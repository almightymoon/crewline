import { Prisma } from "@prisma/client";
import type { AuthUser } from "./auth";

type DbUser = AuthUser;
type GigWith = {
  id: number;
  title: string;
  category: string;
  tags: unknown;
  image: string;
  active: boolean;
  description?: string;
  packages: { tier: string; price: Prisma.Decimal; deliveryDays: number; revisions: number; features: unknown }[];
  freelancer: DbUser;
};
type JobWith = {
  id: number;
  title: string;
  category: string;
  description: string;
  skills: unknown;
  budget: Prisma.Decimal;
  status: string;
  experienceLevel: string;
  duration: string;
  createdAt: Date;
  client: DbUser;
};
type ProposalWith = {
  id: number;
  jobId: number;
  bid: Prisma.Decimal;
  deliveryDays: number;
  coverLetter: string;
  status: string;
  createdAt: Date;
  freelancer: DbUser;
  job?: JobWith & { client: DbUser };
};
type OrderWith = {
  id: number;
  clientId: number;
  freelancerId: number;
  title: string;
  amount: Prisma.Decimal;
  buyerFee: Prisma.Decimal;
  sellerFeePct: Prisma.Decimal;
  status: string;
  package: string | null;
  deliveryDays: number;
  gigId: number | null;
  jobId: number | null;
  createdAt: Date;
  deliveredAt: Date | null;
  releasedAt: Date | null;
  disputed: boolean;
  disputeReason: string;
  disputeBy: number | null;
  disputeOpenedAt: Date | null;
  resolutionNote: string;
  client: DbUser;
  freelancer: DbUser;
  review?: {
    id: number;
    rating: number;
    comment: string;
    createdAt: Date;
    client: DbUser;
  } | null;
  clientReview?: {
    id: number;
    rating: number;
    comment: string;
    createdAt: Date;
    freelancer: DbUser;
  } | null;
};

export function money(v: Prisma.Decimal | number | string | null | undefined): number {
  return Number(new Prisma.Decimal(v ?? 0).toDecimalPlaces(2));
}

export function iso(dt: Date | null | undefined): string | null {
  if (!dt) return null;
  return dt.toISOString();
}

export function userBrief(u: DbUser) {
  const d: Record<string, unknown> = {
    id: u.id,
    name: u.name,
    role: u.role,
    color: u.color,
    avatar: u.avatar || "",
  };
  if (u.freelancer) {
    const f = u.freelancer;
    Object.assign(d, {
      headline: f.headline,
      rating: f.rating,
      reviews_count: f.reviewsCount,
      location: f.location,
    });
  }
  if (u.client) {
    Object.assign(d, {
      company: u.client.company,
      verified: u.client.verified,
      location: u.client.location,
    });
  }
  return d;
}

export function userFull(u: DbUser) {
  const d: Record<string, unknown> = {
    ...userBrief(u),
    email: u.email,
    created_at: iso(u.createdAt),
    is_active: u.isActive,
    notify_prefs: (u.notifyPrefs as object) || {},
  };
  if (u.freelancer) {
    const f = u.freelancer;
    d.profile = {
      headline: f.headline,
      bio: f.bio,
      location: f.location,
      category: f.category,
      skills: f.skills,
      hourly_rate: money(f.hourlyRate),
      available: f.available,
      rating: f.rating,
      reviews_count: f.reviewsCount,
      jobs_completed: f.jobsCompleted,
      languages: f.languages || [],
      experience: f.experience || [],
      portfolio: f.portfolio || [],
      visible: f.visible,
    };
  }
  if (u.client) {
    const c = u.client;
    d.profile = {
      company: c.company,
      bio: c.bio,
      location: c.location,
      verified: c.verified,
      total_spent: money(c.totalSpent),
      website: c.website,
      industry: c.industry,
    };
  }
  return d;
}

export function gigOut(g: GigWith, detail = false) {
  const pk = g.packages.map((p) => ({
    tier: p.tier,
    price: money(p.price),
    delivery_days: p.deliveryDays,
    revisions: p.revisions,
    features: p.features,
  }));
  const d: Record<string, unknown> = {
    id: g.id,
    title: g.title,
    category: g.category,
    tags: g.tags,
    active: g.active,
    image: g.image || "",
    from_price: Math.min(...pk.map((p) => p.price), Infinity) || 0,
    min_days: Math.min(...pk.map((p) => p.delivery_days), Infinity) || 0,
    freelancer: userBrief(g.freelancer),
    packages: pk,
  };
  if (pk.length === 0) {
    d.from_price = 0;
    d.min_days = 0;
  }
  if (detail) {
    d.description = g.description;
    d.skills = g.freelancer.freelancer?.skills || [];
    d.bio = g.freelancer.freelancer?.bio || "";
  }
  return d;
}

