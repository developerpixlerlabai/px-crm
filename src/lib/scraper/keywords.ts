// Keyword lists and patterns, ported verbatim from the retired Apps Script
// scraper (Code.gs, in git history).
// Every list is matched through hasKeyword() in text.ts (leading word edge
// only) unless a comment says otherwise.

// ════════════════════════════════════════════════════════════════
//  SCORING MODEL
//  Two separate axes. This is the core fix for the healthcare skew.
//    INTENT  = "is something happening that means they need us?"  → POINTS
//    SEGMENT = "which vertical are they in?"                      → TAG ONLY
//  In v1 the vertical words were scored as high-value intent, and because
//  healthcare has ~9 near-synonyms that all appear in the same article
//  (healthcare ai / clinical ai / medtech / digital health / health tech /
//  telehealth...), a single article stacked +3 four times and hit 10/10.
//  SaaS terms are disjoint, so real SaaS signals topped out around 6.
// ════════════════════════════════════════════════════════════════

// Each GROUP fires AT MOST ONCE, no matter how many of its keywords match.
// That single rule is what removes the synonym-stacking bias.
export type IntentGroup = { key: string; weight: number; kw: string[] };

export const INTENT_GROUPS: IntentGroup[] = [
  { key: "Funding",     weight: 4, kw: [
      "series a", "series b", "series c", "series d", "seed round",
      "seed funding", "funding round", "raises $", "raised $", "raises €",
      "secures $", "lands $", "closes $", "nets $", "million in funding",
      "venture round", "venture funding", "investment round",
      "secures funding", "closes funding", "raises seed", "raised seed",
      // Added with NEWS_GEO "global". Every keyword above was written for US
      // coverage, where a round is reported as "raises $Nm". Elsewhere the
      // amount is quoted in local currency and the round is named instead of
      // the dollar figure — "raises 270,000 euro in pre-seed", "Raises Rs 36
      // Cr" — so the dollar-anchored patterns never fired and real rounds
      // were dropped as "no trigger event" the moment the geo gate came off.
      "pre-seed", "preseed", "pre seed", "angel round", "bridge round",
      "extension round", "raises rs", "raised rs", "raises ₹", "raises £",
      "crore in", "lakh in",
      // Coming out of stealth is a first-class funding-shaped signal and had
      // NO keyword anywhere, despite its own NEWS_QUERY. It was qualifying
      // only as a side effect of bare "launches" in Product Launch, so
      // de-generalising that verb exposed the gap.
      "exits stealth", "out of stealth", "emerges from stealth",
      "emerging from stealth", "comes out of stealth"
      // NOT bare "raises" / "raised" / "seed", which the spec asks for. Word
      // boundaries cannot save those — \braises matches "raises concerns",
      // \bseed matches "seeded 40 new stores". The signal is semantic, not
      // lexical, so every entry here is anchored to an amount or a round name.
  ]},

  // ── Hiring: two groups, deliberately DISJOINT keyword sets ──
  // The spec's weight table lists both at 4 while filing "AI engineer / ML
  // engineer / LLM engineer / data engineer" under Developer Hiring — which
  // are already AI Hiring's keywords. Both would fire on one phrase for 8
  // points from a single signal, the exact stacking the two-axis model exists
  // to prevent. Keeping the lists disjoint gets the spec's ten groups AND
  // keeps the distinction Phase 1 exists to measure: is it the AI roles or the
  // general engineering roles that produce good leads? Merging them would
  // have answered that question by deleting it.
  { key: "AI Hiring",   weight: 4, kw: [
      "ai engineer", "machine learning engineer", "ml engineer",
      "hiring ai", "ai developer", "llm engineer", "mlops",
      "automation engineer", "ai product manager", "data engineer"
  ]},
  { key: "Developer Hiring", weight: 4, kw: [
      "react developer", "react engineer", "react native developer",
      "react native engineer", "node.js developer", "node.js engineer",
      "node developer", "python developer", "python engineer",
      "django developer", "flask developer", "laravel developer",
      "laravel engineer", "php developer", "shopify developer",
      "shopify engineer", "mobile developer", "mobile engineer",
      "ios developer", "android developer", "flutter developer",
      "frontend developer", "front-end developer", "backend developer",
      "back-end developer", "full-stack developer", "full stack developer",
      "fullstack developer", "software engineer", "platform engineer",
      "hiring developers", "hiring engineers", "hiring software"
  ]},

  { key: "Shopify / Ecommerce", weight: 4, kw: [
      // Action only. The spec is explicit that merely mentioning Shopify earns
      // nothing — there has to be work attached, or every "best Shopify apps"
      // listicle becomes a lead.
      "shopify migration", "shopify plus migration", "migrating to shopify",
      "migrate to shopify", "woocommerce to shopify", "magento to shopify",
      // The spec's own §4 worked example is "Company Y migrates WooCommerce
      // store to Shopify Plus", and none of the phrasings above match it —
      // they all assume the platform names are adjacent. "store to shopify"
      // is the shape these headlines actually take.
      "store to shopify", "migrates to shopify", "moves to shopify",
      "moving to shopify", "switching to shopify", "switch to shopify",
      "replatform to shopify", "woocommerce migration", "magento migration",
      "shopify redesign", "shopify replatform", "shopify development",
      "shopify integration", "shopify app development", "shopify launch",
      "ecommerce replatform", "ecommerce migration", "ecommerce redesign",
      "ecommerce platform launch", "headless commerce migration"
  ]},

  { key: "AI Initiative", weight: 3, kw: [
      "investing in ai", "ai strategy", "ai roadmap", "ai transformation",
      "ai adoption", "adopting ai", "launching ai", "building ai",
      "ai pilot", "ai initiative", "automation roadmap", "ai-first",
      "ai integration", "integrating ai", "ai implementation", "implements ai",
      "deploys ai", "ai deployment", "adds ai features", "introduces ai features",
      // A company shipping an AI product is §17's canonical GOOD signal
      // ("Company X launches AI-powered platform"), and §3 files exactly these
      // under AI Adoption. They live HERE, at 3, rather than being recovered
      // by putting bare "launches" back into Product Launch at 2: measured on
      // 606 items, the generic verb was the only thing qualifying 33 wire
      // releases, and it qualified them whatever they launched.
      "launches ai", "launching ai product", "launches an ai", "unveils ai",
      "introduces ai", "debuts ai", "announces ai", "rolls out ai"
  ]},

  { key: "Modernization", weight: 3, kw: [
      "digital transformation", "legacy system", "modernize", "modernization",
      "replatform", "tech stack overhaul", "cloud migration",
      "software modernization", "application modernization",
      "legacy application", "legacy software", "technology modernization",
      "application transformation", "application migration",
      "platform migration", "technology overhaul", "system modernization"
  ]},

  { key: "Mobile App",  weight: 3, kw: [
      "launches mobile app", "launching mobile app", "new mobile app",
      "mobile application launch", "launches ios app", "launches android app",
      "mobile app development", "mobile app redesign", "app modernization",
      "mobile platform launch", "react native development",
      "flutter development"
  ]},

  { key: "New Leadership", weight: 3, kw: [
      "chief ai officer", "head of ai", "vp of ai", "chief technology officer",
      "chief digital officer", "head of automation", "appoints cto",
      "names cto", "new cto", "appoints chief"
  ]},

  { key: "Product Launch", weight: 2, kw: [
      // Bare "launches" / "unveils" / "debuts" / "rolls out" are GONE, per the
      // spec's own "avoid overly generic launches matching unrelated news".
      // They also co-fired with Mobile App on "launches mobile app" for 3+2
      // from one phrase. "ai-powered" is gone for a different reason: it is a
      // category descriptor, and category keywords must never score.
      "launches new platform", "launches new product", "launches platform",
      "launches software platform", "launches application", "unveils platform",
      "unveils new product", "introduces platform", "introduces new software",
      "rolls out platform", "beta launch", "product launch",
      "new digital platform", "customer portal launch"
  ]},

  { key: "Engineering Expansion", weight: 2, kw: [
      "expands team", "engineering team", "hiring spree", "scaling team",
      "doubling headcount", "growing team", "opens office", "new office",
      "expanding engineering team", "growing engineering team",
      "expanding development team", "engineering hiring", "engineering expansion",
      "doubles engineering team", "builds engineering team",
      "new engineering hub", "technology team expansion", "product team expansion"
  ]}
];

