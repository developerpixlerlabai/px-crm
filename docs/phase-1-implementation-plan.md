# Phase 1 Expansion — Implementation Plan

Working plan for `pixlerlab_phase_1_appscript_expansion.md`, reconciled against
`google-app-script/Code.gs` as it actually stands (v3, 2026-09-02).

Read the spec for the *what*. This file records the *decisions*, the places the
spec is wrong about the code, and the order of work.

## Baseline being changed

Measured 2026-09-02, `node google-app-script/test/{test,live}.js`:

| | now | after Phase 1 |
|---|---:|---:|
| segments | 2 (`health`, `saas`) | **13** |
| intent groups | 7 | **10** |
| News queries | 11 | **33 declared, 28 enabled** |
| lead columns | 18 (A–R) | **21 (A–U)** |
| tests | 257 passing | **500** |
| live: fetched / qualified / saved | 600 / 176 / 60 | **1302 / 294 / 60** |

## Decisions taken

**1. Geography: today's v3 model stands. §9 and §16's US instructions are stale.**
The spec describes the scraper as having "US targeting" and never mentions
`NEWS_GEO`, `jobReach_`, WeWorkRemotely, Remotive-re-enabled or Jobicy — it was
written against v2, before the 2026-09-02 change. `NEWS_GEO` stays `"global"`
and the India-reach job gate stays. Everything else in §9/§16 (soft penalties,
company/domain/recency bonuses) is unaffected and stays as written.

