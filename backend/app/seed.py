"""Sample data: freelancers, clients, gigs, jobs, proposals, orders, reviews and conversations.

Every seeded account uses the password `password123`.
Run manually with:  python -m app.seed   (add --reset to wipe and reseed)
"""
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (
    ClientProfile, ClientReview, Conversation, FreelancerProfile, Gig, GigPackage, Job, Message, Notification,
    Order, Proposal, Review, Transaction, User,
)
from .config import ADMIN_EMAIL, ADMIN_PASSWORD
from .security import hash_password
from .services import fund_order, q, seller_net

PASSWORD = "password123"
NOW = datetime.now(timezone.utc)

FREELANCERS = [
    # key, name, email, headline, location, category, skills, rate, rating, reviews, done, color, bio
    ("amara", "Amara Okafor", "amara@crewline.dev", "Brand identity designer", "Lagos, Nigeria", "design",
     ["Logo design", "Brand guidelines", "Illustrator", "Packaging"], 55, 4.9, 312, 340, "#ff6b4a",
     "Eight years building identities for startups and family businesses. I start with a short call, then show two directions before polishing one."),
    ("tomas", "Tomás Rivera", "tomas@crewline.dev", "Full-stack developer, Next.js and FastAPI", "Mexico City, Mexico", "dev",
     ["Next.js", "FastAPI", "TypeScript", "PostgreSQL", "Docker"], 85, 4.9, 187, 205, "#0a84ff",
     "I ship production web apps for fintech and healthcare teams. Clear scopes, weekly demos, documented handover."),
    ("hana", "Hana Sato", "hana@crewline.dev", "Motion designer", "Osaka, Japan", "video",
     ["After Effects", "Logo animation", "Explainers", "Lottie"], 70, 4.8, 143, 160, "#bf5af2",
     "I make small, precise 2D animations that explain a product in under a minute."),
    ("daniyal", "Daniyal Khan", "daniyal@crewline.dev", "Python and data engineer", "Lahore, Pakistan", "data",
     ["Python", "Pandas", "ETL", "Airflow", "Dashboards"], 60, 4.7, 96, 110, "#5e5ce6",
     "Turning messy exports and spreadsheets into pipelines that run on their own."),
    ("elise", "Elise Moreau", "elise@crewline.dev", "Copywriter and ghostwriter", "Lyon, France", "writing",
     ["Website copy", "Long-form", "Case studies", "Email"], 65, 5.0, 221, 240, "#ff375f",
     "Former journalist. I interview you, then write in your voice so it reads like you on your best day."),
    ("ravi", "Ravi Menon", "ravi@crewline.dev", "Mobile developer, Flutter", "Bengaluru, India", "dev",
     ["Flutter", "Dart", "Firebase", "Maps"], 75, 4.8, 129, 140, "#30b0c7",
     "Cross-platform MVPs that go from idea to the app stores in a few weeks."),
    ("sofia", "Sofia Petrova", "sofia@crewline.dev", "UI/UX designer", "Sofia, Bulgaria", "design",
     ["Figma", "Prototyping", "Design systems", "User research"], 80, 4.9, 204, 230, "#ff9f0a",
     "I design interfaces people understand on the first try, and hand them over ready for developers."),
    ("marcus", "Marcus Bell", "marcus@crewline.dev", "Video editor", "Austin, USA", "video",
     ["Premiere Pro", "Captions", "Sound design", "Color"], 45, 4.8, 278, 300, "#34c759",
     "Fast-turnaround editing for creators and course makers."),
    ("lina", "Lina Haddad", "lina@crewline.dev", "SEO and content strategist", "Amman, Jordan", "marketing",
     ["Technical SEO", "Content planning", "Analytics", "Link building"], 58, 4.7, 118, 130, "#ac8e68",
     "I find the few fixes that move rankings, then rank them by effort and payoff."),
    ("kwame", "Kwame Boateng", "kwame@crewline.dev", "Podcast producer", "Accra, Ghana", "audio",
     ["Audio editing", "Mastering", "Show notes", "Music"], 40, 4.9, 164, 180, "#ff6482",
     "Clean, even audio and tidy episodes so you can focus on the conversation."),
    ("priya", "Priya Nair", "priya@crewline.dev", "Machine learning engineer", "Toronto, Canada", "data",
     ["PyTorch", "NLP", "LLM apps", "MLOps"], 110, 4.9, 72, 80, "#64d2ff",
     "I build practical ML features: classification, search and retrieval, and LLM workflows with evaluation."),
    ("noah", "Noah Fischer", "noah@crewline.dev", "Social media and growth marketer", "Berlin, Germany", "marketing",
     ["Paid social", "Content calendars", "Analytics", "Copy"], 62, 4.6, 88, 95, "#a2845e",
     "Small budgets, measurable results. I set up tracking first, then test creative every week."),
]