// Fallback intent for job postings whose wording doesn't match any group above.
export const JOB_POSTING_INTENT: IntentGroup = { key: "Open AI Role", weight: 3, kw: [] };

// Vertical tags — ZERO points. Used only for the Segment column + quota.
//
// ORDER MATTERS. classifySegment takes the segment with the most keyword hits
// and, on a tie, the one declared FIRST. So these run most-specific first and
// the two broad catch-alls — `saas` and `startup` — go last. Put `startup`
// higher and it wins nearly every funding story, because "startup" appears in
// almost all of them, and the ecommerce/ai/fintech tags this phase exists to
// measure would never surface.
//
// Short tokens like "ai", "ml", "ios" and "pos" are safe here ONLY because
// hasKeyword anchors them to a leading word edge. Under the old indexOf scan
// they matched "said", "HTML", "Biosolutions" and "Deposit". See section 37.
export const SEGMENT_KEYWORDS: Record<string, string[]> = {
  // ── Industry verticals, most specific first ──
  ecommerce: [
    "ecommerce", "e-commerce", "shopify", "dtc", "direct-to-consumer",
    "direct to consumer", "online retail", "consumer brand",
    "digital commerce", "online store", "woocommerce", "magento",
    "headless commerce"
  ],
  fintech: [
    "fintech", "financial technology", "payments", "payment platform",
    "lending platform", "banking technology", "digital banking", "wealthtech",
    "insurtech", "financial platform"
  ],
  real_estate: [
    "real estate", "property technology", "proptech", "property management",
    "property platform", "property portal", "tenant platform",
    "leasing platform"
  ],
  logistics: [
    "logistics", "transportation", "fleet management", "delivery platform",
    "dispatch software", "route optimization", "warehouse management",
    "supply chain software"
  ],
  edtech: [
    "edtech", "education technology", "learning platform", "lms",
    "learning management system", "online learning", "tutoring platform",
    "education platform", "student portal"
  ],
  health: [
    "healthcare", "health tech", "healthtech", "digital health", "medtech",
    "medical device", "clinical", "telehealth", "telemedicine", "patient",
    "ehr", "emr", "hipaa", "biotech", "pharma", "provider network"
  ],
  retail: [
    "retail", "point of sale", "pos platform"
  ],
  manufacturing: [
    "manufacturing software", "manufacturing technology", "industrial software",
    "industrial technology", "factory automation", "production management",
    "manufacturing platform"
  ],
  hospitality: [
    "hospitality technology", "hotel technology", "hotel software",
    "hotel platform", "restaurant technology", "booking platform",
    "travel technology", "travel platform"
  ],
  saas: [
    "saas", "b2b software", "software-as-a-service", "enterprise software",
    "b2b platform", "developer tools", "devtools", "api platform",
    "software company", "martech", "logistics software"
  ],

  // ── Technology tags, deliberately BELOW the industries ──
  // "AI" and "mobile" describe HOW a company builds, not what business it is
  // in, and they co-occur with every vertical in this corpus. Declared above
  // health, `ai` tagged "Acme Health raises $18M for its clinical AI platform"
  // as `ai` and buried the industry. The technology is not lost — step 4's
  // Technology column is where it belongs. These win only when no industry
  // marker is present, which is exactly when they are the useful answer.
  ai: [
    "ai", "artificial intelligence", "genai", "llm", "large language model",
    "machine learning", "ml", "agentic"
  ],
  mobile: [
    "mobile app", "ios", "android", "react native", "flutter",
    "mobile platform", "mobile product", "app development"
  ],

  // ── Broadest catch-all, last ──
  // "startup" appears in nearly every funding story. Declared any higher it
  // wins them all and the vertical tags this phase exists to measure never
  // surface.
  startup: [
    "startup", "venture-backed", "venture backed", "early-stage", "early stage",
    "emerging company", "newly funded"
  ]
};

