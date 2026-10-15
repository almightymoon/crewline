import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { DEFAULT_SETTINGS } from "./config";
import { ApiError } from "./http";
const CENT = 2;

export function q(v: Prisma.Decimal | number | string): Prisma.Decimal {
  return new Prisma.Decimal(v).toDecimalPlaces(CENT, Prisma.Decimal.ROUND_HALF_UP);
}

export async function getSettings(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  const rows = await prisma.setting.findMany();
  for (const row of rows) {
    const val = row.value as { v?: unknown } | unknown;
    out[row.key] = val && typeof val === "object" && "v" in (val as object) ? (val as { v: unknown }).v : val;
  }
  return out;
}

export async function setSetting(key: string, value: unknown) {
  const wrapped = { v: value } as Prisma.InputJsonValue;
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: wrapped },
    update: { value: wrapped },
  });
}

export async function feeRates(): Promise<[Prisma.Decimal, Prisma.Decimal]> {
  const s = await getSettings();
  return [
    q(Number(s.buyer_fee_pct) / 100),
    q(Number(s.seller_fee_pct) / 100),
  ];
}

const CATEGORY: Record<string, string> = {
  order: "orders",
  payment: "orders",
  review: "orders",
  proposal: "proposals",
  announcement: "announcements",
};

export async function notify(
  userId: number,
  kind: string,
  title: string,
  body = "",
  link = "",
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) return null;
  const cat = CATEGORY[kind];
  const prefs = (user.notifyPrefs || {}) as Record<string, boolean>;
  if (cat && prefs[cat] === false) return null;
  return prisma.notification.create({
    data: {
      userId,
      kind,
      title: title.slice(0, 160),
      body: body.slice(0, 400),
      link,
    },
  });
}

export async function notifyAdmins(kind: string, title: string, body = "", link = "") {
  const admins = await prisma.user.findMany({
    where: { role: "admin", isActive: true },
    select: { id: true },
  });
  for (const a of admins) await notify(a.id, kind, title, body, link);
}

export async function getOrCreateConversation(clientId: number, freelancerId: number) {
  const existing = await prisma.conversation.findUnique({
    where: { clientId_freelancerId: { clientId, freelancerId } },
  });
  if (existing) return existing;
  return prisma.conversation.create({ data: { clientId, freelancerId } });
}

export async function postMessage(conversationId: number, senderId: number, body: string) {
  return prisma.message.create({
    data: { conversationId, senderId, body: body.trim() },
  });
}

export async function fundOrder(opts: {
  clientId: number;
  freelancerId: number;
  title: string;
  amount: Prisma.Decimal | number | string;
  gigId?: number | null;
  jobId?: number | null;
  package?: string | null;
  deliveryDays?: number;
}) {
  const [buyerRate, sellerRate] = await feeRates();
  const amount = q(opts.amount);
  const fee = q(amount.mul(buyerRate));
  const total = amount.plus(fee);

  return prisma.$transaction(async (tx) => {
    const client = await tx.user.findUnique({ where: { id: opts.clientId } });
    if (!client) throw new ApiError(404, "Client not found");
    if (client.balance.lessThan(total)) {
      throw new ApiError(
        402,
        `Your wallet is $${q(total.minus(client.balance))} short. Add funds to continue.`,
      );
    }
    await tx.user.update({
      where: { id: opts.clientId },
      data: { balance: q(client.balance.minus(total)) },
    });
    const order = await tx.order.create({
      data: {
        clientId: opts.clientId,
        freelancerId: opts.freelancerId,
        title: opts.title,
        amount,
        buyerFee: fee,
        sellerFeePct: sellerRate,
        status: "funded",
        gigId: opts.gigId ?? null,
        jobId: opts.jobId ?? null,
        package: opts.package ?? null,
        deliveryDays: opts.deliveryDays ?? 7,
      },
    });
    await tx.transaction.create({
      data: {
        userId: opts.clientId,
        kind: "escrow_hold",
        amount: total.negated(),
        orderId: order.id,
        description: `Escrow for ${opts.title}`,
      },
    });
    return order;
  });
}

export function sellerNet(
  amount: Prisma.Decimal | number | string,
  pct: Prisma.Decimal | number | string = "0.10",
): Prisma.Decimal {
  return q(new Prisma.Decimal(amount).mul(new Prisma.Decimal(1).minus(new Prisma.Decimal(pct))));
}

export async function payOut(orderId: number): Promise<Prisma.Decimal> {
  return prisma.$transaction(async (tx) => {
    const o = await tx.order.findUnique({ where: { id: orderId } });
    if (!o) throw new ApiError(404, "Order not found");
    const net = sellerNet(o.amount, o.sellerFeePct);
    const freelancer = await tx.user.findUnique({ where: { id: o.freelancerId }, include: { freelancer: true } });
    const client = await tx.user.findUnique({ where: { id: o.clientId }, include: { client: true } });
    if (!freelancer || !client) throw new ApiError(404, "User not found");

    await tx.user.update({
      where: { id: o.freelancerId },
      data: { balance: q(freelancer.balance.plus(net)) },
    });
    await tx.transaction.create({
      data: {
        userId: o.freelancerId,
        kind: "earning",
        amount: net,
        orderId: o.id,
        description: `Payment for ${o.title}`,
      },
    });
    if (freelancer.freelancer) {
      await tx.freelancerProfile.update({
        where: { userId: o.freelancerId },
        data: { jobsCompleted: { increment: 1 } },
      });
    }
    if (client.client) {
      await tx.clientProfile.update({
        where: { userId: o.clientId },
        data: { totalSpent: q(client.client.totalSpent.plus(o.amount)) },
      });
    }
    await tx.order.update({
      where: { id: o.id },
      data: { status: "released", releasedAt: new Date() },
    });
    return net;
  });
}

export async function refund(orderId: number): Promise<Prisma.Decimal> {
  return prisma.$transaction(async (tx) => {
    const o = await tx.order.findUnique({ where: { id: orderId } });
    if (!o) throw new ApiError(404, "Order not found");
    const amt = q(o.amount.plus(o.buyerFee));
    const client = await tx.user.findUnique({ where: { id: o.clientId } });
    if (!client) throw new ApiError(404, "Client not found");
    await tx.user.update({
      where: { id: o.clientId },
      data: { balance: q(client.balance.plus(amt)) },
    });
    await tx.transaction.create({
      data: {
        userId: o.clientId,
        kind: "refund",
        amount: amt,
        orderId: o.id,
        description: `Refund for ${o.title}`,
      },
    });
    await tx.order.update({ where: { id: o.id }, data: { status: "cancelled" } });
    if (o.jobId) {
      const job = await tx.job.findUnique({ where: { id: o.jobId } });
      if (job?.status === "in_progress") {
        await tx.job.update({ where: { id: o.jobId }, data: { status: "open" } });
      }
    }
    return amt;
  });
}