CLIENTS = [
    ("helen", "Helen Park", "helen@crewline.dev", "Beacon Clinic", "Seattle, USA", True,
     "A multi-location primary care clinic modernizing its patient experience.", "#0a84ff"),
    ("james", "James Whitfield", "james@crewline.dev", "Tidewater Care", "Norfolk, USA", True,
     "Home care agency building its own scheduling and billing software.", "#30b0c7"),
    ("maya", "Maya Brooks", "maya@crewline.dev", "Pine Street Studio", "Portland, USA", False,
     "Online course studio producing video-led learning for creative professionals.", "#ff9f0a"),
    ("luis", "Luis Ortega", "luis@crewline.dev", "Orchard Fintech", "Madrid, Spain", True,
     "Payments startup serving small merchants across southern Europe.", "#5e5ce6"),
    ("chloe", "Chloe Bennett", "chloe@crewline.dev", "Mosaic Foods", "London, UK", True,
     "Specialty food brand selling direct to consumers and restaurants.", "#34c759"),
]

# gigs: owner, category, title, description, tags, base price, base days, features
GIGS = [
    ("amara", "design", "I will design a memorable logo and brand identity kit",
     "You get a logo that works on a shop sign and a favicon, plus the colors and fonts to keep everything consistent.",
     ["logo", "branding", "identity"], 120, 4, ["Primary logo with 2 concepts", "Color palette and type pairing", "Brand guidelines PDF and social kit"]),
    ("tomas", "dev", "I will build your full-stack web app with Next.js and FastAPI",
     "A working product, not a prototype: authentication, database, API and deployment, written in TypeScript and Python.",
     ["nextjs", "fastapi", "web app"], 400, 10, ["Landing page, 3 app pages and login", "REST API with FastAPI and PostgreSQL", "Deployment, tests and handover docs"]),
    ("hana", "video", "I will animate your logo or explainer in 2D motion",
     "Short, clean animations for websites, ads and product demos. Delivered in MP4 and transparent formats.",
     ["animation", "explainer", "logo"], 90, 3, ["5-second logo sting", "30-second explainer with voice-over sync", "60-second explainer with custom illustrations"]),
    ("daniyal", "data", "I will build a Python data pipeline and dashboard",
     "Pull data from APIs, CSVs and databases, clean it on a schedule, and see it in a dashboard you can share.",
     ["python", "etl", "dashboard"], 250, 7, ["One data source, one dashboard", "Up to three sources with scheduled refresh", "Alerts, documentation and a walkthrough call"]),
    ("elise", "writing", "I will write conversion-focused website copy",
     "Headlines, page copy and calls to action that say what you do in plain language.",
     ["copywriting", "website", "landing page"], 80, 3, ["One page, up to 500 words", "Up to 3 pages with SEO titles", "Full site copy with a messaging guide"]),
    ("ravi", "dev", "I will build your Flutter mobile app MVP",
     "One codebase for iOS and Android with login, a backend and push notifications.",
     ["flutter", "mobile", "mvp"], 500, 14, ["3 screens with Firebase backend", "8 screens, login and notifications", "Full MVP with store submission help"]),
    ("sofia", "design", "I will design your app UI in Figma with a clickable prototype",
     "Wireframes through polished screens, with components organized so developers can build from them.",
     ["figma", "ui", "ux"], 200, 5, ["Up to 4 screens", "Up to 10 screens with prototype", "Full flow, design system and dev handoff"]),
    ("marcus", "video", "I will edit your YouTube videos with captions and sound design",
     "Tight cuts, readable captions, color correction and clean audio on every video.",
     ["video editing", "youtube", "captions"], 60, 2, ["Up to 5 minutes of footage", "Up to 15 minutes with b-roll", "Up to 30 minutes with thumbnail"]),
    ("lina", "marketing", "I will run a technical SEO audit with a ranked fix list",
     "A prioritized list of what to fix first, why it matters, and how long each fix takes.",
     ["seo", "audit", "analytics"], 150, 4, ["Audit of up to 50 pages", "Audit plus competitor gap analysis", "Audit, roadmap and 30-minute strategy call"]),
    ("kwame", "audio", "I will edit and master your podcast episode",
     "Noise removal, leveling, filler cleanup and a final master that sounds the same on every device.",
     ["podcast", "mastering", "audio editing"], 45, 2, ["One episode up to 30 minutes", "Episode with intro and outro music", "Episode, show notes and a short audiogram"]),
    ("tomas", "dev", "I will fix bugs and ship features on your TypeScript codebase",
     "Send me the issue list. I will triage, fix and explain each change in the pull request.",
     ["typescript", "bug fixes", "react"], 75, 2, ["Up to 3 small bugs", "One medium feature with tests", "Feature plus code review and refactor notes"]),
    ("daniyal", "data", "I will automate your spreadsheet reports with Python",
     "Stop copy-pasting every Monday. I turn your recurring report into a script that emails the result.",
     ["automation", "excel", "python"], 100, 3, ["One report automated", "Up to three reports", "Reports plus a simple web form to run them"]),
    ("elise", "writing", "I will turn your expertise into a ghostwritten long-form article",
     "A 1,500 to 3,000 word article in your voice, built from a 30-minute interview.",
     ["ghostwriting", "article", "thought leadership"], 140, 5, ["One 1,500-word article", "One 2,500-word article with sources", "Two articles and a LinkedIn summary for each"]),
    ("amara", "design", "I will design an editable social media template pack",
     "Templates for posts, stories and covers that your team can edit in Canva without breaking the look.",
     ["social media", "canva", "templates"], 55, 2, ["6 post templates", "12 templates with story formats", "24 templates and a how-to guide"]),
    ("priya", "data", "I will build a retrieval-augmented chatbot over your documents",
     "A chatbot that answers from your own PDFs and wiki, with citations and a basic evaluation set so you can trust it.",
     ["llm", "rag", "chatbot"], 600, 10, ["Chatbot over up to 100 documents", "Adds evaluation set and feedback logging", "Adds role-based access and deployment"]),
    ("noah", "marketing", "I will plan a 30-day content calendar for your product",
     "Topics, formats and posting days matched to your audience and the keywords they search.",
     ["content", "social media", "strategy"], 70, 3, ["10 topics with outlines", "30-day calendar with channels", "Calendar, briefs and a reporting template"]),
]