// ── GEOGRAPHY ────────────────────────────────────────────────
// EVERYTHING IN THIS BLOCK IS DORMANT unless CONFIG.NEWS_GEO === "us".
//
// It was written when the agency sold into the US: `gl=US` on Google News
// still returns a LOT of global startup funding news, and Indian, Saudi, UAE,
// Bulgarian, Swedish, Korean and Brazilian rounds were roughly a third of all
// results. Delivering from India, those rounds are prospects rather than
// noise, so v3 leaves the gate open by default. The lists survive intact
// because flipping NEWS_GEO back to "us" has to be a one-word change.
//
// HARD = unambiguous, reject outright (foreign currency units, foreign cities).
export const NON_US_HARD = [
  // currency / units — the strongest single tell
  "crore", "lakh", " rs ", "rs.", "₹", "inr", "€", "euro", "£", "gbp",
  "¥", "₩", "aed", "sar", "sgd", "dirham", "riyal", "rupee", "shekel",
  // countries / cities that dominated the noise
  "india", "indian", "bengaluru", "bangalore", "mumbai", "new delhi",
  "gurugram", "gurgaon", "noida", "pune", "hyderabad", "chennai",
  "saudi", "uae", "dubai", "abu dhabi", "qatar", "kuwait", "bahrain",
  "pakistan", "bangladesh", "sri lanka", "nepal",
  "korea", "korean", "japan", "japanese", "china", "chinese", "taiwan",
  "singapore", "indonesia", "vietnam", "philippines", "malaysia", "thailand",
  "nigeria", "kenya", "ghana", "egypt", "south africa",
  "brazil", "brazilian", "mexico", "colombia", "argentina", "chile",
  "latin america", "latam",
  "bulgaria", "romania", "poland", "polish", "czech", "hungary", "ukraine",
  "sweden", "swedish", "norway", "norwegian", "denmark", "danish",
  "finland", "finnish", "estonia", "lithuania", "latvia",
  "turkey", "turkish", "israel", "israeli", "russia", "russian",
  "zimbabwe", "tanzania", "uganda", "ethiopia", "morocco", "tunisia",
  "algeria", "senegal", "rwanda", "zambia", "botswana", "cameroon",
  "peru", "ecuador", "uruguay", "paraguay", "bolivia", "venezuela",
  // Sovereign/national programmes are government buyers by definition
  "sovereign", "ministry of", "national programme", "state-owned",
  // Major non-US cities. Country names alone missed postings that only name
  // the city ("Berlin / Freiburg / NYC").
  "berlin", "munich", "hamburg", "frankfurt", "paris", "lyon", "madrid",
  "barcelona", "amsterdam", "rotterdam", "utrecht", "zurich", "geneva",
  "stockholm", "copenhagen", "oslo", "helsinki", "warsaw", "krakow", "prague",
  "vienna", "budapest", "milan", "rome", "lisbon", "porto", "brussels",
  "athens", "istanbul", "tel aviv", "bangkok", "jakarta", "manila", "seoul",
  "tokyo", "osaka", "shanghai", "beijing", "shenzhen", "hong kong",
  "sydney", "melbourne", "brisbane", "auckland", "vancouver", "montreal",
  "mexico city", "sao paulo", "buenos aires", "santiago", "bogota", "lima",
  "lagos", "nairobi", "cairo", "johannesburg", "cape town", "freiburg"
];