**2. `Developer Hiring` and `AI Hiring` merge into one group at weight 4.**
§16's table lists both at 4, and §3 puts `AI engineer / ML engineer / LLM
engineer / data engineer / automation engineer` under Developer Hiring — which
are already AI Hiring's keywords. Keeping both means one HN post saying "hiring
ML engineers" fires two groups for 8 points from a single signal. That is the
synonym stacking §1 and §16 exist to prevent, so the two become one group.
Final count is 10 groups, as §16 intends.

**3. All three columns are added** as S/T/U: `Technology`,
`Service Opportunity`, `Recommended Outreach`.

## Where the spec is wrong about the code

**§8 — there is no minimum quota to remove.** `applySegmentQuota_` computes a
per-segment *ceiling*; `MIN_PER_SEGMENT` only stops that ceiling dropping below
4. Verified: 40 saas + 1 fintech lead yields `{saas: 25, fintech: 1}` and zero
manufactured rows. Nothing is padded and no good lead is downgraded.

The real defect is the inverse. The cap is `0.6 × total qualified`, so at 176
qualified it is 106 per segment and **never binds** — the anti-flood control is
already dead, and 11 more segments will not revive it. Fix: compute the share
against `MAX_LEADS_PER_RUN` (what actually gets saved), not against the
qualified pool.

**§2 and §3 need a matcher change, not just keyword data.** Both
`classifySegment_` and `INTENT_GROUPS` match with bare `indexOf`. The spec warns
about `ai`; the same holds for `ml`, `ios`, `pos`, `retail`, and for the bare
`raises` / `raised` / `seed` it asks to add to Funding at weight 4. Measured
misfires:

```
["ai"]        <- Acme said it would maintain the platform
["ml"]        <- Company unveils HTML and XML tooling
["ai","ios"]  <- Biosolutions raises $4M for chair maintenance
["pos"]       <- Deposit platform expands
["ai","retail"] <- Curetail Health launches portal
["raises"]    <- Regulator raises concerns about AI in hiring
["raised"]    <- Startup raised eyebrows with its pricing
["seed"]      <- Company seeded 40 new stores
```

Word-boundary matching therefore lands **before** any keyword is added (step 1).

## Column safety (§18) — audited, clear

Appending S/T/U is safe. `migrateSheet()` already sizes off
`LEAD_HEADERS.length`. `getSeenKeys_` reads only A–L (`date 0, company 3,
headline 9, url 11`). `backfillCompanyNames` clamps to
`min(lastColumn, LEAD_HEADERS.length)`. `buildLeadRow_` is positional and
appends cleanly.

Only `applyLeadsFormatting_` hardcodes width: an 18-entry `widths` array and two
`A2:R5000` conditional-format ranges. Both must be extended to `U`.

No existing rows are touched; the sheet does not need recreating.

## Order of work

Each step ends green on `node google-app-script/test/test.js` and is measured
with `node google-app-script/test/live.js` before the next one starts.

**1. Word-boundary matcher. — DONE 2026-09-02.** `hasKeyword_` / `findKeyword_`
replace the `indexOf` scan at all 8 semantic keyword call sites
(`INTENT_GROUPS`, `SEGMENT_KEYWORDS`, `DISQUALIFY`, `WRONG_BUYER`, `PENALTIES`,
`NON_US_HARD`, `NON_US_SOFT`, `US_MARKERS`). Publisher-*name* matching
(`PUBLISHERS`, `STOCK_PUBLISHERS`) deliberately stays on substring — a name has
to match inside a longer publication string.

**Leading word edge only.** Measured on 606 live items, anchoring the trailing
edge as well would have lost 17 `startups`, 6 `ml engineers`, 4 `engineering
teams`, 3 `patients`, 3 `medical devices`. These lists depend on stems.

Scope grew beyond the plan for a reason: the differential found three *live*
bugs, not just the anticipated `ai`/`ml` ones — `ngo` matched **ongoing** (a
funded Series B rejected as a non-profit), `rs.` matched **engineers.** (21
items read as rupees), `sar` matched **Samsara**, `apac` matched **capacity**,
`stock` matched **livestock**.

A/B'd against a patched copy over a frozen corpus: **0 lost, 2 rescued, 0 score
changes**, 2 segment retags. Tests 257 → 297. `harness.js` now honours a
`CODE_PATH` env var so this A/B is repeatable for steps 2–6.

**2. Segments and intent groups. — DONE 2026-09-02.** 13 segments, 10 intent
groups. Tests 297 → 377. Frozen-corpus A/B: qualified **372 → 382** (20 lost,
30 gained).

*Decision reversed:* `AI Hiring` and `Developer Hiring` are NOT merged. They
are two groups with **disjoint keyword sets** — asserted in test 40, not just
intended. That satisfies §16's ten groups, removes the 8-points-from-one-phrase
stacking, and keeps the distinction Phase 1 exists to measure: is it the AI
roles or the general engineering roles that convert? Merging would have
answered that by deleting it.

*Segment classification was rewritten, not just extended.* `classifySegment_`
counted keyword hits and took the highest, which hands the tag to whichever
list owns the most synonyms for one phrase. Taken literally the spec added 27
self-overlapping keywords (`"ai"` also matches `"ai platform"`,
`"generative ai"`, `"ai-powered"`…), and `ai` then beat `health` on "Acme
Health raises $18M for its clinical AI platform". Two fixes: every list is now
self-disjoint (asserted), and classification is **first match in declaration
order** — the same at-most-once rule INTENT_GROUPS use. Order is therefore
load-bearing: industries, then `saas`, then the technology tags `ai`/`mobile`,
then `startup` last.

*`ai` and `mobile` sit below the industries* because they describe how a
company builds, not what business it is in, and they co-occur with every
vertical. The technology is not lost — step 4's Technology column is its home.

*Product Launch was de-generalised.* Bare `launches` / `unveils` / `debuts` /
`rolls out` / `ai-powered` are gone, per §3's own "avoid overly generic
launches" and §16's "category keywords must not score". Measured: they were
the only thing qualifying 33 wire releases, whatever those releases launched.
§17's canonical GOOD signal ("launches AI-powered platform") is recovered
through **AI Initiative at 3**, where §3 actually files it.

*Gap found:* coming out of stealth had **no keyword anywhere** despite its own
`NEWS_QUERY`. It was riding on bare `launches` and vanished when that went.
Added to Funding.

*Risk did not materialise.* Score compression was the flagged danger; the
spread improved instead. The score-5 pile fell from 180 to 93 and only 3% sit
at the 10 ceiling. `MIN_SCORE` stays at 5.

*Known dead until step 5:* `Shopify / Ecommerce` and `Mobile App` fire zero
times on the live corpus — there are no ecommerce or mobile News queries yet.
That is a sourcing gap, not a scoring one; test 41 proves the groups work.

**3. Widen the job filters (§11). — DONE 2026-09-02.** Tests 377 → 438.
Live: fetched 605 → 649, qualified 176 → 190, and **every job source improved**.

*Two faults, not one.* `RELEVANT_JOB_TITLE` was too narrow (no React, Python,
PHP, Shopify, DevOps, web developer) and it was also **broken**: `full ?stack`
matches "full stack" and "fullstack" but not **"full-stack"**, the spelling
almost everyone uses, so "Senior React Full-stack Developer" was rejected.
"Front-end", "Back-end" and plain **"Backend Developer"** had no pattern at all.
Between them those are the commonest titles on every remote board. Every role
shape is now hyphen-tolerant. Measured over 285 live postings: **104 → 149
(36% → 52%)**.

Bare `engineer` and bare `developer` are deliberately NOT patterns. What the
filter still refuses is the point, and is asserted: Product Manager, Product
Designer, Customer Support, Mechanical Engineer, Director of Finance, Data
Analyst.

*`HN_KEYWORDS` widened too*, since HN is the largest job source and was equally
AI/ML-bound. It matches whole comments rather than titles, so it is looser by
nature: **98 → 138 of 200** comments on the September 2026 thread, with thread
chatter ("Applied 2 months ago. No response") still falling out. Volume is safe
to raise because `MAX_PER_SOURCE` caps what HN can save at 15 — more candidates
only means a better top 15.

*Consequence handled:* admitting "Software Engineer" admitted research
hospitals and universities with it (St. Jude Children's Research Hospital
scored 8). `WRONG_BUYER` gained institution **phrases** — `research hospital`,
`university of`, `medical center`. Phrases, not bare words: a bare "hospital"
or "university" would also reject `HospitalIQ` and `UniversityNow`, which are
health-tech and edtech vendors and among the best leads in the system. Both
directions asserted in test 44.

Per-source, before → after qualified: WWR Full-Stack 37 → **53** (now the top
source overall), HN 29 → 40, WWR Back-End 4 → 7, Programming 14 → 18, DevOps
2 → 4, Jobicy 2 → 4, Remotive 1 → 3. Segment `mobile` appears for the first
time and `ai` fell from 55% to 45% as general dev work came in.

**4. Columns S/T/U. — DONE 2026-09-02.** 18 → 21 columns, all appended.
`TECHNOLOGIES` is ordered most-specific-first with a `covers` list, so a React
Native role reports "React Native" and not "React Native, React, Mobile"; at
most three are reported. `deriveOpportunity_` maps (technology, intents,
segment) to a service, and returns "" rather than inventing one. Outreach lines
are deterministic templates, per §6's ban on calling an LLM for this.

All five of the spec's own §4/§5 worked examples pass end to end. One of them
did not at first: "Company Y migrates WooCommerce store to Shopify Plus" fired
nothing, because every Shopify keyword assumed the two platform names were
adjacent. Added `store to shopify` and the migration verbs.

Live: 60 saved leads carry 27 "AI Development / Integration", 16 "Custom
Software Development", 10 "Dedicated Development Team", plus Shopify, React
Native, Laravel and Mobile ones.

**5. News queries. — DONE 2026-09-02.** 11 → 33 declared, 28 enabled.
Live: sources 20 → 42, fetched 649 → **1302**, qualified 190 → **294**, in 39s
against a 270s budget. A new `enabled: false` flag switches a query off without
deleting it, so the measurement that killed it stays beside it.

*Five queries measured off.* Three Shopify/ecommerce migration queries fetched
25 items between them and qualified **zero** — and the scoring was right to
refuse all 25. Google News has no Shopify migration *news*, only SEO content
and competitor marketing: "How to Choose a Retail Ecommerce Platform (2026)",
"Top Shopify Development Companies in India for D2C Brands". "Hiring
React/Node" returned literally zero items — newsrooms do not report which
framework a company recruits for.

**That is the Phase 1 answer for those two categories: Shopify and
developer-hiring signals come from job boards, not from news.** Both are
detected — as real reqs ("Senior Shopify Developer"), which is a hiring company
rather than a marketing article. Ecommerce *funding* works, because a round is
an event a newsroom reports rather than a topic an agency blogs about.

Best new queries: Startup Series A (48 qualified), AI Startup Funding (30),
Startup Seed (28), Logistics Funding (11), EdTech Funding (10), Mobile App
Launch (10), Fintech Funding (9).

**6. Quota, Run Log, preview. — DONE 2026-09-02.** Tests 484 → 500.

*Quota* now takes its share of `MAX_LEADS_PER_RUN` rather than of the qualified
pool. The cap fell from **175 to 36** per segment — it had never once bound, so
the anti-flood control was dead. `MIN_PER_SEGMENT` is untouched: it was never
the padding mechanism the spec describes.

*Run Log* gains a real `rejected` count and a reason histogram, e.g.
`fetched 61 · qualified 5 · rejected 56 · low score 29, no trigger event 16,
disqualified 10`. Two fixes in one: it reports what to DO about a bad source
(rewrite the query vs. wrong geography vs. duplicates), and the count now comes
from `evaluate_` instead of `fetched - qualified` — duplicates never reach
`evaluate_`, so that subtraction was blaming the scoring for the deduper's
work. It immediately showed HN losing 97 of 138 to `out of reach` and Jobicy
losing all 49.

*`previewScoring()`* prints technology, service and reject reason per item,
plus per-source health and the service-opportunity mix.

## Risks to watch

**Score compression is already present and will worsen.** `evaluate_` sums the
top 3 groups by weight and clamps to 10. Of 60 leads saved today, 24 score 8+,
36 score 6–7 and **none** score 5. Three more weight-4 groups push more items
into the 10 ceiling and flatten ranking further. Step 2 must re-measure the
distribution; expect to raise `MIN_SCORE`, which §19 anticipates.

**Runtime.** 20 sources currently fetch in ~16s against a 270s budget. Step 5
roughly doubles the request count. `fetchBatch_` is parallel so this should
hold, but it is measured at step 5, not assumed.

## Out of scope (§13)

No OpenAI/Claude API, no paid enrichment, no Apollo/Hunter/Clearbit, no
Supabase/Neon, no external DB, no embeddings or AI classification. Apps Script
and Google Sheets only.