export function jobOut(
  j: JobWith,
  proposalsCount = 0,
  stats: Record<string, unknown> | null = null,
  applied: string | null = null,
) {
  const d: Record<string, unknown> = {
    id: j.id,
    title: j.title,
    category: j.category,
    description: j.description,
    skills: j.skills,
    budget: money(j.budget),
    status: j.status,
    experience_level: j.experienceLevel,
    duration: j.duration,
    created_at: iso(j.createdAt),
    proposals_count: proposalsCount,
    client: userBrief(j.client),
  };
  if (stats != null) d.client_stats = stats;
  if (applied != null) d.applied = applied;
  return d;
}

export function clientReviewOut(r: {
  id: number;
  rating: number;
  comment: string;
  createdAt: Date;
  freelancer: DbUser;
}) {
  return {
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    created_at: iso(r.createdAt),
    freelancer: userBrief(r.freelancer),
  };
}

export function proposalOut(p: ProposalWith, withJob = false) {
  const d: Record<string, unknown> = {
    id: p.id,
    job_id: p.jobId,
    bid: money(p.bid),
    delivery_days: p.deliveryDays,
    cover_letter: p.coverLetter,
    status: p.status,
    created_at: iso(p.createdAt),
    freelancer: userBrief(p.freelancer),
  };
  if (withJob && p.job) {
    d.job = {
      id: p.job.id,
      title: p.job.title,
      budget: money(p.job.budget),
      status: p.job.status,
      client: userBrief(p.job.client),
    };
  }
  return d;
}

export function reviewOut(r: {
  id: number;
  rating: number;
  comment: string;
  createdAt: Date;
  client: DbUser;
}) {
  return {
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    created_at: iso(r.createdAt),
    client: userBrief(r.client),
  };
}

export function orderOut(o: OrderWith, viewer: { id: number }) {
  const other = viewer.id === o.clientId ? o.freelancer : o.client;
  return {
    id: o.id,
    title: o.title,
    amount: money(o.amount),
    buyer_fee: money(o.buyerFee),
    seller_fee_pct: Number(o.sellerFeePct),
    status: o.status,
    package: o.package,
    delivery_days: o.deliveryDays,
    gig_id: o.gigId,
    job_id: o.jobId,
    created_at: iso(o.createdAt),
    delivered_at: iso(o.deliveredAt),
    released_at: iso(o.releasedAt),
    disputed: o.disputed,
    dispute_reason: o.disputeReason,
    dispute_by: o.disputeBy,
    dispute_opened_at: iso(o.disputeOpenedAt),
    resolution_note: o.resolutionNote,
    client: userBrief(o.client),
    freelancer: userBrief(o.freelancer),
    counterpart: userBrief(other),
    review: o.review ? reviewOut(o.review) : null,
    client_review: o.clientReview ? clientReviewOut(o.clientReview) : null,
  };
}

export function txOut(t: {
  id: number;
  kind: string;
  amount: Prisma.Decimal;
  description: string;
  orderId: number | null;
  createdAt: Date;
}) {
  return {
    id: t.id,
    kind: t.kind,
    amount: money(t.amount),
    description: t.description,
    order_id: t.orderId,
    created_at: iso(t.createdAt),
  };
}

export function messageOut(m: {
  id: number;
  conversationId: number;
  senderId: number;
  body: string;
  read: boolean;
  readAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: m.id,
    conversation_id: m.conversationId,
    sender_id: m.senderId,
    body: m.body,
    read: m.read,
    read_at: iso(m.readAt),
    created_at: iso(m.createdAt),
  };
}

export function conversationOut(
  c: { id: number; clientId: number; freelancerId: number; client: DbUser; freelancer: DbUser },
  viewer: { id: number },
  last: Parameters<typeof messageOut>[0] | null,
  unread: number,
  online = false,
) {
  const other = viewer.id === c.clientId ? c.freelancer : c.client;
  return {
    id: c.id,
    other: { ...userBrief(other), online },
    unread,
    last_message: last ? messageOut(last) : null,
  };
}

export function notificationOut(n: {
  id: number;
  kind: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: Date;
}) {
  return {
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link,
    read: n.read,
    created_at: iso(n.createdAt),
  };
}