// SOFT = ambiguous. A US company "expanding into Europe" is still a lead, so
// penalize instead of rejecting.
export const NON_US_SOFT = [
  "europe", "european", "emea", "apac", "uk-based", "britain", "british",
  "london", "germany", "german", "france", "french", "spain", "spanish",
  "italy", "italian", "netherlands", "dutch", "ireland", "switzerland",
  "canada", "canadian", "toronto", "australia", "australian", "new zealand"
];

// Positive US signal — small ranking bonus so domestic leads float to the top.
export const US_MARKERS = [
  "u.s.", "us-based", "united states", "american", "silicon valley",
  "san francisco", "new york", "nyc", "boston", "austin", "seattle",
  "chicago", "denver", "atlanta", "miami", "los angeles", "california",
  "texas", "massachusetts", "delaware", "bay area"
];

// ── CAN WE ACTUALLY TAKE THIS JOB? ───────────────────────────
// Replaces the US gate for job postings. Three distinct answers matter, not
// two: an explicit "Worldwide" is a better lead than a post that says only
// "Remote" and never names a region, and both beat "Remote (US only)".

// Region tokens that INCLUDE India. Sources with a structured location field
// (Remotive's candidate_required_location, WWR's <region>, Jobicy's jobGeo)
// are checked against this as an allowlist, because the absence of a fence is
// not the same as being invited: "Americas, Europe, Israel" names no US-only
// restriction and is still closed to us.
//
// EMEA is deliberately absent — Europe, Middle East and Africa excludes India.
export const REGION_INCLUDES_INDIA = [
  "india", "worldwide", "anywhere", "global", "international",
  "asia", "apac", "asia pacific", "asia-pacific", "south asia", "any location"
];

// Free-text fences, for sources with no structured field (Hacker News). These
// are regexes rather than substrings because "us" and "eu" are two of the most
// destructive substrings in the English language.
export const JOB_FENCED_RE = new RegExp([
  // "US only", "EU-based", "Canada residents", "US citizens"
  "\\b(?:u\\.?s\\.?a?|united states|north america|americas|canada|eu|europe|emea|uk|australia|latam)[\\s-]*(?:only|based|residents?|citizens?)\\b",
  // "Remote (US)", "REMOTE (EU/UK)" — the single commonest HN phrasing
  "\\bremote\\s*[({\\[]\\s*(?:u\\.?s\\.?a?|united states|north america|americas|canada|eu|europe|emea|uk)\\b",
  // Work-authorization language is a fence even when no region is named
  "\\b(?:green card|work authou?ri[sz]ation|authou?ri[sz]ed to work in the u\\.?s)\\b",
  // "US timezones" is not a legal fence, but a 10.5-hour offset is a real one
  "\\bu\\.?s\\.?\\s*time ?zones?\\b",
  "\\bmust (?:be|reside|live) (?:in|within) (?:the )?(?:u\\.?s|united states|eu|uk|canada)\\b"
].join("|"), "i");

// India is explicitly inside the net.
export const JOB_OPEN_RE = /\b(india|worldwide|anywhere|globally|global|apac|asia[\s-]?pacific|asia)\b/i;

// Some marker of remote work. Without one, a posting is an office job in a
// city we do not have an office in.
export const JOB_REMOTE_RE = /\b(remote|anywhere|worldwide|distributed|work from home|wfh|globally)\b/i;

// Wrong buyer type — you can't sell an AI build to these.
export const WRONG_BUYER = [
  "nhs", "government", "federal", "department of", "city of", "county of",
  "school district", "public sector", "non-profit", "nonprofit", "ngo",
  "municipal", "state agency", "veterans affairs",
  // Institutions, surfaced by step 3's wider job-title filter: once "Software
  // Engineer" was admitted, research hospitals and universities came with it
  // ("Sr. Staff Software Engineer, Rust Genomics Infrastructure" at St. Jude
  // Children's Research Hospital, 2026-09-02). They buy through procurement,
  // not by hiring an agency.
  //
  // PHRASES, not bare words, and that is the whole design. A bare "hospital"
  // or "university" would also reject "HospitalIQ" and "UniversityNow" —
  // health-tech and edtech vendors, which are exactly the leads we want. Every
  // entry below only appears inside an actual institution's name.
  "children's hospital", "childrens hospital", "research hospital",
  "university hospital", "medical center", "medical centre",
  "university of", "college of", "school of"
];

