/**
 * Sample data: freelancers, clients, gigs, jobs, proposals, orders, reviews and conversations.
 * Ported from backend/app/seed.py
 *
 * Every seeded account uses the password `password123`.
 * Run: npm run db:seed
 */
import { pbkdf2Sync, randomBytes } from "crypto";
import { Prisma, PrismaClient } from "../app/generated/prisma";

const prisma = new PrismaClient();

const PASSWORD = "password123";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@crewline.dev";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin12345";
const BUYER_FEE_PCT = new Prisma.Decimal("0.05");
const SELLER_FEE_PCT = new Prisma.Decimal("0.10");
const NOW = new Date();

function q(v: Prisma.Decimal | number | string): Prisma.Decimal {
  return new Prisma.Decimal(v).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function sellerNet(amount: Prisma.Decimal | number | string, pct = SELLER_FEE_PCT): Prisma.Decimal {
  return q(new Prisma.Decimal(amount).mul(new Prisma.Decimal(1).minus(pct)));
}

/** Match backend/app/security.py: pbkdf2_sha256$200000$salt$dk */
function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const dk = pbkdf2Sync(password, salt, 200_000, 32, "sha256");
  return `pbkdf2_sha256$200000$${salt.toString("base64")}$${dk.toString("base64")}`;
}

function ago(hours: number): Date {
  return new Date(NOW.getTime() - hours * 3600_000);
}

type FreelancerRow = [
  string, string, string, string, string, string, string[], number, number, number, number, string, string,
];
type ClientRow = [string, string, string, string, string, boolean, string, string];
type GigRow = [string, string, string, string, string[], number, number, string[]];
type JobRow = [string, string, string, string, string[], number, number, string];

const FREELANCERS: FreelancerRow[] = [
  ["amara", "Amara Okafor", "amara@crewline.dev", "Brand identity designer", "Lagos, Nigeria", "design",
    ["Logo design", "Brand guidelines", "Illustrator", "Packaging"], 55, 4.9, 312, 340, "#ff6b4a",
    "Eight years building identities for startups and family businesses. I start with a short call, then show two directions before polishing one."],
  ["tomas", "Tomás Rivera", "tomas@crewline.dev", "Full-stack developer, Next.js and FastAPI", "Mexico City, Mexico", "dev",
    ["Next.js", "FastAPI", "TypeScript", "PostgreSQL", "Docker"], 85, 4.9, 187, 205, "#0a84ff",
    "I ship production web apps for fintech and healthcare teams. Clear scopes, weekly demos, documented handover."],
  ["hana", "Hana Sato", "hana@crewline.dev", "Motion designer", "Osaka, Japan", "video",
    ["After Effects", "Logo animation", "Explainers", "Lottie"], 70, 4.8, 143, 160, "#bf5af2",
    "I make small, precise 2D animations that explain a product in under a minute."],
  ["daniyal", "Daniyal Khan", "daniyal@crewline.dev", "Python and data engineer", "Lahore, Pakistan", "data",
    ["Python", "Pandas", "ETL", "Airflow", "Dashboards"], 60, 4.7, 96, 110, "#5e5ce6",
    "Turning messy exports and spreadsheets into pipelines that run on their own."],
  ["elise", "Elise Moreau", "elise@crewline.dev", "Copywriter and ghostwriter", "Lyon, France", "writing",
    ["Website copy", "Long-form", "Case studies", "Email"], 65, 5.0, 221, 240, "#ff375f",
    "Former journalist. I interview you, then write in your voice so it reads like you on your best day."],
  ["ravi", "Ravi Menon", "ravi@crewline.dev", "Mobile developer, Flutter", "Bengaluru, India", "dev",
    ["Flutter", "Dart", "Firebase", "Maps"], 75, 4.8, 129, 140, "#30b0c7",
    "Cross-platform MVPs that go from idea to the app stores in a few weeks."],
  ["sofia", "Sofia Petrova", "sofia@crewline.dev", "UI/UX designer", "Sofia, Bulgaria", "design",
    ["Figma", "Prototyping", "Design systems", "User research"], 80, 4.9, 204, 230, "#ff9f0a",
    "I design interfaces people understand on the first try, and hand them over ready for developers."],
  ["marcus", "Marcus Bell", "marcus@crewline.dev", "Video editor", "Austin, USA", "video",
    ["Premiere Pro", "Captions", "Sound design", "Color"], 45, 4.8, 278, 300, "#34c759",
    "Fast-turnaround editing for creators and course makers."],
  ["lina", "Lina Haddad", "lina@crewline.dev", "SEO and content strategist", "Amman, Jordan", "marketing",
    ["Technical SEO", "Content planning", "Analytics", "Link building"], 58, 4.7, 118, 130, "#ac8e68",
    "I find the few fixes that move rankings, then rank them by effort and payoff."],
  ["kwame", "Kwame Boateng", "kwame@crewline.dev", "Podcast producer", "Accra, Ghana", "audio",
    ["Audio editing", "Mastering", "Show notes", "Music"], 40, 4.9, 164, 180, "#ff6482",
    "Clean, even audio and tidy episodes so you can focus on the conversation."],
  ["priya", "Priya Nair", "priya@crewline.dev", "Machine learning engineer", "Toronto, Canada", "data",
    ["PyTorch", "NLP", "LLM apps", "MLOps"], 110, 4.9, 72, 80, "#64d2ff",
    "I build practical ML features: classification, search and retrieval, and LLM workflows with evaluation."],
  ["noah", "Noah Fischer", "noah@crewline.dev", "Social media and growth marketer", "Berlin, Germany", "marketing",
    ["Paid social", "Content calendars", "Analytics", "Copy"], 62, 4.6, 88, 95, "#a2845e",
    "Small budgets, measurable results. I set up tracking first, then test creative every week."],
];

