import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { memberOnly, requireRole } from "@/lib/auth";
import { LIVE } from "@/lib/config";
import { ApiError, json, parseBody } from "@/lib/http";
import {
  fundOrder,
  getOrCreateConversation,
  notify,
  notifyAdmins,
  payOut,
  postMessage,
  q,
  refund,
  sellerNet,
} from "@/lib/services";
import { money, orderOut, proposalOut, txOut } from "@/lib/serialize";
import { gigInclude, orderInclude, proposalInclude } from "./helpers";

async function loadOrder(oid: number, userId: number) {
  const o = await prisma.order.findUnique({ where: { id: oid }, include: orderInclude });
  if (!o || (userId !== o.clientId && userId !== o.freelancerId)) throw new ApiError(404, "Order not found");
  return o;
}

function noDispute(o: { disputed: boolean }) {
  if (o.disputed) throw new ApiError(409, "This order is under review by Crewline support");
}

async function note(clientId: number, freelancerId: number, senderId: number, text: string) {
  const conv = await getOrCreateConversation(clientId, freelancerId);
  await postMessage(conv.id, senderId, text);
}

function monthSeries(
  txs: { createdAt: Date; amount: Prisma.Decimal }[],
): { month: string; label: string; amount: number }[] {
  const now = new Date();
  const months: [number, number][] = [];
  for (let i = 5; i >= 0; i--) {
    let y = now.getUTCFullYear();
    let m = now.getUTCMonth() + 1 - i;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    months.push([y, m]);
  }
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const totals: Record<string, number> = {};
  for (const [y, m] of months) totals[`${y}-${m}`] = 0;
  const start = new Date(Date.UTC(months[0]![0], months[0]![1] - 1, 1));
  for (const t of txs) {
    if (t.createdAt < start) continue;
    const key = `${t.createdAt.getUTCFullYear()}-${t.createdAt.getUTCMonth() + 1}`;
    if (key in totals) totals[key]! += Math.abs(Number(t.amount));
  }
  return months.map(([y, m]) => ({
    month: `${y}-${String(m).padStart(2, "0")}`,
    label: labels[m - 1]!,
    amount: Math.round((totals[`${y}-${m}`] || 0) * 100) / 100,
  }));
}