// HARD REJECT for NEWS items only — this is what kills the noise v1 was
// saving: market reports, earnings coverage, student competitions, listicles
// and competitor blog posts.
//
// Deliberately NOT applied to job postings. Phrases like "university",
// "how to" and "vs." appear constantly in job descriptions (degree
// requirements, responsibilities), and applying this list to them rejected
// 100% of job leads in testing.
export const DISQUALIFY = [
  // Content that is ABOUT the topic rather than a company doing something
  "market size", "market report", "market research", "market forecast",
  "cagr", "market to reach", "industry report", "study finds", "research paper",
  "survey finds", "according to a report", "white paper", "webinar",
  "top 10", "top 5", "best practices", "how to", "guide to", "ultimate guide",
  "predictions for", "trends to watch", "opinion:", "podcast", "roundup",
  "what is ", "explained:", "vs.", "review:",

  // Public-market / earnings noise (this is what "FLYW Q2 Deep Dive" was)
  "q1 results", "q2 results", "q3 results", "q4 results", "quarterly results",
  "earnings", "deep dive", "price target", "analyst rating", "shares rise",
  "shares fall", "stock", "nasdaq", "nyse", "dividend", "sec filing",
  "outperform", "downgrade", "upgrade to buy",
  // Surfaced by NEWS_GEO "global": Indian and Korean outlets headline ordinary
  // company news as "<Company> Share Price: ...", which carries none of the
  // tells above and was saved as a lead ("Coforge Share Price: Unveils New AI
  // Adoption Framework", 2026-09-02) with "New AI Adoption Framework"
  // extracted as its company name.
  "share price",

  // Academic / student content (news only — in a job posting these words are
  // just degree requirements)
  "university", "academic", "student", "competition showcase", "professor",
  "peer-reviewed", "dissertation",

  // A leadership DEPARTURE is the opposite of a buying signal. ("exits" is
  // deliberately absent — "exits stealth" is a genuinely good signal.)
  "departs", "steps down", "resigns", "is leaving", "to depart", "ousted"
];

// SOFT penalties — subtract points but don't reject outright
export const PENALTIES = [
  { kw: ["sponsored", "press release", "advertorial"], points: -2 },
  { kw: ["acquired by", "acquisition of", "merges with"], points: -1 }, // often too late to sell
  { kw: ["layoffs", "shuts down", "bankruptcy", "winding down"], points: -4 }
];

// Publications — never let one of these end up in the Company column
export const PUBLISHERS = [
  "techcrunch", "businesswire", "prnewswire", "globenewswire", "benzinga",
  "reuters", "bloomberg", "forbes", "citybiz", "unite.ai", "tracxn",
  "security boulevard", "venturebeat", "axios", "cnbc", "yahoo",
  "fiercehealthcare", "mobihealthnews", "medcitynews", "statnews",
  "the verge", "wired", "zdnet", "silicon", "finsmes", "pymnts",
  "seeking alpha", "motley fool", "investing.com", "msn", "afr",
  "healthcare it news", "modern healthcare", "beckers", "fintech futures"
];

// Publishers whose entire beat is stock coverage. Anything sourced from these
// is investor content, never a buying signal — reject on the source, not the
// wording, because "Cencora Sees Specialty Growth Continue While GLP-1 Mix
// Weighs on Margins" contains no rejectable phrase but is still worthless.
export const STOCK_PUBLISHERS = [
  "benzinga", "seeking alpha", "motley fool", "investing.com", "zacks",
  "simply wall st", "insider monkey", "marketbeat", "tipranks", "barron",
  "stocktwits", "gurufocus", "nasdaq.com", "24/7 wall st"
];

// Words that are never a company name (guards the extractor)
export const NOT_A_COMPANY = [
  "the", "this", "these", "new", "how", "why", "what", "when", "who",
  "top", "best", "first", "global", "us", "u.s.", "ai", "report", "study",
  "exclusive", "breaking", "opinion", "meet", "inside", "here",
  "hn", "hacker news", "location", "remote", "hiring"
];