const CLIENTS: ClientRow[] = [
  ["helen", "Helen Park", "helen@crewline.dev", "Beacon Clinic", "Seattle, USA", true,
    "A multi-location primary care clinic modernizing its patient experience.", "#0a84ff"],
  ["james", "James Whitfield", "james@crewline.dev", "Tidewater Care", "Norfolk, USA", true,
    "Home care agency building its own scheduling and billing software.", "#30b0c7"],
  ["maya", "Maya Brooks", "maya@crewline.dev", "Pine Street Studio", "Portland, USA", false,
    "Online course studio producing video-led learning for creative professionals.", "#ff9f0a"],
  ["luis", "Luis Ortega", "luis@crewline.dev", "Orchard Fintech", "Madrid, Spain", true,
    "Payments startup serving small merchants across southern Europe.", "#5e5ce6"],
  ["chloe", "Chloe Bennett", "chloe@crewline.dev", "Mosaic Foods", "London, UK", true,
    "Specialty food brand selling direct to consumers and restaurants.", "#34c759"],
];

const GIGS: GigRow[] = [
  ["amara", "design", "I will design a memorable logo and brand identity kit",
    "You get a logo that works on a shop sign and a favicon, plus the colors and fonts to keep everything consistent.",
    ["logo", "branding", "identity"], 120, 4, ["Primary logo with 2 concepts", "Color palette and type pairing", "Brand guidelines PDF and social kit"]],
  ["tomas", "dev", "I will build your full-stack web app with Next.js and FastAPI",
    "A working product, not a prototype: authentication, database, API and deployment, written in TypeScript and Python.",
    ["nextjs", "fastapi", "web app"], 400, 10, ["Landing page, 3 app pages and login", "REST API with FastAPI and PostgreSQL", "Deployment, tests and handover docs"]],
  ["hana", "video", "I will animate your logo or explainer in 2D motion",
    "Short, clean animations for websites, ads and product demos. Delivered in MP4 and transparent formats.",
    ["animation", "explainer", "logo"], 90, 3, ["5-second logo sting", "30-second explainer with voice-over sync", "60-second explainer with custom illustrations"]],
  ["daniyal", "data", "I will build a Python data pipeline and dashboard",
    "Pull data from APIs, CSVs and databases, clean it on a schedule, and see it in a dashboard you can share.",
    ["python", "etl", "dashboard"], 250, 7, ["One data source, one dashboard", "Up to three sources with scheduled refresh", "Alerts, documentation and a walkthrough call"]],
  ["elise", "writing", "I will write conversion-focused website copy",
    "Headlines, page copy and calls to action that say what you do in plain language.",
    ["copywriting", "website", "landing page"], 80, 3, ["One page, up to 500 words", "Up to 3 pages with SEO titles", "Full site copy with a messaging guide"]],
  ["ravi", "dev", "I will build your Flutter mobile app MVP",
    "One codebase for iOS and Android with login, a backend and push notifications.",
    ["flutter", "mobile", "mvp"], 500, 14, ["3 screens with Firebase backend", "8 screens, login and notifications", "Full MVP with store submission help"]],
  ["sofia", "design", "I will design your app UI in Figma with a clickable prototype",
    "Wireframes through polished screens, with components organized so developers can build from them.",
    ["figma", "ui", "ux"], 200, 5, ["Up to 4 screens", "Up to 10 screens with prototype", "Full flow, design system and dev handoff"]],
  ["marcus", "video", "I will edit your YouTube videos with captions and sound design",
    "Tight cuts, readable captions, color correction and clean audio on every video.",
    ["video editing", "youtube", "captions"], 60, 2, ["Up to 5 minutes of footage", "Up to 15 minutes with b-roll", "Up to 30 minutes with thumbnail"]],
  ["lina", "marketing", "I will run a technical SEO audit with a ranked fix list",
    "A prioritized list of what to fix first, why it matters, and how long each fix takes.",
    ["seo", "audit", "analytics"], 150, 4, ["Audit of up to 50 pages", "Audit plus competitor gap analysis", "Audit, roadmap and 30-minute strategy call"]],
  ["kwame", "audio", "I will edit and master your podcast episode",
    "Noise removal, leveling, filler cleanup and a final master that sounds the same on every device.",
    ["podcast", "mastering", "audio editing"], 45, 2, ["One episode up to 30 minutes", "Episode with intro and outro music", "Episode, show notes and a short audiogram"]],
  ["tomas", "dev", "I will fix bugs and ship features on your TypeScript codebase",
    "Send me the issue list. I will triage, fix and explain each change in the pull request.",
    ["typescript", "bug fixes", "react"], 75, 2, ["Up to 3 small bugs", "One medium feature with tests", "Feature plus code review and refactor notes"]],
  ["daniyal", "data", "I will automate your spreadsheet reports with Python",
    "Stop copy-pasting every Monday. I turn your recurring report into a script that emails the result.",
    ["automation", "excel", "python"], 100, 3, ["One report automated", "Up to three reports", "Reports plus a simple web form to run them"]],
  ["elise", "writing", "I will turn your expertise into a ghostwritten long-form article",
    "A 1,500 to 3,000 word article in your voice, built from a 30-minute interview.",
    ["ghostwriting", "article", "thought leadership"], 140, 5, ["One 1,500-word article", "One 2,500-word article with sources", "Two articles and a LinkedIn summary for each"]],
  ["amara", "design", "I will design an editable social media template pack",
    "Templates for posts, stories and covers that your team can edit in Canva without breaking the look.",
    ["social media", "canva", "templates"], 55, 2, ["6 post templates", "12 templates with story formats", "24 templates and a how-to guide"]],
  ["priya", "data", "I will build a retrieval-augmented chatbot over your documents",
    "A chatbot that answers from your own PDFs and wiki, with citations and a basic evaluation set so you can trust it.",
    ["llm", "rag", "chatbot"], 600, 10, ["Chatbot over up to 100 documents", "Adds evaluation set and feedback logging", "Adds role-based access and deployment"]],
  ["noah", "marketing", "I will plan a 30-day content calendar for your product",
    "Topics, formats and posting days matched to your audience and the keywords they search.",
    ["content", "social media", "strategy"], 70, 3, ["10 topics with outlines", "30-day calendar with channels", "Calendar, briefs and a reporting template"]],
];