# jobs: client, category, title, description, skills, budget, hours since posted, status
JOBS = [
    ("helen", "design", "Redesign our patient booking flow", "Our clinic app loses people at the time-selection step. We need a clearer flow, tested with five users, and handoff files for our developers.", ["Figma", "UX research", "Healthcare"], 1800, 2, "open"),
    ("james", "dev", "Build a REST API for shift scheduling", "Multi-tenant scheduling with roles, overtime rules and audit logs. We have the data model drafted and need it built and tested.", ["FastAPI", "PostgreSQL", "Docker"], 3200, 5, "open"),
    ("maya", "video", "Edit 12 course videos", "Twelve videos of 8 to 12 minutes each. Remove pauses, add captions and our intro. Raw files are ready to share.", ["Premiere Pro", "Captions"], 600, 20, "open"),
    ("luis", "writing", "Write six case studies from customer calls", "We have recordings and transcripts. Each case study should run about 900 words and follow our template.", ["Case studies", "B2B", "Interviewing"], 1200, 27, "open"),
    ("chloe", "data", "Clean and model two years of sales data", "CSV exports from three systems that disagree with each other. Reconcile them and deliver a monthly forecast notebook.", ["Python", "Pandas", "Forecasting"], 900, 50, "open"),
    ("luis", "marketing", "Fix our site's Core Web Vitals", "Our largest contentful paint is 4.8 seconds on mobile. Find the causes, fix what you can, and give us a list of what you cannot.", ["Technical SEO", "Performance"], 700, 55, "open"),
    ("maya", "audio", "Mix and master a six-episode podcast season", "Interview format, two voices per episode, recorded remotely. Need consistent loudness and a reusable preset.", ["Mastering", "Audio editing"], 540, 70, "open"),
    ("james", "dev", "Flutter app for tracking home visits", "Caregivers check in and out, clients see live status. Designs are ready in Figma and the API already exists.", ["Flutter", "Firebase", "Maps"], 4500, 90, "open"),
    ("helen", "marketing", "Local SEO for three clinic locations", "Set up and optimise our Google Business profiles, fix NAP consistency and build a review request process.", ["Local SEO", "Analytics"], 800, 100, "open"),
    ("chloe", "design", "Packaging design for a new sauce range", "Three labels for a limited range. We have brand colors and photography, and need print-ready files.", ["Packaging", "Illustrator", "Branding"], 1500, 30, "open"),
    ("luis", "data", "Fraud-flagging model for merchant payments", "Build a baseline classifier on our labelled transactions, document the features, and hand over a reproducible notebook.", ["Python", "scikit-learn", "Fintech"], 2800, 12, "open"),
    ("maya", "design", "Course landing page redesign", "Our current page converts at 1.8 percent. We want a cleaner layout, a stronger offer section and a mobile-first Figma file.", ["Figma", "Landing page"], 950, 40, "open"),
    ("helen", "dev", "Patient portal bug fixes and polish", "A backlog of 14 small issues in a Next.js app. Looking for someone who can triage and clear them in two weeks.", ["Next.js", "TypeScript"], 1100, 160, "in_progress"),
    ("chloe", "writing", "Product descriptions for 60 items", "Short, appetising descriptions in a friendly tone. We will share a style guide and a few examples.", ["Copywriting", "E-commerce"], 480, 200, "closed"),
]