// Hosts that tell you nothing about the employer — a poster linking to their
// LinkedIn, an ATS or a Google Doc yielded companies called "Linkedin", "Drive"
// and "Jobs". Better to leave the company blank than to invent a wrong one.
export const GENERIC_HOSTS = [
  "linkedin", "google", "docs.google", "drive.google", "forms.gle", "goo.gl",
  "notion", "notion.so", "airtable", "typeform", "greenhouse", "lever",
  "ashbyhq", "workable", "bamboohr", "recruitee", "smartrecruiters", "jobvite",
  "indeed", "wellfound", "angel.co", "ycombinator", "github", "gitlab",
  "twitter", "x.com", "medium", "substack", "bit.ly", "tinyurl", "dropbox",
  "calendly", "gmail", "youtube", "facebook", "instagram"
];


// Pipe segments that are a location or a work arrangement, not a company.
export const HN_SEGMENT_NOISE = /^(remote|onsite|on-?site|hybrid|full[\s-]?time|part[\s-]?time|contract(or)?|intern(ship)?s?|visa|h1b|c2c|freelance|anywhere|worldwide|us|usa|united states|uk|eu|emea)\b/i;

// Role descriptions also show up in these segments and must not become the
// company name ("NYC | ONSITE Norm Ai | AI eng" was yielding "AI eng").
// Comma-separated tech stacks get posted as their own segment and were being
// read as the company name ("Python, TensorFlow, PyTorch, GCP, AWS, Azure").
export const HN_TECH_STACK = /\b(python|javascript|typescript|golang|rust|java|kotlin|swift|ruby|php|react|vue|angular|node\.?js|django|rails|kubernetes|docker|terraform|tensorflow|pytorch|aws|gcp|azure|postgres|mysql|mongodb|redis|kafka)\b/i;

export const HN_ROLE_NOISE = /\b(engineers?|eng|developers?|devs?|managers?|designers?|scientists?|analysts?|leads?|architects?|sre|devops|founders?|cto|cpo|vp|director|internships?|recruiters?|fullstack|full-stack|backend|frontend)\b/i;


// Ordered most-specific first. `covers` names the broader technologies this
// one makes redundant, so "Senior React Native Developer" reports
// "React Native" rather than "React Native, React, Mobile".
export const TECHNOLOGIES = [
  { name: "Shopify",     covers: ["Ecommerce"],
    kw: ["shopify", "woocommerce", "magento", "headless commerce"] },
  { name: "React Native", covers: ["React", "Mobile"],
    kw: ["react native"] },
  { name: "Flutter",     covers: ["Mobile"], kw: ["flutter"] },
  { name: "iOS",         covers: ["Mobile"], kw: ["ios", "swift"] },
  { name: "Android",     covers: ["Mobile"], kw: ["android", "kotlin"] },
  { name: "React",       covers: [],        kw: ["react", "next.js"] },
  { name: "Node.js",     covers: [],        kw: ["node.js", "nodejs", "node"] },
  { name: "Python",      covers: [],        kw: ["python", "django", "flask"] },
  { name: "Laravel",     covers: ["PHP"],   kw: ["laravel"] },
  { name: "PHP",         covers: [],        kw: ["php"] },
  { name: "AI/LLM",      covers: [],
    kw: ["ai", "llm", "machine learning", "ml", "genai", "artificial intelligence",
         "agentic", "mlops", "deep learning"] },
  { name: "DevOps/Cloud", covers: [],
    kw: ["devops", "kubernetes", "terraform", "cloud migration", "site reliability"] },
  { name: "API/Integration", covers: [], kw: ["api", "integration", "webhook"] },
  { name: "Mobile",      covers: [], kw: ["mobile app", "mobile developer", "mobile engineer"] },
  { name: "Ecommerce",   covers: [], kw: ["ecommerce", "e-commerce"] },
  { name: "Full Stack",  covers: [], kw: ["full stack", "full-stack", "fullstack"] }
];


// Keyed by intent, checked in this order — the most actionable trigger wins.
// Deterministic templates on purpose: the spec rules out calling an LLM for
// this in Phase 1.
export const OUTREACH_ANGLES: [string, string][] = [
  ["Shopify / Ecommerce", "appears to be migrating or rebuilding on Shopify. Pitch migration, theme customization and integrations."],
  ["Mobile App",          "is launching a mobile product. Pitch React Native / mobile development support."],
  ["Developer Hiring",    "is hiring {TECH} engineers. Pitch outsourced {TECH} capacity to move the roadmap faster than a hire can."],
  ["AI Hiring",           "is hiring AI/ML engineers. Pitch AI and LLM engineering capacity alongside the in-house search."],
  ["Modernization",       "is modernizing its stack. Pitch application modernization and full-stack engineering support."],
  ["AI Initiative",       "is shipping an AI product. Pitch AI/LLM engineering and product development support."],
  ["Funding",             "recently raised. Pitch product development support to turn the new capital into faster execution."],
  ["New Leadership",      "just appointed new technical leadership. New leaders buy — pitch delivery capacity for their first roadmap."],
  ["Engineering Expansion", "is growing its engineering team. Pitch a dedicated team as the faster alternative to hiring."],
  ["Product Launch",      "just shipped. Pitch engineering capacity for the next release."],
  ["Open AI Role",        "has an open engineering req. Pitch development capacity to close the gap while they recruit."]
];