const JOBS: JobRow[] = [
  ["helen", "design", "Redesign our patient booking flow", "Our clinic app loses people at the time-selection step. We need a clearer flow, tested with five users, and handoff files for our developers.", ["Figma", "UX research", "Healthcare"], 1800, 2, "open"],
  ["james", "dev", "Build a REST API for shift scheduling", "Multi-tenant scheduling with roles, overtime rules and audit logs. We have the data model drafted and need it built and tested.", ["FastAPI", "PostgreSQL", "Docker"], 3200, 5, "open"],
  ["maya", "video", "Edit 12 course videos", "Twelve videos of 8 to 12 minutes each. Remove pauses, add captions and our intro. Raw files are ready to share.", ["Premiere Pro", "Captions"], 600, 20, "open"],
  ["luis", "writing", "Write six case studies from customer calls", "We have recordings and transcripts. Each case study should run about 900 words and follow our template.", ["Case studies", "B2B", "Interviewing"], 1200, 27, "open"],
  ["chloe", "data", "Clean and model two years of sales data", "CSV exports from three systems that disagree with each other. Reconcile them and deliver a monthly forecast notebook.", ["Python", "Pandas", "Forecasting"], 900, 50, "open"],
  ["luis", "marketing", "Fix our site's Core Web Vitals", "Our largest contentful paint is 4.8 seconds on mobile. Find the causes, fix what you can, and give us a list of what you cannot.", ["Technical SEO", "Performance"], 700, 55, "open"],
  ["maya", "audio", "Mix and master a six-episode podcast season", "Interview format, two voices per episode, recorded remotely. Need consistent loudness and a reusable preset.", ["Mastering", "Audio editing"], 540, 70, "open"],
  ["james", "dev", "Flutter app for tracking home visits", "Caregivers check in and out, clients see live status. Designs are ready in Figma and the API already exists.", ["Flutter", "Firebase", "Maps"], 4500, 90, "open"],
  ["helen", "marketing", "Local SEO for three clinic locations", "Set up and optimise our Google Business profiles, fix NAP consistency and build a review request process.", ["Local SEO", "Analytics"], 800, 100, "open"],
  ["chloe", "design", "Packaging design for a new sauce range", "Three labels for a limited range. We have brand colors and photography, and need print-ready files.", ["Packaging", "Illustrator", "Branding"], 1500, 30, "open"],
  ["luis", "data", "Fraud-flagging model for merchant payments", "Build a baseline classifier on our labelled transactions, document the features, and hand over a reproducible notebook.", ["Python", "scikit-learn", "Fintech"], 2800, 12, "open"],
  ["maya", "design", "Course landing page redesign", "Our current page converts at 1.8 percent. We want a cleaner layout, a stronger offer section and a mobile-first Figma file.", ["Figma", "Landing page"], 950, 40, "open"],
  ["helen", "dev", "Patient portal bug fixes and polish", "A backlog of 14 small issues in a Next.js app. Looking for someone who can triage and clear them in two weeks.", ["Next.js", "TypeScript"], 1100, 160, "in_progress"],
  ["chloe", "writing", "Product descriptions for 60 items", "Short, appetising descriptions in a friendly tone. We will share a style guide and a few examples.", ["Copywriting", "E-commerce"], 480, 200, "closed"],
];

const PROPOSALS: [string, string, number, number, string][] = [
  ["Redesign our patient booking", "sofia", 1750, 12, "I have redesigned booking flows for two health apps and know where people hesitate. I would start with five quick interviews, then prototype two versions and test them before we polish."],
  ["Redesign our patient booking", "amara", 1900, 14, "I can bring a clean visual system to the flow as well as the screens. I will deliver Figma components so your developers can reuse them across the app."],
  ["Build a REST API", "tomas", 3100, 18, "This is close to what I built last year for a home care provider: roles, overtime rules and audit trails on FastAPI and Postgres. I would deliver tests and documentation with each milestone."],
  ["Build a REST API", "daniyal", 3300, 21, "I can build the API and the reporting views on top of it. I would write the migrations first so we agree on the data model early."],
  ["Edit 12 course videos", "marcus", 560, 9, "Course editing is most of what I do. I can turn around the first video in two days so you can approve the style, then batch the rest."],
  ["Write six case studies", "elise", 1250, 14, "I interview-style edit transcripts into stories that read well and still sound like your customers. I will send the first draft within three days."],
  ["Clean and model", "daniyal", 880, 8, "I will reconcile the exports with a documented set of rules, so every number can be traced. The forecast notebook will run end to end from the raw files."],
  ["Clean and model", "priya", 1000, 10, "I would add a simple baseline and a seasonal model, and compare both against held-out months so you can see how much to trust the forecast."],
  ["Fix our site", "lina", 720, 7, "I will profile the pages with real-device data, fix the biggest wins first and send you a plain-language list of what needs engineering time."],
  ["Mix and master", "kwame", 520, 8, "I have produced several interview podcasts with remote guests. I will build a reusable preset and apply it to all six episodes."],
  ["Flutter app", "ravi", 4400, 28, "I have shipped two caregiver apps with check-in and maps. I would start with the check-in flow so you can try it on a phone in the first week."],
  ["Fraud-flagging", "priya", 2700, 15, "I would begin with an exploration of the labels, then compare a few simple models and document which features matter. You will get a notebook anyone on your team can rerun."],
  ["Course landing page", "sofia", 900, 7, "I will rework the page structure around your offer, then deliver a mobile-first Figma file with the sections ready to hand off."],
];