# proposals: job index (by title start), freelancer key, bid, days, text
PROPOSALS = [
    ("Redesign our patient booking", "sofia", 1750, 12, "I have redesigned booking flows for two health apps and know where people hesitate. I would start with five quick interviews, then prototype two versions and test them before we polish."),
    ("Redesign our patient booking", "amara", 1900, 14, "I can bring a clean visual system to the flow as well as the screens. I will deliver Figma components so your developers can reuse them across the app."),
    ("Build a REST API", "tomas", 3100, 18, "This is close to what I built last year for a home care provider: roles, overtime rules and audit trails on FastAPI and Postgres. I would deliver tests and documentation with each milestone."),
    ("Build a REST API", "daniyal", 3300, 21, "I can build the API and the reporting views on top of it. I would write the migrations first so we agree on the data model early."),
    ("Edit 12 course videos", "marcus", 560, 9, "Course editing is most of what I do. I can turn around the first video in two days so you can approve the style, then batch the rest."),
    ("Write six case studies", "elise", 1250, 14, "I interview-style edit transcripts into stories that read well and still sound like your customers. I will send the first draft within three days."),
    ("Clean and model", "daniyal", 880, 8, "I will reconcile the exports with a documented set of rules, so every number can be traced. The forecast notebook will run end to end from the raw files."),
    ("Clean and model", "priya", 1000, 10, "I would add a simple baseline and a seasonal model, and compare both against held-out months so you can see how much to trust the forecast."),
    ("Fix our site", "lina", 720, 7, "I will profile the pages with real-device data, fix the biggest wins first and send you a plain-language list of what needs engineering time."),
    ("Mix and master", "kwame", 520, 8, "I have produced several interview podcasts with remote guests. I will build a reusable preset and apply it to all six episodes."),
    ("Flutter app", "ravi", 4400, 28, "I have shipped two caregiver apps with check-in and maps. I would start with the check-in flow so you can try it on a phone in the first week."),
    ("Fraud-flagging", "priya", 2700, 15, "I would begin with an exploration of the labels, then compare a few simple models and document which features matter. You will get a notebook anyone on your team can rerun."),
    ("Course landing page", "sofia", 900, 7, "I will rework the page structure around your offer, then deliver a mobile-first Figma file with the sections ready to hand off."),
]

# orders: (client, freelancer, gig title start | job title start, status, hours ago, review rating)
ORDERS = [
    ("helen", "tomas", "job:Patient portal bug fixes", "in_progress", 150, None),
    ("maya", "marcus", "gig:I will edit your YouTube", "delivered", 30, None),
    ("chloe", "amara", "gig:I will design a memorable logo", "released", 400, 5),
    ("luis", "elise", "gig:I will write conversion-focused", "released", 500, 5),
    ("james", "tomas", "gig:I will fix bugs and ship", "funded", 6, None),
    ("helen", "lina", "gig:I will run a technical SEO", "released", 900, 4),
    ("chloe", "elise", "job:Product descriptions", "released", 190, 5),
    ("maya", "kwame", "gig:I will edit and master", "in_progress", 20, None),
    ("chloe", "marcus", "gig:I will edit your YouTube", "disputed", 60, None),
    ("luis", "tomas", "gig:I will fix bugs and ship", "released", 320, 4),
]

CHATS = {
    ("helen", "tomas"): [("c", "Hi Tomás, thanks for taking on the portal fixes. I put the 14 issues in a shared sheet, ordered by how often patients hit them."),
                         ("f", "Great, thank you. I went through the list and I can clear the top eight this week. A few need design input, I will flag those in the sheet."),
                         ("c", "Perfect. Anything blocking you right now?"),
                         ("f", "Only access to the staging environment. Could you send the credentials by email?")],
    ("maya", "marcus"): [("c", "Hey Marcus, the raw files for videos 1 to 5 are in the folder I shared."),
                         ("f", "Got them. I delivered the first batch just now. Captions are burned in, and I left a separate SRT for each video."),
                         ("c", "Looks great so far. Let me watch the second one before I approve.")],
    ("luis", "elise"): [("c", "The copy is excellent. Our conversion went up in the first week."),
                        ("f", "That is lovely to hear. If you want, I can write two more variants to test against it.")],
    ("james", "tomas"): [("c", "Ordered the bug-fix package. The three issues are listed in the requirements I sent."),
                         ("f", "Thanks, James. I will start tomorrow morning and update you in the pull requests.")],
    ("maya", "kwame"): [("c", "Episode one and two are in the shared folder. Guests were recorded on laptops, so expect some room echo."),
                        ("f", "No problem. I will start with a noise and echo pass, then send you a short sample to approve the sound.")],
}

REVIEWS = {
    5: ["Exactly what we hoped for and delivered ahead of schedule. Clear communication throughout.",
        "Thoughtful work and easy to collaborate with. We will hire again."],
    4: ["Solid work and a useful report. A couple of revisions needed but handled quickly."],
}