export async function handleWork(method: string, parts: string[], req: Request, url: URL) {
  // POST /jobs/:id/proposals
  if (method === "POST" && parts[0] === "jobs" && parts[2] === "proposals") {
    const user = await requireRole(req, "freelancer");
    const jid = Number(parts[1]);
    const body = await parseBody<{ bid: number; delivery_days: number; cover_letter: string }>(req);
    const job = await prisma.job.findUnique({ where: { id: jid } });
    if (!job) throw new ApiError(404, "Job not found");
    if (job.status !== "open") throw new ApiError(409, "This job is no longer accepting proposals");
    if (await prisma.proposal.findUnique({ where: { jobId_freelancerId: { jobId: jid, freelancerId: user.id } } })) {
      throw new ApiError(409, "You already sent a proposal for this job");
    }
    const p = await prisma.proposal.create({
      data: {
        jobId: jid,
        freelancerId: user.id,
        bid: body.bid,
        deliveryDays: body.delivery_days,
        coverLetter: (body.cover_letter || "").trim(),
      },
    });
    const conv = await getOrCreateConversation(job.clientId, user.id);
    await postMessage(conv.id, user.id, `Hi, I just sent a proposal for "${job.title}".`);
    await notify(
      job.clientId,
      "proposal",
      `New proposal on "${job.title}"`,
      `${user.name} bid $${q(body.bid)} for ${body.delivery_days} days.`,
      `/job/${jid}`,
    );
    return json({ id: p.id }, 201);
  }

  // GET /jobs/:id/proposals
  if (method === "GET" && parts[0] === "jobs" && parts[2] === "proposals") {
    const user = await requireRole(req, "client");
    const jid = Number(parts[1]);
    const job = await prisma.job.findUnique({ where: { id: jid } });
    if (!job || job.clientId !== user.id) throw new ApiError(404, "Job not found");
    const rows = await prisma.proposal.findMany({
      where: { jobId: jid, status: { not: "withdrawn" } },
      include: proposalInclude,
      orderBy: { createdAt: "desc" },
    });
    return json(rows.map((p) => proposalOut(p)));
  }

  // GET /me/proposals
  if (method === "GET" && parts[0] === "me" && parts[1] === "proposals") {
    const user = await requireRole(req, "freelancer");
    const rows = await prisma.proposal.findMany({
      where: { freelancerId: user.id },
      include: {
        ...proposalInclude,
        job: { include: { client: { include: { client: true, freelancer: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    return json(rows.map((p) => proposalOut(p, true)));
  }

  // POST /proposals/:id/accept
  if (method === "POST" && parts[0] === "proposals" && parts[2] === "accept") {
    const user = await requireRole(req, "client");
    const pid = Number(parts[1]);
    const p = await prisma.proposal.findUnique({
      where: { id: pid },
      include: { job: true, freelancer: true },
    });
    if (!p || p.job.clientId !== user.id) throw new ApiError(404, "Proposal not found");
    if (p.status !== "pending" || p.job.status !== "open") {
      throw new ApiError(409, "This proposal can no longer be accepted");
    }
    const order = await fundOrder({
      clientId: user.id,
      freelancerId: p.freelancerId,
      title: p.job.title,
      amount: p.bid,
      jobId: p.jobId,
      deliveryDays: p.deliveryDays,
    });
    await prisma.proposal.update({ where: { id: p.id }, data: { status: "accepted" } });
    await prisma.job.update({ where: { id: p.jobId }, data: { status: "in_progress" } });
    const others = await prisma.proposal.findMany({
      where: { jobId: p.jobId, id: { not: p.id }, status: "pending" },
    });
    for (const other of others) {
      await prisma.proposal.update({ where: { id: other.id }, data: { status: "rejected" } });
      await notify(
        other.freelancerId,
        "proposal",
        "Proposal not selected",
        `The client chose another freelancer for "${p.job.title}".`,
        `/job/${p.jobId}`,
      );
    }
    const conv = await getOrCreateConversation(user.id, p.freelancerId);
    await postMessage(
      conv.id,
      user.id,
      `I accepted your proposal and funded escrow for "${p.job.title}". You can start whenever you are ready.`,
    );
    await notify(
      p.freelancerId,
      "proposal",
      "You were hired",
      `${user.name} accepted your proposal for "${p.job.title}" and funded escrow.`,
      `/order/${order.id}`,
    );
    return json({ order_id: order.id });
  }

  // POST /proposals/:id/withdraw
  if (method === "POST" && parts[0] === "proposals" && parts[2] === "withdraw") {
    const user = await requireRole(req, "freelancer");
    const p = await prisma.proposal.findUnique({ where: { id: Number(parts[1]) } });
    if (!p || p.freelancerId !== user.id) throw new ApiError(404, "Proposal not found");
    if (p.status !== "pending") throw new ApiError(409, "Only pending proposals can be withdrawn");
    await prisma.proposal.update({ where: { id: p.id }, data: { status: "withdrawn" } });
    return json({ ok: true });
  }

  // POST /gigs/:id/orders
  if (method === "POST" && parts[0] === "gigs" && parts[2] === "orders") {
    const user = await requireRole(req, "client");
    const body = await parseBody<{ tier: string; requirements?: string }>(req);
    const gig = await prisma.gig.findFirst({
      where: { id: Number(parts[1]), active: true },
      include: { ...gigInclude, packages: true },
    });
    if (!gig || !gig.freelancer.isActive) throw new ApiError(404, "Gig not found");
    const pkg = gig.packages.find((p) => p.tier === body.tier);
    if (!pkg) throw new ApiError(422, "Unknown package");
    const order = await fundOrder({
      clientId: user.id,
      freelancerId: gig.freelancerId,
      title: `${gig.title} (${pkg.tier[0]!.toUpperCase()}${pkg.tier.slice(1)})`,
      amount: pkg.price,
      gigId: gig.id,
      package: pkg.tier,
      deliveryDays: pkg.deliveryDays,
    });
    const conv = await getOrCreateConversation(user.id, gig.freelancerId);
    const noteText = (body.requirements || "").trim();
    await postMessage(
      conv.id,
      user.id,
      `I ordered "${gig.title}" (${pkg.tier}).` + (noteText ? `\n\n${noteText}` : ""),
    );
    await notify(
      gig.freelancerId,
      "order",
      "New order",
      `${user.name} ordered "${gig.title}" (${pkg.tier}).`,
      `/order/${order.id}`,
    );
    return json({ order_id: order.id }, 201);
  }

  // GET /me/orders
  if (method === "GET" && parts[0] === "me" && parts[1] === "orders") {
    const user = await memberOnly(req);
    const status = url.searchParams.get("status");
    const where: Prisma.OrderWhereInput = user.role === "client" ? { clientId: user.id } : { freelancerId: user.id };
    if (status === "active") where.status = { in: [...LIVE] };
    else if (status) where.status = status;
    const rows = await prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { createdAt: "desc" },
    });
    return json(rows.map((o) => orderOut(o, user)));
  }

  // GET /orders/:id
  if (method === "GET" && parts[0] === "orders" && parts.length === 2) {
    const user = await memberOnly(req);
    const o = await loadOrder(Number(parts[1]), user.id);
    const conv = await getOrCreateConversation(o.clientId, o.freelancerId);
    return json({ ...orderOut(o, user), conversation_id: conv.id });
  }

  // order actions
  const orderAction = parts[0] === "orders" && parts.length === 3 ? parts[2] : null;
  if (method === "POST" && orderAction) {
    const oid = Number(parts[1]);

    if (orderAction === "start") {
      const user = await requireRole(req, "freelancer");
      const o = await loadOrder(oid, user.id);
      noDispute(o);
      if (o.freelancerId !== user.id || o.status !== "funded") throw new ApiError(409, "This order cannot be started");
      const updated = await prisma.order.update({
        where: { id: o.id },
        data: { status: "in_progress" },
        include: orderInclude,
      });
      await note(o.clientId, o.freelancerId, user.id, `I started work on "${o.title}".`);
      await notify(o.clientId, "order", "Work started", `${user.name} started "${o.title}".`, `/order/${o.id}`);
      return json(orderOut(updated, user));
    }

    if (orderAction === "deliver") {
      const user = await requireRole(req, "freelancer");
      const body = await parseBody<{ note?: string }>(req).catch(() => ({ note: "" }));
      const o = await loadOrder(oid, user.id);
      noDispute(o);
      if (o.freelancerId !== user.id || !["in_progress", "revision"].includes(o.status)) {
        throw new ApiError(409, "This order cannot be delivered right now");
      }
      const updated = await prisma.order.update({
        where: { id: o.id },
        data: { status: "delivered", deliveredAt: new Date() },
        include: orderInclude,
      });
      const n = (body.note || "").trim();
      await note(o.clientId, o.freelancerId, user.id, `I delivered "${o.title}".` + (n ? `\n\n${n}` : ""));
      await notify(
        o.clientId,
        "order",
        "Work delivered",
        `${user.name} delivered "${o.title}". Review it and release payment.`,
        `/order/${o.id}`,
      );
      return json(orderOut(updated, user));
    }

    if (orderAction === "revise") {
      const user = await requireRole(req, "client");
      const body = await parseBody<{ note?: string }>(req).catch(() => ({ note: "" }));
      const o = await loadOrder(oid, user.id);
      noDispute(o);
      if (o.clientId !== user.id || o.status !== "delivered") {
        throw new ApiError(409, "You can only request a revision on delivered work");
      }
      const updated = await prisma.order.update({
        where: { id: o.id },
        data: { status: "revision" },
        include: orderInclude,
      });
      const n = (body.note || "").trim();
      await note(o.clientId, o.freelancerId, user.id, "I requested a revision." + (n ? `\n\n${n}` : ""));
      await notify(
        o.freelancerId,
        "order",
        "Revision requested",
        `${user.name} asked for changes on "${o.title}".`,
        `/order/${o.id}`,
      );
      return json(orderOut(updated, user));
    }

    if (orderAction === "release") {
      const user = await requireRole(req, "client");
      const o = await loadOrder(oid, user.id);
      noDispute(o);
      if (o.clientId !== user.id || o.status !== "delivered") {
        throw new ApiError(409, "You can only release payment for delivered work");
      }
      const net = await payOut(o.id);
      await note(o.clientId, o.freelancerId, user.id, "I approved the work and released the payment. Thank you!");
      await notify(
        o.freelancerId,
        "payment",
        `You earned $${net}`,
        `Payment for "${o.title}" is in your wallet.`,
        `/order/${o.id}`,
      );
      const updated = await loadOrder(oid, user.id);
      return json(orderOut(updated, user));
    }

    if (orderAction === "cancel") {
      const user = await requireRole(req, "client");
      const o = await loadOrder(oid, user.id);
      noDispute(o);
      if (o.clientId !== user.id || o.status !== "funded") {
        throw new ApiError(409, "Only orders that have not started can be cancelled");
      }
      await refund(o.id);
      await notify(
        o.freelancerId,
        "order",
        "Order cancelled",
        `${user.name} cancelled "${o.title}" before it started.`,
        `/order/${o.id}`,
      );
      const updated = await loadOrder(oid, user.id);
      return json(orderOut(updated, user));
    }

    if (orderAction === "dispute") {
      const user = await memberOnly(req);
      const body = await parseBody<{ reason: string }>(req);
      const o = await loadOrder(oid, user.id);
      if (o.disputed) throw new ApiError(409, "A dispute is already open on this order");
      if (![...LIVE].includes(o.status as (typeof LIVE)[number])) {
        throw new ApiError(409, "Only active orders can be disputed");
      }
      const updated = await prisma.order.update({
        where: { id: o.id },
        data: {
          disputed: true,
          disputeReason: body.reason.trim(),
          disputeBy: user.id,
          disputeOpenedAt: new Date(),
        },
        include: orderInclude,
      });
      await note(o.clientId, o.freelancerId, user.id, "I opened a dispute on this order. Crewline support will review it.");
      const other = user.id === o.clientId ? o.freelancerId : o.clientId;
      await notify(
        other,
        "dispute",
        "A dispute was opened",
        `${user.name} reported a problem with "${o.title}". Support will review it.`,
        `/order/${o.id}`,
      );
      await notifyAdmins("dispute", "New dispute", `"${o.title}" · opened by ${user.name}`, "/admin/disputes");
      return json(orderOut(updated, user));
    }

    if (orderAction === "review") {
      const user = await requireRole(req, "client");
      const body = await parseBody<{ rating: number; comment?: string }>(req);
      const o = await loadOrder(oid, user.id);
      if (o.clientId !== user.id || o.status !== "released") {
        throw new ApiError(409, "You can review an order once payment is released");
      }
      if (o.review) throw new ApiError(409, "You already reviewed this order");
      await prisma.review.create({
        data: {
          orderId: o.id,
          clientId: user.id,
          freelancerId: o.freelancerId,
          rating: body.rating,
          comment: (body.comment || "").trim(),
        },
      });
      const f = o.freelancer.freelancer;
      if (f) {
        const total = f.rating * f.reviewsCount + body.rating;
        const reviewsCount = f.reviewsCount + 1;
        await prisma.freelancerProfile.update({
          where: { userId: o.freelancerId },
          data: { reviewsCount, rating: Math.round((total / reviewsCount) * 100) / 100 },
        });
      }
      await notify(
        o.freelancerId,
        "review",
        `New ${body.rating}-star review`,
        (body.comment || "").trim().slice(0, 160) || `${user.name} reviewed "${o.title}".`,
        `/freelancer/${o.freelancerId}`,
      );
      return json({ ok: true }, 201);
    }

    if (orderAction === "client-review") {
      const user = await requireRole(req, "freelancer");
      const body = await parseBody<{ rating: number; comment?: string }>(req);
      const o = await loadOrder(oid, user.id);
      if (o.freelancerId !== user.id || o.status !== "released") {
        throw new ApiError(409, "You can review a client once payment is released");
      }
      if (o.clientReview) throw new ApiError(409, "You already reviewed this client");
      await prisma.clientReview.create({
        data: {
          orderId: o.id,
          clientId: o.clientId,
          freelancerId: user.id,
          rating: body.rating,
          comment: (body.comment || "").trim(),
        },
      });
      await notify(
        o.clientId,
        "review",
        `New ${body.rating}-star review from ${user.name}`,
        (body.comment || "").trim().slice(0, 160) ||
          `${user.name} reviewed working with you on "${o.title}".`,
        `/client/${o.clientId}`,
      );
      return json({ ok: true }, 201);
    }
  }

  // GET /wallet
  if (method === "GET" && parts[0] === "wallet" && parts.length === 1) {
    const user = await memberOnly(req);
    const tx = await prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    });
    return json({ balance: money(user.balance), transactions: tx.map(txOut) });
  }

  // POST /wallet/deposit
  if (method === "POST" && parts[0] === "wallet" && parts[1] === "deposit") {
    const user = await requireRole(req, "client");
    const body = await parseBody<{ amount: number }>(req);
    const amt = q(body.amount);
    if (amt.lte(0) || amt.gt(10000)) throw new ApiError(422, "Invalid amount");
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { balance: q(user.balance.plus(amt)) },
    });
    await prisma.transaction.create({
      data: { userId: user.id, kind: "deposit", amount: amt, description: "Added funds (demo)" },
    });
    return json({ balance: money(updated.balance) });
  }

  // POST /wallet/withdraw
  if (method === "POST" && parts[0] === "wallet" && parts[1] === "withdraw") {
    const user = await requireRole(req, "freelancer");
    const body = await parseBody<{ amount: number }>(req);
    const amt = q(body.amount);
    if (user.balance.lessThan(amt)) throw new ApiError(402, "That is more than your available balance");
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { balance: q(user.balance.minus(amt)) },
    });
    await prisma.transaction.create({
      data: {
        userId: user.id,
        kind: "withdrawal",
        amount: amt.negated(),
        description: "Withdrawal to bank (demo)",
      },
    });
    return json({ balance: money(updated.balance) });
  }

  // GET /dashboard
  if (method === "GET" && parts[0] === "dashboard" && parts.length === 1) {
    const user = await memberOnly(req);
    const where: Prisma.OrderWhereInput =
      user.role === "client" ? { clientId: user.id } : { freelancerId: user.id };
    const orders = await prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { createdAt: "desc" },
    });
    const live = orders.filter((o) => [...LIVE].includes(o.status as (typeof LIVE)[number]));
    if (user.role === "client") {
      const jobs = await prisma.job.findMany({ where: { clientId: user.id } });
      const openIds = jobs.filter((j) => j.status === "open").map((j) => j.id);
      const pending = openIds.length
        ? await prisma.proposal.count({ where: { jobId: { in: openIds }, status: "pending" } })
        : 0;
      const txs = await prisma.transaction.findMany({
        where: { userId: user.id, kind: "escrow_hold" },
      });
      return json({
        role: "client",
        balance: money(user.balance),
        in_escrow: money(live.reduce((s, o) => s.plus(o.amount), new Prisma.Decimal(0))),
        total_spent: money(user.client?.totalSpent),
        active_orders: live.length,
        awaiting_review: orders.filter((o) => o.status === "delivered" && !o.disputed).length,
        open_jobs: openIds.length,
        pending_proposals: pending,
        disputes: live.filter((o) => o.disputed).length,
        series: monthSeries(txs),
        recent_orders: orders.slice(0, 5).map((o) => orderOut(o, user)),
      });
    }
    const earned = await prisma.transaction.aggregate({
      where: { userId: user.id, kind: "earning" },
      _sum: { amount: true },
    });
    const pend = await prisma.proposal.count({ where: { freelancerId: user.id, status: "pending" } });
    const gigs = await prisma.gig.count({ where: { freelancerId: user.id, active: true } });
    const f = user.freelancer!;
    const txs = await prisma.transaction.findMany({ where: { userId: user.id, kind: "earning" } });
    return json({
      role: "freelancer",
      balance: money(user.balance),
      pending_earnings: money(
        live.reduce((s, o) => s.plus(sellerNet(o.amount, o.sellerFeePct)), new Prisma.Decimal(0)),
      ),
      total_earned: money(earned._sum.amount),
      active_orders: live.length,
      to_deliver: live.filter((o) => ["funded", "in_progress", "revision"].includes(o.status) && !o.disputed).length,
      pending_proposals: pend,
      gigs,
      disputes: live.filter((o) => o.disputed).length,
      rating: f.rating,
      reviews_count: f.reviewsCount,
      jobs_completed: f.jobsCompleted,
      series: monthSeries(txs),
      recent_orders: orders.slice(0, 5).map((o) => orderOut(o, user)),
    });
  }

  return null;
}