const ORDERS: [string, string, string, string, number, number | null][] = [
  ["helen", "tomas", "job:Patient portal bug fixes", "in_progress", 150, null],
  ["maya", "marcus", "gig:I will edit your YouTube", "delivered", 30, null],
  ["chloe", "amara", "gig:I will design a memorable logo", "released", 400, 5],
  ["luis", "elise", "gig:I will write conversion-focused", "released", 500, 5],
  ["james", "tomas", "gig:I will fix bugs and ship", "funded", 6, null],
  ["helen", "lina", "gig:I will run a technical SEO", "released", 900, 4],
  ["chloe", "elise", "job:Product descriptions", "released", 190, 5],
  ["maya", "kwame", "gig:I will edit and master", "in_progress", 20, null],
  ["chloe", "marcus", "gig:I will edit your YouTube", "disputed", 60, null],
  ["luis", "tomas", "gig:I will fix bugs and ship", "released", 320, 4],
];

const CHATS: Record<string, [string, string][]> = {
  "helen:tomas": [
    ["c", "Hi Tomás, thanks for taking on the portal fixes. I put the 14 issues in a shared sheet, ordered by how often patients hit them."],
    ["f", "Great, thank you. I went through the list and I can clear the top eight this week. A few need design input, I will flag those in the sheet."],
    ["c", "Perfect. Anything blocking you right now?"],
    ["f", "Only access to the staging environment. Could you send the credentials by email?"],
  ],
  "maya:marcus": [
    ["c", "Hey Marcus, the raw files for videos 1 to 5 are in the folder I shared."],
    ["f", "Got them. I delivered the first batch just now. Captions are burned in, and I left a separate SRT for each video."],
    ["c", "Looks great so far. Let me watch the second one before I approve."],
  ],
  "luis:elise": [
    ["c", "The copy is excellent. Our conversion went up in the first week."],
    ["f", "That is lovely to hear. If you want, I can write two more variants to test against it."],
  ],
  "james:tomas": [
    ["c", "Ordered the bug-fix package. The three issues are listed in the requirements I sent."],
    ["f", "Thanks, James. I will start tomorrow morning and update you in the pull requests."],
  ],
  "maya:kwame": [
    ["c", "Episode one and two are in the shared folder. Guests were recorded on laptops, so expect some room echo."],
    ["f", "No problem. I will start with a noise and echo pass, then send you a short sample to approve the sound."],
  ],
};

const REVIEWS: Record<number, string[]> = {
  5: [
    "Exactly what we hoped for and delivered ahead of schedule. Clear communication throughout.",
    "Thoughtful work and easy to collaborate with. We will hire again.",
  ],
  4: ["Solid work and a useful report. A couple of revisions needed but handled quickly."],
};

const EXTRA: Record<string, [string[], object[], object[]]> = {
  tomas: [
    ["English", "Spanish"],
    [
      { role: "Senior full-stack engineer", company: "Northwind Health", period: "2021 to 2024", description: "Built scheduling and billing for a multi-tenant care platform on FastAPI and Next.js." },
      { role: "Backend developer", company: "Paygrid", period: "2018 to 2021", description: "Payments APIs and reconciliation jobs on PostgreSQL." },
    ],
    [
      { title: "Care scheduling platform", description: "Multi-tenant shifts, EVV check-ins and invoicing.", link: "https://example.com/care" },
      { title: "Merchant analytics dashboard", description: "Next.js dashboard with role-based access.", link: "https://example.com/dash" },
    ],
  ],
  sofia: [
    ["English", "Bulgarian", "Russian"],
    [{ role: "Lead product designer", company: "Fintrack", period: "2020 to 2024", description: "Led the redesign of a mobile banking app used by 400k people." }],
    [{ title: "Mobile banking redesign", description: "Research, flows and a component library.", link: "https://example.com/bank" }],
  ],
  amara: [
    ["English", "Yoruba"],
    [{ role: "Brand designer", company: "Studio Kasa", period: "2016 to present", description: "Identity systems for startups, restaurants and cooperatives." }],
    [{ title: "Kasa coffee rebrand", description: "Logo, packaging and signage.", link: "https://example.com/kasa" }],
  ],
  elise: [
    ["French", "English"],
    [{ role: "Staff writer", company: "Le Courrier", period: "2012 to 2019", description: "Business and technology reporting." }],
    [],
  ],
};

const CLIENT_EXTRA: Record<string, [string, string]> = {
  helen: ["https://beaconclinic.example", "Healthcare"],
  james: ["https://tidewatercare.example", "Healthcare software"],
  maya: ["https://pinestreet.example", "Education"],
  luis: ["https://orchard.example", "Fintech"],
  chloe: ["https://mosaicfoods.example", "Food and beverage"],
};