EXTRA = {  # key -> (languages, experience, portfolio)
    "tomas": (["English", "Spanish"],
              [{"role": "Senior full-stack engineer", "company": "Northwind Health", "period": "2021 to 2024", "description": "Built scheduling and billing for a multi-tenant care platform on FastAPI and Next.js."},
               {"role": "Backend developer", "company": "Paygrid", "period": "2018 to 2021", "description": "Payments APIs and reconciliation jobs on PostgreSQL."}],
              [{"title": "Care scheduling platform", "description": "Multi-tenant shifts, EVV check-ins and invoicing.", "link": "https://example.com/care"},
               {"title": "Merchant analytics dashboard", "description": "Next.js dashboard with role-based access.", "link": "https://example.com/dash"}]),
    "sofia": (["English", "Bulgarian", "Russian"],
              [{"role": "Lead product designer", "company": "Fintrack", "period": "2020 to 2024", "description": "Led the redesign of a mobile banking app used by 400k people."}],
              [{"title": "Mobile banking redesign", "description": "Research, flows and a component library.", "link": "https://example.com/bank"}]),
    "amara": (["English", "Yoruba"],
              [{"role": "Brand designer", "company": "Studio Kasa", "period": "2016 to present", "description": "Identity systems for startups, restaurants and cooperatives."}],
              [{"title": "Kasa coffee rebrand", "description": "Logo, packaging and signage.", "link": "https://example.com/kasa"}]),
    "elise": (["French", "English"],
              [{"role": "Staff writer", "company": "Le Courrier", "period": "2012 to 2019", "description": "Business and technology reporting."}], []),
}
CLIENT_EXTRA = {"helen": ("https://beaconclinic.example", "Healthcare"), "james": ("https://tidewatercare.example", "Healthcare software"),
                "maya": ("https://pinestreet.example", "Education"), "luis": ("https://orchard.example", "Fintech"),
                "chloe": ("https://mosaicfoods.example", "Food and beverage")}

# Local portraits served from /assets/avatars/{key}.jpg
AVATARS = {key: f"/assets/avatars/{key}.jpg" for key, *_ in (*FREELANCERS, *CLIENTS)}
AVATARS["admin"] = "/assets/avatars/admin.jpg"

# Cover images served from /assets/gigs/{slug}.jpg, keyed by gig title prefix
GIG_IMAGES = {
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
}


def gig_image(title: str) -> str:
    slug = next((s for prefix, s in GIG_IMAGES.items() if title.startswith(prefix)), "")
    return f"/assets/gigs/{slug}.jpg" if slug else ""


JOB_EXTRA = {  # title prefix -> (experience level, duration)
    "Redesign our patient booking": ("expert", "month"), "Build a REST API": ("expert", "quarter"),
    "Edit 12 course videos": ("intermediate", "month"), "Write six case studies": ("intermediate", "month"),
    "Clean and model": ("intermediate", "week"), "Fix our site": ("intermediate", "week"),
    "Mix and master": ("entry", "week"), "Flutter app": ("expert", "quarter"),
    "Local SEO": ("entry", "month"), "Packaging design": ("intermediate", "month"),
    "Fraud-flagging": ("expert", "quarter"), "Course landing page": ("intermediate", "week"),
    "Patient portal": ("intermediate", "month"), "Product descriptions": ("entry", "week"),
}
# Older, finished work so clients have a history on their job posts
PAST_JOBS = [
    ("helen", "design", "Brand refresh for clinic signage", "Update our logo lockups and wayfinding signs across three locations.", ["Illustrator", "Branding"], 1400, 24 * 70),
    ("helen", "writing", "Patient education leaflets", "Six short leaflets on common procedures, in plain language.", ["Copywriting", "Healthcare"], 900, 24 * 110),
    ("james", "dev", "Mobile timesheet prototype", "Clickable prototype of a caregiver timesheet flow.", ["Figma", "Prototyping"], 1200, 24 * 90),
    ("james", "data", "Overtime analytics dashboard", "Dashboard showing overtime by branch and caregiver.", ["Python", "Dashboards"], 2200, 24 * 130),
    ("maya", "video", "Course trailer edit", "Cut a 90 second trailer for our spring course launch.", ["Premiere Pro"], 450, 24 * 60),
    ("luis", "marketing", "Landing page conversion audit", "Review our merchant landing pages and rank the fixes.", ["Analytics", "SEO"], 800, 24 * 80),
    ("luis", "dev", "Webhook reliability fixes", "Harden our payment webhook consumer and add retries.", ["FastAPI", "PostgreSQL"], 2600, 24 * 150),
    ("chloe", "design", "Recipe card templates", "Printable recipe card templates for our subscription box.", ["Illustrator", "Print"], 600, 24 * 95),
]
CLIENT_SPEND = {"helen": 14200, "james": 42500, "maya": 3100, "luis": 21400, "chloe": 8700}  # lifetime spend before this demo data
ORDER_CLIENT_REVIEWS = {  # (client, freelancer) -> (rating, comment) for the demo orders that were released
    ("chloe", "amara"): (5, "Chloe gave a clear brief, answered quickly and paid the moment the work was delivered."),
    ("luis", "elise"): (5, "Great to work with. Luis shared customer calls and feedback fast, which made the copy better."),
    ("helen", "lina"): (4, "Well organised client with realistic expectations. A couple of scope changes mid-way, handled politely."),
    ("chloe", "elise"): (5, "Friendly, decisive and fair. Would happily work with Mosaic Foods again."),
}
EXTRA_CLIENT_REVIEWS = [  # (client, freelancer, rating, comment, days ago)
    ("helen", "sofia", 5, "Helen knows her users and gave us access to patients for interviews. A pleasure.", 40),
    ("helen", "tomas", 5, "Specs were clear, feedback was quick and payment was prompt.", 75),
    ("helen", "kwame", 4, "Good communication. Deadlines moved once but she told me early.", 120),
    ("james", "tomas", 5, "Technical, direct and respectful of my time. Escrow was funded before I started.", 55),
    ("james", "daniyal", 5, "Clear data model and honest about constraints. Easy project.", 100),
    ("james", "ravi", 4, "Thorough requirements. Lots of detail up front which saved time later.", 135),
    ("maya", "marcus", 5, "Raw files were organised and she approved the style quickly.", 35),
    ("maya", "kwame", 4, "Nice to work with, though feedback came in batches at the end.", 85),
    ("luis", "priya", 5, "Great domain knowledge and a clear definition of done.", 62),
    ("luis", "tomas", 4, "Fast responses. Scope grew a little but we agreed a fair adjustment.", 140),
    ("chloe", "amara", 5, "Chloe trusts her freelancers and gives useful, specific feedback.", 50),
    ("chloe", "noah", 4, "Professional and quick to pay. Would work together again.", 105),
]


