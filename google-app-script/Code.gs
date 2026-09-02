// ============================================================
//  INTENT SIGNAL SCRAPER — v3 (Zero Cost Edition)
//  For: AI Development Agency delivering FROM INDIA to SaaS/Tech +
//       Healthcare/MedTech, anywhere in the world
//  Tools used: Google Sheets, Gmail, Google Apps Script (all free)
//
//  WHAT CHANGED FROM v2 (and why):
//    1. The geography question changed. v2 asked "is this US?"; v3 asks "can
//       we deliver this from India?". Two different answers follow:
//         • NEWS is global (CONFIG.NEWS_GEO). v2's US gate threw away 95 of
//           499 items on the run measured 2026-09-02 — Indian, Saudi, Korean
//           and European rounds are prospects for a team in India, not noise.
//           Set NEWS_GEO back to "us" and v2's behaviour returns intact.
//         • JOBS are gated on REACH instead: remote, and not fenced to a
//           region that excludes us. See jobReach_(). "Remote (US only)" is a
//           real remote job we still cannot win, and so is a posting whose
//           location field reads "Americas, Europe, Israel".
//    2. Widened the Funding keywords. Every one of them was dollar-anchored
//       ("raises $"), so the instant the geo gate came off, "raises 270,000
//       euro in pre-seed" and "Raises Rs 36 Cr" scored as "no trigger event".
//    3. WeWorkRemotely added — the best of the remote boards for us. Its
//       <region> tag is an explicit eligibility field, its <title> is
//       "Company: Role", and its description carries the employer's own URL,
//       so company AND domain come free. Measured: 44 items on the Full-Stack
//       feed alone, 37 qualified — more than Hacker News.
//    4. Remotive re-enabled and Jobicy added. v2 disabled Remotive precisely
//       BECAUSE its jobs were open to "Americas, Europe, Israel" and "Brazil"
//       rather than the US; that is now the shape of posting we want.
//    5. Fetchers no longer drop rows on geography. They pass their structured
//       location through as `locationField` and evaluate_() decides, so every
//       geographic drop is one visible line in auditFeeds() instead of
//       vanishing silently inside a fetcher.
//
//  WHAT CHANGED IN v2 (and why):
//    1. Google News RSS is now the primary engine. No per-alert setup, full
//       boolean queries, and a `when:Nd` operator so queries never go stale.
//       (v1 relied on 7 hand-made Google Alerts feeds — 4 returned ZERO items.)
//    2. Indeed RSS removed. It returns HTTP 404 + an HTML page — that endpoint
//       was retired. Replaced with HN "Who is hiring" + Remotive (both verified
//       live, free, no API key, and both hand you a real company name).
//       (v3 note: Remotive was later disabled here and is back on again — see
//       the v3 list above.)
//    3. Scoring split into INTENT (trigger events = points) vs SEGMENT
//       (vertical = tag only, zero points). v1 scored `healthcare ai`,
//       `digital health`, `health tech` etc. as high-value signals, so any
//       article merely ABOUT healthcare AI stacked to 10/10 while a genuine
//       SaaS hiring signal scraped a 6.
//    4. Hard gate: at least one intent group must fire. Kills topic articles,
//       vendor blog posts, market reports and earnings coverage.
//    5. Per-segment quota so one noisy vertical can't flood the digest.
//    6. Titles are now HTML-decoded and tag-stripped. v1 stripped tags from the
//       summary but not the title — and Google wraps your matched keywords in
//       <b>, so `Series <b>A</b>` never matched the keyword "series a".
//    7. Per-source stats written to the Run Log every run, so a dead feed is
//       visible the next morning instead of failing silently for months.
//
//  ─────────────────────────────────────────────────────────────
//  INSTALLING: this is ONE self-contained file. Copy all of it, open your
//  Google Sheet > Extensions > Apps Script, select everything in Code.gs,
//  paste, save. Nothing else to add — no libraries, no manifest edits, no
//  API keys, no Google Alerts to create.
//
//  WHICH FUNCTION TO RUN — these six are the only ones you ever pick from the
//  editor's Run dropdown. Every helper in this file has a name ending in "_",
//  which Apps Script treats as private and hides from that dropdown, so you
//  can't accidentally run one:
//    smokeTest()             one feed, one API, one cell — run this FIRST if
//                            anything times out; finishes in seconds
//    auditFeeds()            check every source is alive — writes no leads
//    previewScoring()        dry run; tune MIN_SCORE before saving anything
//    runDailyIntentScrape()  the real run (this is what the trigger calls)
//    backfillCompanyNames()  re-extract Company on rows already saved, and
//                            clean leftover HTML out of old rows. Safe to
//                            re-run; never touches a name you typed yourself.
//    migrateSheet()          ONE TIME on an existing v1 sheet — keeps your rows
//    setupSheet()            ONE TIME on a fresh sheet — WIPES the Leads tab
//    createDailyTrigger()    automate the 8am run
//
//  RUN ORDER FOR A FRESH SHEET:      setupSheet() → auditFeeds() → createDailyTrigger()
//  RUN ORDER FOR AN EXISTING SHEET:  migrateSheet() → auditFeeds() → createDailyTrigger()
//
//  Or skip the dropdown entirely: reload the Sheet after pasting and use the
//  "Intent Scraper" menu that appears next to Help.
//
//  The first run will ask for authorization — v2 needs external-URL access for
//  the news feeds, on top of the Sheets and Gmail scopes v1 used.
// ============================================================


// ─── CONFIGURATION ───────────────────────────────────────────

