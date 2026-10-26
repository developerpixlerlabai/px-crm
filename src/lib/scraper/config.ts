// Scraper configuration, ported from the retired Apps Script scraper (Code.gs
// v3, in git history before its removal). The tuning comments are kept
// verbatim: they are the record of what was measured and why each value is
// what it is.

// ─── CONFIGURATION ───────────────────────────────────────────

export const CONFIG = {
  // Who gets the daily digest. DIGEST_TO in the environment overrides it.
  NOTIFICATION_EMAIL: "mukesh@pixlerlab.com",

  // The digest's dates are written in this zone. The server runs in UTC, and
  // a run at 02:30 UTC is already "today" in India.
  TIME_ZONE: "Asia/Kolkata",

  // Appears in digest email subject. CHANGE THIS — v1 shipped "Your AI Agency".
  AGENCY_NAME: "Pixler Lab",

  // Minimum score to save a lead (0-10).
  // Recalibrated for v2 scoring — 5 is roughly "one clear trigger event +
  // a named company". Raise to 6 once daily volume is comfortable.
  MIN_SCORE: 5,

  // Ignore NEWS older than this many days (0 = no recency filter)
  RECENCY_DAYS: 14,

  // Job postings get a longer window — a req that opened 3 weeks ago is still
  // an open budget, and Remotive's feed in particular skews older.
  JOB_RECENCY_DAYS: 45,

  // Don't re-surface a company you already have a row for, if that row is
  // newer than this. Stops the same funding story arriving from 4 publications
  // as 4 separate leads. Set to 0 to allow repeats.
  COMPANY_DEDUPE_DAYS: 30,

  // ── Anti-flood controls ──
  // No single segment may exceed this share of the leads saved in one run.
  // This is what stops healthcare from eating the whole digest.
  MAX_SEGMENT_SHARE: 0.6,
  // ...but always allow at least this many per segment, even if it breaks share.
  MIN_PER_SEGMENT: 4,
  // Per-request ceiling. A source that has not answered by then is recorded
  // as an error for this run, so one hung feed cannot stall the rest.
  FETCH_TIMEOUT_SECONDS: 30,

  // Hard ceiling per run (protects against a runaway feed)
  MAX_LEADS_PER_RUN: 60,

  // How many leads to itemise in the digest email. The rest are summarised
  // with a link to the CRM — a 60-item email is a wall nobody reads.
  DIGEST_MAX_LEADS: 25,
  // ...and no single source may contribute more than this many. HN's hiring
  // thread alone can qualify 60+ posts and would otherwise crowd out every
  // funding signal.
  MAX_PER_SOURCE: 15,

  // Deferred leads are NOT saved and NOT marked as seen, so they get
  // reconsidered on the next run. Nothing is lost — just delayed.

  // ── PRIMARY ENGINE: Google News RSS ─────────────────────────
  // No setup needed. Edit/add queries freely — they take effect immediately.
  // Query syntax: normal Google operators + `when:7d` for recency.
  //   segment: "saas" | "health"   (drives the quota + the Segment column)
  //   bing:    true  → also run this query against Bing News RSS for coverage
  //
  // NOTE: Google News gives you a HEADLINE but no real snippet, so keep
  // queries phrased around things that appear in headlines (raises, hires,
  // launches, appoints) rather than body-copy phrases like "we are building".
  NEWS_QUERIES: [
    // ── SaaS / Tech (deliberately weighted heavier — this was the dead half) ──
    { label: "SaaS Funding A/B",        segment: "saas",   bing: true,
      q: '("Series A" OR "Series B") raises OR raised (SaaS OR "B2B software") when:7d' },
    { label: "Seed Round B2B Software", segment: "saas",   bing: true,
      q: '"seed round" raises startup ("B2B software" OR SaaS OR platform) when:7d' },
    { label: "Exits Stealth",           segment: "saas",   bing: true,
      q: '("exits stealth" OR "emerges from stealth" OR "launches out of stealth") AI when:14d' },
    { label: "New AI Leadership",       segment: "saas",
      q: '("chief AI officer" OR "head of AI" OR "VP of AI" OR "head of automation") appoints OR hires OR names when:14d' },
    { label: "AI Initiative Announced", segment: "saas",   bing: true,
      q: '("investing in AI" OR "AI roadmap" OR "AI transformation" OR "AI strategy") company announces when:7d' },
    { label: "AI Agent Funding",        segment: "saas",
      q: 'raises ("AI agents" OR "agentic" OR "AI copilot") million when:7d' },
    { label: "AI Product Launch B2B",   segment: "saas",
      q: 'launches "AI-powered" platform (B2B OR SaaS OR enterprise) when:7d' },

    // ── Healthcare / MedTech (fewer queries — it was already over-represented) ──
    { label: "Health Tech Funding",     segment: "health",
      q: '("digital health" OR "health tech") raises ("Series A" OR "Series B" OR "seed") when:7d' },
    { label: "Modernization Partner",   segment: "health",
      q: '("digital transformation" OR "legacy modernization") (partners OR selects OR taps) health OR clinical when:14d' },
    { label: "Health AI Deployment",    segment: "health",
      q: '(healthcare OR clinical) (deploys OR implements OR partners) AI OR automation when:14d' },
    { label: "MedTech AI Launch",       segment: "health",
      q: '(medtech OR "medical device") launches OR unveils AI when:14d' },

    // ── Phase 1 expansion (spec §7) ──────────────────────────────
    // Roughly 2–4 per segment, each individually labelled so the audit
    // (npm run scrape:audit) can tell you which CATEGORY earns its keep. That is the whole point of this
    // phase — anything that comes back DEAD or NOISE gets switched off here
    // with the measurement written next to it, the same way the v2 Bing and
    // Google Alerts queries were.

    // Ecommerce / Shopify.
    //
    // MEASURED FINDING, 2026-09-02 — the three migration queries are OFF.
    // They are not broken and neither is the scoring: Google News simply has
    // no Shopify migration *news*. All 25 items across them were SEO content
    // and competitor marketing — "How to Choose a Retail Ecommerce Platform
    // (2026)", "Ecommerce Content Strategy: Enterprise Guide", "Top Shopify
    // Development Companies in India for D2C Brands" — which the DISQUALIFY
    // list and the intent gate correctly threw away, all 25 of them.
    //
    // Shopify opportunities ARE detected, just not from here: the job boards
    // surface them as real reqs ("Senior Shopify Developer", "Senior Shopify
    // Full-stack Developer"), which is a hiring company rather than a
    // marketing article. Re-enable to re-test; the parser and scoring are
    // untouched.
    { label: "Shopify Replatform",      segment: "ecommerce", enabled: false,
      q: '"Shopify Plus" migration OR replatform OR redesign when:14d' },
    { label: "Shopify Migration",       segment: "ecommerce", enabled: false,
      q: 'Shopify migration OR "WooCommerce to Shopify" OR "Magento to Shopify" when:14d' },
    { label: "Ecommerce Replatform",    segment: "ecommerce", enabled: false,
      q: 'ecommerce replatform OR "ecommerce redesign" OR "headless commerce" when:14d' },
    // ...but ecommerce FUNDING works, because a funding round is an event a
    // newsroom reports rather than a topic an agency blogs about.
    { label: "Ecommerce Funding",       segment: "ecommerce",
      q: '(ecommerce OR "DTC brand") startup raises funding when:7d' },

    // AI
    { label: "AI Startup Funding",      segment: "ai",
      q: '"AI startup" raises funding when:7d' },
    { label: "AI Adoption",             segment: "ai",
      q: 'company "adopts AI" OR "AI integration" OR "AI implementation" when:14d' },

    // Startups / funding
    { label: "Startup Series A",        segment: "startup",
      q: 'startup "Series A" raises when:7d' },
    { label: "Startup Seed",            segment: "startup",
      q: 'startup "seed round" OR "pre-seed" raises when:7d' },

    // Developer hiring.
    // OFF — returned literally ZERO items (2026-09-02). Newsrooms do not
    // report which framework a company is recruiting for; that signal lives on
    // the job boards, where HN and WWR produce it in volume. Kept as the
    // record of a category that news cannot serve.
    { label: "Hiring React/Node",       segment: "saas", enabled: false,
      q: '"hiring React developers" OR "hiring Node.js" OR "hiring Python developers" when:14d' },
    { label: "Hiring Engineers",        segment: "startup",
      q: 'startup "hiring software engineers" OR "engineering team" expansion when:14d' },

    // Mobile — the other group with no source before now
    { label: "Mobile App Launch",       segment: "mobile",
      q: '"launches mobile app" OR "launches iOS app" OR "launches Android app" when:14d' },
    { label: "Mobile App Funding",      segment: "mobile",
      q: '"mobile app" startup raises when:14d' },

    // Modernization
    { label: "Legacy Modernization",    segment: "saas",
      q: '"legacy modernization" OR "application modernization" company when:14d' },
    { label: "Cloud Migration",         segment: "saas",
      q: '"cloud migration" OR "platform migration" company software when:14d' },

    // Fintech
    { label: "Fintech Funding",         segment: "fintech",
      q: 'fintech startup raises funding when:7d' },
    { label: "Fintech Platform Launch", segment: "fintech",
      q: 'fintech launches platform OR "payment platform" when:14d' },

    // Real estate
    { label: "PropTech Funding",        segment: "real_estate",
      q: 'proptech OR "real estate platform" startup raises funding when:7d' },
    { label: "PropTech Launch",         segment: "real_estate",
      q: '"property management software" OR "real estate platform" launches when:14d' },

    // Logistics
    { label: "Logistics Funding",       segment: "logistics",
      q: 'logistics startup raises funding when:7d' },
    { label: "Logistics Platform",      segment: "logistics",
      q: '"logistics platform" OR "fleet management" software launches when:14d' },

    // EdTech
    { label: "EdTech Funding",          segment: "edtech",
      q: 'edtech startup raises funding when:7d' },
    // OFF — 3 items, 0 qualified (2026-09-02). EdTech FUNDING works; edtech
    // platform launches are written up as features, not as company actions.
    { label: "EdTech Platform",         segment: "edtech", enabled: false,
      q: '"learning platform" OR "education technology" startup launches when:14d' }
  ],

  // Mirror `bing: true` queries through Bing News RSS (free, no key).
  // OFF by default: measured on a live run 2026-08-06 it returned 21 items
  // across 4 queries and produced 0 qualified leads (one query returned
  // nothing at all). Flip to true to re-test — it costs 4 extra fetches.
  USE_BING: false,

  // ── GEOGRAPHY ───────────────────────────────────────────────
  // Pixler Lab delivers from India, so "is this US?" is the wrong question in
  // both halves of the system. v3 asks "can we actually win this work?".
  //
  //   NEWS_GEO "global" — a funded startup is a prospect wherever it is.
  //     v2's US gate threw away 95 of 499 items on the run measured
  //     2026-09-02. Set to "us" to restore v2 exactly; NON_US_HARD and
  //     US_MARKERS are still here and come back to life when you do.
  //
  //   REQUIRE_REMOTE_JOB — a posting only counts if we could staff it from
  //     India: remote, and not fenced to a region that excludes us.
  //     "Remote (US only)" is a genuine remote job we still cannot win, and
  //     so is "Americas, Europe, Israel".
  NEWS_GEO: "global",
  REQUIRE_REMOTE_JOB: true,

  // ── JOB BOARD SOURCES ───────────────────────────────────────
  // The best sources in the system: a job posting is an explicit budget
  // signal, AND these hand you the company name — often its own domain too —
  // so the lead is outreach-ready.
  USE_HN_WHO_IS_HIRING: true,
  // Regex patterns, not substrings — a bare "ai" substring also matches
  // "said", "maintain", "available", "chair"...
  //
  // Widened alongside RELEVANT_JOB_TITLE, and for the same reason. These match
  // the whole comment rather than a title, so the gate is looser by nature;
  // measured on the September 2026 thread it took candidates from 98 of 200
  // comments to 138. What still falls out is thread chatter — "Applied 2
  // months ago. No response" — rather than postings. Volume is safe to raise
  // here because MAX_PER_SOURCE caps what HN can actually save at 15; more
  // candidates only means a better top 15.
  HN_KEYWORDS: ["\\bA\\.?I\\.?\\b", "machine learning", "\\bML\\b", "\\bLLM",
                "automation", "data engineer", "\\bMLOps\\b",
                "\\breact\\b", "\\bnode(\\.?js)?\\b", "\\bpython\\b", "\\bdjango\\b",
                "\\blaravel\\b", "\\bphp\\b", "\\bshopify\\b", "\\bflutter\\b",
                "\\btypescript\\b", "\\bjavascript\\b", "\\bios\\b", "\\bandroid\\b",
                "full[\\s-]?stack", "front[\\s-]?end", "back[\\s-]?end",
                "\\bdevops\\b", "software engineer"],

  // ── WeWorkRemotely (the best of the remote boards for us) ───
  // Free RSS, no key. Measured 2026-09-02: 172 items across these four feeds,
  // and its <region> tag is an EXPLICIT eligibility field — 18 of 25
  // programming posts and 15 of 15 devops posts read "Anywhere in the World".
  // Its <title> is "Company: Role", and the description carries the
  // employer's own URL, so both the company name and the domain come free.
  USE_WWR: true,
  WWR_FEEDS: [
    { label: "WWR: Full-Stack",  slug: "remote-full-stack-programming-jobs", segment: "saas" },
    { label: "WWR: Programming", slug: "remote-programming-jobs",            segment: "saas" },
    { label: "WWR: Back-End",    slug: "remote-back-end-programming-jobs",   segment: "saas" },
    { label: "WWR: DevOps",      slug: "remote-devops-sysadmin-jobs",        segment: "saas" }
  ],

  // ── Remotive ────────────────────────────────────────────────
  // Back ON. v2 disabled it because none of its jobs were open to the US —
  // "Americas, Europe, Israel", "Brazil", "Europe, UK, Germany". Those are
  // now exactly the shape of posting we want, and its
  // `candidate_required_location` is a structured field we can trust.
  //
  // One fetch, not four: v2 measured that the `search` parameter is ignored
  // entirely and all four queries returned the SAME jobs, so four fetches
  // bought four identical result sets. RELEVANT_JOB_TITLE does the filtering.
  USE_REMOTIVE: true,
  REMOTIVE_LIMIT: 100,

  // ── Jobicy ──────────────────────────────────────────────────
  // Free JSON, no key. Its `jobGeo` is structured like Remotive's.
  //
  // ONE query, not two. `industry` is ignored by the API exactly the way
  // Remotive ignores `search`: measured 2026-09-02, industry=engineering and
  // industry=dev returned the same 100 job ids, overlap 100/100. The second
  // query bought a duplicate fetch and a permanent NOISE row in the audit.
  USE_JOBICY: true,
  JOBICY_QUERIES: [
    { label: "Jobicy: Engineering", industry: "engineering", segment: "saas" }
  ],

  // A job title must match this to count as work Pixler Lab could take on.
  // Needed because Remotive's own search filter barely works (see fetchRemotive).
  //
  // WIDENED past AI/ML, per the Phase 1 spec: "do not require the job to
  // contain AI/ML anymore". A job posting is the most explicit budget signal
  // in the system, and the v2 pattern was throwing away most of them —
  // measured over 285 live postings on 2026-09-02, it passed 104 (36%).
  //
  // Two separate faults, not one. It was too NARROW (no React, Python, PHP,
  // Shopify, DevOps, backend, web developer) and it was also BROKEN: the
  // hyphen. `full ?stack` matches "full stack" and "fullstack" but not
  // "full-stack", which is how almost everyone writes it, so "Senior React
  // Full-stack Developer" was rejected. So were "Front-end", "Back-end" and
  // plain "Backend Developer", which had no pattern at all. Every role shape
  // below is hyphen-tolerant.
  //
  // Widening to 149/285 (52%). What it still refuses is the point: Product
  // Manager, Product Designer, Customer Support, Mechanical Engineer,
  // Director of Finance, Data Analyst. Bare "engineer" and bare "developer"
  // are deliberately absent — they would let all of those back in.
  RELEVANT_JOB_TITLE: new RegExp("\\b(" + [
    // AI / data
    "a\\.?i\\.?", "ml", "llm", "machine learning", "deep learning",
    "data scien", "data engineer", "mlops",
    // Languages and frameworks Pixler Lab builds in
    "react", "react native", "node\\.?js", "node", "python", "django", "flask",
    "laravel", "php", "shopify", "flutter", "swift", "kotlin",
    "typescript", "javascript", "\\.net", "ruby on rails", "rails",
    // Role shapes — every one hyphen-tolerant
    "full[\\s-]?stack", "front[\\s-]?end", "back[\\s-]?end",
    "software engineer", "web developer", "application developer",
    "mobile developer", "mobile engineer", "ios developer", "android developer",
    "platform engineer", "devops", "dev ops", "site reliability", "sre",
    "cloud engineer", "infrastructure engineer", "api engineer",
    "automation", "integration"
  ].join("|") + ")\\b", "i"),

  // ── LEGACY: your original Google Alerts feeds ───────────────
  // Audited live on 2026-08-06. Kept only the two that actually return items.
  // The four SaaS ones returned ZERO entries — `site:` operators don't work in
  // Google Alerts, and one had "2024 OR 2025" hardcoded into the query.
  // Re-enable any of these only if the audit shows entries > 0.
  LEGACY_ALERT_FEEDS: [
    { label: "MedTech AI Investment (Alert)", segment: "health", enabled: true,
      url: "https://www.google.com/alerts/feeds/06603326583628741775/4527756030740921781" },
    { label: "Healthcare Digital Transformation (Alert)", segment: "health", enabled: true,
      url: "https://www.google.com/alerts/feeds/06603326583628741775/15417297547233066720" },

    // ── Confirmed returning 0 entries — left here for the record ──
    { label: "Hiring AI Engineer - SaaS (Alert)", segment: "saas", enabled: false,
      url: "https://www.google.com/alerts/feeds/06603326583628741775/13994820161492251633" },
    { label: "Digital Transformation (Alert)", segment: "saas", enabled: false,
      url: "https://www.google.com/alerts/feeds/06603326583628741775/14344148010221656525" },
    { label: "Series A/B Funding - SaaS US (Alert)", segment: "saas", enabled: false,
      url: "https://www.google.com/alerts/feeds/06603326583628741775/361296831353028729" },
    { label: "Hiring Automation Lead (Alert)", segment: "saas", enabled: false,
      url: "https://www.google.com/alerts/feeds/06603326583628741775/361296831353032215" },
    { label: "Health Tech Funding US (Alert)", segment: "health", enabled: false,
      url: "https://www.google.com/alerts/feeds/06603326583628741775/361296831353032140" }
  ]
};