const AVATARS: Record<string, string> = Object.fromEntries(
  [...FREELANCERS, ...CLIENTS].map(([key]) => [key, `/assets/avatars/${key}.jpg`]),
);
AVATARS.admin = "/assets/avatars/admin.jpg";

const GIG_IMAGES: Record<string, string> = {
  "I will design a memorable logo": "logo",
  "I will build your full-stack": "webapp",
  "I will animate your logo": "motion",
  "I will build a Python data pipeline": "pipeline",
  "I will write conversion-focused": "copy",
  "I will build your Flutter": "flutter",
  "I will design your app UI": "figma",
  "I will edit your YouTube": "youtube",
  "I will run a technical SEO": "seo",
  "I will edit and master": "podcast",
  "I will fix bugs and ship": "bugs",
  "I will automate your spreadsheet": "spreadsheet",
  "I will turn your expertise": "article",
  "I will design an editable social": "social",
  "I will build a retrieval-augmented": "chatbot",
  "I will plan a 30-day content": "calendar",
};

function gigImage(title: string): string {
  const slug = Object.entries(GIG_IMAGES).find(([prefix]) => title.startsWith(prefix))?.[1] ?? "";
  return slug ? `/assets/gigs/${slug}.jpg` : "";
}

const JOB_EXTRA: Record<string, [string, string]> = {
  "Redesign our patient booking": ["expert", "month"],
  "Build a REST API": ["expert", "quarter"],
  "Edit 12 course videos": ["intermediate", "month"],
  "Write six case studies": ["intermediate", "month"],
  "Clean and model": ["intermediate", "week"],
  "Fix our site": ["intermediate", "week"],
  "Mix and master": ["entry", "week"],
  "Flutter app": ["expert", "quarter"],
  "Local SEO": ["entry", "month"],
  "Packaging design": ["intermediate", "month"],
  "Fraud-flagging": ["expert", "quarter"],
  "Course landing page": ["intermediate", "week"],
  "Patient portal": ["intermediate", "month"],
  "Product descriptions": ["entry", "week"],
};

const PAST_JOBS: [string, string, string, string, string[], number, number][] = [
  ["helen", "design", "Brand refresh for clinic signage", "Update our logo lockups and wayfinding signs across three locations.", ["Illustrator", "Branding"], 1400, 24 * 70],
  ["helen", "writing", "Patient education leaflets", "Six short leaflets on common procedures, in plain language.", ["Copywriting", "Healthcare"], 900, 24 * 110],
  ["james", "dev", "Mobile timesheet prototype", "Clickable prototype of a caregiver timesheet flow.", ["Figma", "Prototyping"], 1200, 24 * 90],
  ["james", "data", "Overtime analytics dashboard", "Dashboard showing overtime by branch and caregiver.", ["Python", "Dashboards"], 2200, 24 * 130],
  ["maya", "video", "Course trailer edit", "Cut a 90 second trailer for our spring course launch.", ["Premiere Pro"], 450, 24 * 60],
  ["luis", "marketing", "Landing page conversion audit", "Review our merchant landing pages and rank the fixes.", ["Analytics", "SEO"], 800, 24 * 80],
  ["luis", "dev", "Webhook reliability fixes", "Harden our payment webhook consumer and add retries.", ["FastAPI", "PostgreSQL"], 2600, 24 * 150],
  ["chloe", "design", "Recipe card templates", "Printable recipe card templates for our subscription box.", ["Illustrator", "Print"], 600, 24 * 95],
];

const CLIENT_SPEND: Record<string, number> = {
  helen: 14200, james: 42500, maya: 3100, luis: 21400, chloe: 8700,
};

const ORDER_CLIENT_REVIEWS: Record<string, [number, string]> = {
  "chloe:amara": [5, "Chloe gave a clear brief, answered quickly and paid the moment the work was delivered."],
  "luis:elise": [5, "Great to work with. Luis shared customer calls and feedback fast, which made the copy better."],
  "helen:lina": [4, "Well organised client with realistic expectations. A couple of scope changes mid-way, handled politely."],
  "chloe:elise": [5, "Friendly, decisive and fair. Would happily work with Mosaic Foods again."],
};

const EXTRA_CLIENT_REVIEWS: [string, string, number, string, number][] = [
  ["helen", "sofia", 5, "Helen knows her users and gave us access to patients for interviews. A pleasure.", 40],
  ["helen", "tomas", 5, "Specs were clear, feedback was quick and payment was prompt.", 75],
  ["helen", "kwame", 4, "Good communication. Deadlines moved once but she told me early.", 120],
  ["james", "tomas", 5, "Technical, direct and respectful of my time. Escrow was funded before I started.", 55],
  ["james", "daniyal", 5, "Clear data model and honest about constraints. Easy project.", 100],
  ["james", "ravi", 4, "Thorough requirements. Lots of detail up front which saved time later.", 135],
  ["maya", "marcus", 5, "Raw files were organised and she approved the style quickly.", 35],
  ["maya", "kwame", 4, "Nice to work with, though feedback came in batches at the end.", 85],
  ["luis", "priya", 5, "Great domain knowledge and a clear definition of done.", 62],
  ["luis", "tomas", 4, "Fast responses. Scope grew a little but we agreed a fair adjustment.", 140],
  ["chloe", "amara", 5, "Chloe trusts her freelancers and gives useful, specific feedback.", 50],
  ["chloe", "noah", 4, "Professional and quick to pay. Would work together again.", 105],
];