def ago(hours):
    return NOW - timedelta(hours=hours)


def apply_avatars(db: Session) -> int:
    mapping = {email: AVATARS[key] for key, _name, email, *_ in (*FREELANCERS, *CLIENTS)}
    mapping[ADMIN_EMAIL.lower()] = AVATARS["admin"]
    n = 0
    for email, avatar in mapping.items():
        u = db.scalar(select(User).where(User.email == email))
        if u:
            u.avatar = avatar
            n += 1
    db.commit()
    return n


def apply_gig_images(db: Session) -> int:
    n = 0
    for g in db.scalars(select(Gig)):
        image = gig_image(g.title)
        if image:
            g.image = image
            n += 1
    db.commit()
    return n


def seed(db: Session) -> None:
    users, f_by_key, c_by_key = {}, {}, {}
    for key, name, email, headline, loc, cat, skills, rate, rating, reviews, done, color, bio in FREELANCERS:
        u = User(email=email, password_hash=hash_password(PASSWORD), name=name, role="freelancer",
                 color=color, avatar=AVATARS[key], balance=q(0), created_at=ago(24 * 200))
        u.freelancer = FreelancerProfile(headline=headline, bio=bio, location=loc, category=cat,
                                         skills=skills, hourly_rate=Decimal(rate), rating=rating,
                                         reviews_count=reviews, jobs_completed=done)
        db.add(u)
        f_by_key[key] = u
    for key, name, email, company, loc, verified, bio, color in CLIENTS:
        u = User(email=email, password_hash=hash_password(PASSWORD), name=name, role="client",
                 color=color, avatar=AVATARS[key], balance=q(4000), created_at=ago(24 * 150))
        u.client = ClientProfile(company=company, bio=bio, location=loc, verified=verified,
                                 total_spent=q(0))
        db.add(u)
        c_by_key[key] = u
        ex = CLIENT_EXTRA.get(key)
        if ex:
            u.client.website, u.client.industry = ex
    for key, (langs, exp, port) in EXTRA.items():
        fp = f_by_key[key].freelancer
        fp.languages, fp.experience, fp.portfolio = langs, exp, port
    for f in f_by_key.values():
        if not f.freelancer.languages:
            f.freelancer.languages = ["English"]
    if not db.scalar(select(User.id).where(User.role == "admin").limit(1)):
        db.add(User(email=ADMIN_EMAIL.lower(), password_hash=hash_password(ADMIN_PASSWORD), name="Super Admin",
                    role="admin", color="#1d1d1f", avatar=AVATARS["admin"], created_at=ago(24 * 300)))
    db.flush()

    gig_by_title = {}
    for owner, cat, title, desc, tags, price, days, feats in GIGS:
        g = Gig(freelancer_id=f_by_key[owner].id, title=title, category=cat, description=desc,
                tags=tags, image=gig_image(title), created_at=ago(24 * 60))
        tiers = [("basic", price, days, 1, feats[:1]),
                 ("standard", round(price * 2 / 5) * 5, days + max(1, days // 2), 3, feats[:2]),
                 ("premium", round(price * 4.5 / 5) * 5, days * 2, -1, feats)]
        for tier, p, d, r, f in tiers:
            g.packages.append(GigPackage(tier=tier, price=Decimal(p), delivery_days=d, revisions=r, features=f))
        db.add(g)
        gig_by_title[title] = g
    job_by_title = {}
    for client, cat, title, desc, skills, budget, hrs, status in JOBS:
        j = Job(client_id=c_by_key[client].id, title=title, category=cat, description=desc,
                skills=skills, budget=Decimal(budget), status=status, created_at=ago(hrs))
        j.experience_level, j.duration = next((v for k, v in JOB_EXTRA.items() if title.startswith(k)), ("intermediate", "month"))
        db.add(j)
        job_by_title[title] = j
    past = []
    for client, cat, title, desc, skills, budget, hrs in PAST_JOBS:
        pj = Job(client_id=c_by_key[client].id, title=title, category=cat, description=desc, skills=skills,
                 budget=Decimal(budget), status="closed", created_at=ago(hrs),
                 experience_level="intermediate", duration="month")
        db.add(pj)
        past.append((client, cat, pj, budget, hrs))
    db.flush()
    # Completed history: each older job was filled, so clients have a real hire rate.
    # Written directly (no wallet movement) because the spend is already part of CLIENT_SPEND.
    HIST_FREELANCER = {"design": "sofia", "writing": "elise", "dev": "tomas", "data": "daniyal",
                       "video": "marcus", "marketing": "lina"}
    for client, cat, pj, budget, hrs in past:
        fl, cl = f_by_key[HIST_FREELANCER[cat]], c_by_key[client]
        amt = Decimal(budget)
        fee = q(amt * Decimal("0.05"))
        net = seller_net(amt, Decimal("0.10"))
        o = Order(client_id=cl.id, freelancer_id=fl.id, title=pj.title, amount=amt, buyer_fee=fee,
                  seller_fee_pct=Decimal("0.10"), status="released", job_id=pj.id, delivery_days=14,
                  created_at=ago(hrs - 24), delivered_at=ago(hrs - 24 * 10), released_at=ago(hrs - 24 * 12))
        db.add(o)
        db.flush()
        # Ledger history that nets to zero against today's balances: funds in, funds spent, earned, paid out.
        db.add_all([
            Transaction(user_id=cl.id, kind="deposit", amount=amt + fee, description="Added funds", created_at=ago(hrs - 23)),
            Transaction(user_id=cl.id, kind="escrow_hold", amount=-(amt + fee), order_id=o.id,
                        description=f"Escrow for {pj.title}", created_at=ago(hrs - 24)),
            Transaction(user_id=fl.id, kind="earning", amount=net, order_id=o.id,
                        description=f"Payment for {pj.title}", created_at=ago(hrs - 24 * 12)),
            Transaction(user_id=fl.id, kind="withdrawal", amount=-net, description="Withdrawal to bank",
                        created_at=ago(hrs - 24 * 13)),
        ])
    db.flush()

    def find(d, prefix):
        return next(v for k, v in d.items() if k.startswith(prefix))

    for prefix, fkey, bid, days, text in PROPOSALS:
        job = find(job_by_title, prefix)
        db.add(Proposal(job_id=job.id, freelancer_id=f_by_key[fkey].id, bid=Decimal(bid),
                        delivery_days=days, cover_letter=text,
                        created_at=job.created_at + timedelta(hours=3)))
    db.flush()

    review_i = {5: 0, 4: 0}
    for ckey, fkey, src, status, hrs, rating in ORDERS:
        client, fl = c_by_key[ckey], f_by_key[fkey]
        kind, prefix = src.split(":", 1)
        disp = status == "disputed"
        if disp:
            status = "in_progress"
        if kind == "gig":
            gig = find(gig_by_title, prefix)
            pkg = gig.packages[1] if len(gig.packages) > 1 else gig.packages[0]
            o = fund_order(db, client, fl, f"{gig.title} ({pkg.tier.title()})", pkg.price,
                           gig_id=gig.id, package=pkg.tier, delivery_days=pkg.delivery_days)
        else:
            job = find(job_by_title, prefix)
            prop = db.scalar(select(Proposal).where(Proposal.job_id == job.id, Proposal.freelancer_id == fl.id))
            amount = prop.bid if prop else job.budget
            o = fund_order(db, client, fl, job.title, amount, job_id=job.id, delivery_days=14)
            if prop:
                prop.status = "accepted"
        o.created_at = ago(hrs)
        db.flush()
        if status in ("in_progress", "delivered", "released"):
            o.status = "in_progress"
        if status in ("delivered", "released"):
            o.status, o.delivered_at = "delivered", ago(max(hrs - 24, 1))
        if status == "released":
            net = seller_net(o.amount)
            fl.balance = q(fl.balance + net)
            db.add(Transaction(user_id=fl.id, kind="earning", amount=net, order_id=o.id,
                               description=f"Payment for {o.title}", created_at=ago(max(hrs - 40, 1))))
            client.client.total_spent = q(client.client.total_spent + o.amount)
            o.status, o.released_at = "released", ago(max(hrs - 40, 1))
            if rating:
                pool = REVIEWS[rating]
                db.add(Review(order_id=o.id, client_id=client.id, freelancer_id=fl.id, rating=rating,
                              comment=pool[review_i[rating] % len(pool)], created_at=ago(max(hrs - 44, 1))))
                review_i[rating] += 1
            cr = ORDER_CLIENT_REVIEWS.get((ckey, fkey))
            if cr:
                db.add(ClientReview(order_id=o.id, client_id=client.id, freelancer_id=fl.id, rating=cr[0],
                                    comment=cr[1], created_at=ago(max(hrs - 46, 1))))
        if disp:
            o.disputed, o.dispute_by, o.dispute_opened_at = True, client.id, ago(5)
            o.dispute_reason = "The first cut does not follow the brief we agreed on and the captions are out of sync. I would like a refund or a proper redo."
        db.flush()
        for t in db.scalars(select(Transaction).where(Transaction.order_id == o.id, Transaction.kind == "escrow_hold")):
            t.created_at = o.created_at

    # a few more jobs-in-progress links
    for j in job_by_title.values():
        if j.status == "in_progress":
            continue

    for (ckey, fkey), lines in CHATS.items():
        conv = db.scalar(select(Conversation).where(Conversation.client_id == c_by_key[ckey].id,
                                                    Conversation.freelancer_id == f_by_key[fkey].id))
        if not conv:
            conv = Conversation(client_id=c_by_key[ckey].id, freelancer_id=f_by_key[fkey].id)
            db.add(conv)
            db.flush()
        base = NOW - timedelta(hours=len(lines) * 3)
        for i, (who, body) in enumerate(lines):
            sender = c_by_key[ckey] if who == "c" else f_by_key[fkey]
            last_two = i >= len(lines) - 1
            db.add(Message(conversation_id=conv.id, sender_id=sender.id, body=body,
                           read=not last_two, read_at=None if last_two else base + timedelta(hours=i * 3 + 1),
                           created_at=base + timedelta(hours=i * 3)))
    for key, extra in CLIENT_SPEND.items():
        c = c_by_key[key].client
        c.total_spent = q(c.total_spent + extra)
    for ckey, fkey, rating, comment, days in EXTRA_CLIENT_REVIEWS:
        db.add(ClientReview(order_id=None, client_id=c_by_key[ckey].id, freelancer_id=f_by_key[fkey].id,
                            rating=rating, comment=comment, created_at=ago(24 * days)))
    admin = db.scalar(select(User).where(User.role == "admin"))
    notes = [
        (c_by_key["helen"], "order", "Work delivered", "Marcus Bell delivered \"Edit your YouTube videos\". Review it and release payment.", "/dashboard/orders", 3, False),
        (c_by_key["helen"], "proposal", "New proposal on \"Redesign our patient booking flow\"", "Sofia Petrova bid $1,750 for 12 days.", "/job/1", 26, False),
        (c_by_key["helen"], "announcement", "Welcome to Crewline", "Post a job or browse gigs to get started.", "", 240, True),
        (f_by_key["tomas"], "order", "New order", "James Whitfield ordered \"Fix bugs and ship features\" (standard).", "/dashboard/orders", 6, False),
        (f_by_key["tomas"], "proposal", "You were hired", "Helen Park accepted your proposal for \"Patient portal bug fixes\".", "/dashboard/orders", 150, True),
        (f_by_key["tomas"], "payment", "You earned $540", "Payment for a recent order is in your wallet.", "/dashboard/wallet", 400, True),
    ]
    if admin:
        notes.append((admin, "dispute", "New dispute", "\"Edit your YouTube videos\" · opened by Chloe Bennett", "/admin/disputes", 5, False))
    for user, kind, title, body, link, hrs, read in notes:
        db.add(Notification(user_id=user.id, kind=kind, title=title, body=body, link=link, read=read, created_at=ago(hrs)))
    db.commit()


def main():
    from .db import Base, SessionLocal, engine, ensure_columns
    if "--reset" in sys.argv:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    ensure_columns()
    with SessionLocal() as db:
        if db.scalar(select(User).limit(1)):
            n = apply_avatars(db)
            gigs = apply_gig_images(db)
            print(f"Database already has data. Updated {n} user photos and {gigs} gig images. Use --reset to wipe and reseed.")
            return
        seed(db)
        print("Seeded. Log in with any seeded email and the password:", PASSWORD)


if __name__ == "__main__":
    main()
