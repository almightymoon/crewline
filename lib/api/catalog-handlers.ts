import { Prisma } from "@/app/generated/prisma";
import { prisma } from "@/lib/prisma";
import { memberOnly, optionalUser, requireRole } from "@/lib/auth";
import { CATEGORIES, CATEGORY_IMAGES, VALID_CATS } from "@/lib/config";
import { ApiError, json, parseBody } from "@/lib/http";
import { getSettings } from "@/lib/services";
import {
  clientReviewOut,
  gigOut,
  jobOut,
  money,
  proposalOut,
  reviewOut,
  userBrief,
  userFull,
} from "@/lib/serialize";
import { clientStats, csv, gigInclude, jobInclude, proposalCounts, words } from "./helpers";

export async function handleCatalog(method: string, parts: string[], req: Request, url: URL) {
  // GET /meta
  if (method === "GET" && parts[0] === "meta" && parts.length === 1) {
    const cfg = await getSettings();
    const gigs = await prisma.gig.groupBy({ by: ["category"], _count: true });
    const jobs = await prisma.job.groupBy({ by: ["category"], where: { status: "open" }, _count: true });
    const gigCounts = Object.fromEntries(gigs.map((g) => [g.category, g._count]));
    const jobCounts = Object.fromEntries(jobs.map((j) => [j.category, j._count]));
    return json({
      fees: { buyer: cfg.buyer_fee_pct, seller: cfg.seller_fee_pct },
      signups_enabled: cfg.signups_enabled,
      categories: CATEGORIES.map(([c, n]) => ({
        id: c,
        name: n,
        gigs: gigCounts[c] || 0,
        jobs: jobCounts[c] || 0,
        image: CATEGORY_IMAGES[c] || "",
      })),
      stats: {
        freelancers: await prisma.freelancerProfile.count(),
        clients: await prisma.clientProfile.count(),
        gigs: await prisma.gig.count(),
        open_jobs: await prisma.job.count({ where: { status: "open" } }),
        completed_orders: await prisma.order.count({ where: { status: "released" } }),
      },
    });
  }

  // GET /freelancers
  if (method === "GET" && parts[0] === "freelancers" && parts.length === 1) {
    const q = url.searchParams.get("q");
    const category = url.searchParams.get("category");
    const sort = url.searchParams.get("sort") || "rating";
    const limit = Math.min(Number(url.searchParams.get("limit") || 24), 60);
    const where: Prisma.UserWhereInput = {
      role: "freelancer",
      isActive: true,
      freelancer: { is: { visible: true, ...(category && category !== "all" ? { category } : {}) } },
    };
    const w = words(q);
    if (w.length) {
      where.AND = w.map((term) => ({
        OR: [
          { name: { contains: term } },
          { freelancer: { is: { headline: { contains: term } } } },
        ],
      }));
    }
    const rows = await prisma.user.findMany({
      where,
      include: { freelancer: true, client: true },
      take: limit,
      orderBy:
        sort === "rating"
          ? [{ freelancer: { rating: "desc" } }, { freelancer: { reviewsCount: "desc" } }]
          : [{ freelancer: { hourlyRate: "asc" } }],
    });
    // filter skills in memory for SQLite JSON
    const filtered = w.length
      ? rows.filter((u) => {
          const skills = JSON.stringify(u.freelancer?.skills || []).toLowerCase();
          return w.every(
            (term) =>
              u.name.toLowerCase().includes(term) ||
              (u.freelancer?.headline || "").toLowerCase().includes(term) ||
              skills.includes(term),
          );
        })
      : rows;
    return json(
      filtered.map((u) => ({
        ...userBrief(u),
        skills: u.freelancer!.skills,
        hourly_rate: money(u.freelancer!.hourlyRate),
        jobs_completed: u.freelancer!.jobsCompleted,
        category: u.freelancer!.category,
        available: u.freelancer!.available,
      })),
    );
  }

  // GET /freelancers/:id
  if (method === "GET" && parts[0] === "freelancers" && parts.length === 2) {
    const uid = Number(parts[1]);
    const viewer = await optionalUser(req);
    const u = await prisma.user.findFirst({
      where: { id: uid, role: "freelancer" },
      include: { freelancer: true, client: true },
    });
    if (!u || !u.isActive) throw new ApiError(404, "Freelancer not found");
    if (!u.freelancer?.visible && !(viewer && (viewer.id === uid || viewer.role === "admin"))) {
      throw new ApiError(404, "This profile is private");
    }
    const gigs = await prisma.gig.findMany({
      where: { freelancerId: uid, active: true },
      include: gigInclude,
    });
    const reviews = await prisma.review.findMany({
      where: { freelancerId: uid },
      include: { client: { include: { client: true, freelancer: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    const d = userFull(u);
    delete d.email;
    return json({ ...d, gigs: gigs.map((g) => gigOut(g)), reviews: reviews.map(reviewOut) });
  }

  // GET /clients/:id
  if (method === "GET" && parts[0] === "clients" && parts.length === 2) {
    const uid = Number(parts[1]);
    const u = await prisma.user.findFirst({
      where: { id: uid, role: "client" },
      include: { client: true, freelancer: true },
    });
    if (!u || !u.isActive) throw new ApiError(404, "Client not found");
    const d = userFull(u);
    delete d.email;
    const jobs = await prisma.job.findMany({
      where: { clientId: uid },
      include: jobInclude,
      orderBy: { createdAt: "desc" },
      take: 12,
    });
    const pc = await proposalCounts(jobs.map((j) => j.id));
    const reviews = await prisma.clientReview.findMany({
      where: { clientId: uid },
      include: { freelancer: { include: { freelancer: true, client: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    const stats = (await clientStats([uid]))[uid];
    return json({
      ...d,
      stats,
      open_jobs: jobs.filter((j) => j.status === "open").map((j) => jobOut(j, pc[j.id] || 0)),
      past_jobs: jobs.filter((j) => j.status !== "open").map((j) => jobOut(j, pc[j.id] || 0)),
      reviews: reviews.map(clientReviewOut),
    });
  }

  // PUT /me/profile
  if (method === "PUT" && parts[0] === "me" && parts[1] === "profile") {
    const user = await memberOnly(req);
    const body = await parseBody<Record<string, unknown>>(req);
    if (typeof body.name === "string") {
      await prisma.user.update({ where: { id: user.id }, data: { name: body.name.trim() } });
    }
    if (user.freelancer) {
      const data: Prisma.FreelancerProfileUpdateInput = {};
      for (const k of ["headline", "bio", "location"] as const) {
        if (body[k] !== undefined) data[k] = String(body[k]);
      }
      if (body.hourly_rate !== undefined) data.hourlyRate = new Prisma.Decimal(Number(body.hourly_rate));
      if (body.available !== undefined) data.available = Boolean(body.available);
      if (body.visible !== undefined) data.visible = Boolean(body.visible);
      if (typeof body.category === "string" && VALID_CATS.has(body.category)) data.category = body.category;
      if (Array.isArray(body.skills)) data.skills = body.skills.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 15);
      if (Array.isArray(body.languages)) data.languages = body.languages.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 15);
      if (Array.isArray(body.experience)) {
        data.experience = (body.experience as { role?: string; company?: string }[])
          .filter((e) => (e.role || "").trim() || (e.company || "").trim())
          .slice(0, 10);
      }
      if (Array.isArray(body.portfolio)) {
        data.portfolio = (body.portfolio as { title?: string }[]).filter((p) => (p.title || "").trim()).slice(0, 12);
      }
      await prisma.freelancerProfile.update({ where: { userId: user.id }, data });
    } else if (user.client) {
      const data: Prisma.ClientProfileUpdateInput = {};
      for (const k of ["company", "bio", "location", "website", "industry"] as const) {
        if (body[k] !== undefined) data[k] = String(body[k]);
      }
      await prisma.clientProfile.update({ where: { userId: user.id }, data });
    }
    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { freelancer: true, client: true },
    });
    return json(userFull(updated));
  }

  // GET /gigs
  if (method === "GET" && parts[0] === "gigs" && parts.length === 1) {
    const q = url.searchParams.get("q");
    const category = url.searchParams.get("category");
    const maxPrice = url.searchParams.get("max_price");
    const maxDays = url.searchParams.get("max_days");
    const sort = url.searchParams.get("sort") || "recommended";
    const limit = Math.min(Number(url.searchParams.get("limit") || 48), 100);
    const where: Prisma.GigWhereInput = {
      active: true,
      freelancer: { isActive: true },
      ...(category && category !== "all" ? { category } : {}),
    };
    let rows = await prisma.gig.findMany({
      where,
      include: gigInclude,
      take: 200,
      orderBy: { id: "desc" },
    });
    const w = words(q);
    rows = rows.filter((g) => {
      const minp = Math.min(...g.packages.map((p) => Number(p.price)), Infinity);
      const mind = Math.min(...g.packages.map((p) => p.deliveryDays), Infinity);
      if (maxPrice && minp > Number(maxPrice)) return false;
      if (maxDays && mind > Number(maxDays)) return false;
      if (w.length) {
        const blob = `${g.title} ${g.description} ${JSON.stringify(g.tags)} ${g.freelancer.name}`.toLowerCase();
        if (!w.every((t) => blob.includes(t))) return false;
      }
      return true;
    });
    rows.sort((a, b) => {
      const ap = Math.min(...a.packages.map((p) => Number(p.price)), 0);
      const bp = Math.min(...b.packages.map((p) => Number(p.price)), 0);
      if (sort === "price_low") return ap - bp;
      if (sort === "price_high") return bp - ap;
      if (sort === "newest") return b.createdAt.getTime() - a.createdAt.getTime();
      return (b.freelancer.freelancer?.rating || 0) - (a.freelancer.freelancer?.rating || 0);
    });
    return json(rows.slice(0, limit).map((g) => gigOut(g)));
  }

  // GET /gigs/:id
  if (method === "GET" && parts[0] === "gigs" && parts.length === 2 && !Number.isNaN(Number(parts[1]))) {
    const g = await prisma.gig.findUnique({ where: { id: Number(parts[1]) }, include: gigInclude });
    if (!g) throw new ApiError(404, "Gig not found");
    return json(gigOut(g, true));
  }

  // POST /gigs
  if (method === "POST" && parts[0] === "gigs" && parts.length === 1) {
    const user = await requireRole(req, "freelancer");
    const body = await parseBody<{
      title: string;
      category: string;
      description: string;
      tags?: string[];
      image?: string;
      basic: { price: number; delivery_days: number; revisions?: number; features?: string[] };
      standard: { price: number; delivery_days: number; revisions?: number; features?: string[] };
      premium: { price: number; delivery_days: number; revisions?: number; features?: string[] };
    }>(req);
    if (!VALID_CATS.has(body.category)) throw new ApiError(422, "Unknown category");
    const image = (body.image || "").trim();
    if (image && !image.startsWith("/") && !image.startsWith("http")) throw new ApiError(422, "Image must be a URL");
    const g = await prisma.gig.create({
      data: {
        freelancerId: user.id,
        title: body.title.trim(),
        category: body.category,
        description: body.description.trim(),
        tags: (body.tags || []).map((t) => t.trim()).filter(Boolean).slice(0, 8),
        image,
        packages: {
          create: (["basic", "standard", "premium"] as const).map((tier) => {
            const p = body[tier];
            return {
              tier,
              price: p.price,
              deliveryDays: p.delivery_days,
              revisions: p.revisions ?? 1,
              features: (p.features || []).filter((f) => f.trim()),
            };
          }),
        },
      },
    });
    return json({ id: g.id }, 201);
  }

  // DELETE /gigs/:id
  if (method === "DELETE" && parts[0] === "gigs" && parts.length === 2) {
    const user = await requireRole(req, "freelancer");
    const g = await prisma.gig.findUnique({ where: { id: Number(parts[1]) } });
    if (!g || g.freelancerId !== user.id) throw new ApiError(404, "Gig not found");
    await prisma.gig.update({ where: { id: g.id }, data: { active: false } });
    return json({ ok: true });
  }

  // GET /me/gigs
  if (method === "GET" && parts[0] === "me" && parts[1] === "gigs") {
    const user = await requireRole(req, "freelancer");
    const rows = await prisma.gig.findMany({
      where: { freelancerId: user.id, active: true },
      include: gigInclude,
      orderBy: { id: "desc" },
    });
    return json(rows.map((g) => gigOut(g)));
  }

  // GET /jobs/search
  if (method === "GET" && parts[0] === "jobs" && parts[1] === "search") {
    return handleJobSearch(req, url);
  }

  // GET /jobs
  if (method === "GET" && parts[0] === "jobs" && parts.length === 1) {
    const q = url.searchParams.get("q");
    const category = url.searchParams.get("category");
    const minBudget = url.searchParams.get("min_budget");
    const status = url.searchParams.get("status") || "open";
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
    const where: Prisma.JobWhereInput = {
      ...(status !== "any" ? { status } : {}),
      ...(category && category !== "all" ? { category } : {}),
      ...(minBudget ? { budget: { gte: Number(minBudget) } } : {}),
    };
    let rows = await prisma.job.findMany({
      where,
      include: jobInclude,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const w = words(q);
    if (w.length) {
      rows = rows.filter((j) => {
        const blob = `${j.title} ${j.description} ${JSON.stringify(j.skills)}`.toLowerCase();
        return w.every((t) => blob.includes(t));
      });
    }
    const c = await proposalCounts(rows.map((j) => j.id));
    return json(rows.map((j) => jobOut(j, c[j.id] || 0)));
  }

  // GET /jobs/:id
  if (method === "GET" && parts[0] === "jobs" && parts.length === 2 && !Number.isNaN(Number(parts[1]))) {
    const jid = Number(parts[1]);
    const user = await optionalUser(req);
    const j = await prisma.job.findUnique({ where: { id: jid }, include: jobInclude });
    if (!j) throw new ApiError(404, "Job not found");
    const stats = (await clientStats([j.clientId]))[j.clientId]!;
    const out = jobOut(j, (await proposalCounts([j.id]))[j.id] || 0, stats) as Record<string, unknown>;
    const bids = (
      await prisma.proposal.findMany({
        where: { jobId: jid, status: { not: "withdrawn" } },
        select: { bid: true },
      })
    ).map((b) => Number(b.bid));
    out.bids = bids.length
      ? { avg: Math.round((bids.reduce((a, b) => a + b, 0) / bids.length) * 100) / 100, low: Math.min(...bids), high: Math.max(...bids) }
      : null;
    const reviews = await prisma.clientReview.findMany({
      where: { clientId: j.clientId },
      include: { freelancer: { include: { freelancer: true, client: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    });
    out.client_reviews = reviews.map(clientReviewOut);
    const past = await prisma.job.findMany({
      where: { clientId: j.clientId, id: { not: jid } },
      include: jobInclude,
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    const pc = await proposalCounts(past.map((p) => p.id));
    out.client_jobs = past.map((p) => jobOut(p, pc[p.id] || 0));
    const sim = await prisma.job.findMany({
      where: { category: j.category, id: { not: jid }, status: "open" },
      include: jobInclude,
      orderBy: { createdAt: "desc" },
      take: 3,
    });
    const sc = await proposalCounts(sim.map((p) => p.id));
    out.similar = sim.map((p) => jobOut(p, sc[p.id] || 0));
    if (user?.role === "freelancer") {
      const p = await prisma.proposal.findUnique({
        where: { jobId_freelancerId: { jobId: jid, freelancerId: user.id } },
        include: { freelancer: { include: { freelancer: true, client: true } } },
      });
      out.my_proposal_status = p?.status ?? null;
      out.my_proposal = p && p.status !== "withdrawn" ? proposalOut(p) : null;
      const my = new Set(((user.freelancer?.skills as string[]) || []).map((s) => s.toLowerCase()));
      out.match = [...my].filter((s) => ((j.skills as string[]) || []).map((x) => x.toLowerCase()).includes(s)).sort();
    }
    return json(out);
  }

  // POST /jobs
  if (method === "POST" && parts[0] === "jobs" && parts.length === 1) {
    const user = await requireRole(req, "client");
    const body = await parseBody<{
      title: string;
      category: string;
      description: string;
      skills?: string[];
      budget: number;
      experience_level?: string;
      duration?: string;
    }>(req);
    if (!VALID_CATS.has(body.category)) throw new ApiError(422, "Unknown category");
    const j = await prisma.job.create({
      data: {
        clientId: user.id,
        title: body.title.trim(),
        category: body.category,
        description: body.description.trim(),
        skills: (body.skills || []).map((s) => s.trim()).filter(Boolean).slice(0, 8),
        budget: body.budget,
        experienceLevel: body.experience_level || "intermediate",
        duration: body.duration || "month",
      },
    });
    return json({ id: j.id }, 201);
  }

  // GET /me/jobs
  if (method === "GET" && parts[0] === "me" && parts[1] === "jobs") {
    const user = await requireRole(req, "client");
    const rows = await prisma.job.findMany({
      where: { clientId: user.id },
      include: jobInclude,
      orderBy: { createdAt: "desc" },
    });
    const c = await proposalCounts(rows.map((j) => j.id));
    return json(rows.map((j) => jobOut(j, c[j.id] || 0)));
  }

  // POST /jobs/:id/close
  if (method === "POST" && parts[0] === "jobs" && parts[2] === "close") {
    const user = await requireRole(req, "client");
    const j = await prisma.job.findUnique({ where: { id: Number(parts[1]) } });
    if (!j || j.clientId !== user.id) throw new ApiError(404, "Job not found");
    if (j.status !== "open") throw new ApiError(409, "Only open jobs can be closed");
    await prisma.job.update({ where: { id: j.id }, data: { status: "closed" } });
    await prisma.proposal.updateMany({
      where: { jobId: j.id, status: "pending" },
      data: { status: "rejected" },
    });
    return json({ ok: true });
  }

  return null;
}

async function handleJobSearch(req: Request, url: URL) {
  const viewer = await optionalUser(req);
  const q = url.searchParams.get("q");
  const category = url.searchParams.get("category");
  const experience = url.searchParams.get("experience");
  const duration = url.searchParams.get("duration");
  const skills = url.searchParams.get("skills");
  const minBudget = url.searchParams.get("min_budget");
  const maxBudget = url.searchParams.get("max_budget");
  const verified = url.searchParams.get("verified") === "true";
  const minRating = url.searchParams.get("min_rating");
  const minSpent = url.searchParams.get("min_spent");
  const minProposals = url.searchParams.get("min_proposals");
  const maxProposals = url.searchParams.get("max_proposals");
  const postedWithin = url.searchParams.get("posted_within");
  const applied = url.searchParams.get("applied") as "hide" | "only" | null;
  const sort = url.searchParams.get("sort") || "newest";
  const limit = Math.min(Number(url.searchParams.get("limit") || 20), 50);
  const offset = Number(url.searchParams.get("offset") || 0);

  const rows = await prisma.job.findMany({
    where: { status: "open" },
    include: { ...jobInclude, client: { include: { client: true, freelancer: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const countsAll = await proposalCounts(rows.map((j) => j.id));
  const statsAll = await clientStats(rows.map((j) => j.clientId));

  const cats = csv(category);
  const exps = csv(experience);
  const durs = csv(duration);
  const skillList = csv(skills);
  const w = words(q);

  let myApplied = new Set<number>();
  if (viewer?.role === "freelancer") {
    const mine = await prisma.proposal.findMany({
      where: { freelancerId: viewer.id, status: { not: "withdrawn" } },
      select: { jobId: true, status: true },
    });
    myApplied = new Set(mine.map((m) => m.jobId));
  }

  const filter = (skip?: string) =>
    rows.filter((j) => {
      const st = statsAll[j.clientId]!;
      const pc = countsAll[j.id] || 0;
      if (w.length) {
        const blob = `${j.title} ${j.description} ${JSON.stringify(j.skills)}`.toLowerCase();
        if (!w.every((t) => blob.includes(t))) return false;
      }
      if (skip !== "category" && cats.length && !cats.includes(j.category)) return false;
      if (skip !== "experience" && exps.length && !exps.includes(j.experienceLevel)) return false;
      if (skip !== "duration" && durs.length && !durs.includes(j.duration)) return false;
      if (skillList.length) {
        const js = JSON.stringify(j.skills).toLowerCase();
        if (!skillList.every((s) => js.includes(s.toLowerCase()))) return false;
      }
      if (minBudget && Number(j.budget) < Number(minBudget)) return false;
      if (maxBudget && Number(j.budget) > Number(maxBudget)) return false;
      if (verified && !st.verified) return false;
      if (minRating && Number(st.rating) < Number(minRating)) return false;
      if (minSpent && Number(st.total_spent) < Number(minSpent)) return false;
      if (minProposals != null && minProposals !== "" && pc < Number(minProposals)) return false;
      if (maxProposals != null && maxProposals !== "" && pc > Number(maxProposals)) return false;
      if (postedWithin) {
        const cutoff = Date.now() - Number(postedWithin) * 3600_000;
        if (j.createdAt.getTime() < cutoff) return false;
      }
      if (applied && viewer?.role === "freelancer") {
        const has = myApplied.has(j.id);
        if (applied === "only" && !has) return false;
        if (applied === "hide" && has) return false;
      }
      return true;
    });

  const filtered = filter();
  const total = filtered.length;

  const mySkills = new Set(
    (((viewer?.freelancer?.skills as string[]) || []) as string[]).map((s) => s.toLowerCase()),
  );

  if (sort === "best_match" && mySkills.size) {
    filtered.sort((a, b) => {
      const am =
        [...mySkills].filter((s) => ((a.skills as string[]) || []).map((x) => x.toLowerCase()).includes(s)).length +
        (viewer!.freelancer?.category === a.category ? 0.5 : 0);
      const bm =
        [...mySkills].filter((s) => ((b.skills as string[]) || []).map((x) => x.toLowerCase()).includes(s)).length +
        (viewer!.freelancer?.category === b.category ? 0.5 : 0);
      return bm - am || b.createdAt.getTime() - a.createdAt.getTime();
    });
  } else if (sort === "budget_high") filtered.sort((a, b) => Number(b.budget) - Number(a.budget));
  else if (sort === "budget_low") filtered.sort((a, b) => Number(a.budget) - Number(b.budget));
  else if (sort === "fewest_proposals")
    filtered.sort((a, b) => (countsAll[a.id] || 0) - (countsAll[b.id] || 0) || b.createdAt.getTime() - a.createdAt.getTime());
  else if (sort === "client_rating")
    filtered.sort(
      (a, b) =>
        Number(statsAll[b.clientId]!.rating) - Number(statsAll[a.clientId]!.rating) ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    );
  else if (sort === "client_spent")
    filtered.sort(
      (a, b) =>
        Number(statsAll[b.clientId]!.total_spent) - Number(statsAll[a.clientId]!.total_spent) ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    );
  else filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const page = filtered.slice(offset, offset + limit);
  let mineStatus: Record<number, string> = {};
  if (viewer?.role === "freelancer" && page.length) {
    const mine = await prisma.proposal.findMany({
      where: {
        jobId: { in: page.map((j) => j.id) },
        freelancerId: viewer.id,
        status: { not: "withdrawn" },
      },
    });
    mineStatus = Object.fromEntries(mine.map((m) => [m.jobId, m.status]));
  }

  const items = page.map((j) => {
    const d = jobOut(j, countsAll[j.id] || 0, statsAll[j.clientId], mineStatus[j.id] ?? null) as Record<string, unknown>;
    d.match = mySkills.size
      ? [...mySkills].filter((s) => ((j.skills as string[]) || []).map((x) => x.toLowerCase()).includes(s)).sort()
      : [];
    return d;
  });

  const facet = (field: "category" | "experienceLevel" | "duration", skip: string) => {
    const counts: Record<string, number> = {};
    for (const j of filter(skip)) {
      const key = j[field];
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  };

  return json({
    items,
    total,
    offset,
    facets: {
      category: facet("category", "category"),
      experience: facet("experienceLevel", "experience"),
      duration: facet("duration", "duration"),
    },
  });
}