export const ACTION_WORDS = [
  "raises", "raised", "secures", "secured", "lands", "closes", "closed",
  "nets", "snags", "bags", "scores", "announces", "announced", "launches",
  "launched", "unveils", "debuts", "introduces", "appoints", "appointed",
  "names", "hires", "hiring", "taps", "acquires", "acquired", "partners",
  "expands", "expanding", "picks", "deploys", "implements", "adopts", "selects",
  // Added after a live run left these as "— extract manually —":
  "completes", "receives", "attracts", "wins", "signs", "invests",
  "doubles", "opens", "banks", "earns", "bets",
  // Added 2026-08-08 from 25 more unresolved headlines. Deliberately NOT
  // added: bare "launch"/"drive"/"push" — they appear mid-sentence in topic
  // headlines ("Why Patient Outcomes Must Drive Healthcare AI Strategy") and
  // would turn the preceding words into a company name.
  "emerges", "emerged", "establishes", "established", "emphasizes",
  "showcases", "advances", "reopens"
];


/**
 * Descriptor nouns that sit between an adjective phrase and the real name:
 * "Food delivery startup Amigo", "…Implementation Platform June AI".
 *
 * "Labs", "Ventures" and "Studios" are deliberately absent — they are far more
 * often part of the actual name ("BlackCube Labs") than a descriptor, and
 * listing them made the extractor eat the company it was looking for.
 */
// Longest first so "startups" wins the alternation over "startup".
export const DESCRIPTOR_WORDS = [
  "start-ups", "start-up", "startups", "startup", "scale-ups", "scale-up",
  "scaleups", "scaleup", "consultants", "consultant", "companies", "company",
  "providers", "provider", "platforms", "platform", "unicorns", "unicorn",
  "vendors", "vendor", "giants", "giant", "makers", "maker", "firms", "firm"
];


// Query params that carry no identity — safe to drop before comparing URLs.
export const TRACKING_PARAMS = /^(utm_\w*|oc|ct|cd|usg|rct|sa|ved|ei|gclid|fbclid|mc_cid|mc_eid|ref|referrer|source|campaign|amp)$/i;


// ════════════════════════════════════════════════════════════════
//  JOB POSTINGS AS BUYING SIGNALS
//  A posting is evidence that a company needs engineering capacity — not a
//  job we would apply for. So geography is no longer a gate (a US startup that
//  hires "Remote (US only)" can still contract an agency in India); what
//  matters is whether the company is the kind that buys from one: funded,
//  early-stage, 2–300 people, in a priority market, and not a competitor.
//
//  Measured 2026-10-26: the old "can we take this job from India?" gate
//  dropped 92 of 128 HN posts and 40 of 52 Jobicy posts — including Estuary
//  (Series A), HiO (seed) and a dozen other US startups — while keeping
//  "Anywhere in the World" WWR posts from DuckDuckGo, Affirm, Squarespace,
//  Vercel and Reddit, all of which scored 8–10.
// ════════════════════════════════════════════════════════════════

/** Stage signals that mark an early company. Any one lifts the score cap. */
export const STARTUP_SIGNAL_RE = new RegExp(
  "\\b(" + [
    "pre-?seed", "seed[- ](?:round|stage|funded|funding)", "series a",
    "founding (?:engineer|developer|team|member|hire)", "first (?:engineer|engineering hire|hire|technical hire)",
    "early[- ]stage", "y ?combinator", "\\(yc\\b", "yc [swfx]\\d{2}", "yc-backed",
    "team of (?:\\d|two|three|four|five|six|seven|eight|nine|ten)\\b",
    "\\d{1,2}[- ](?:person|people|employee) (?:team|company|startup)",
    "small team", "venture[- ]backed", "just raised", "recently raised",
  ].join("|") + ")",
  "i",
);

/**
 * Signals of a mature organisation, in the TITLE. Levelled ladders
 * ("Engineer II", "Machine Learning Engineer - IV") and requisition ids
 * ("(R13923)") are how large companies' ATSs write titles; a 10-person
 * startup does neither.
 */
