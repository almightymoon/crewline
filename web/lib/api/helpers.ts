import { prisma } from "@/lib/prisma";

export const orderInclude = {
  client: { include: { client: true, freelancer: true } },
  freelancer: { include: { client: true, freelancer: true } },
  review: { include: { client: { include: { client: true, freelancer: true } } } },
  clientReview: { include: { freelancer: { include: { client: true, freelancer: true } } } },
} as const;

export const gigInclude = {
  packages: true,
  freelancer: { include: { freelancer: true, client: true } },
} as const;

export const jobInclude = {
  client: { include: { client: true, freelancer: true } },
} as const;

export const proposalInclude = {
  freelancer: { include: { freelancer: true, client: true } },
} as const;

export const userInclude = { freelancer: true, client: true } as const;

export function words(q: string | null | undefined): string[] {
  return (q || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
}

export async function proposalCounts(ids: number[]): Promise<Record<number, number>> {
  if (!ids.length) return {};
  const rows = await prisma.proposal.groupBy({
    by: ["jobId"],
    where: { jobId: { in: ids }, status: { not: "withdrawn" } },
    _count: true,
  });
  return Object.fromEntries(rows.map((r) => [r.jobId, r._count]));
}

export async function clientStats(ids: number[]): Promise<Record<number, Record<string, unknown>>> {
  const uniq = [...new Set(ids)];
  const out: Record<number, Record<string, unknown>> = {};
  for (const i of uniq) {
    out[i] = {
      rating: 0,
      reviews_count: 0,
      jobs_posted: 0,
      hires: 0,
      hire_rate: 0,
      total_spent: 0,
      verified: false,
      location: "",
      member_since: null,
    };
  }
  if (!uniq.length) return out;

  const reviews = await prisma.clientReview.groupBy({
    by: ["clientId"],
    where: { clientId: { in: uniq } },
    _avg: { rating: true },
    _count: true,
  });
  for (const r of reviews) {
    out[r.clientId]!.rating = Math.round((r._avg.rating || 0) * 10) / 10;
    out[r.clientId]!.reviews_count = r._count;
  }

  const jobs = await prisma.job.groupBy({
    by: ["clientId"],
    where: { clientId: { in: uniq } },
    _count: true,
  });
  for (const j of jobs) out[j.clientId]!.jobs_posted = j._count;

  const hireRows = await prisma.order.findMany({
    where: { jobId: { not: null }, status: { not: "cancelled" }, clientId: { in: uniq } },
    select: { clientId: true, jobId: true },
  });
  const hireSets = new Map<number, Set<number>>();
  for (const h of hireRows) {
    if (h.jobId == null) continue;
    if (!hireSets.has(h.clientId)) hireSets.set(h.clientId, new Set());
    hireSets.get(h.clientId)!.add(h.jobId);
  }
  for (const [cid, set] of hireSets) out[cid]!.hires = set.size;

  const profiles = await prisma.clientProfile.findMany({
    where: { userId: { in: uniq } },
    include: { user: true },
  });
  for (const p of profiles) {
    out[p.userId]!.total_spent = Number(p.totalSpent);
    out[p.userId]!.verified = p.verified;
    out[p.userId]!.location = p.location;
    out[p.userId]!.member_since = p.user.createdAt.toISOString();
  }

  for (const st of Object.values(out)) {
    const posted = st.jobs_posted as number;
    const hires = st.hires as number;
    st.hire_rate = posted ? Math.min(100, Math.round((hires / posted) * 100)) : 0;
  }
  return out;
}

export function csv(v: string | null | undefined): string[] {
  return (v || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 12);
}