const HIST_FREELANCER: Record<string, string> = {
  design: "sofia", writing: "elise", dev: "tomas", data: "daniyal", video: "marcus", marketing: "lina",
};

type UserRec = { id: number; balance: Prisma.Decimal };
type GigRec = { id: number; title: string; packages: { id: number; tier: string; price: Prisma.Decimal; deliveryDays: number }[] };
type JobRec = { id: number; title: string; budget: Prisma.Decimal; createdAt: Date; status: string };

function findByPrefix<T extends { title: string }>(items: Map<string, T>, prefix: string): T {
  for (const [k, v] of items) {
    if (k.startsWith(prefix)) return v;
  }
  throw new Error(`No match for prefix: ${prefix}`);
}

/** Move price + buyer fee out of the client's wallet and into escrow (mirrors services.fund_order). */
async function fundOrder(
  clientId: number,
  freelancerId: number,
  title: string,
  amountIn: Prisma.Decimal | number,
  opts: { gigId?: number; jobId?: number; package?: string; deliveryDays?: number } = {},
): Promise<{ id: number; amount: Prisma.Decimal; title: string; clientId: number; freelancerId: number }> {
  const amount = q(amountIn);
  const fee = q(amount.mul(BUYER_FEE_PCT));
  const total = amount.add(fee);
  const client = await prisma.user.findUniqueOrThrow({ where: { id: clientId } });
  if (new Prisma.Decimal(client.balance).lt(total)) {
    throw new Error(`Wallet short for ${title}: need ${total}, have ${client.balance}`);
  }
  await prisma.user.update({
    where: { id: clientId },
    data: { balance: q(new Prisma.Decimal(client.balance).minus(total)) },
  });
  const order = await prisma.order.create({
    data: {
      clientId,
      freelancerId,
      title,
      amount,
      buyerFee: fee,
      sellerFeePct: SELLER_FEE_PCT,
      status: "funded",
      gigId: opts.gigId ?? null,
      jobId: opts.jobId ?? null,
      package: opts.package ?? null,
      deliveryDays: opts.deliveryDays ?? 7,
    },
  });
  await prisma.transaction.create({
    data: {
      userId: clientId,
      kind: "escrow_hold",
      amount: total.negated(),
      orderId: order.id,
      description: `Escrow for ${title}`,
    },
  });
  return order;
}