const CONFIG = {
  // Your Gmail address for daily digest notifications
  NOTIFICATION_EMAIL: "mukesh@pixlerlab.com",

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
  // Apps Script kills any run at 6 minutes with "Exceeded maximum execution
  // time" and everything the run did is lost. Stop voluntarily before that so
  // whatever was collected still gets saved and logged.
  MAX_RUNTIME_SECONDS: 270,   // 4.5 min

  // Hard ceiling per run (protects against a runaway feed)
  MAX_LEADS_PER_RUN: 60,

  // How many leads to itemise in the digest email. The rest are summarised
  // with a link to the sheet — a 60-item email is a wall nobody reads.
  DIGEST_MAX_LEADS: 25,
  // ...and no single source may contribute more than this many. HN's hiring
  // thread alone can qualify 60+ posts and would otherwise crowd out every
  // funding signal.
  MAX_PER_SOURCE: 15,

  // Deferred leads are NOT saved and NOT marked as seen, so they get
  // reconsidered on the next run. Nothing is lost — just delayed.

  // Sheet names — don't change unless you rename tabs
  SHEETS: {
    LEADS:  "Leads",
    ALERTS: "Alert Sources",
    LOG:    "Run Log"
  },

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
    // Roughly 2–4 per segment, each individually labelled so auditFeeds() can
    // tell you which CATEGORY earns its keep. That is the whole point of this
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
  // Re-enable any of these only if auditFeeds() shows entries > 0.
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
const INTENT_GROUPS = [
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
const JOB_POSTING_INTENT = { key: "Open AI Role", weight: 3, kw: [] };

// Vertical tags — ZERO points. Used only for the Segment column + quota.
//
// ORDER MATTERS. classifySegment_ takes the segment with the most keyword hits
// and, on a tie, the one declared FIRST. So these run most-specific first and
// the two broad catch-alls — `saas` and `startup` — go last. Put `startup`
// higher and it wins nearly every funding story, because "startup" appears in
// almost all of them, and the ecommerce/ai/fintech tags this phase exists to
// measure would never surface.
//
// Short tokens like "ai", "ml", "ios" and "pos" are safe here ONLY because
// hasKeyword_ anchors them to a leading word edge. Under the old indexOf scan
// they matched "said", "HTML", "Biosolutions" and "Deposit". See section 37.
const SEGMENT_KEYWORDS = {
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
const NON_US_HARD = [
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
const NON_US_SOFT = [
  "europe", "european", "emea", "apac", "uk-based", "britain", "british",
  "london", "germany", "german", "france", "french", "spain", "spanish",
  "italy", "italian", "netherlands", "dutch", "ireland", "switzerland",
  "canada", "canadian", "toronto", "australia", "australian", "new zealand"
];

// Positive US signal — small ranking bonus so domestic leads float to the top.
const US_MARKERS = [
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
const REGION_INCLUDES_INDIA = [
  "india", "worldwide", "anywhere", "global", "international",
  "asia", "apac", "asia pacific", "asia-pacific", "south asia", "any location"
];

// Free-text fences, for sources with no structured field (Hacker News). These
// are regexes rather than substrings because "us" and "eu" are two of the most
// destructive substrings in the English language.
const JOB_FENCED_RE = new RegExp([
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
const JOB_OPEN_RE = /\b(india|worldwide|anywhere|globally|global|apac|asia[\s-]?pacific|asia)\b/i;

// Some marker of remote work. Without one, a posting is an office job in a
// city we do not have an office in.
const JOB_REMOTE_RE = /\b(remote|anywhere|worldwide|distributed|work from home|wfh|globally)\b/i;

// Wrong buyer type — you can't sell an AI build to these.
const WRONG_BUYER = [
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
const DISQUALIFY = [
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
const PENALTIES = [
  { kw: ["sponsored", "press release", "advertorial"], points: -2 },
  { kw: ["acquired by", "acquisition of", "merges with"], points: -1 }, // often too late to sell
  { kw: ["layoffs", "shuts down", "bankruptcy", "winding down"], points: -4 }
];

// Publications — never let one of these end up in the Company column
const PUBLISHERS = [
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
const STOCK_PUBLISHERS = [
  "benzinga", "seeking alpha", "motley fool", "investing.com", "zacks",
  "simply wall st", "insider monkey", "marketbeat", "tipranks", "barron",
  "stocktwits", "gurufocus", "nasdaq.com", "24/7 wall st"
];

// Words that are never a company name (guards the extractor)
const NOT_A_COMPANY = [
  "the", "this", "these", "new", "how", "why", "what", "when", "who",
  "top", "best", "first", "global", "us", "u.s.", "ai", "report", "study",
  "exclusive", "breaking", "opinion", "meet", "inside", "here",
  "hn", "hacker news", "location", "remote", "hiring"
];


// ════════════════════════════════════════════════════════════════
//  MAIN ENTRY POINT
// ════════════════════════════════════════════════════════════════

/**
 * Set this function as your daily trigger.
 * Safe to run on a brand-new spreadsheet — tabs auto-create.
 */
function runDailyIntentScrape() {
  const clock = startClock_("runDailyIntentScrape");

  const ss         = getSpreadsheet_();
  const leadsSheet = getOrCreateSheet_(ss, CONFIG.SHEETS.LEADS);
  const logSheet   = getOrCreateSheet_(ss, CONFIG.SHEETS.LOG);

  const runStart = new Date();
  clock.phase("reading existing leads for dedupe");
  const seen     = getSeenKeys_(leadsSheet);
  const stats    = [];   // per-source diagnostics
  const candidates = [];

  // ── 1. COLLECT from every source ──────────────────────────────
  const collected = collectAll_(stats, clock);

  clock.phase(`scoring ${collected.length} items`);
  let stoppedEarly = false;
  collected.forEach((item, i) => {
    // Bail out voluntarily rather than being killed at the 6-minute mark —
    // a killed run writes nothing at all and loses the whole fetch.
    if (stoppedEarly) return;
    if ((i % 50) === 0 && clock.overBudget()) {
      stoppedEarly = true;
      Logger.log(`Budget reached after ${i}/${collected.length} items — saving what we have.`);
      return;
    }
    // Dedupe on URL *and* on a normalized headline fingerprint. Google News
    // links are opaque per-query redirects, so URL alone is not enough —
    // the same story arrives with a different URL from each query.
    if (!item.url || seen.urls.has(normalizeUrl_(item.url))) return;

    // Headline fingerprinting applies to NEWS only. Job postings have unique,
    // stable URLs, and anonymous HN posts all share the same generic title
    // prefix — fingerprinting them collapsed 80 distinct postings into one.
    const fp = item.kind === "job" ? "" : fingerprint_(item.title);
    if (fp && seen.prints.has(fp)) return;

    const verdict = evaluate_(item);
    if (!verdict.keep) return;

    // Company-level dedupe — catches the same event covered by several outlets
    if (verdict.companyKey && seen.companies.has(verdict.companyKey)) return;

    if (fp) seen.prints.add(fp);               // in-run dedupe (v1 bug: same
    seen.urls.add(normalizeUrl_(item.url));     // URL from 2 feeds saved twice)
    if (verdict.companyKey) seen.companies.add(verdict.companyKey);

    candidates.push(Object.assign({}, item, verdict));
  });

  // ── 2. RANK + APPLY SEGMENT QUOTA ─────────────────────────────
  candidates.sort((a, b) => b.score - a.score);
  const quota = applySegmentQuota_(candidates);

  // ── 3. BATCH WRITE (v1 did one appendRow per lead) ─────────────
  clock.phase(`writing ${quota.kept.length} leads`);
  if (quota.kept.length > 0) {
    const rows = quota.kept.map(buildLeadRow_);
    leadsSheet
      .getRange(leadsSheet.getLastRow() + 1, 1, rows.length, rows[0].length)
      .setValues(rows);
  }

  // ── 4. LOG per-source stats so dead feeds are visible ─────────
  const duration = ((new Date() - runStart) / 1000).toFixed(1);
  const logRows = [[
    new Date(), stoppedEarly ? "PARTIAL" : "SUCCESS",
    `${quota.kept.length} saved / ${candidates.length} qualified / ${stats.reduce((n, s) => n + s.fetched, 0)} fetched`,
    `Ran in ${duration}s · segments: ${JSON.stringify(quota.counts)}` +
    (quota.deferred.length ? ` · ${quota.deferred.length} DEFERRED by quota (cap ${quota.cap}/segment) — they will be reconsidered next run` : "") +
    (stoppedEarly ? " · STOPPED EARLY at the runtime budget; unprocessed items are not marked seen, so the next run picks them up" : "")
  ]];

  stats.forEach(s => {
    logRows.push([
      new Date(),
      s.fetched === 0 ? "EMPTY" : (s.error ? "ERROR" : "OK"),
      s.label,
      statDetail_(s) +
        (s.fetched === 0 && !s.error ? "  ← SOURCE RETURNED NOTHING, check the query" : "")
    ]);
  });

  logSheet.getRange(logSheet.getLastRow() + 1, 1, logRows.length, 4).setValues(logRows);

  // ── 5. DIGEST ─────────────────────────────────────────────────
  if (quota.kept.length > 0) sendDailyDigest_(quota.kept, quota, stats);

  Logger.log(`Run complete: ${quota.kept.length} saved, ${quota.deferred.length} deferred.`);
}


// ════════════════════════════════════════════════════════════════
//  COLLECTION — every source funnels into one normalized shape:
//  { title, snippet, url, publishedAt, sourceLabel, segmentHint,
//    company, contactTitle, domain }
// ════════════════════════════════════════════════════════════════

function collectAll_(stats, clock) {
  const all = [];
  // Callers may not pass a clock (auditFeeds/previewScoring do); make it optional.
  clock = clock || startClock_("collectAll");

  const push = (label, items) => {
    const stat = { label: label, fetched: items.length, qualified: 0, error: null };
    stats.push(stat);
    items.forEach(i => { i._stat = stat; });
    items.forEach(i => all.push(i));
  };

  // One source failing must never abort the run — that's how v1's Indeed
  // block took the whole job-board half of the system down silently.
  const guard = (label, fn) => {
    try {
      push(label, fn());
    } catch (e) {
      stats.push({ label: label, fetched: 0, qualified: 0, error: String(e && e.message || e) });
    }
  };

  // ── All RSS/Atom feeds, issued as ONE parallel batch ─────────
  // Fetched serially these took ~54s — a seventh of the 6-minute execution
  // quota spent purely waiting on HTTP. fetchAll() runs them concurrently and
  // finishes in roughly the time of the single slowest feed.
  const feedReqs = [];

  // `enabled: false` switches a query off without deleting it, so the
  // measurement that killed it stays next to the query it killed. Absent means
  // on, so the queries that predate the flag need no edit.
  CONFIG.NEWS_QUERIES.filter(nq => nq.enabled !== false).forEach(nq => {
    feedReqs.push({ label: "GNews: " + nq.label, format: "rss2",
                    segment: nq.segment, url: googleNewsUrl_(nq) });
    if (CONFIG.USE_BING && nq.bing) {
      feedReqs.push({ label: "Bing: " + nq.label, format: "rss2",
                      segment: nq.segment, url: bingNewsUrl_(nq) });
    }
  });

  // Legacy Google Alerts ride the same batch (only the ones proven to return items)
  CONFIG.LEGACY_ALERT_FEEDS.filter(f => f.enabled).forEach(f => {
    feedReqs.push({ label: "Alert: " + f.label, format: "atom",
                    segment: f.segment, url: f.url, feed: f });
  });

  clock.phase(`fetching ${feedReqs.length} feeds in one batch`);
  const feedResponses = fetchBatch_(feedReqs);
  clock.phase("feeds fetched, parsing");

  feedResponses.forEach(r => {
    if (r.error) {
      stats.push({ label: r.req.label, fetched: 0, qualified: 0, error: r.error });
      return;
    }
    // Each response is handled independently so one bad feed can't abort the rest
    try {
      const code = r.res.getResponseCode();
      if (code !== 200) throw new Error("HTTP " + code);
      const xml = r.res.getContentText();
      push(r.req.label, r.req.format === "atom"
        ? parseAtomText_(xml, r.req.feed)
        : parseRss2Text_(xml, r.req.label, r.req.segment));
    } catch (e) {
      stats.push({ label: r.req.label, fetched: 0, qualified: 0,
                   error: String(e && e.message || e) });
    }
  });

  // ── Job boards (highest-quality signal: explicit budget + real company) ──
  // These stay sequential: HN needs two dependent calls (find the current
  // thread, then read its comments), so there's nothing to parallelize.
  if (clock.overBudget()) {
    const msg = `Runtime budget hit after ${clock.seconds().toFixed(0)}s — skipping job boards this run.`;
    Logger.log(msg);
    stats.push({ label: "Job boards", fetched: 0, qualified: 0, error: msg });
    return all;
  }

  clock.phase("fetching job boards");
  if (CONFIG.USE_HN_WHO_IS_HIRING) {
    guard("HN: Who is hiring", () => fetchHackerNewsHiring_());
  }
  if (CONFIG.USE_WWR) {
    CONFIG.WWR_FEEDS.forEach(f => {
      guard(f.label, () => fetchWeWorkRemotely_(f));
    });
  }
  if (CONFIG.USE_REMOTIVE) {
    guard("Remotive", () => fetchRemotive_());
  }
  if (CONFIG.USE_JOBICY) {
    CONFIG.JOBICY_QUERIES.forEach(jq => {
      guard(jq.label, () => fetchJobicy_(jq));
    });
  }

  return all;
}


// ── RUNTIME BUDGET + PROGRESS LOGGING ─────────────────────────

/**
 * Tracks elapsed time and logs a timestamped line at each phase boundary.
 *
 * Both halves matter. Without the phase log, a run that dies leaves you with
 * nothing but "Exceeded maximum execution time" and no idea which step hung.
 * Without the budget, hitting 6 minutes throws away the entire run's work.
 */
function startClock_(label) {
  const t0 = new Date().getTime();
  Logger.log(`▶ ${label} started`);

  return {
    seconds:    () => (new Date().getTime() - t0) / 1000,
    overBudget: () => (new Date().getTime() - t0) > CONFIG.MAX_RUNTIME_SECONDS * 1000,
    phase: function (name) {
      Logger.log(`  [${this.seconds().toFixed(1)}s] ${name}`);
    }
  };
}


// ── FETCHING ──────────────────────────────────────────────────

const FETCH_OPTS_ = {
  muteHttpExceptions: true,
  followRedirects:    true,
  headers: { "User-Agent": "Mozilla/5.0 (compatible; PixlerLab-IntentScraper/2.0)" }
};

/**
 * Issues every feed request concurrently via UrlFetchApp.fetchAll().
 * Returns [{ req, res, error }] in the SAME order as the input.
 *
 * fetchAll() is all-or-nothing: if the call itself throws, every feed dies with
 * it. So on failure this falls back to fetching one at a time, which is slower
 * but degrades to "one broken feed" instead of "no news at all".
 */
function fetchBatch_(reqs) {
  if (!reqs.length) return [];

  const requests = reqs.map(r => ({
    url:                r.url,
    muteHttpExceptions: FETCH_OPTS_.muteHttpExceptions,
    followRedirects:    FETCH_OPTS_.followRedirects,
    headers:            FETCH_OPTS_.headers
  }));

  try {
    const responses = UrlFetchApp.fetchAll(requests);
    return reqs.map((r, i) => ({ req: r, res: responses[i], error: null }));
  } catch (e) {
    Logger.log("fetchAll() failed (" + (e && e.message || e) +
               ") — falling back to sequential fetching.");
    return reqs.map(r => {
      try {
        return { req: r, res: UrlFetchApp.fetch(r.url, FETCH_OPTS_), error: null };
      } catch (e2) {
        return { req: r, res: null, error: String(e2 && e2.message || e2) };
      }
    });
  }
}


/**
 * Google News RSS. Verified: 27 items for a single query.
 * Structure: <item><title>Headline - Publisher</title><link>redirect</link>
 *            <pubDate>RFC822</pubDate><source url="https://domain">Name</source>
 * There is no usable <description> — it's just an anchor tag — so scoring
 * runs on the headline. News headlines are dense with intent verbs, so
 * this works, but keep queries headline-shaped.
 */
function googleNewsUrl_(nq) {
  return "https://news.google.com/rss/search?q=" + encodeURIComponent(nq.q) +
         "&hl=en-US&gl=US&ceid=US:en";
}

/** Bing News RSS — free, no key. Lower volume, but a different index. */
function bingNewsUrl_(nq) {
  // Bing doesn't understand `when:Nd`; strip it and rely on its own recency sort
  const q = nq.q.replace(/\bwhen:\d+d\b/g, "").trim();
  return "https://www.bing.com/news/search?q=" + encodeURIComponent(q) + "&format=RSS";
}

/**
 * Single-feed convenience wrappers. collectAll_() does NOT use these — it
 * batches every feed through fetchBatch_() instead. Kept because fetching one
 * named feed on its own is genuinely useful when debugging a query.
 */
function fetchGoogleNews_(nq) {
  const res = UrlFetchApp.fetch(googleNewsUrl_(nq), FETCH_OPTS_);
  if (res.getResponseCode() !== 200) throw new Error("HTTP " + res.getResponseCode());
  return parseRss2Text_(res.getContentText(), nq.label, nq.segment);
}

function fetchBingNews_(nq) {
  const res = UrlFetchApp.fetch(bingNewsUrl_(nq), FETCH_OPTS_);
  if (res.getResponseCode() !== 200) throw new Error("HTTP " + res.getResponseCode());
  return parseRss2Text_(res.getContentText(), nq.label, nq.segment);
}

/** Shared RSS 2.0 parser for Google News + Bing News. Pure — no I/O. */
function parseRss2Text_(xml, label, segment) {
  const channel = XmlService.parse(xml).getRootElement().getChild("channel");
  if (!channel) return [];

  const out = [];
  channel.getChildren("item").forEach(item => {
    try {
      let title = cleanText_(item.getChildText("title"));
      const link = (item.getChildText("link") || "").trim();
      if (!title || !link) return;

      // <source url="https://tracxn.com">Tracxn</source>
      const srcEl    = item.getChild("source");
      const publisher = srcEl ? cleanText_(srcEl.getText()) : "";
      const pubDomain = srcEl && srcEl.getAttribute("url")
        ? hostOf_(srcEl.getAttribute("url").getValue()) : "";

      // Google News appends " - Publisher" to every headline. Strip it so the
      // publisher name can't be mistaken for the company.
      title = stripPublisherSuffix_(title, publisher);

      out.push({
        kind:         "news",
        title:        title,
        snippet:      "",                 // Google News has no real snippet
        url:          link,
        publishedAt:  parseDate_(item.getChildText("pubDate")),
        sourceLabel:  label,
        segmentHint:  segment,
        company:      "",                 // resolved later by the extractor
        contactTitle: "",
        publisher:    publisher,
        domain:       ""                  // pubDomain is the PUBLISHER, not the lead
      });
    } catch (e) { /* skip malformed item */ }
  });

  return out;
}


/**
 * Hacker News "Ask HN: Who is hiring?" — the single best free source here.
 * Comment format is conventionally: `Company | Location | Role | https://url`
 * so you get company name AND their own domain, which makes the lead
 * immediately outreach-ready. Verified live via the Algolia API (no key).
 */
function fetchHackerNewsHiring_() {
  // MUST use search_by_date, not search. Algolia's default `search` endpoint
  // sorts by RELEVANCE, which returns the 2020 thread — every comment on it is
  // six years old, so the recency filter then rejected 100% of them.
  const threadRes = UrlFetchApp.fetch(
    "https://hn.algolia.com/api/v1/search_by_date?query=" +
    encodeURIComponent("Ask HN Who is hiring") + "&tags=story&hitsPerPage=20",
    { muteHttpExceptions: true });
  if (threadRes.getResponseCode() !== 200) throw new Error("HN thread lookup HTTP " + threadRes.getResponseCode());

  const hits = JSON.parse(threadRes.getContentText()).hits || [];
  // Date-sorted results also surface "Why is the Who is hiring post..." style
  // discussion threads, so match the real monthly thread's title shape.
  const thread = hits.find(h => /who is hiring\?\s*\(/i.test(h.title || ""));
  if (!thread) return [];
  const storyId = thread.objectID;

  // Pull its comments
  const cRes = UrlFetchApp.fetch(
    "https://hn.algolia.com/api/v1/search?tags=comment,story_" + storyId + "&hitsPerPage=200",
    { muteHttpExceptions: true });
  if (cRes.getResponseCode() !== 200) throw new Error("HN comments HTTP " + cRes.getResponseCode());

  const out = [];
  JSON.parse(cRes.getContentText()).hits.forEach(hit => {
    const raw = cleanText_(hit.comment_text || "");
    if (!raw) return;

    // Only postings that mention AI/ML/automation work
    if (!CONFIG.HN_KEYWORDS.some(k => new RegExp(k, "i").test(raw))) return;

    // Their own domain — from the first URL in the post
    const urlMatch = raw.match(/https?:\/\/[^\s)|]+/);
    const domain   = urlMatch ? hostOf_(urlMatch[0]) : "";
    const company  = parseHnCompany_(raw, domain);
    const posting  = parseHnPosting_(raw, company);

    out.push({
      kind:         "job",
      // A readable one-liner. Previously this dumped 140 raw characters of
      // pipe-delimited comment into the headline, which then landed in the
      // digest email truncated mid-sentence with the company name repeated.
      title:        (posting.role || "Hiring") + (company ? " at " + company : ""),
      role:         posting.role,
      location:     posting.location,
      salary:       posting.salary,
      snippet:      raw.substring(0, 400),
      url:          "https://news.ycombinator.com/item?id=" + hit.objectID,
      publishedAt:  parseDate_(hit.created_at),
      sourceLabel:  "HN Who is hiring",
      segmentHint:  "saas",               // HN's hiring thread is tech/startup
      // The pipe header carries the location — that's what the geo filter reads
      locationHint: raw.split("|").slice(0, 4).join(" "),
      // HN has no structured location field, so jobReach_ falls back to
      // reading the free text above. Set explicitly so that fallback is a
      // decision in the data rather than an accident of an absent key.
      locationField: "",
      company:      company,
      contactTitle: "Hiring Manager",
      publisher:    "Hacker News",
      domain:       domain
    });
  });

  return out;
}


/**
 * Pulls role / location / salary out of an HN hiring post.
 *
 * The convention is pipe-delimited — `Company | Location | Role | $range | url`
 * — but the order varies wildly, so identify each field by what it looks like
 * rather than by position.
 */
function parseHnPosting_(raw, company) {
  const segs = String(raw || "").split("|").map(s => s.trim()).filter(s => s);
  const out  = { role: "", location: "", salary: "" };

  // Must carry a "k" or comma-thousands. The looser version pulled "$30" out
  // of "$30M raised" and printed it as the salary.
  const SALARY = new RegExp(
    "\\$\\s?\\d{2,3}\\s?[kK]\\b(?:\\s?(?:-|–|—|to)\\s?\\$?\\s?\\d{2,3}\\s?[kK]\\b)?" +
    "|\\$\\s?\\d{2,3},\\d{3}(?:\\s?(?:-|–|—|to)\\s?\\$?\\s?\\d{2,3},\\d{3})?");
  // Case-INsensitive: HN posts shout "REMOTE" and "ONSITE" as often as not,
  // which a case-sensitive test silently missed, leaving every location blank.
  const WORK_MODE = /\b(remote|hybrid|on-?site|anywhere|worldwide|distributed)\b/i;
  // Case-SENSITIVE: "Austin, TX" is a place, "growth, ai" is not.
  const CITY      = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?,\s*[A-Z]{2})\b|\b(NYC|SF|Bay Area|Silicon Valley)\b/;
  const US_PLACE  = { test: (t) => WORK_MODE.test(t) || CITY.test(t) };

  segs.forEach(s => {
    if (company && s === company) return;         // don't repeat the company
    if (/^https?:/i.test(s)) return;

    if (!out.salary) {
      const m = s.match(SALARY);
      if (m) out.salary = m[0].replace(/\s+/g, "");
    }
    // A role reads like a job title and is not just a location
    if (!out.role && HN_ROLE_NOISE.test(s) && s.length <= 70 && !US_PLACE.test(s)) {
      out.role = s.replace(/\s*\(.*$/, "").trim();
    }
    if (!out.location && US_PLACE.test(s) && s.length <= 60) {
      out.location = s.replace(/\s*\|.*$/, "").trim();
    }
  });

  // Salary often sits mid-sentence rather than in its own segment
  if (!out.salary) {
    const m = raw.match(SALARY);
    if (m) out.salary = m[0].replace(/\s+/g, "");
  }
  return out;
}

// Hosts that tell you nothing about the employer — a poster linking to their
// LinkedIn, an ATS or a Google Doc yielded companies called "Linkedin", "Drive"
// and "Jobs". Better to leave the company blank than to invent a wrong one.
const GENERIC_HOSTS = [
  "linkedin", "google", "docs.google", "drive.google", "forms.gle", "goo.gl",
  "notion", "notion.so", "airtable", "typeform", "greenhouse", "lever",
  "ashbyhq", "workable", "bamboohr", "recruitee", "smartrecruiters", "jobvite",
  "indeed", "wellfound", "angel.co", "ycombinator", "github", "gitlab",
  "twitter", "x.com", "medium", "substack", "bit.ly", "tinyurl", "dropbox",
  "calendly", "gmail", "youtube", "facebook", "instagram"
];

/**
 * True when a hostname tells you nothing about the employer.
 *
 * Written out longhand deliberately. The terse version of the suffix test was
 *   d.indexOf("." + g) === d.length - g.length - 1
 * which is a bug: when the host and the blocklist entry are the same length the
 * right-hand side evaluates to -1, and indexOf returns -1 on no match, so
 * -1 === -1 matched. "adalat.ai" (9 chars) was rejected because "notion.so" is
 * also 9 chars, which blanked the company on nearly every HN lead.
 */
function isGenericHost_(host) {
  const d = String(host || "").toLowerCase().replace(/^www\./, "");
  if (!d) return false;

  return GENERIC_HOSTS.some(g => {
    if (d === g) return true;                       // bit.ly
    if (d.indexOf(g + ".") === 0) return true;      // linkedin.com
    if (d.indexOf("." + g + ".") !== -1) return true; // drive.google.com
    const suffix = "." + g;                          // sub.example.notion
    return d.length > suffix.length &&
           d.slice(d.length - suffix.length) === suffix;
  });
}

// Pipe segments that are a location or a work arrangement, not a company.
const HN_SEGMENT_NOISE = /^(remote|onsite|on-?site|hybrid|full[\s-]?time|part[\s-]?time|contract(or)?|intern(ship)?s?|visa|h1b|c2c|freelance|anywhere|worldwide|us|usa|united states|uk|eu|emea)\b/i;

// Role descriptions also show up in these segments and must not become the
// company name ("NYC | ONSITE Norm Ai | AI eng" was yielding "AI eng").
// Comma-separated tech stacks get posted as their own segment and were being
// read as the company name ("Python, TensorFlow, PyTorch, GCP, AWS, Azure").
const HN_TECH_STACK = /\b(python|javascript|typescript|golang|rust|java|kotlin|swift|ruby|php|react|vue|angular|node\.?js|django|rails|kubernetes|docker|terraform|tensorflow|pytorch|aws|gcp|azure|postgres|mysql|mongodb|redis|kafka)\b/i;

const HN_ROLE_NOISE = /\b(engineers?|eng|developers?|devs?|managers?|designers?|scientists?|analysts?|leads?|architects?|sre|devops|founders?|cto|cpo|vp|director|internships?|recruiters?|fullstack|full-stack|backend|frontend)\b/i;

/**
 * HN posts nominally start with the company name, but plenty lead with the
 * location or work mode instead ("NYC | ONSITE (hybrid) Norm Ai | ..."), which
 * a naive first-segment read turns into a company called "NYC".
 * Walk the first few segments, skip the obvious non-companies, and fall back
 * to the brand in their own domain.
 */
function parseHnCompany_(raw, domain) {
  const segs = String(raw || "").split("|").map(s => s.trim()).filter(s => s);

  const usable = segs.slice(0, 4).filter(s =>
    s && s.length <= 60 &&
    !/^https?:/i.test(s) &&
    !HN_SEGMENT_NOISE.test(s) &&
    !HN_ROLE_NOISE.test(s) &&
    !HN_TECH_STACK.test(s) &&
    (s.match(/,/g) || []).length < 2 &&     // 2+ commas means it's a list
    // Short all-letter ALL-CAPS is a location or region ("NYC", "SF", "EMEA").
    // The digit check keeps real names like "ML6" — companies use them,
    // airport-style location codes don't.
    !(s.length <= 5 && !/[a-z0-9]/.test(s))
  );

  // The company is conventionally the FIRST segment, so take them in order
  // rather than preferring by letter case.
  if (usable.length) {
    return usable[0]
      .replace(/\s*\(.*$/, "")                              // drop parentheticals
      .replace(/\.(com|io|ai|co|dev|app|net|org|xyz|sh)$/i, "") // "Oscilar.com" -> "Oscilar"
      .trim();
  }

  if (domain) {
    if (isGenericHost_(domain)) return "";
    const base = domain.split(".")[0];
    if (base && base.length > 1 && base !== "jobs" && base !== "www" && base !== "careers") {
      return base.charAt(0).toUpperCase() + base.slice(1);
    }
  }
  return "";
}

/**
 * Remotive API — free JSON, no key. Gives a clean company_name, which is
 * worth more for outreach than a news headline you have to parse.
 */
function fetchRemotive_() {
  const res = UrlFetchApp.fetch(
    "https://remotive.com/api/remote-jobs?limit=" + CONFIG.REMOTIVE_LIMIT, FETCH_OPTS_);
  if (res.getResponseCode() !== 200) throw new Error("Remotive HTTP " + res.getResponseCode());

  const jobs = JSON.parse(res.getContentText()).jobs || [];
  const out  = [];

  jobs.forEach(j => {
    const company = String(j.company_name || "").trim();
    const title   = String(j.title || "").trim();
    if (!company || !title) return;

    // Remotive's own `search` param is ignored by the API (measured: four
    // different queries returned identical result sets), and its unfiltered
    // feed is mostly copywriting, content review and patient care. The title
    // filter is the only thing standing between us and that noise.
    if (!CONFIG.RELEVANT_JOB_TITLE.test(title)) return;

    // No geography check here — `candidate_required_location` is handed to
    // evaluate_() as locationField and judged there, so every drop shows up
    // in one place in the audit instead of vanishing inside a fetcher.
    out.push({
      kind:          "job",
      title:         title + " at " + company,
      role:          title,
      location:      j.candidate_required_location || "",
      salary:        j.salary || "",
      snippet:       cleanText_(j.description || "").substring(0, 400),
      url:           j.url,
      publishedAt:   parseDate_(j.publication_date),
      sourceLabel:   "Remotive",
      segmentHint:   "saas",
      locationHint:  j.candidate_required_location || "",
      locationField: j.candidate_required_location || "",
      company:       company,
      contactTitle:  "Hiring Manager",
      publisher:     "Remotive",
      domain:        ""
    });
  });

  return out;
}


/**
 * WeWorkRemotely category RSS. Free, no key, and the richest of the remote
 * boards for this system because every item carries THREE things we otherwise
 * have to guess at:
 *
 *   <region>      an explicit eligibility field — "Anywhere in the World",
 *                 "Asia Only", "North America Only"
 *   <title>       "Company: Role", so the company name needs no extractor
 *   description   "Headquarters: X" and the employer's own URL, which gives
 *                 us the domain and therefore an outreach-ready lead
 *
 * The description arrives entity-encoded (&lt;p&gt;), so the URL has to be
 * pulled BEFORE cleanText_ strips the tags — decoding first turns the anchor
 * into markup that the tag-stripper then eats, href and all.
 */
function fetchWeWorkRemotely_(feed) {
  const res = UrlFetchApp.fetch(
    "https://weworkremotely.com/categories/" + feed.slug + ".rss", FETCH_OPTS_);
  if (res.getResponseCode() !== 200) throw new Error("WWR HTTP " + res.getResponseCode());

  const channel = XmlService.parse(res.getContentText()).getRootElement().getChild("channel");
  if (!channel) return [];

  const out = [];
  channel.getChildren("item").forEach(item => {
    try {
      const rawTitle = cleanText_(item.getChildText("title"));
      const link     = (item.getChildText("link") || "").trim();
      if (!rawTitle || !link) return;

      // "Proxify AB: Senior Backend Developer (Python)"
      const split   = rawTitle.indexOf(":");
      const company = split > 0 ? rawTitle.slice(0, split).trim() : "";
      const role    = split > 0 ? rawTitle.slice(split + 1).trim() : rawTitle;
      if (!CONFIG.RELEVANT_JOB_TITLE.test(role)) return;

      const rawDesc = item.getChildText("description") || "";
      const decoded = rawDesc.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
      // The FIRST href in the body is the "URL:" line — the employer's own
      // site. Later hrefs are apply links on WWR's domain.
      const hrefs   = decoded.match(/href="(https?:\/\/[^"]+)"/i);
      const domain  = hrefs ? hostOf_(hrefs[1]) : "";
      const region  = cleanText_(item.getChildText("region"));

      out.push({
        kind:          "job",
        title:         role + (company ? " at " + company : ""),
        role:          role,
        location:      region,
        salary:        "",
        snippet:       cleanText_(decoded).substring(0, 400),
        url:           link,
        publishedAt:   parseDate_(item.getChildText("pubDate")),
        sourceLabel:   feed.label,
        segmentHint:   feed.segment,
        locationHint:  region,
        locationField: region,
        company:       company,
        contactTitle:  "Hiring Manager",
        publisher:     "WeWorkRemotely",
        domain:        isGenericHost_(domain) ? "" : domain
      });
    } catch (e) { /* skip malformed item */ }
  });

  return out;
}


/**
 * Jobicy. Free JSON, no key. `jobGeo` is structured the same way Remotive's
 * location is ("Anywhere", "Canada, USA", "LATAM, Canada, Europe, USA"), so
 * it goes straight into locationField and the same allowlist judges it.
 */
function fetchJobicy_(jq) {
  const res = UrlFetchApp.fetch(
    "https://jobicy.com/api/v2/remote-jobs?count=100&industry=" +
    encodeURIComponent(jq.industry), FETCH_OPTS_);
  if (res.getResponseCode() !== 200) throw new Error("Jobicy HTTP " + res.getResponseCode());

  const jobs = JSON.parse(res.getContentText()).jobs || [];
  const out  = [];

  jobs.forEach(j => {
    const company = String(j.companyName || "").trim();
    const title   = String(j.jobTitle || "").trim();
    if (!company || !title) return;
    if (!CONFIG.RELEVANT_JOB_TITLE.test(title)) return;

    const geo = String(j.jobGeo || "").trim();
    out.push({
      kind:          "job",
      title:         title + " at " + company,
      role:          title,
      location:      geo,
      salary:        j.salaryMin ? String(j.salaryMin) : "",
      snippet:       cleanText_(j.jobExcerpt || j.jobDescription || "").substring(0, 400),
      url:           j.url,
      publishedAt:   parseDate_(j.pubDate),
      sourceLabel:   jq.label,
      segmentHint:   jq.segment,
      locationHint:  geo,
      locationField: geo,
      company:       company,
      contactTitle:  "Hiring Manager",
      publisher:     "Jobicy",
      domain:        ""
    });
  });

  return out;
}


/**
 * Legacy Google Alerts Atom parser.
 * FIX vs v1: the title is now decoded and tag-stripped. Google wraps your
 * matched query terms in <b>, and v1 only stripped tags from the summary —
 * so `Series <b>A</b>` could never match the keyword "series a", and the
 * company-name regex (anchored on ^[A-Z]) failed on titles starting with <b>.
 */
function fetchAtomAlert_(feed) {
  const res = UrlFetchApp.fetch(feed.url, FETCH_OPTS_);
  if (res.getResponseCode() !== 200) throw new Error("HTTP " + res.getResponseCode());
  return parseAtomText_(res.getContentText(), feed);
}

/** Pure Atom parser — no I/O, so collectAll_() can feed it a batched response. */
function parseAtomText_(xml, feed) {
  const atom = XmlService.getNamespace("http://www.w3.org/2005/Atom");
  const root = XmlService.parse(xml).getRootElement();
  const out  = [];

  root.getChildren("entry", atom).forEach(entry => {
    try {
      const title   = cleanText_(entry.getChildText("title", atom));
      const snippet = cleanText_(entry.getChildText("summary", atom));
      const linkEl  = entry.getChild("link", atom);
      const href    = linkEl && linkEl.getAttribute("href")
        ? linkEl.getAttribute("href").getValue() : "";
      if (!title || !href) return;

      out.push({
        kind:         "news",
        title:        title,
        snippet:      snippet,
        url:          unwrapGoogleRedirect_(href),   // pull the real article URL out
        publishedAt:  parseDate_(entry.getChildText("updated", atom)),
        sourceLabel:  feed.label,
        segmentHint:  feed.segment,
        company:      "",
        contactTitle: "",
        publisher:    "",
        domain:       ""
      });
    } catch (e) { /* skip malformed entry */ }
  });

  return out;
}


// ════════════════════════════════════════════════════════════════
//  EVALUATION — the hard gate + the two-axis score
// ════════════════════════════════════════════════════════════════

/**
 * Returns { keep, score, intents, segment, reason }
 *
 * The HARD GATE is the important part: an item must show at least one real
 * trigger event. v1 had no such gate, which is why a competitor's blog post
 * ("Your Healthcare AI Strategy Has a Data Problem") scored 6+ and got saved
 * as a lead — it matched two vertical keywords and nothing else.
 */
// ── KEYWORD MATCHING ─────────────────────────────────────────

/**
 * Compiles a scoring keyword into a matcher anchored at its LEADING edge.
 *
 * Every list in this file used to be scanned with `indexOf`, which matches a
 * keyword anywhere inside a longer word. Measured over 606 live items on
 * 2026-09-02, that was silently costing real leads:
 *
 *   "ngo"    matched "ongoing"    → "…backs sovereign AI firm Sarvam in
 *                                    ongoing Series B" rejected as a non-profit
 *   "rs."    matched "engineers." → 21 items read as Indian rupees
 *   "sar"    matched "Samsara"    → rejected as Saudi
 *   "apac"   matched "capacity"   → "Capacity raises $54m" penalised -3
 *   "stock"  matched "livestock"  → "Livestock tech platform Breedr raises
 *                                    €23 million" killed as stock coverage
 *
 * LEADING edge only, deliberately. A trailing \b as well would be stricter but
 * wrong: it drops the plurals and inflections these lists rely on. Measured on
 * the same corpus, anchoring both edges lost 17 "startups", 6 "ml engineers",
 * 4 "engineering teams", 3 "patients" and 3 "medical devices". Anchoring only
 * the front keeps every one of those and still refuses to match mid-word.
 *
 * The \b is omitted when the keyword does not START with a word character —
 * "₹", " rs " and "$…" have no word boundary in front of them to assert, and
 * demanding one would match nothing at all.
 */
const KEYWORD_RE_CACHE_ = {};

function keywordRe_(kw) {
  let re = KEYWORD_RE_CACHE_[kw];
  if (!re) {
    const escaped = String(kw).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = KEYWORD_RE_CACHE_[kw] =
      new RegExp((/^\w/.test(kw) ? "\\b" : "") + escaped, "i");
  }
  return re;
}

/** True when `text` contains `kw` as a word rather than as a fragment. */
function hasKeyword_(text, kw) {
  return keywordRe_(kw).test(text);
}

/** The first keyword in `list` that `text` contains, or undefined. */
function findKeyword_(text, list) {
  return list.find(k => hasKeyword_(text, k));
}


/**
 * How far does this job posting reach — can Pixler Lab take it on from India?
 *
 *   "open"    explicitly includes India (or is worldwide)
 *   "unclear" remote, but the region is never stated
 *   "fenced"  remote, but restricted to a region that excludes us
 *   "onsite"  no remote marker at all — an office job somewhere we are not
 *
 * `structured` is the source's own location field (Remotive, WWR, Jobicy all
 * have one). When present it is authoritative and treated as an ALLOWLIST:
 * a field that names regions but not ours is a fence, even though it contains
 * no "only". When absent (Hacker News) we fall back to reading the free text,
 * where the absence of a fence has to be read as permission — HN posters
 * write "REMOTE" and leave it at that far too often to reject them all.
 */
function jobReach_(freeText, structured) {
  const struct = String(structured || "").toLowerCase().trim();

  if (struct) {
    // Split on the separators these fields actually use, so "USA" from
    // "LATAM, Europe, USA, Canada, APAC" is one token among five.
    const tokens = struct.split(/[,;/|]|\band\b|\+/).map(t => t.trim()).filter(t => t);
    const open = tokens.some(t =>
      REGION_INCLUDES_INDIA.some(r => t.indexOf(r) !== -1));
    if (open) return "open";
    // A named region list that does not include us. This is the case v2 could
    // not express: a perfectly good remote job that is still not ours.
    if (tokens.length) return "fenced";
  }

  const text = String(freeText || "");
  if (JOB_FENCED_RE.test(text)) return "fenced";
  if (JOB_OPEN_RE.test(text))   return "open";
  if (JOB_REMOTE_RE.test(text)) return "unclear";
  return "onsite";
}


function evaluate_(item) {
  const isJob = item.kind === "job";
  const text  = (item.title + " " + item.snippet).toLowerCase();
  const stat  = item._stat;

  /**
   * Every rejection goes through here so the Run Log can answer "why did this
   * source give me nothing?" (spec §14). Previously a source's stat row said
   * only fetched-vs-qualified, so a query returning 25 items and 0 leads was
   * indistinguishable from a query returning 25 items that were all
   * duplicates — and those need opposite fixes.
   */
  const reject = (reason) => {
    if (stat) {
      stat.rejected = (stat.rejected || 0) + 1;
      // "score 4" and "score 7" are the same finding; bucket them together.
      const bucket = reason.indexOf(":") !== -1
        ? reason.split(":")[0].trim()
        : (reason.indexOf("score") === 0 ? "low score" : reason);
      stat.reasons = stat.reasons || {};
      stat.reasons[bucket] = (stat.reasons[bucket] || 0) + 1;
    }
    return { keep: false, reason: reason };
  };

  // 1. Recency. Job postings stay open far longer than news stays relevant,
  //    so they get their own, longer window.
  const maxAge = isJob ? CONFIG.JOB_RECENCY_DAYS : CONFIG.RECENCY_DAYS;
  let ageDays = null;
  if (item.publishedAt) {
    ageDays = (new Date() - item.publishedAt) / 86400000;
    if (maxAge > 0 && ageDays > maxAge) return reject("too old");
  }

  // 2. Geography — "can we deliver this?", not "is this American?".
  //
  //    Jobs are gated on reach: remote and open to India. Note this reads the
  //    title + the source's location field only, never the description — job
  //    descriptions list every global office the employer has ever had and
  //    would fence off postings that are genuinely open.
  //
  //    News is ungated by default (CONFIG.NEWS_GEO). A funded startup in
  //    Bengaluru or Berlin is a prospect for a team in India.
  let reach = null;
  if (isJob) {
    reach = jobReach_(item.title + " " + (item.locationHint || ""), item.locationField);
    if (CONFIG.REQUIRE_REMOTE_JOB && (reach === "fenced" || reach === "onsite")) {
      return reject("out of reach: " + reach);
    }
  } else if (CONFIG.NEWS_GEO === "us") {
    const foreign = findKeyword_(text, NON_US_HARD);
    if (foreign) return reject("non-US: " + foreign.trim());
  }

  // 3. Wrong buyer type. Jobs get the title-only check for the same reason.
  const buyerText = isJob ? (item.title + " " + (item.company || "")).toLowerCase() : text;
  const badBuyer = findKeyword_(buyerText, WRONG_BUYER);
  if (badBuyer) return reject("wrong buyer: " + badBuyer.trim());

  // 4. Content-type noise — NEWS ONLY (see the DISQUALIFY comment)
  if (!isJob) {
    const dq = findKeyword_(text, DISQUALIFY);
    if (dq) return reject("disqualified: " + dq);

    // Substring, NOT hasKeyword_: these are publication NAMES matched against a
    // longer publication string, where being a fragment is the whole point —
    // "motley fool" has to match "The Motley Fool", "nasdaq.com" has to match
    // "Nasdaq.com Staff". Measured on 606 live items, anchoring these changed
    // nothing; leaving them as substrings keeps them working when a publisher
    // renames itself into a longer string.
    const pub = String(item.publisher || "").toLowerCase();
    if (pub && STOCK_PUBLISHERS.some(p => pub.indexOf(p) !== -1)) {
      return reject("stock-coverage publisher: " + item.publisher);
    }
  }

  // 5. Intent groups — each fires ONCE (no synonym stacking)
  let fired = INTENT_GROUPS.filter(g => g.kw.some(k => hasKeyword_(text, k)));

  // A job posting IS the trigger event — an open req is committed budget.
  // The source already filtered for AI/ML/automation relevance before we got
  // here, so don't also demand that the post use one of our exact phrasings.
  // Without this, 52 of 84 real HN "who is hiring" posts were thrown away for
  // saying "Software Engineer, ML platform" instead of "ML engineer".
  if (fired.length === 0 && isJob) fired = [JOB_POSTING_INTENT];

  if (fired.length === 0) return reject("no trigger event");

  // Count the 3 strongest groups only, so a keyword-dense article can't run away
  const counted = fired.slice().sort((a, b) => b.weight - a.weight).slice(0, 3);
  let score = counted.reduce((n, g) => n + g.weight, 0);

  // 6. Segment classification (tag only — contributes ZERO points)
  const segment = classifySegment_(text, item.segmentHint);

  // 7. Outreach-readiness + locality bonuses
  const company = item.company || extractCompanyName_(item.title, item.publisher);
  if (isRealCompany_(company)) score += 2;
  if (item.domain)            score += 1;   // we already have their website
  if (ageDays !== null && ageDays <= 3) score += 1;
  // A posting that names India (or the whole world) beats one that just says
  // "Remote" and leaves us guessing whether we are allowed to answer it.
  if (reach === "open") score += 1;
  if (CONFIG.NEWS_GEO === "us" && !isJob &&
      US_MARKERS.some(k => hasKeyword_(text, k))) score += 1;

  // 8. Soft penalties
  if (CONFIG.NEWS_GEO === "us" && !isJob &&
      NON_US_SOFT.some(k => hasKeyword_(text, k))) score -= 3;
  PENALTIES.forEach(p => {
    if (p.kw.some(k => hasKeyword_(text, k))) score += p.points;
  });

  score = Math.max(0, Math.min(10, score));
  if (score < CONFIG.MIN_SCORE) return reject("score " + score);

  if (stat) stat.qualified++;

  const resolved = isRealCompany_(company) ? company : "";
  const displayCompany = resolved || "— extract manually —";

  // Derived AFTER the lead has earned its place. None of these scores.
  // Technology reads the role too: a WWR title is "Company: Role", so the
  // stack often lives there rather than in the snippet.
  const intents      = fired.map(g => g.key).join(", ");
  const technologies = detectTechnology_(text + " " + String(item.role || "").toLowerCase());

  return {
    keep:       true,
    score:      score,
    intents:    intents,
    segment:    segment,
    technology:  technologies.join(", "),
    opportunity: deriveOpportunity_(technologies, intents, segment),
    outreach:    outreachAngle_(intents, technologies, displayCompany),
    company:    displayCompany,
    // Company-level dedupe key. Empty when we couldn't name the company, so
    // unnamed leads never collapse into each other.
    companyKey: resolved ? resolved.toLowerCase().replace(/[^a-z0-9]/g, "") : "",
    reason:     "ok"
  };
}

/**
 * Vertical tag. Falls back to the source's own hint, then "other".
 *
 * FIRST segment that matches at all wins — the same rule INTENT_GROUPS use, for
 * the same reason. Counting hits and taking the highest looks fairer and is
 * not: it hands the tag to whichever list happens to own the most synonyms for
 * one phrase. "early stage fintech startup raises a seed round" scored
 * `startup` 2 ("early stage" + "startup") against `fintech` 1 and buried the
 * vertical. There is no honest way to weigh one list's synonym count against
 * another's, so priority is expressed where it can be read and tuned — the
 * declaration order of SEGMENT_KEYWORDS — instead of emerging from how verbose
 * each list happens to be.
 */
function classifySegment_(text, hint) {
  const segments = Object.keys(SEGMENT_KEYWORDS);
  for (let i = 0; i < segments.length; i++) {
    if (SEGMENT_KEYWORDS[segments[i]].some(k => hasKeyword_(text, k))) return segments[i];
  }
  return hint || "other";
}

// ════════════════════════════════════════════════════════════════
//  TECHNOLOGY / SERVICE / OUTREACH  (spec sections 4, 5, 6)
//  All three are DERIVED from signals that already fired. None of them scores
//  a single point — they answer "what would we actually sell this company?"
//  after the lead has already earned its place.
// ════════════════════════════════════════════════════════════════

// Ordered most-specific first. `covers` names the broader technologies this
// one makes redundant, so "Senior React Native Developer" reports
// "React Native" rather than "React Native, React, Mobile".
const TECHNOLOGIES = [
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

/**
 * Which of Pixler Lab's technologies this signal is about.
 *
 * Returns at most three, most specific first, because a job description that
 * lists a whole stack would otherwise produce a column nobody can read.
 */
function detectTechnology_(text) {
  const hits = TECHNOLOGIES.filter(t => t.kw.some(k => hasKeyword_(text, k)));
  const covered = {};
  hits.forEach(t => t.covers.forEach(c => { covered[c] = true; }));
  return hits.filter(t => !covered[t.name]).map(t => t.name).slice(0, 3);
}

/**
 * The service Pixler Lab would actually pitch, derived from what fired.
 *
 * Ordered by how specific the evidence is: a Shopify migration is a Shopify
 * job whatever else the article says, while "they raised money" only ever
 * justifies the generic answer. Returns "" when nothing supports a claim —
 * the spec is explicit that a service must not be invented.
 */
function deriveOpportunity_(technologies, intents, segment) {
  const tech = technologies || [];
  const has  = (t) => tech.indexOf(t) !== -1;
  const fired = (k) => String(intents || "").indexOf(k) !== -1;

  if (has("Shopify") || fired("Shopify / Ecommerce")) return "Shopify Development / Migration";
  if (segment === "ecommerce")                        return "Ecommerce Development";
  if (fired("Mobile App") || has("React Native") || has("Flutter") ||
      has("iOS") || has("Android") || has("Mobile")) {
    if (has("React Native")) return "React Native Development";
    if (has("Flutter"))      return "Flutter Development";
    return "Mobile App Development";
  }
  if (fired("Modernization"))                          return "Software Modernization";
  if (fired("AI Hiring") || fired("AI Initiative") || has("AI/LLM"))
    return "AI Development / Integration";

  if (fired("Developer Hiring")) {
    if (has("React"))   return "React Development";
    if (has("Node.js")) return "Node.js Development";
    if (has("Python"))  return "Python Development";
    if (has("Laravel")) return "Laravel Development";
    if (has("PHP"))     return "PHP Development";
    return "Dedicated Development Team";
  }
  if (fired("Engineering Expansion"))                  return "Dedicated Development Team";
  if (has("API/Integration"))                          return "API / Integration Development";
  if (fired("Funding") || fired("New Leadership"))     return "Custom Software Development";
  if (fired("Product Launch"))                         return "Custom Software Development";
  if (fired("Open AI Role"))                           return "Dedicated Development Team";
  return "";
}

// Keyed by intent, checked in this order — the most actionable trigger wins.
// Deterministic templates on purpose: the spec rules out calling an LLM for
// this in Phase 1.
const OUTREACH_ANGLES = [
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

/** One sentence a human can act on, or "" when nothing fired. */
function outreachAngle_(intents, technologies, company) {
  const fired = String(intents || "");
  for (let i = 0; i < OUTREACH_ANGLES.length; i++) {
    if (fired.indexOf(OUTREACH_ANGLES[i][0]) === -1) continue;
    const who  = company && company.indexOf("extract manually") === -1 ? company : "This company";
    const tech = (technologies && technologies.length) ? technologies[0] : "software";
    return who + " " + OUTREACH_ANGLES[i][1].replace(/\{TECH\}/g, tech);
  }
  return "";
}


/**
 * Caps any one segment's share of a run so a single high-volume vertical
 * can't own the digest. Deferred items are neither saved nor marked seen,
 * so they come back around on the next run — nothing is lost.
 */
function applySegmentQuota_(sorted) {
  // Share of what actually gets SAVED, not of what qualified.
  //
  // The spec (§8) reads this backwards — it says MIN_PER_SEGMENT forces four
  // leads per segment and manufactures weak ones. It does not: `cap` is a
  // per-segment CEILING and nothing is ever padded. Verified with 40 saas
  // leads and 1 fintech lead: the result is {saas: 25, fintech: 1} and no
  // invented rows.
  //
  // The real defect is the opposite. Computed against the QUALIFIED pool the
  // ceiling was 0.6 x 291 = 175 per segment against a 60-lead run, so it never
  // once bound and the anti-flood control was dead — `ai` took 42% of every
  // digest unchallenged. Measured against MAX_LEADS_PER_RUN it means what it
  // says: no segment may take more than 60% of the run.
  const cap = Math.max(
    CONFIG.MIN_PER_SEGMENT,
    Math.ceil(Math.min(sorted.length, CONFIG.MAX_LEADS_PER_RUN) * CONFIG.MAX_SEGMENT_SHARE)
  );
  const counts = {}, perSource = {}, kept = [], deferred = [];

  sorted.forEach(c => {
    const seg = c.segment || "other";
    const src = c.sourceLabel || "?";
    counts[seg]    = counts[seg]    || 0;
    perSource[src] = perSource[src] || 0;

    if (counts[seg] < cap &&
        perSource[src] < CONFIG.MAX_PER_SOURCE &&
        kept.length < CONFIG.MAX_LEADS_PER_RUN) {
      counts[seg]++;
      perSource[src]++;
      kept.push(c);
    } else {
      deferred.push(c);
    }
  });

  return { kept: kept, deferred: deferred, cap: cap, counts: counts, perSource: perSource };
}


// ════════════════════════════════════════════════════════════════
//  COMPANY NAME EXTRACTION
// ════════════════════════════════════════════════════════════════

const ACTION_WORDS = [
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
const DESCRIPTOR_WORDS = [
  "start-ups", "start-up", "startups", "startup", "scale-ups", "scale-up",
  "scaleups", "scaleup", "consultants", "consultant", "companies", "company",
  "providers", "provider", "platforms", "platform", "unicorns", "unicorn",
  "vendors", "vendor", "giants", "giant", "makers", "maker", "firms", "firm"
];

// Built with anyCase_ rather than an /i flag on the whole pattern: the flag
// would also make the "(?=[A-Z])" guard case-insensitive, and the strip then
// ate everything up to a lowercase word ("…AI-powered Platforms to Advance"
// left just "to Advance Cashless Healthcare").
const DESCRIPTOR_NOUNS =
  "(?:" + DESCRIPTOR_WORDS.map(anyCase_).join("|") + ")";

/**
 * Strips descriptive lead-ins so the extractor lands on the actual company.
 * From a live run: "Enterprise AI Startup Superleap Raises...",
 * "UAE Startup Bundle Raises...", "Bulgaria's Estel Technologies raises..."
 * all produced the descriptor as the company name.
 */
function stripLeadingDescriptor_(t) {
  return String(t || "")
    // "{Funding Alert} Personal Assistance Startup Hulp ..." -> "Personal ..."
    .replace(/^\s*[{[(][^}\])]{0,40}[}\])]\s*/, "")
    // "Bulgaria's Estel Technologies ..." -> "Estel Technologies ..."
    .replace(/^[A-Z][\w.&-]*['’]s\s+(?=[A-Z])/, "")
    // "Enterprise AI Startup Superleap ..." -> "Superleap ..."
    // Case-insensitive and not restricted to Capitalised lead-ins, because
    // "Food delivery startup Amigo" and "Legal AI startup NYAI" are lowercase.
    .replace(
      new RegExp("^(?:[\\w&'’.-]+\\s+){0,5}" + DESCRIPTOR_NOUNS +
                 "\\s+(?=[A-Z\\u00C0-\\u00DE])"), "")
    .trim();
}

/**
 * Headlines capitalize their verbs ("Obsidian Security Raises $85 Million"),
 * but the company-name part of the pattern must stay case-SENSITIVE so it
 * only matches proper nouns. Since one regex can't be half case-insensitive,
 * expand each verb into a [Rr]aises-style class instead of using the /i flag.
 */
function anyCase_(word) {
  return word.split("").map(c =>
    /[a-z]/.test(c) ? "[" + c.toUpperCase() + c + "]" : c
  ).join("");
}

const COMPANY_ACTIONS = "(?:" + ACTION_WORDS.map(anyCase_).join("|") + ")";

// Accented capitals/letters are included explicitly: JS \w is ASCII-only, so
// "Naïve raises $28.5M" stopped the name at "Na" and matched nothing.
const NAME_ =
  "([A-Z\\u00C0-\\u00DE][\\w&.'’\\-\\u00C0-\\u00FF]*" +
  "(?:\\s+(?:[A-Z\\u00C0-\\u00DE][\\w&.'’\\-\\u00C0-\\u00FF]*|of|and|the)){0,4})";

// "Naïve startup raises …" — a lowercase descriptor may sit between the name
// and the verb, where stripLeadingDescriptor_ can't reach it (it only strips
// descriptors that PRECEDE the name).
const OPT_DESC_ =
  "(?:\\s+(?:" +
  ["startup", "start-up", "company", "platform", "firm"].map(anyCase_).join("|") +
  "))?";

const LAUNCH_VERBS_ = "(?:[Ll]aunch(?:es|ed)?|[Uu]nveil(?:s|ed)?|[Ii]ntroduc(?:e|es|ed))";

/**
 * Pulls the company out of a headline, or "" when the headline never names one
 * ("Two LA Startups Raised $2.37B to Build What AI Needs").
 *
 * Three passes, cheapest first. Order matters: the direct patterns must run
 * before the launch-verb pass, or "Bloom Security launches with $20M" would be
 * read as a product launch and lose the company sitting at the front.
 */
function extractCompanyName_(title, publisher) {
  const base = stripPublisherSuffix_(cleanText_(title), publisher);
  const t    = stripLeadingDescriptor_(base);

  // Stripped first ("Personal Assistance Startup Hulp Raises" must yield Hulp,
  // not the descriptor), then the original — the strip is a heuristic and
  // over-fires on product names like "…Innovation Platform Hub", where the
  // company is still sitting at the front of the untouched headline.
  const direct = matchCompanyPatterns_(t) || matchCompanyPatterns_(base);
  if (direct) return direct;

  // "Former Nubank Execs Launch AI-Powered Wealth Advisory Platform Decade
  //  With Record $85M Seed Round" — the name trails a launch verb and a pile
  //  of descriptors, so re-run the descriptor strip on just that fragment.
  const launched = t.match(
    new RegExp(LAUNCH_VERBS_ + "\\s+([^,]{0,70}?)(?=\\s+[Ww]ith\\b|,|$)"));
  if (launched) {
    const fromLaunch = matchCompanyPatterns_(
      stripLeadingDescriptor_(launched[1]), true);
    if (fromLaunch) return fromLaunch;
  }

  // "Beyond Real-World Trial Iteration: QuantHealth Secures $45M" — the
  //  headline leads with a themed clause and names the company after the colon.
  const colon = t.indexOf(": ");
  if (colon > 0 && colon < t.length - 3) {
    const after = matchCompanyPatterns_(stripLeadingDescriptor_(t.slice(colon + 2)));
    if (after) return after;
  }

  return "";
}

/**
 * @param {boolean} bare  Accept a leading proper noun on its own. Only safe for
 *                        a fragment already isolated by a launch verb — on a
 *                        whole headline it would name every article's first word.
 */
function matchCompanyPatterns_(t, bare) {
  const patterns = [
    new RegExp("^" + NAME_ + OPT_DESC_ + "\\s+" + COMPANY_ACTIONS + "\\b"),
    new RegExp("^" + NAME_ + ",\\s+(?:a|an|the|which)\\s+"),
    new RegExp("^" + NAME_ + "\\s+(?:" + ["has", "is", "to", "will"].map(anyCase_).join("|") +
               ")\\s+" + COMPANY_ACTIONS),
    new RegExp("^" + NAME_ + "\\s+(?:" + anyCase_("series") + "\\s+[A-D]|" +
               anyCase_("funding") + "|" + anyCase_("round") + ")\\b"),
    // "Enrola’s pivot to AI sales-tech lands $2.1 million Seed" — possessive
    // followed by lowercase prose, so the stripLeadingDescriptor_ rule (which
    // requires a capital after the apostrophe) never fires.
    new RegExp("^" + NAME_ + "['’]s\\s+[\\w\\s.,'’-]{0,45}?\\s+" + COMPANY_ACTIONS + "\\b")
  ];
  if (bare) patterns.push(new RegExp("^" + NAME_ + "\\s*$"));

  for (let i = 0; i < patterns.length; i++) {
    const m = t.match(patterns[i]);
    if (m && isRealCompany_(m[1])) return m[1].trim();
  }
  return "";
}

/** Rejects publications, generic words, and junk from the Company column. */
function isRealCompany_(name) {
  if (!name) return false;
  const n = String(name).trim();
  if (n.length < 2 || n.length > 60) return false;
  if (n.indexOf("extract manually") !== -1) return false;

  const lower = n.toLowerCase();
  if (PUBLISHERS.some(p => lower.indexOf(p) !== -1)) return false;
  if (NOT_A_COMPANY.indexOf(lower) !== -1) return false;

  // "Two LA Startups Raised $2.37B to Build What AI Needs" — the headline is
  // about a category, so the name it yields ends in the category noun. A real
  // company never does (and "Labs"/"Ventures" are kept out of that list
  // precisely because they DO end real names).
  if (DESCRIPTOR_WORDS.indexOf(lower.split(/\s+/).pop()) !== -1) return false;
  // A single lowercase word is almost never a company name here
  if (!/[A-Z]/.test(n)) return false;
  return true;
}

/** Removes Google News' trailing " - Publisher" from a headline. */
function stripPublisherSuffix_(title, publisher) {
  let t = String(title || "").trim();
  if (publisher) {
    const suffix = " - " + publisher;
    if (t.length > suffix.length && t.slice(-suffix.length) === suffix) {
      return t.slice(0, -suffix.length).trim();
    }
  }
  // Fallback: drop a short trailing " - Something" segment
  const m = t.match(/^(.*)\s-\s([^-]{2,30})$/);
  if (m && PUBLISHERS.some(p => m[2].toLowerCase().indexOf(p) !== -1)) return m[1].trim();
  return t;
}


// ════════════════════════════════════════════════════════════════
//  TEXT / URL UTILITIES
// ════════════════════════════════════════════════════════════════

/**
 * Decode HTML entities, then strip tags, then collapse whitespace.
 * Runs the decode twice because feeds are frequently double-encoded
 * (`&amp;#39;` → `&#39;` → `'`), which v1 wrote into the sheet raw.
 */
function cleanText_(s) {
  if (!s) return "";
  let out = String(s);
  for (let i = 0; i < 2; i++) {
    out = out
      .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&#(\d+);/g,           (m, d) => String.fromCharCode(parseInt(d, 10)))
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }
  return out.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Pulls the real article URL out of a Google redirect wrapper, e.g.
 *   google.com/url?rct=j&sa=t&url=https://real.site/story&ct=ga&usg=...
 * Note the separator class allows ";" — the href often arrives with its
 * ampersands still entity-encoded (`&amp;url=`), so the character
 * immediately before "url=" is a semicolon rather than an "&".
 */
function unwrapGoogleRedirect_(url) {
  let s = String(url || "").replace(/&amp;/g, "&");
  const m = s.match(/[?&;]url=([^&]+)/);
  if (m) {
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }
  return s;
}

// Query params that carry no identity — safe to drop before comparing URLs.
const TRACKING_PARAMS = /^(utm_\w*|oc|ct|cd|usg|rct|sa|ved|ei|gclid|fbclid|mc_cid|mc_eid|ref|referrer|source|campaign|amp)$/i;

/**
 * Strips protocol, www, trailing slash and tracking params so dedupe works.
 *
 * It must NOT strip the whole query string: some sources put the item's
 * identity there. Hacker News URLs are `item?id=49192593`, so blanket
 * query-stripping normalized all 84 hiring posts to the same key and 83 of
 * them were silently thrown away as duplicates.
 */
function normalizeUrl_(url) {
  let s = String(url || "").replace(/^https?:\/\//i, "").replace(/^www\./i, "")
                           .replace(/#.*$/, "");
  const qi = s.indexOf("?");
  if (qi === -1) return s.replace(/\/+$/, "").toLowerCase();

  const path = s.slice(0, qi).replace(/\/+$/, "");
  const kept = s.slice(qi + 1).split("&").filter(pair => {
    const k = pair.split("=")[0];
    return k && !TRACKING_PARAMS.test(k);
  }).sort();

  return (kept.length ? path + "?" + kept.join("&") : path).toLowerCase();
}

/**
 * Headline fingerprint — the secondary dedupe key.
 * Necessary because Google News returns a different opaque redirect URL for
 * the same story on every query, so URL-only dedupe lets duplicates through.
 *
 * Strips a trailing " - Publisher" first so the same story arriving from
 * Google News, Bing News and a Google Alert collapses to one key. Keeps ALL
 * tokens (including numbers and single letters) — dropping them made
 * "Series A" and "Series B" fingerprint identically, which would silently
 * merge two different rounds into one lead.
 */
function fingerprint_(title) {
  return cleanText_(title)
    .replace(/\s+-\s+[^-]{2,30}$/, "")     // drop the publisher suffix
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/).filter(w => w).slice(0, 10).join(" ");
}

function hostOf_(url) {
  const m = String(url || "").match(/^https?:\/\/([^\/\s?#]+)/i);
  return m ? m[1].replace(/^www\./, "") : "";
}

function parseDate_(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}


// ════════════════════════════════════════════════════════════════
//  ROW BUILDER
//  Columns A–O are unchanged from v1 so your existing rows still line up.
//  P/Q/R are new — run migrateSheet() once to add the headers.
// ════════════════════════════════════════════════════════════════

// A–R are unchanged from v2. S/T/U are appended, never inserted: getSeenKeys_
// reads A–L by index, backfillCompanyNames reads D/J/K by index, and the
// conditional formatting is anchored by letter. Appending keeps every one of
// those correct and leaves existing rows untouched — migrateSheet() widens the
// sheet in place, so nobody has to rebuild it.
const LEAD_HEADERS = [
  "Date Found", "Priority", "Score", "Company", "Contact Name",
  "Title / Role", "Email", "Signal Source", "Matched Signals",
  "Headline", "Snippet", "Source URL", "Status", "Notes", "Outreach Sent?",
  "Segment", "Intent", "Domain",
  "Technology", "Service Opportunity", "Recommended Outreach"
];

function buildLeadRow_(c) {
  return [
    new Date(),                        // A: Date Found
    scoreLabel_(c.score),               // B: Priority
    c.score,                           // C: Score
    c.company,                         // D: Company
    "",                                // E: Contact Name
    c.contactTitle || "",              // F: Title / Role
    "",                                // G: Email
    c.sourceLabel,                     // H: Signal Source
    c.intents,                         // I: Matched Signals (intent groups)
    c.title,                           // J: Headline (now clean — no <b> tags)
    (c.snippet || "").substring(0, 300),// K: Snippet
    c.url,                             // L: Source URL
    "New",                             // M: Status
    "",                                // N: Notes
    "",                                // O: Outreach Sent?
    c.segment,                         // P: Segment
    c.intents,                         // Q: Intent
    c.domain || "",                    // R: Domain
    c.technology  || "",               // S: Technology
    c.opportunity || "",               // T: Service Opportunity
    c.outreach    || ""                // U: Recommended Outreach
  ];
}

function scoreLabel_(score) {
  if (score >= 8) return "🔥 Hot";
  if (score >= 6) return "⚡ Warm";
  return "❄️ Cool";
}


// ════════════════════════════════════════════════════════════════
//  DUPLICATE PREVENTION
// ════════════════════════════════════════════════════════════════

/**
 * Builds THREE dedupe keys from the existing sheet:
 *   urls      — normalized Source URL (column L)
 *   prints    — headline fingerprint_ (column J)
 *   companies — company name (column D), but only from rows newer than
 *               COMPANY_DEDUPE_DAYS
 *
 * The company key is what actually matters in practice. A single funding round
 * gets covered by four publications with four different headlines and four
 * different Google News redirect URLs, so URL and headline dedupe both miss it
 * — a live test produced "Superleap" 4x and "Decade" 3x in one run before this
 * key existed.
 */
function getSeenKeys_(leadsSheet) {
  const keys = { urls: new Set(), prints: new Set(), companies: new Set() };
  if (!leadsSheet) return keys;

  const lastRow = leadsSheet.getLastRow();
  if (lastRow < 2) return keys;

  // One read for A..L: date(0), company(3), headline(9), url(11)
  const data   = leadsSheet.getRange(2, 1, lastRow - 1, 12).getValues();
  const cutoff = CONFIG.COMPANY_DEDUPE_DAYS > 0
    ? new Date(new Date() - CONFIG.COMPANY_DEDUPE_DAYS * 86400000)
    : null;

  data.forEach(row => {
    if (row[11]) keys.urls.add(normalizeUrl_(row[11]));
    if (row[9])  keys.prints.add(fingerprint_(row[9]));

    if (cutoff && row[3]) {
      const found = row[0] instanceof Date ? row[0] : parseDate_(row[0]);
      if (!found || found >= cutoff) {
        const ck = String(row[3]).toLowerCase().replace(/[^a-z0-9]/g, "");
        if (ck && ck.indexOf("extractmanually") === -1) keys.companies.add(ck);
      }
    }
  });
  return keys;
}


// ════════════════════════════════════════════════════════════════
//  EMAIL DIGEST
// ════════════════════════════════════════════════════════════════

function sendDailyDigest_(leads, quota, stats) {
  const hot  = leads.filter(l => l.score >= 8);
  const warm = leads.filter(l => l.score >= 6 && l.score < 8);
  const cool = leads.filter(l => l.score < 6);

  const shown  = leads.slice(0, CONFIG.DIGEST_MAX_LEADS);
  const hidden = leads.length - shown.length;

  const mix = Object.keys(quota.counts)
    .sort((a, b) => quota.counts[b] - quota.counts[a])
    .map(k => `${quota.counts[k]} ${k}`).join(" / ");

  const badSources = stats.filter(s => s.fetched === 0 || s.error);
  const sheetUrl   = getSpreadsheet_().getUrl();

  // Layout is table-based on purpose: Gmail strips `display:flex`, so the
  // previous version's header row silently collapsed. Tables render
  // identically in Gmail, Outlook and Apple Mail.
  //
  // No emoji anywhere in this HTML. Astral-plane characters (U+1F525 and
  // friends) arrived mangled — the "HOT (8+)" heading rendered as a row of
  // diamonds. 2-3 byte characters like · and — are fine, so those stay.
  const P = {
    bg:     "#0f0f0d",
    card:   "#171714",
    line:   "#26261f",
    text:   "#e8e8e0",
    dim:    "#8a8a80",
    faint:  "#5a5a52",
    green:  "#00e5a0",
    hot:    "#ff6b3d",
    warm:   "#6b8cff",
    cool:   "#7a8a99"
  };

  let html =
`<div style="background:${P.bg};padding:28px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" align="center" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;margin:0 auto;background:${P.bg};">

  <tr><td style="padding:0 0 22px;">
    <div style="font-size:10px;color:${P.faint};letter-spacing:2.5px;text-transform:uppercase;padding-bottom:10px;">
      ${escapeHtml_(CONFIG.AGENCY_NAME)} &middot; Intent Signals
    </div>
    <div style="font-size:30px;font-weight:700;color:#fff;letter-spacing:-0.8px;line-height:1.15;">
      ${hot.length} hot ${hot.length === 1 ? "lead" : "leads"}
    </div>
    <div style="font-size:13px;color:${P.dim};padding-top:8px;line-height:1.6;">
      ${escapeHtml_(fmtDate_(new Date()))} &middot; ${leads.length} new total${
        warm.length ? ` &middot; ${warm.length} warm` : ""}${
        cool.length ? ` &middot; ${cool.length} cool` : ""}<br>
      <span style="color:${P.green};">${escapeHtml_(mix)}</span>${
        quota.deferred.length
          ? `<span style="color:${P.faint};"> &middot; ${quota.deferred.length} queued for tomorrow</span>`
          : ""}
    </div>
  </td></tr>

  <tr><td style="padding:0 0 20px;">
    <a href="${escapeHtml_(sheetUrl)}" style="display:inline-block;background:${P.green};color:#06251a;font-size:13px;font-weight:600;text-decoration:none;padding:11px 20px;border-radius:3px;">
      Open the Leads sheet
    </a>
  </td></tr>
`;

  html += digestSection_("Hot &middot; score 8+",   shown.filter(l => l.score >= 8), P.hot,  P);
  html += digestSection_("Warm &middot; score 6-7", shown.filter(l => l.score >= 6 && l.score < 8), P.warm, P);
  html += digestSection_("Cool &middot; score 5",   shown.filter(l => l.score < 6),  P.cool, P);

  if (hidden > 0) {
    html +=
`  <tr><td style="padding:4px 0 0;">
    <a href="${escapeHtml_(sheetUrl)}" style="font-size:12px;color:${P.dim};text-decoration:none;">
      + ${hidden} more ${hidden === 1 ? "lead" : "leads"} in the sheet &rarr;
    </a>
  </td></tr>
`;
  }

  // Surface dead sources in the email itself. This is how you catch the next
  // Indeed-style silent failure the morning it happens rather than months on.
  if (badSources.length) {
    html +=
`  <tr><td style="padding:24px 0 0;border-top:1px solid ${P.line};">
    <div style="font-size:10px;color:#e8b40a;letter-spacing:2px;text-transform:uppercase;padding:16px 0 8px;">
      ${badSources.length} source${badSources.length === 1 ? "" : "s"} returned nothing
    </div>
    <div style="font-size:12px;color:${P.dim};line-height:1.8;">
      ${badSources.map(s =>
          escapeHtml_(s.label) + " &mdash; " +
          escapeHtml_(s.error ? s.error.substring(0, 70) : "empty")
        ).join("<br>")}
    </div>
  </td></tr>
`;
  }

  html +=
`  <tr><td style="padding:22px 0 0;border-top:1px solid ${P.line};">
    <div style="font-size:11px;color:${P.faint};line-height:1.7;padding-top:14px;">
      Rows with Status = "New" need action today.<br>
      Scores: 8+ act now &middot; 6-7 worth a look &middot; 5 keep an eye on.
    </div>
  </td></tr>

</table>
</div>`;

  GmailApp.sendEmail(
    CONFIG.NOTIFICATION_EMAIL,
    `${hot.length} hot leads, ${leads.length} new — ${CONFIG.AGENCY_NAME}`,
    digestPlainText_(leads, hot, warm, cool, mix, sheetUrl),
    { htmlBody: html, name: CONFIG.AGENCY_NAME + " Intent Signals" }
  );
}

/** One priority group of lead cards. Returns "" when the group is empty. */
function digestSection_(title, list, accent, P) {
  if (!list.length) return "";

  let h =
`  <tr><td style="padding:18px 0 10px;">
    <div style="font-size:10px;color:${accent};letter-spacing:2.5px;text-transform:uppercase;font-weight:600;">
      ${title} &middot; ${list.length}
    </div>
  </td></tr>
`;
  list.forEach(l => { h += digestLeadRow_(l, accent, P); });
  return h;
}

/**
 * A single lead card.
 * Nested tables rather than flexbox so the company/score row survives Gmail.
 */
function digestLeadRow_(lead, accent, P) {
  const company = lead.company && lead.company.indexOf("extract manually") === -1
    ? lead.company : "(company not parsed)";

  // Escape each PART, then join with the separator entity. Joining first and
  // escaping afterwards turned "&middot;" into a literal "&amp;middot;", so the
  // job lines read "AI Engineer &middot; REMOTE &middot; $180K".
  // Truncation also happens before escaping, so it can't slice an entity in half.
  const SEP = ' <span style="color:' + P.faint + ';">&middot;</span> ';
  const trim = (t, n) => escapeHtml_(String(t || "").substring(0, n));

  // Jobs carry structured role/location/salary; news carries a headline.
  // Fall back to the raw post when a poster ignored the pipe convention, so
  // the line is never blank.
  let detail;
  if (lead.kind === "job") {
    const parts = [lead.role, lead.location, lead.salary].filter(Boolean);
    detail = parts.length
      ? parts.map(p => trim(p, 60)).join(SEP)
      : trim(lead.snippet || lead.title, 150);
  } else {
    detail = trim(lead.title, 150);
  }

  const chips = [lead.segment, lead.intents]
    .filter(Boolean).map(c => trim(c, 60)).join(SEP);

  const links = [
    `<a href="${escapeHtml_(lead.url)}" style="color:${accent};text-decoration:none;">Source</a>`
  ];
  if (lead.domain) {
    links.push(`<a href="https://${escapeHtml_(lead.domain)}" style="color:${P.green};text-decoration:none;">${escapeHtml_(lead.domain)}</a>`);
  }
  if (company !== "(company not parsed)") {
    // Straight into finding a human to contact — the actual next action.
    links.push(`<a href="https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(company)}" style="color:${P.dim};text-decoration:none;">Find contacts</a>`);
  }

  return (
`  <tr><td style="padding:0 0 8px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.card};border-left:3px solid ${accent};">
      <tr><td style="padding:14px 16px;">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-size:15px;font-weight:700;color:#fff;line-height:1.3;">
              ${escapeHtml_(company)}
            </td>
            <td align="right" width="52" style="font-size:12px;font-weight:700;color:${accent};white-space:nowrap;vertical-align:top;">
              ${lead.score}<span style="color:${P.faint};font-weight:400;">/10</span>
            </td>
          </tr>
        </table>

        <div style="font-size:13px;color:${P.text};line-height:1.5;padding:7px 0 0;">
          ${detail}
        </div>

        <div style="font-size:10px;color:${P.faint};text-transform:uppercase;letter-spacing:1.2px;padding:9px 0 0;">
          ${chips}
        </div>

        <div style="font-size:12px;padding:10px 0 0;">
          ${links.join(`<span style="color:${P.line};"> &nbsp;|&nbsp; </span>`)}
        </div>

      </td></tr>
    </table>
  </td></tr>
`);
}

/** Plain-text alternative — what watches, notifications and screen readers get. */
function digestPlainText_(leads, hot, warm, cool, mix, sheetUrl) {
  const lines = [
    `${hot.length} hot leads, ${leads.length} new total`,
    `${fmtDate_(new Date())} · ${mix}`,
    "",
    sheetUrl,
    ""
  ];
  leads.slice(0, CONFIG.DIGEST_MAX_LEADS).forEach(l => {
    const company = l.company && l.company.indexOf("extract manually") === -1 ? l.company : "?";
    const detail = l.kind === "job"
      ? [l.role, l.location, l.salary].filter(Boolean).join(" · ")
      : l.title;
    lines.push(`[${l.score}/10] ${company} — ${String(detail || "").substring(0, 110)}`);
    lines.push(`         ${l.url}`);
  });
  if (leads.length > CONFIG.DIGEST_MAX_LEADS) {
    lines.push("", `+ ${leads.length - CONFIG.DIGEST_MAX_LEADS} more in the sheet.`);
  }
  return lines.join("\n");
}

/** "Thu 6 Aug 2026" — toDateString() gives the clunkier "Thu Aug 06 2026". */
function fmtDate_(d) {
  const days   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function escapeHtml_(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}


// ════════════════════════════════════════════════════════════════
//  DIAGNOSTICS — run this whenever volume drops
// ════════════════════════════════════════════════════════════════

/**
 * Fetches EVERY configured source and reports what each one actually returns.
 * This is the function that would have caught v1's problem on day one:
 * 4 of 7 Google Alerts feeds and 4 of 4 Indeed feeds were returning nothing.
 *
 * Writes a table to the Run Log and logs it. Does not save any leads.
 */
/**
 * "fetched 25 · qualified 0 · rejected 25 · no trigger event 18, disqualified 7"
 *
 * The reason histogram is the half that tells you what to DO. A query that
 * fetches 25 and qualifies 0 needs a different fix depending on whether those
 * 25 were topic articles (rewrite the query), duplicates (it overlaps another
 * query) or out of reach (wrong geography) — and until now the log could not
 * tell them apart. It also stops reporting `fetched - qualified` as the
 * rejected count, which was wrong: items dropped as duplicates never reach
 * evaluate_ at all, so that subtraction blamed the scoring for the deduper.
 */
function statDetail_(s) {
  if (s.error) return s.error;
  const parts = ["fetched " + s.fetched, "qualified " + s.qualified];
  if (s.rejected) parts.push("rejected " + s.rejected);
  const reasons = Object.keys(s.reasons || {})
    .sort((a, b) => s.reasons[b] - s.reasons[a])
    .slice(0, 4)
    .map(r => r + " " + s.reasons[r]);
  return parts.join(" \u00b7 ") + (reasons.length ? " \u00b7 " + reasons.join(", ") : "");
}


function auditFeeds() {
  const ss       = getSpreadsheet_();
  const logSheet = getOrCreateSheet_(ss, CONFIG.SHEETS.LOG);
  const stats    = [];

  const items = collectAll_(stats);

  // Score everything so we can see qualified-vs-fetched per source
  items.forEach(i => { evaluate_(i); });

  const rows = [[new Date(), "AUDIT", `${stats.length} sources · ${items.length} items fetched`,
                 "Per-source breakdown follows"]];
  let report = "FEED AUDIT\n";

  stats.sort((a, b) => a.fetched - b.fetched).forEach(s => {
    const verdict = s.error ? "ERROR" : (s.fetched === 0 ? "DEAD" : (s.qualified === 0 ? "NOISE" : "OK"));
    const detail  = statDetail_(s);
    rows.push([new Date(), verdict, s.label, detail]);
    report += `${verdict.padEnd(6)} ${String(s.fetched).padStart(3)} fetched / ${String(s.qualified).padStart(3)} qualified  ${s.label}\n`;
  });

  logSheet.getRange(logSheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
  Logger.log(report);

  const dead  = stats.filter(s => s.fetched === 0 || s.error);
  const noise = stats.filter(s => s.fetched > 0 && s.qualified === 0);

  safeAlert_(
    "FEED AUDIT COMPLETE\n\n" +
    `Sources checked: ${stats.length}\n` +
    `Items fetched:   ${items.length}\n` +
    `Qualified:       ${stats.reduce((n, s) => n + s.qualified, 0)}\n\n` +
    (dead.length  ? `DEAD (0 items): ${dead.length}\n` + dead.map(s => "  • " + s.label).join("\n") + "\n\n" : "All sources returned items.\n\n") +
    (noise.length ? `NOISE (items but 0 qualified): ${noise.length}\n` + noise.map(s => "  • " + s.label).join("\n") + "\n\n" : "") +
    "Full table is in the Run Log tab."
  );
}

/**
 * SMALLEST POSSIBLE TEST — run this first when something times out.
 *
 * Touches one feed, one API and one cell, timing each step, so you can see
 * exactly which layer is slow or hanging. Finishes in seconds; if THIS times
 * out the problem is the environment (authorization, network, a debugger
 * breakpoint), not the scraper's volume.
 */
function smokeTest() {
  const clock = startClock_("smokeTest");
  const lines = [];
  const step = (name, fn) => {
    const t = new Date().getTime();
    let outcome;
    try {
      outcome = fn();
    } catch (e) {
      outcome = "FAILED — " + (e && e.message || e);
    }
    const secs = ((new Date().getTime() - t) / 1000).toFixed(1);
    const line = `${secs}s  ${name}: ${outcome}`;
    lines.push(line);
    Logger.log("  " + line);
    return outcome;
  };

  step("1. spreadsheet access", () => "OK — " + getSpreadsheet_().getName());

  step("2. single Google News fetch", () => {
    const nq = CONFIG.NEWS_QUERIES[0];
    const res = UrlFetchApp.fetch(googleNewsUrl_(nq), FETCH_OPTS_);
    const code = res.getResponseCode();
    if (code !== 200) return "HTTP " + code;
    return `HTTP 200, ${parseRss2Text_(res.getContentText(), nq.label, nq.segment).length} items`;
  });

  step("3. batched fetch of 2 feeds", () => {
    const two = CONFIG.NEWS_QUERIES.slice(0, 2).map(nq => ({
      label: nq.label, format: "rss2", segment: nq.segment, url: googleNewsUrl_(nq)
    }));
    const got = fetchBatch_(two);
    return got.map(r => r.error ? "ERR" : "HTTP " + r.res.getResponseCode()).join(", ");
  });

  step("4. Hacker News API", () => {
    const r = UrlFetchApp.fetch(
      "https://hn.algolia.com/api/v1/search_by_date?query=" +
      encodeURIComponent("Ask HN Who is hiring") + "&tags=story&hitsPerPage=1",
      { muteHttpExceptions: true });
    return "HTTP " + r.getResponseCode();
  });

  step("5. write one cell to the Run Log", () => {
    const sheet = getOrCreateSheet_(getSpreadsheet_(), CONFIG.SHEETS.LOG);
    sheet.appendRow([new Date(), "SMOKE", "smokeTest", "reached the write step"]);
    return "OK";
  });

  const summary = `SMOKE TEST finished in ${clock.seconds().toFixed(1)}s\n\n` + lines.join("\n");
  Logger.log(summary);
  safeAlert_(summary);
}

/**
 * Dry run: scores today's items and logs the decision for each one WITHOUT
 * writing to the Leads sheet. Use this to tune MIN_SCORE and the keyword
 * lists — you can see exactly why each item was kept or dropped.
 */
function previewScoring() {
  const stats = [];
  const items = collectAll_(stats);
  let kept = 0;

  // One line per candidate, with everything needed to judge it (spec §15):
  // what it is, why it scored, what we would sell, and — for the rejects —
  // exactly which rule threw it out.
  Logger.log("KEEP? | SCORE | SEGMENT | INTENTS / REASON | TECHNOLOGY | SERVICE | HEADLINE");
  items.slice(0, 200).forEach(i => {
    const v = evaluate_(i);
    if (v.keep) kept++;
    Logger.log(
      `${v.keep ? "KEEP" : "drop"} | ${String(v.score || "-").padStart(2)} | ` +
      `${(v.segment || "-").padEnd(12)} | ${(v.intents || v.reason).substring(0, 38).padEnd(38)} | ` +
      `${(v.technology || "-").padEnd(22)} | ${(v.opportunity || "-").padEnd(32)} | ` +
      i.title.substring(0, 70)
    );
  });

  // The same per-source accounting auditFeeds() writes, so a preview also
  // tells you which query is pulling its weight.
  Logger.log("\nPER SOURCE");
  stats.sort((a, b) => b.qualified - a.qualified)
       .forEach(s => Logger.log(`  ${s.label.padEnd(34)} ${statDetail_(s)}`));

  const byService = {};
  items.forEach(i => {
    const v = evaluate_(i);
    if (v.keep && v.opportunity) byService[v.opportunity] = (byService[v.opportunity] || 0) + 1;
  });
  Logger.log("\nSERVICE OPPORTUNITIES");
  Object.keys(byService).sort((a, b) => byService[b] - byService[a])
        .forEach(k => Logger.log(`  ${String(byService[k]).padStart(4)}  ${k}`));

  safeAlert_(
    `Preview: ${items.length} fetched, ${kept} would be saved.\n\n` +
    "Per-item scoring, per-source health and the service-opportunity mix are in\n" +
    "Extensions > Apps Script > Executions."
  );
}


// ════════════════════════════════════════════════════════════════
//  SHEET SETUP + MIGRATION
// ════════════════════════════════════════════════════════════════

/**
 * Returns the spreadsheet this script is attached to, with a readable error
 * instead of a TypeError from somewhere deep in a helper.
 */
function getSpreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error(
      "No spreadsheet is attached to this script. This project has to be " +
      "container-bound: open your Google Sheet, then Extensions > Apps Script, " +
      "and paste the code there. A standalone Apps Script project has no " +
      "active spreadsheet."
    );
  }
  return ss;
}

/** The functions that are meant to be run directly (used in error messages). */
const ENTRY_POINTS = [
  "smokeTest", "auditFeeds", "previewScoring", "runDailyIntentScrape",
  "migrateSheet", "setupSheet", "createDailyTrigger", "backfillCompanyNames"
];

function getOrCreateSheet_(ss, name) {
  // The trailing "_" makes this private, so it no longer appears in the Run
  // dropdown and can't be invoked bare — which is what produced the opaque
  // "Cannot read properties of undefined". Kept as an invariant check.
  if (!name) {
    throw new Error(
      "getOrCreateSheet_() is an internal helper and can't be run on its own.\n\n" +
      "Run one of these instead:\n  " +
      ENTRY_POINTS.join("\n  ") +
      "\n\nStart with auditFeeds() — it checks every source and writes no leads."
    );
  }
  ss = ss || getSpreadsheet_();

  let sheet = ss.getSheetByName(name);
  if (sheet) return sheet;

  sheet = ss.insertSheet(name);

  if (name === CONFIG.SHEETS.LEADS) {
    writeLeadsHeaders_(sheet);
  } else if (name === CONFIG.SHEETS.LOG) {
    sheet.getRange(1, 1, 1, 4).setValues([["Timestamp", "Status", "Source", "Details"]]);
    styleHeader_(sheet.getRange(1, 1, 1, 4));
    sheet.setFrozenRows(1);
  } else if (name === CONFIG.SHEETS.ALERTS) {
    sheet.getRange(1, 1, 1, 4).setValues([["Label", "Query", "Engine", "Status"]]);
    styleHeader_(sheet.getRange(1, 1, 1, 4));
  }

  return sheet;
}

function styleHeader_(range) {
  range.setBackground("#0f0f0d").setFontColor("#00e5a0")
       .setFontFamily("Courier New").setFontSize(10).setFontWeight("bold");
}

function writeLeadsHeaders_(sheet) {
  sheet.getRange(1, 1, 1, LEAD_HEADERS.length).setValues([LEAD_HEADERS]);
  styleHeader_(sheet.getRange(1, 1, 1, LEAD_HEADERS.length));
  sheet.setFrozenRows(1);
  applyLeadsFormatting_(sheet);
}

function applyLeadsFormatting_(sheet) {
  const widths = [110, 90, 60, 180, 140, 160, 180, 170, 200, 300, 300, 90, 110, 200, 110, 90, 160, 150,
                  140, 200, 420];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["New", "Researching", "Outreach Sent", "Replied", "Meeting Booked", "Not a Fit", "Closed Won"], true)
    .build();
  sheet.getRange("M2:M5000").setDataValidation(statusRule);

  const rules = [
    SpreadsheetApp.newConditionalFormatRule().whenTextContains("🔥 Hot")
      .setBackground("#fff0eb").setRanges([sheet.getRange("A2:U5000")]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains("⚡ Warm")
      .setBackground("#ebf0ff").setRanges([sheet.getRange("A2:U5000")]).build()
  ];
  sheet.setConditionalFormatRules(rules);
}

/**
 * Run this ONCE on an EXISTING v1 sheet. Adds the three new columns
 * (Segment / Intent / Domain) and re-applies formatting WITHOUT touching
 * your existing lead rows. Use this instead of setupSheet() — setupSheet()
 * wipes the tab.
 */
function migrateSheet() {
  const ss    = getSpreadsheet_();
  const sheet = getOrCreateSheet_(ss, CONFIG.SHEETS.LEADS);

  const width = Math.max(sheet.getLastColumn(), 1);
  if (sheet.getMaxColumns() < LEAD_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), LEAD_HEADERS.length - sheet.getMaxColumns());
  }

  sheet.getRange(1, 1, 1, LEAD_HEADERS.length).setValues([LEAD_HEADERS]);
  styleHeader_(sheet.getRange(1, 1, 1, LEAD_HEADERS.length));
  sheet.setFrozenRows(1);
  applyLeadsFormatting_(sheet);

  getOrCreateSheet_(ss, CONFIG.SHEETS.LOG);

  safeAlert_(
    "✅ Migration complete.\n\n" +
    `Leads sheet now has ${LEAD_HEADERS.length} columns (was ${width}).\n` +
    "Existing rows are untouched; Segment / Intent / Domain are blank for them.\n\n" +
    "Next:\n" +
    "1. Run auditFeeds() to confirm every source is alive\n" +
    "2. Run previewScoring() to sanity-check MIN_SCORE\n" +
    "3. Run createDailyTrigger()"
  );
}

/**
 * Fresh setup. WARNING: clears the Leads tab. On an existing sheet with data,
 * use migrateSheet() instead.
 */
function setupSheet() {
  const ss = getSpreadsheet_();

  let leadsSheet = ss.getSheetByName(CONFIG.SHEETS.LEADS);
  if (!leadsSheet) {
    leadsSheet = ss.insertSheet(CONFIG.SHEETS.LEADS);
  } else {
    leadsSheet.clearContents();
    leadsSheet.clearFormats();
    leadsSheet.setConditionalFormatRules([]);
  }
  writeLeadsHeaders_(leadsSheet);

  // Alert Sources tab is just a readable inventory of what the scraper queries.
  let alertSheet = ss.getSheetByName(CONFIG.SHEETS.ALERTS);
  if (!alertSheet) alertSheet = ss.insertSheet(CONFIG.SHEETS.ALERTS);
  else alertSheet.clearContents();

  alertSheet.getRange(1, 1, 1, 4).setValues([["Label", "Query / Endpoint", "Engine", "Segment"]]);
  styleHeader_(alertSheet.getRange(1, 1, 1, 4));

  const rows = [];
  CONFIG.NEWS_QUERIES.forEach(q => {
    rows.push([q.label, q.q,
               q.enabled === false ? "Google News RSS (OFF — measured 0 qualified)"
                                   : "Google News RSS", q.segment]);
    if (q.enabled !== false && CONFIG.USE_BING && q.bing) {
      rows.push([q.label, q.q, "Bing News RSS", q.segment]);
    }
  });
  if (CONFIG.USE_HN_WHO_IS_HIRING) rows.push(["HN Who is hiring", "Algolia API — latest thread", "Hacker News API", "saas"]);
  if (CONFIG.USE_WWR) {
    CONFIG.WWR_FEEDS.forEach(f => rows.push([f.label, f.slug + ".rss", "WeWorkRemotely RSS", f.segment]));
  }
  if (CONFIG.USE_REMOTIVE) rows.push(["Remotive", "remote-jobs?limit=" + CONFIG.REMOTIVE_LIMIT, "Remotive API", "saas"]);
  if (CONFIG.USE_JOBICY) {
    CONFIG.JOBICY_QUERIES.forEach(q => rows.push([q.label, "industry=" + q.industry, "Jobicy API", q.segment]));
  }
  CONFIG.LEGACY_ALERT_FEEDS.forEach(f => rows.push([f.label, f.url, f.enabled ? "Google Alerts (on)" : "Google Alerts (OFF — returns 0)", f.segment]));

  alertSheet.getRange(2, 1, rows.length, 4).setValues(rows);
  [220, 520, 200, 90].forEach((w, i) => alertSheet.setColumnWidth(i + 1, w));

  let logSheet = ss.getSheetByName(CONFIG.SHEETS.LOG);
  if (!logSheet) logSheet = ss.insertSheet(CONFIG.SHEETS.LOG);
  else logSheet.clearContents();
  logSheet.getRange(1, 1, 1, 4).setValues([["Timestamp", "Status", "Source", "Details"]]);
  styleHeader_(logSheet.getRange(1, 1, 1, 4));
  logSheet.setFrozenRows(1);
  [160, 80, 240, 460].forEach((w, i) => logSheet.setColumnWidth(i + 1, w));

  ss.setActiveSheet(leadsSheet);
  ss.moveActiveSheet(1);

  safeAlert_(
    "✅ Setup complete — no Google Alerts setup required.\n\n" +
    `${rows.length} sources configured (Google News, Bing News, HN, Remotive).\n\n` +
    "Next:\n" +
    "1. auditFeeds()        — confirm every source is alive\n" +
    "2. previewScoring()    — dry run, tune MIN_SCORE\n" +
    "3. runDailyIntentScrape() — real run\n" +
    "4. createDailyTrigger()   — automate at 8am"
  );
}


// ════════════════════════════════════════════════════════════════
//  BACKFILL — repair rows already written to the sheet
// ════════════════════════════════════════════════════════════════

/**
 * Re-runs cleanText_ + extractCompanyName_ over rows that are already saved.
 *
 * Improving the extractor only helps future runs; the rows already in the sheet
 * keep whatever v1 (or an older v2) produced. This walks the Leads tab and:
 *
 *   1. Cleans Headline and Snippet on rows written before the HTML fix — the
 *      pre-Aug-2026 rows still carry raw "<b>" and "&#39;".
 *   2. Re-extracts Company wherever it is still "— extract manually —",
 *      using the cleaned headline.
 *
 * Never overwrites a company you typed in by hand: a row is only touched when
 * its Company is empty or the placeholder. Safe to run repeatedly.
 */
function backfillCompanyNames() {
  const sheet   = getOrCreateSheet_(null, CONFIG.SHEETS.LEADS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    safeAlert_("Nothing to backfill — the Leads sheet has no rows yet.");
    return { scanned: 0, named: 0, cleaned: 0 };
  }

  const COMPANY = 3, HEADLINE = 9, SNIPPET = 10;   // 0-based, per LEAD_HEADERS
  const width  = Math.min(sheet.getLastColumn(), LEAD_HEADERS.length);
  const range  = sheet.getRange(2, 1, lastRow - 1, width);
  const values = range.getValues();

  let named = 0, cleaned = 0, touched = 0;
  const examples = [];

  values.forEach(row => {
    const rawHeadline = String(row[HEADLINE] || "");
    const rawSnippet  = String(row[SNIPPET]  || "");
    const headline    = cleanText_(rawHeadline);
    const snippet     = cleanText_(rawSnippet);

    let changed = false;
    if (headline !== rawHeadline) { row[HEADLINE] = headline; changed = true; }
    if (snippet  !== rawSnippet)  { row[SNIPPET]  = snippet;  changed = true; }
    if (changed) cleaned++;

    const company = String(row[COMPANY] || "").trim();
    if (!company || company.indexOf("extract manually") !== -1) {
      const found = extractCompanyName_(headline, "");
      if (found) {
        row[COMPANY] = found;
        changed = true;
        named++;
        if (examples.length < 5) examples.push(found + "  ←  " + headline.substring(0, 60));
      }
    }

    if (changed) touched++;
  });

  if (touched) range.setValues(values);
  SpreadsheetApp.flush();

  const msg =
    "Backfill complete.\n\n" +
    (lastRow - 1) + " rows scanned\n" +
    named   + " company names recovered\n" +
    cleaned + " rows had leftover HTML cleaned out\n" +
    (examples.length ? "\nExamples:\n  " + examples.join("\n  ") : "");

  safeAlert_(msg);
  return { scanned: lastRow - 1, named: named, cleaned: cleaned };
}


// ════════════════════════════════════════════════════════════════
//  TRIGGER + HELPERS
// ════════════════════════════════════════════════════════════════

function createDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "runDailyIntentScrape") ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger("runDailyIntentScrape").timeBased().everyDays(1).atHour(8).create();

  safeAlert_("✅ Daily trigger created.\n\nRuns every day at 8am. Digest goes to " +
            CONFIG.NOTIFICATION_EMAIL + ".");
}

/**
 * Reports a result without ever blocking the execution.
 * Full text goes to the Logger (Executions view); a one-line summary goes to a
 * non-blocking toast on the sheet. Detail for auditFeeds()/runDailyIntentScrape()
 * also lands in the Run Log tab, which is the copy worth reading.
 */
function safeAlert_(msg) {
  // ALWAYS log first — this is the copy that survives.
  Logger.log(msg);

  // Never use SpreadsheetApp.getUi().alert() here. When a function is run from
  // the Apps Script editor, getUi() does NOT throw: it succeeds and renders a
  // modal in the SPREADSHEET tab, then blocks waiting for a click. If you're
  // looking at the editor rather than the sheet, nothing clicks it and the
  // execution hangs until the 6-minute quota kills it — which is exactly what
  // happened to auditFeeds() (audit table logged, then 6 min of nothing, then
  // "Exceeded maximum execution time"). toast() is non-blocking.
  try {
    const firstLine = String(msg).split("\n").filter(l => l.trim())[0] || "Done";
    getSpreadsheet_().toast(firstLine.substring(0, 250), "Intent Scraper", 8);
  } catch (e) {
    // No spreadsheet UI available (e.g. a time-based trigger). The log is enough.
  }
}

/** Convenience menu so you can run the diagnostics without the script editor. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Intent Scraper")
    .addItem("Run now", "runDailyIntentScrape")
    .addSeparator()
    .addItem("Smoke test (is anything hanging?)", "smokeTest")
    .addItem("Audit feeds (what's alive?)", "auditFeeds")
    .addItem("Preview scoring (dry run)", "previewScoring")
    .addSeparator()
    .addItem("Migrate existing sheet", "migrateSheet")
    .addItem("Backfill missing company names", "backfillCompanyNames")
    .addItem("Install daily trigger", "createDailyTrigger")
    .addToUi();
}
