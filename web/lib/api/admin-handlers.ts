import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { LIVE } from "@/lib/config";
import { ApiError, json, parseBody } from "@/lib/http";
import { getSettings, notify, payOut, q, refund, setSetting } from "@/lib/services";
import { gigOut, iso, jobOut, money, orderOut, userBrief, userFull } from "@/lib/serialize";
import { gigInclude, jobInclude, orderInclude, words } from "./helpers";

async function log(adminId: number, action: string, target = "", detail = "") {
  await prisma.adminLog.create({
    data: { adminId, action, target: target.slice(0, 80), detail: detail.slice(0, 400) },
  });
}

function userRow(
  u: {
    id: number;
    name: string;
    role: string;
    color: string;
    avatar: string;
    email: string;
    isActive: boolean;
    suspendedReason: string;
    balance: Prisma.Decimal;
    createdAt: Date;
    lastLoginAt: Date | null;
    freelancer: unknown;
    client: unknown;
  },
  orders = 0,
) {
  return {
    ...userBrief(u as never),
    email: u.email,
    is_active: u.isActive,
    suspended_reason: u.suspendedReason,
    balance: money(u.balance),
    orders,
    created_at: iso(u.createdAt),
    last_login_at: iso(u.lastLoginAt),
  };
}

export async function handleAdmin(method: string, parts: string[], req: Request, url: URL) {
  if (parts[0] !== "admin") return null;
  const admin = await requireRole(req, "admin");
  const rest = parts.slice(1);

  // GET /admin/stats
  if (method === "GET" && rest[0] === "stats" && rest.length === 1) {
    const now = new Date();
    const since = new Date(now.getTime() - 29 * 86400_000);
    const users = (w: Prisma.UserWhereInput) => prisma.user.count({ where: w });
    const released = await prisma.order.findMany({ where: { status: "released" } });
    const live = await prisma.order.findMany({ where: { status: { in: [...LIVE] } } });
    const gmv = released.reduce((s, o) => s.plus(o.amount), new Prisma.Decimal(0));
    const revenue = released.reduce(
      (s, o) => s.plus(o.buyerFee).plus(q(o.amount.mul(o.sellerFeePct))),
      new Prisma.Decimal(0),
    );
    const days: Date[] = [];
    for (let i = 0; i < 30; i++) days.push(new Date(since.getTime() + i * 86400_000));
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const gmvBy: Record<string, number> = {};
    const ordersBy: Record<string, number> = {};
    const signupsBy: Record<string, number> = {};
    for (const d of days) {
      const k = dayKey(d);
      gmvBy[k] = 0;
      ordersBy[k] = 0;
      signupsBy[k] = 0;
    }
    for (const o of released) {
      if (o.releasedAt) {
        const k = dayKey(o.releasedAt);
        if (k in gmvBy) gmvBy[k]! += Number(o.amount);
      }
    }
    const recentOrders = await prisma.order.findMany({ where: { createdAt: { gte: since } } });
    for (const o of recentOrders) {
      const k = dayKey(o.createdAt);
      if (k in ordersBy) ordersBy[k]! += 1;
    }
    const recentUsers = await prisma.user.findMany({
      where: { createdAt: { gte: since }, role: { not: "admin" } },
    });
    for (const u of recentUsers) {
      const k = dayKey(u.createdAt);
      if (k in signupsBy) signupsBy[k]! += 1;
    }
    const recent = await prisma.user.findMany({
      where: { role: { not: "admin" } },
      include: { freelancer: true, client: true },
      orderBy: { id: "desc" },
      take: 6,
    });
    const disputes = await prisma.order.findMany({
      where: { disputed: true },
      include: orderInclude,
      orderBy: { disputeOpenedAt: "desc" },
      take: 5,
    });
    return json({
      users: {
        total: await users({ role: { not: "admin" } }),
        clients: await users({ role: "client" }),
        freelancers: await users({ role: "freelancer" }),
        suspended: await users({ isActive: false }),
        new_7d: await users({
          role: { not: "admin" },
          createdAt: { gte: new Date(now.getTime() - 7 * 86400_000) },
        }),
      },
      gigs: await prisma.gig.count({ where: { active: true } }),
      open_jobs: await prisma.job.count({ where: { status: "open" } }),
      orders: {
        live: live.length,
        released: released.length,
        cancelled: await prisma.order.count({ where: { status: "cancelled" } }),
        disputed: await prisma.order.count({ where: { disputed: true } }),
      },
      gmv: money(gmv),
      revenue: money(revenue),
      escrow_held: money(live.reduce((s, o) => s.plus(o.amount).plus(o.buyerFee), new Prisma.Decimal(0))),
      series: days.map((d) => {
        const k = dayKey(d);
        return { date: k, gmv: Math.round((gmvBy[k] || 0) * 100) / 100, orders: ordersBy[k] || 0, signups: signupsBy[k] || 0 };
      }),
      recent_users: recent.map((u) => userBrief(u)),
      disputes: disputes.map((o) => orderOut(o, admin)),
    });
  }

  // GET /admin/users
  if (method === "GET" && rest[0] === "users" && rest.length === 1) {
    const q_ = url.searchParams.get("q");
    const role = url.searchParams.get("role");
    const status = url.searchParams.get("status");
    const limit = Math.min(Number(url.searchParams.get("limit") || 25), 100);
    const offset = Number(url.searchParams.get("offset") || 0);
    const where: Prisma.UserWhereInput = {};
    if (role && ["client", "freelancer", "admin"].includes(role)) where.role = role;
    if (status === "suspended") where.isActive = false;
    else if (status === "active") where.isActive = true;
    let rows = await prisma.user.findMany({
      where,
      include: { freelancer: true, client: true },
      orderBy: { id: "desc" },
    });
    for (const w of words(q_)) {
      rows = rows.filter(
        (u) => u.name.toLowerCase().includes(w) || u.email.toLowerCase().includes(w),
      );
    }
    const total = rows.length;
    rows = rows.slice(offset, offset + limit);
    const counts: Record<number, number> = {};
    if (rows.length) {
      const ids = rows.map((u) => u.id);
      const asClient = await prisma.order.groupBy({ by: ["clientId"], where: { clientId: { in: ids } }, _count: true });
      const asFl = await prisma.order.groupBy({
        by: ["freelancerId"],
        where: { freelancerId: { in: ids } },
        _count: true,
      });
      for (const r of asClient) counts[r.clientId] = (counts[r.clientId] || 0) + r._count;
      for (const r of asFl) counts[r.freelancerId] = (counts[r.freelancerId] || 0) + r._count;
    }
    return json({ total, items: rows.map((u) => userRow(u, counts[u.id] || 0)) });
  }

  // GET /admin/users/:id
  if (method === "GET" && rest[0] === "users" && rest.length === 2) {
    const u = await prisma.user.findUnique({
      where: { id: Number(rest[1]) },
      include: { freelancer: true, client: true },
    });
    if (!u) throw new ApiError(404, "User not found");
    let orders: { id: number; title: string; status: string; amount: Prisma.Decimal; disputed: boolean }[] = [];
    if (u.role !== "admin") {
      orders = await prisma.order.findMany({
        where: u.role === "client" ? { clientId: u.id } : { freelancerId: u.id },
        orderBy: { id: "desc" },
        take: 8,
      });
    }
    return json({
      ...userRow(u),
      profile: userFull(u).profile,
      orders_list: orders.map((o) => ({
        id: o.id,
        title: o.title,
        status: o.status,
        amount: money(o.amount),
        disputed: o.disputed,
      })),
    });
  }

  async function target(uid: number) {
    const u = await prisma.user.findUnique({ where: { id: uid }, include: { client: true, freelancer: true } });
    if (!u) throw new ApiError(404, "User not found");
    if (u.role === "admin") throw new ApiError(403, "Admin accounts cannot be changed here");
    return u;
  }

  // POST /admin/users/:id/suspend
  if (method === "POST" && rest[0] === "users" && rest[2] === "suspend") {
    const body = await parseBody<{ reason?: string }>(req);
    const u = await target(Number(rest[1]));
    const reason = (body.reason || "").trim() || "Suspended by an administrator";
    await prisma.user.update({
      where: { id: u.id },
      data: { isActive: false, suspendedReason: reason },
    });
    await log(admin.id, "suspend_user", `user:${u.id} ${u.name}`, reason);
    return json({ ok: true });
  }

  // POST /admin/users/:id/reactivate
  if (method === "POST" && rest[0] === "users" && rest[2] === "reactivate") {
    const u = await target(Number(rest[1]));
    await prisma.user.update({ where: { id: u.id }, data: { isActive: true, suspendedReason: "" } });
    await log(admin.id, "reactivate_user", `user:${u.id} ${u.name}`);
    return json({ ok: true });
  }

  // POST /admin/users/:id/verify
  if (method === "POST" && rest[0] === "users" && rest[2] === "verify") {
    const body = await parseBody<{ verified: boolean }>(req);
    const u = await target(Number(rest[1]));
    if (!u.client) throw new ApiError(422, "Only clients have payment verification");
    await prisma.clientProfile.update({ where: { userId: u.id }, data: { verified: body.verified } });
    await log(admin.id, body.verified ? "verify_client" : "unverify_client", `user:${u.id} ${u.name}`);
    return json({ ok: true });
  }

  // GET /admin/gigs
  if (method === "GET" && rest[0] === "gigs" && rest.length === 1) {
    const q_ = url.searchParams.get("q");
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
    let rows = await prisma.gig.findMany({ include: gigInclude, orderBy: { id: "desc" }, take: 200 });
    for (const w of words(q_)) rows = rows.filter((g) => g.title.toLowerCase().includes(w));
    return json(rows.slice(0, limit).map((g) => gigOut(g)));
  }

  // POST /admin/gigs/:id/toggle
  if (method === "POST" && rest[0] === "gigs" && rest[2] === "toggle") {
    const g = await prisma.gig.findUnique({ where: { id: Number(rest[1]) } });
    if (!g) throw new ApiError(404, "Gig not found");
    const active = !g.active;
    await prisma.gig.update({ where: { id: g.id }, data: { active } });
    await log(admin.id, active ? "enable_gig" : "disable_gig", `gig:${g.id}`, g.title);
    await notify(
      g.freelancerId,
      "system",
      "Your gig was " + (active ? "restored" : "removed by support"),
      g.title,
    );
    return json({ active });
  }

  // GET /admin/jobs
  if (method === "GET" && rest[0] === "jobs" && rest.length === 1) {
    const q_ = url.searchParams.get("q");
    const status = url.searchParams.get("status");
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
    let rows = await prisma.job.findMany({
      where: status ? { status } : undefined,
      include: jobInclude,
      orderBy: { id: "desc" },
      take: 200,
    });
    for (const w of words(q_)) rows = rows.filter((j) => j.title.toLowerCase().includes(w));
    return json(rows.slice(0, limit).map((j) => jobOut(j)));
  }

  // POST /admin/jobs/:id/close
  if (method === "POST" && rest[0] === "jobs" && rest[2] === "close") {
    const j = await prisma.job.findUnique({ where: { id: Number(rest[1]) } });
    if (!j) throw new ApiError(404, "Job not found");
    await prisma.job.update({ where: { id: j.id }, data: { status: "closed" } });
    await log(admin.id, "close_job", `job:${j.id}`, j.title);
    await notify(j.clientId, "system", "Your job was closed by support", j.title, `/job/${j.id}`);
    return json({ ok: true });
  }

  // GET /admin/orders
  if (method === "GET" && rest[0] === "orders" && rest.length === 1) {
    const status = url.searchParams.get("status");
    const disputed = url.searchParams.get("disputed");
    const q_ = url.searchParams.get("q");
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
    const where: Prisma.OrderWhereInput = {};
    if (status) where.status = status;
    if (disputed === "true") where.disputed = true;
    if (disputed === "false") where.disputed = false;
    let rows = await prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { id: "desc" },
      take: 200,
    });
    for (const w of words(q_)) rows = rows.filter((o) => o.title.toLowerCase().includes(w));
    return json(rows.slice(0, limit).map((o) => orderOut(o, admin)));
  }

  // POST /admin/orders/:id/resolve
  if (method === "POST" && rest[0] === "orders" && rest[2] === "resolve") {
    const body = await parseBody<{ decision: "release" | "refund"; note: string }>(req);
    const o = await prisma.order.findUnique({ where: { id: Number(rest[1]) }, include: orderInclude });
    if (!o || !o.disputed) throw new ApiError(404, "No open dispute on that order");
    let msgC: string;
    let msgF: string;
    if (body.decision === "release") {
      const net = await payOut(o.id);
      msgC = `Support released the payment to ${o.freelancer.name}.`;
      msgF = `Support resolved the dispute in your favour. $${net} was added to your wallet.`;
    } else {
      await refund(o.id);
      msgC = "Support resolved the dispute and refunded your payment in full.";
      msgF = "Support resolved the dispute and refunded the client.";
    }
    const updated = await prisma.order.update({
      where: { id: o.id },
      data: { disputed: false, resolutionNote: body.note.trim() },
      include: orderInclude,
    });
    await log(admin.id, "resolve_dispute", `order:${o.id}`, `${body.decision}: ${body.note}`);
    await notify(
      o.clientId,
      "dispute",
      "Dispute resolved",
      `${msgC} ${body.note.trim()}`.slice(0, 400),
      `/order/${o.id}`,
    );
    await notify(
      o.freelancerId,
      "dispute",
      "Dispute resolved",
      `${msgF} ${body.note.trim()}`.slice(0, 400),
      `/order/${o.id}`,
    );
    return json(orderOut(updated, admin));
  }

  // POST /admin/orders/:id/refund
  if (method === "POST" && rest[0] === "orders" && rest[2] === "refund") {
    const body = await parseBody<{ reason?: string }>(req);
    const o = await prisma.order.findUnique({ where: { id: Number(rest[1]) }, include: orderInclude });
    if (!o || ![...LIVE].includes(o.status as (typeof LIVE)[number])) {
      throw new ApiError(409, "Only active orders can be refunded");
    }
    await refund(o.id);
    const note = (body.reason || "").trim() || "Refunded by an administrator";
    const updated = await prisma.order.update({
      where: { id: o.id },
      data: { disputed: false, resolutionNote: note },
      include: orderInclude,
    });
    await log(admin.id, "force_refund", `order:${o.id}`, note);
    await notify(o.clientId, "system", "Order refunded", `"${o.title}" was refunded by support.`, `/order/${o.id}`);
    await notify(
      o.freelancerId,
      "system",
      "Order cancelled by support",
      `"${o.title}" was refunded to the client.`,
      `/order/${o.id}`,
    );
    return json(orderOut(updated, admin));
  }

  // GET /admin/transactions
  if (method === "GET" && rest[0] === "transactions") {
    const kind = url.searchParams.get("kind");
    const limit = Math.min(Number(url.searchParams.get("limit") || 60), 200);
    const rows = await prisma.transaction.findMany({
      where: kind ? { kind } : undefined,
      include: { user: true },
      orderBy: { id: "desc" },
      take: limit,
    });
    return json(
      rows.map((t) => ({
        id: t.id,
        kind: t.kind,
        amount: money(t.amount),
        description: t.description,
        user: t.user.name,
        order_id: t.orderId,
        created_at: iso(t.createdAt),
      })),
    );
  }

  // POST /admin/announcements
  if (method === "POST" && rest[0] === "announcements") {
    const body = await parseBody<{ title: string; body?: string; audience?: string }>(req);
    const where: Prisma.UserWhereInput = { role: { not: "admin" }, isActive: true };
    if (body.audience === "client" || body.audience === "freelancer") where.role = body.audience;
    const users = await prisma.user.findMany({ where, select: { id: true } });
    let n = 0;
    for (const u of users) {
      if (await notify(u.id, "announcement", body.title, body.body || "")) n += 1;
    }
    await log(admin.id, "announcement", `audience:${body.audience || "all"}`, body.title);
    return json({ delivered: n });
  }

  // GET|PUT /admin/settings
  if (rest[0] === "settings" && rest.length === 1) {
    if (method === "GET") return json(await getSettings());
    if (method === "PUT") {
      const body = await parseBody<{
        buyer_fee_pct: number;
        seller_fee_pct: number;
        signups_enabled: boolean;
      }>(req);
      const before = await getSettings();
      for (const [k, v] of Object.entries(body)) await setSetting(k, v);
      await log(admin.id, "update_settings", "platform", `${JSON.stringify(before)} -> ${JSON.stringify(body)}`);
      return json(await getSettings());
    }
  }

  // GET /admin/logs
  if (method === "GET" && rest[0] === "logs") {
    const limit = Math.min(Number(url.searchParams.get("limit") || 100), 300);
    const rows = await prisma.adminLog.findMany({
      include: { admin: true },
      orderBy: { id: "desc" },
      take: limit,
    });
    return json(
      rows.map((r) => ({
        id: r.id,
        admin: r.admin?.name || "Deleted admin",
        action: r.action,
        target: r.target,
        detail: r.detail,
        created_at: iso(r.createdAt),
      })),
    );
  }

  return null;
}