export const LARGE_COMPANY_TITLE_RE =
  /\b(?:engineer|developer|scientist|analyst|architect)\s*(?:-\s*)?(?:i{2,3}|iv|v|vi|[2-6])\b|\(\s*r\d{3,}\s*\)|\breq(?:uisition)?[-\s#]*\d{3,}|\b(?:distinguished|director|vice president|vp)\b/i;

/**
 * Weaker title signal: Staff/Principal ladders exist at 100-person companies
 * too ("Staff Full-Stack Engineer" at Propel Labs), so these cost a point
 * rather than four.
 */
export const SENIOR_LADDER_TITLE_RE = /\b(?:staff|principal|senior staff)\b/i;

/** Mature-organisation signals in the posting body. */
export const LARGE_COMPANY_TEXT_RE = new RegExp(
  "\\b(" + [
    "fortune (?:100|500)", "publicly traded", "public company", "nasdaq", "nyse",
    "\\d{1,3}(?:,\\d{3})\\+? employees", "thousands of employees",
    "\\d{2,3}\\+? countries", "global (?:offices|workforce)",
  ].join("|") + ")",
  "i",
);

/**
 * Companies too large to buy agency capacity, seen in the job feeds. Matched
 * on the normalized company name. A list, not a rule, so add to it when a
 * big brand gets through — the stage signals above catch most of the rest.
 */
export const LARGE_COMPANIES = [
  "affirm", "airbnb", "amazon", "apple", "atlassian", "automattic", "binance",
  "canonical", "circleci", "cloudflare", "coinbase", "datadog", "doordash",
  "dropbox", "duckduckgo", "elastic", "elevenlabs", "github", "gitlab", "google",
  "hashicorp", "hubspot", "jumio", "lattice", "meta", "microsoft", "mongodb",
  "netflix", "notion", "okta", "oportun", "planetscale", "reddit", "salesforce",
  "shopify", "slack", "sourcegraph", "spotify", "squarespace", "stripe",
  "supabase", "tether", "twilio", "typeform", "uber", "vercel", "zapier", "zoom",
];

/**
 * Competitors and gig marketplaces. Staffing and outsourcing firms sell what
 * we sell; data-labelling platforms hire "AI trainers", which is piecework,
 * not engineering budget. Matched on the normalized company name.
 */
export const COMPETITOR_COMPANIES = [
  // Staffing, talent marketplaces, outsourced development
  "toptal", "turing", "andela", "lemonio", "proxify", "proxifyab", "bairesdev",
  "crossover", "xteam", "gunio", "arcdev", "braintrust", "upwork", "fiverr",
  "revelo", "scalablepath", "terminal", "hired", "interviewresources",
  "growthminded", "irashtech", "startuphakk",
  // AI data labelling / "AI trainer" piecework
  "imerit", "imerittechnology", "outlier", "dataannotation", "remotasks",
  "appen", "telusinternational", "mercor", "alignerr", "invisibletechnologies",
  "surgeai", "scaleai", "askable",
];

/** The same, from the company name or posting wording rather than a list. */
export const COMPETITOR_NAME_RE = /\b(?:staffing|recruit(?:ing|ment|ers)?|talent|outsourc\w*|consult(?:ing|ancy|ants))\b/i;
// Phrases only a recruiter or a labelling platform writes. Deliberately NOT
// "for our clients" — B2B SaaS postings say that about their own customers.
export const COMPETITOR_TEXT_RE =
  /\b(?:on behalf of (?:our|a) client|our client is|ai trainers?|data annotation|annotators?|annotation tasks|labell?ing tasks|freelance network|talent network)\b/i;

/** Roles that are not engineering work, checked on the role/title. */
export const NON_ENGINEERING_ROLE_RE =
  /\b(?:product (?:manager|specialist|owner|marketing)|pm\b|marketing|growth|sales|business development|account (?:executive|manager)|customer (?:success|support)|support (?:specialist|agent)|recruit(?:er|ing)|talent|hr\b|people (?:ops|partner)|finance|accountant|legal|counsel|operations manager|community manager|content (?:writer|strategist)|copywriter)\b/i;

/** ...unless the same role also names engineering work ("Growth Engineer"). */
export const ENGINEERING_ROLE_RE =
  /\b(?:engineer|engineering|developer|dev|programmer|architect|sre|devops|scientist|ml|ai|data|full[\s-]?stack|front[\s-]?end|back[\s-]?end|mobile|ios|android)\b/i;

/**
 * PixlerLab's priority markets (US, UK, UAE, Australia), read from a job's
 * location text. "US"/"USA"/"U.S." are matched case-SENSITIVELY — lowercase
 * "us" is everywhere in prose ("join us").
 */
export const PRIORITY_MARKET_CASED_RE = new RegExp(
  "\\b(?:US|USA|UK|UAE)\\b|\\bU\\.S\\.(?:A\\.)?|\\bU\\.K\\." +
    // "Austin, TX" — a capitalised city, then a US state code
    "|\\b[A-Z][a-z]+(?: [A-Z][a-z]+)?, (?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\\b",
);
export const PRIORITY_MARKET_RE = new RegExp(
  "\\b(" + [
    "united states", "north america", "(?<!latin |south |central )america", "united kingdom", "england",
    "scotland", "london", "manchester", "emirates", "dubai", "abu dhabi",
    "australia", "sydney", "melbourne", "brisbane", "perth",
    "new york", "nyc", "san francisco", "bay area", "silicon valley", "seattle",
    "boston", "austin", "chicago", "los angeles", "denver", "miami", "atlanta",
  ].join("|") + ")\\b",
  "i",
);