async function seed() {
  const fByKey = new Map<string, UserRec>();
  const cByKey = new Map<string, UserRec>();

  for (const [key, name, email, headline, loc, cat, skills, rate, rating, reviews, done, color, bio] of FREELANCERS) {
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: hashPassword(PASSWORD),
        name,
        role: "freelancer",
        color,
        avatar: AVATARS[key],
        balance: q(0),
        notifyPrefs: { orders: true, proposals: true, messages: true, announcements: true },
        createdAt: ago(24 * 200),
        freelancer: {
          create: {
            headline,
            bio,
            location: loc,
            category: cat,
            skills,
            hourlyRate: q(rate),
            rating,
            reviewsCount: reviews,
            jobsCompleted: done,
            languages: ["English"],
            experience: [],
            portfolio: [],
          },
        },
      },
    });
    fByKey.set(key, { id: u.id, balance: q(0) });
  }

  for (const [key, name, email, company, loc, verified, bio, color] of CLIENTS) {
    const ex = CLIENT_EXTRA[key];
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: hashPassword(PASSWORD),
        name,
        role: "client",
        color,
        avatar: AVATARS[key],
        balance: q(4000),
        notifyPrefs: { orders: true, proposals: true, messages: true, announcements: true },
        createdAt: ago(24 * 150),
        client: {
          create: {
            company,
            bio,
            location: loc,
            verified,
            totalSpent: q(0),
            website: ex?.[0] ?? "",
            industry: ex?.[1] ?? "",
          },
        },
      },
    });
    cByKey.set(key, { id: u.id, balance: q(4000) });
  }

  for (const [key, [langs, exp, port]] of Object.entries(EXTRA)) {
    const u = fByKey.get(key)!;
    await prisma.freelancerProfile.update({
      where: { userId: u.id },
      data: { languages: langs, experience: exp, portfolio: port },
    });
  }

  const existingAdmin = await prisma.user.findFirst({ where: { role: "admin" } });
  let adminId: number | null = existingAdmin?.id ?? null;
  if (!existingAdmin) {
    const admin = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL.toLowerCase(),
        passwordHash: hashPassword(ADMIN_PASSWORD),
        name: "Super Admin",
        role: "admin",
        color: "#1d1d1f",
        avatar: AVATARS.admin,
        notifyPrefs: { orders: true, proposals: true, messages: true, announcements: true },
        createdAt: ago(24 * 300),
      },
    });
    adminId = admin.id;
  }

  const gigByTitle = new Map<string, GigRec>();
  for (const [owner, cat, title, desc, tags, price, days, feats] of GIGS) {
    const tiers: [string, number, number, number, string[]][] = [
      ["basic", price, days, 1, feats.slice(0, 1)],
      ["standard", Math.round((price * 2) / 5) * 5, days + Math.max(1, Math.floor(days / 2)), 3, feats.slice(0, 2)],
      ["premium", Math.round((price * 4.5) / 5) * 5, days * 2, -1, feats],
    ];
    const g = await prisma.gig.create({
      data: {
        freelancerId: fByKey.get(owner)!.id,
        title,
        category: cat,
        description: desc,
        tags,
        image: gigImage(title),
        createdAt: ago(24 * 60),
        packages: {
          create: tiers.map(([tier, p, d, r, f]) => ({
            tier,
            price: q(p),
            deliveryDays: d,
            revisions: r,
            features: f,
          })),
        },
      },
      include: { packages: { orderBy: { price: "asc" } } },
    });
    gigByTitle.set(title, g);
  }

  const jobByTitle = new Map<string, JobRec>();
  for (const [client, cat, title, desc, skills, budget, hrs, status] of JOBS) {
    const extra = Object.entries(JOB_EXTRA).find(([k]) => title.startsWith(k))?.[1] ?? ["intermediate", "month"];
    const j = await prisma.job.create({
      data: {
        clientId: cByKey.get(client)!.id,
        title,
        category: cat,
        description: desc,
        skills,
        budget: q(budget),
        status,
        experienceLevel: extra[0],
        duration: extra[1],
        createdAt: ago(hrs),
      },
    });
    jobByTitle.set(title, j);
  }

  type PastEntry = [string, string, JobRec, number, number];
  const past: PastEntry[] = [];
  for (const [client, cat, title, desc, skills, budget, hrs] of PAST_JOBS) {
    const pj = await prisma.job.create({
      data: {
        clientId: cByKey.get(client)!.id,
        title,
        category: cat,
        description: desc,
        skills,
        budget: q(budget),
        status: "closed",
        createdAt: ago(hrs),
        experienceLevel: "intermediate",
        duration: "month",
      },
    });
    past.push([client, cat, pj, budget, hrs]);
  }

  for (const [client, cat, pj, budget, hrs] of past) {
    const fl = fByKey.get(HIST_FREELANCER[cat])!;
    const cl = cByKey.get(client)!;
    const amt = q(budget);
    const fee = q(amt.mul(BUYER_FEE_PCT));
    const net = sellerNet(amt, SELLER_FEE_PCT);
    const o = await prisma.order.create({
      data: {
        clientId: cl.id,
        freelancerId: fl.id,
        title: pj.title,
        amount: amt,
        buyerFee: fee,
        sellerFeePct: SELLER_FEE_PCT,
        status: "released",
        jobId: pj.id,
        deliveryDays: 14,
        createdAt: ago(hrs - 24),
        deliveredAt: ago(hrs - 24 * 10),
        releasedAt: ago(hrs - 24 * 12),
      },
    });
    await prisma.transaction.createMany({
      data: [
        { userId: cl.id, kind: "deposit", amount: amt.add(fee), description: "Added funds", createdAt: ago(hrs - 23) },
        { userId: cl.id, kind: "escrow_hold", amount: amt.add(fee).negated(), orderId: o.id, description: `Escrow for ${pj.title}`, createdAt: ago(hrs - 24) },
        { userId: fl.id, kind: "earning", amount: net, orderId: o.id, description: `Payment for ${pj.title}`, createdAt: ago(hrs - 24 * 12) },
        { userId: fl.id, kind: "withdrawal", amount: net.negated(), description: "Withdrawal to bank", createdAt: ago(hrs - 24 * 13) },
      ],
    });
  }

  for (const [prefix, fkey, bid, days, text] of PROPOSALS) {
    const job = findByPrefix(jobByTitle, prefix);
    await prisma.proposal.create({
      data: {
        jobId: job.id,
        freelancerId: fByKey.get(fkey)!.id,
        bid: q(bid),
        deliveryDays: days,
        coverLetter: text,
        createdAt: new Date(job.createdAt.getTime() + 3 * 3600_000),
      },
    });
  }

  const reviewI: Record<number, number> = { 5: 0, 4: 0 };

  for (const [ckey, fkey, src, statusIn, hrs, rating] of ORDERS) {
    const client = cByKey.get(ckey)!;
    const fl = fByKey.get(fkey)!;
    const [kind, prefix] = src.split(":") as [string, string];
    let status = statusIn;
    const disp = status === "disputed";
    if (disp) status = "in_progress";

    let order: { id: number; amount: Prisma.Decimal; title: string; clientId: number; freelancerId: number };
    if (kind === "gig") {
      const gig = findByPrefix(gigByTitle, prefix);
      const pkg = gig.packages.length > 1 ? gig.packages[1] : gig.packages[0];
      order = await fundOrder(client.id, fl.id, `${gig.title} (${pkg.tier[0].toUpperCase()}${pkg.tier.slice(1)})`, pkg.price, {
        gigId: gig.id,
        package: pkg.tier,
        deliveryDays: pkg.deliveryDays,
      });
    } else {
      const job = findByPrefix(jobByTitle, prefix);
      const prop = await prisma.proposal.findFirst({
        where: { jobId: job.id, freelancerId: fl.id },
      });
      const amount = prop ? prop.bid : job.budget;
      order = await fundOrder(client.id, fl.id, job.title, amount, {
        jobId: job.id,
        deliveryDays: 14,
      });
      if (prop) {
        await prisma.proposal.update({ where: { id: prop.id }, data: { status: "accepted" } });
      }
    }

    await prisma.order.update({ where: { id: order.id }, data: { createdAt: ago(hrs) } });

    if (["in_progress", "delivered", "released"].includes(status)) {
      await prisma.order.update({ where: { id: order.id }, data: { status: "in_progress" } });
    }
    if (["delivered", "released"].includes(status)) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "delivered", deliveredAt: ago(Math.max(hrs - 24, 1)) },
      });
    }
    if (status === "released") {
      const net = sellerNet(order.amount);
      const flUser = await prisma.user.findUniqueOrThrow({ where: { id: fl.id } });
      await prisma.user.update({
        where: { id: fl.id },
        data: { balance: q(new Prisma.Decimal(flUser.balance).add(net)) },
      });
      fl.balance = q(new Prisma.Decimal(flUser.balance).add(net));
      await prisma.transaction.create({
        data: {
          userId: fl.id,
          kind: "earning",
          amount: net,
          orderId: order.id,
          description: `Payment for ${order.title}`,
          createdAt: ago(Math.max(hrs - 40, 1)),
        },
      });
      const cp = await prisma.clientProfile.findUniqueOrThrow({ where: { userId: client.id } });
      await prisma.clientProfile.update({
        where: { userId: client.id },
        data: { totalSpent: q(new Prisma.Decimal(cp.totalSpent).add(order.amount)) },
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "released", releasedAt: ago(Math.max(hrs - 40, 1)) },
      });
      if (rating) {
        const pool = REVIEWS[rating];
        await prisma.review.create({
          data: {
            orderId: order.id,
            clientId: client.id,
            freelancerId: fl.id,
            rating,
            comment: pool[reviewI[rating]! % pool.length]!,
            createdAt: ago(Math.max(hrs - 44, 1)),
          },
        });
        reviewI[rating]! += 1;
      }
      const cr = ORDER_CLIENT_REVIEWS[`${ckey}:${fkey}`];
      if (cr) {
        await prisma.clientReview.create({
          data: {
            orderId: order.id,
            clientId: client.id,
            freelancerId: fl.id,
            rating: cr[0],
            comment: cr[1],
            createdAt: ago(Math.max(hrs - 46, 1)),
          },
        });
      }
    }
    if (disp) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          disputed: true,
          disputeBy: client.id,
          disputeOpenedAt: ago(5),
          disputeReason:
            "The first cut does not follow the brief we agreed on and the captions are out of sync. I would like a refund or a proper redo.",
        },
      });
    }

    await prisma.transaction.updateMany({
      where: { orderId: order.id, kind: "escrow_hold" },
      data: { createdAt: ago(hrs) },
    });
  }

  for (const [pair, lines] of Object.entries(CHATS)) {
    const [ckey, fkey] = pair.split(":") as [string, string];
    let conv = await prisma.conversation.findUnique({
      where: {
        clientId_freelancerId: {
          clientId: cByKey.get(ckey)!.id,
          freelancerId: fByKey.get(fkey)!.id,
        },
      },
    });
    if (!conv) {
      conv = await prisma.conversation.create({
        data: {
          clientId: cByKey.get(ckey)!.id,
          freelancerId: fByKey.get(fkey)!.id,
        },
      });
    }
    const base = new Date(NOW.getTime() - lines.length * 3 * 3600_000);
    for (let i = 0; i < lines.length; i++) {
      const [who, body] = lines[i]!;
      const senderId = who === "c" ? cByKey.get(ckey)!.id : fByKey.get(fkey)!.id;
      const lastTwo = i >= lines.length - 1;
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          senderId,
          body,
          read: !lastTwo,
          readAt: lastTwo ? null : new Date(base.getTime() + (i * 3 + 1) * 3600_000),
          createdAt: new Date(base.getTime() + i * 3 * 3600_000),
        },
      });
    }
  }

  for (const [key, extra] of Object.entries(CLIENT_SPEND)) {
    const cp = await prisma.clientProfile.findUniqueOrThrow({ where: { userId: cByKey.get(key)!.id } });
    await prisma.clientProfile.update({
      where: { userId: cByKey.get(key)!.id },
      data: { totalSpent: q(new Prisma.Decimal(cp.totalSpent).add(extra)) },
    });
  }

  for (const [ckey, fkey, rating, comment, days] of EXTRA_CLIENT_REVIEWS) {
    await prisma.clientReview.create({
      data: {
        orderId: null,
        clientId: cByKey.get(ckey)!.id,
        freelancerId: fByKey.get(fkey)!.id,
        rating,
        comment,
        createdAt: ago(24 * days),
      },
    });
  }

  const notes: [number, string, string, string, string, number, boolean][] = [
    [cByKey.get("helen")!.id, "order", "Work delivered", 'Marcus Bell delivered "Edit your YouTube videos". Review it and release payment.', "/dashboard/orders", 3, false],
    [cByKey.get("helen")!.id, "proposal", 'New proposal on "Redesign our patient booking flow"', "Sofia Petrova bid $1,750 for 12 days.", "/job/1", 26, false],
    [cByKey.get("helen")!.id, "announcement", "Welcome to Crewline", "Post a job or browse gigs to get started.", "", 240, true],
    [fByKey.get("tomas")!.id, "order", "New order", 'James Whitfield ordered "Fix bugs and ship features" (standard).', "/dashboard/orders", 6, false],
    [fByKey.get("tomas")!.id, "proposal", "You were hired", 'Helen Park accepted your proposal for "Patient portal bug fixes".', "/dashboard/orders", 150, true],
    [fByKey.get("tomas")!.id, "payment", "You earned $540", "Payment for a recent order is in your wallet.", "/dashboard/wallet", 400, true],
  ];
  if (adminId) {
    notes.push([adminId, "dispute", "New dispute", '"Edit your YouTube videos" · opened by Chloe Bennett', "/admin/disputes", 5, false]);
  }
  for (const [userId, kind, title, body, link, hrs, read] of notes) {
    await prisma.notification.create({
      data: { userId, kind, title, body, link, read, createdAt: ago(hrs) },
    });
  }

  console.log("Seeded. Log in with any seeded email and the password:", PASSWORD);
}

async function main() {
  const existing = await prisma.user.findFirst();
  if (existing) {
    console.log("Database already has data. Use prisma migrate reset or delete the DB to reseed.");
    return;
  }
  await seed();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
