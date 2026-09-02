# PixlerLab Intent Scraper - Phase 1 Expansion

## Objective

Update the existing Google Apps Script lead scraper to expand PixlerLab's lead coverage beyond SaaS/Tech + Healthcare.

**This is Phase 1 only. Keep the current Apps Script + Google Sheets architecture. Do NOT migrate to Python, Supabase, Neon, or add paid APIs.**

The purpose of this phase is to test which categories and buying signals actually produce good PixlerLab prospects before rebuilding the system later.

The current scraper already has the correct high-level architecture:

- Google News RSS as the primary engine
- HN Who Is Hiring as a job signal
- intent scoring separate from segment classification
- hard intent gate
- company-level and headline deduplication
- US targeting
- per-segment quotas
- source diagnostics / Run Log
- Google Sheets as the current output

Preserve those strengths.

---

# 1. Core Principle

Do NOT turn industry/category keywords into intent points.

Keep:

**INTENT = why this company may need development now**

**SEGMENT = what industry/type of company it is**

For example:

- "Healthcare" = segment
- "Raised Series A" = intent
- "Hiring React developers" = intent + technology signal
- "Migrating to Shopify Plus" = intent + service signal
- "Launching mobile app" = intent + service signal
- "Legacy modernization" = intent + service signal

Industry/category must remain a tag and must contribute **ZERO direct intent points**.

This is important because the existing v2 scraper was deliberately changed to stop healthcare/vertical synonyms from artificially inflating scores.

---

# 2. New Segments to Add

Add these segment tags to `SEGMENT_KEYWORDS`.

## Priority 1

### ecommerce

Keywords should include concepts such as:

- ecommerce
- e-commerce
- Shopify
- Shopify Plus
- DTC
- direct-to-consumer
- online retailer
- online retail
- ecommerce brand
- consumer brand
- digital commerce
- online store
- WooCommerce
- Magento

### ai

Keywords should include:

- artificial intelligence
- AI
- generative AI
- GenAI
- AI startup
- AI SaaS
- AI agents
- agentic AI
- LLM
- large language model
- machine learning
- ML
- AI platform
- AI software
- AI automation
- AI-powered

Do not use a bare substring search for `ai` where it can create false matches such as "said", "maintain", etc. Use proper word-boundary matching where appropriate.

### startup

Keywords:

- startup
- startup company
- venture-backed
- venture backed
- early-stage
- early stage
- funded startup
- technology startup
- emerging company
- newly funded

### mobile

Keywords:

- mobile app
- mobile application
- iOS app
- Android app
- iOS
- Android
- React Native
- Flutter
- mobile platform
- mobile product
- app development

### fintech

Keywords:

- fintech
- financial technology
- payments
- payment platform
- lending platform
- banking technology
- digital banking
- wealthtech
- insurtech
- financial platform

### real_estate

Keywords:

- real estate
- property technology
- proptech
- property management
- property platform
- real estate platform
- real estate software
- property portal
- tenant platform
- leasing platform

## Priority 2

### logistics

Keywords:

- logistics
- transportation
- fleet management
- delivery platform
- dispatch software
- route optimization
- warehouse management
- transportation management
- supply chain software
- logistics platform

### edtech

Keywords:

- edtech
- education technology
- learning platform
- LMS
- learning management system
- online learning
- tutoring platform
- education platform
- student portal

### retail

Keywords:

- retail
- retail technology
- retail platform
- retail software
- point of sale
- POS platform
- consumer retail

### manufacturing

Keywords:

- manufacturing software
- manufacturing technology
- industrial software
- industrial technology
- factory automation
- production management
- manufacturing platform

### hospitality

Keywords:

- hospitality technology
- hotel technology
- hotel software
- hotel platform
- restaurant technology
- booking platform
- travel technology
- travel platform

## Keep Existing

Do not remove:

- `health`
- `saas`

Healthcare should remain supported, but it should no longer dominate simply because there are many healthcare synonyms.

---

# 3. Add New Intent Groups

Expand `INTENT_GROUPS`.

The current intent architecture should remain. Each intent group fires at most once.

Add these groups.

## Shopify / Ecommerce Opportunity

Suggested weight: **4**

Signals:

- Shopify migration
- Shopify Plus migration
- migrating to Shopify
- migrate to Shopify
- WooCommerce to Shopify
- Magento to Shopify
- Shopify redesign
- Shopify replatform
- ecommerce replatform
- ecommerce migration
- ecommerce redesign
- Shopify development
- Shopify integration
- Shopify app
- Shopify launch
- ecommerce platform launch

Important:

Do not give points merely because an article mentions "Shopify".

There must be an actual action/opportunity.

---

## Mobile App Opportunity

Suggested weight: **3**

Signals:

- launches mobile app
- launching mobile app
- new mobile app
- mobile application launch
- launches iOS app
- launches Android app
- mobile app development
- mobile app redesign
- app modernization
- mobile platform launch
- React Native development
- Flutter development

Again, a generic article about mobile apps should not qualify.

---

## Developer Hiring

Suggested weight: **4**

Expand the existing hiring logic to detect:

- React developer
- React engineer
- React Native developer
- React Native engineer
- Node.js developer
- Node.js engineer
- Node developer
- Python developer
- Python engineer
- Laravel developer
- Laravel engineer
- PHP developer
- Shopify developer
- Shopify engineer
- mobile developer
- mobile engineer
- iOS developer
- Android developer
- Flutter developer
- frontend developer
- backend developer
- full-stack developer
- software engineer
- AI engineer
- ML engineer
- LLM engineer
- data engineer
- automation engineer

The goal is to identify companies that may have immediate development capacity requirements.

Do not score generic "hiring" by itself.

---

## Product / Platform Launch

Suggested weight: **2**

Expand beyond the existing product launch terms.

Signals:

- launches new platform
- launches new product
- launches software platform
- launches application
- launches mobile app
- unveils platform
- unveils new product
- introduces platform
- introduces new software
- beta launch
- product launch
- new digital platform
- customer portal launch

Avoid overly generic "launches" matching unrelated news.

---

## Software Modernization

Suggested weight: **3**

Signals:

- legacy modernization
- software modernization
- application modernization
- legacy application
- legacy software
- technology modernization
- digital transformation
- application transformation
- cloud migration
- application migration
- platform migration
- replatforming
- replatform
- tech stack overhaul
- technology overhaul
- system modernization

This should be especially useful because it can map to React, Node, Python, Laravel, mobile, APIs, and cloud work.

---

## AI Adoption / AI Integration

Suggested weight: **3**

Expand current AI Initiative coverage.

Signals:

- adopting AI
- AI adoption
- AI integration
- integrating AI
- AI implementation
- implements AI
- deploys AI
- AI deployment
- AI automation
- AI agents
- deploys AI agents
- launches AI platform
- launches AI-powered product
- adds AI features
- introduces AI features
- AI transformation
- AI roadmap
- AI strategy
- AI initiative

Do not score a company simply because it is described as an AI company.

---

## Funding

Keep the existing Funding group.

Expand coverage to include:

- pre-seed
- preseed
- seed
- seed round
- Series A
- Series B
- Series C
- Series D
- venture round
- funding round
- raised
- raises
- secures funding
- closes funding
- investment round
- venture funding

Funding remains one of the strongest buying signals.

---

## Engineering Team Expansion

Suggested weight: **2**

Signals:

- expanding engineering team
- growing engineering team
- expanding development team
- engineering hiring
- engineering expansion
- doubles engineering team
- builds engineering team
- new engineering hub
- technology team expansion
- product team expansion

Avoid scoring generic company headcount growth.

---

# 4. Add Technology / Service Detection

Do NOT make technology itself an intent score.

Add a separate technology/service classification field if the current row structure allows it without breaking existing sheets.

Possible values:

- Shopify
- React
- React Native
- Node.js
- Python
- Laravel
- PHP
- Flutter
- iOS
- Android
- AI/LLM
- API/Integration
- Full Stack
- Mobile
- Ecommerce
- Custom Software
- Software Modernization

For example:

**Signal:** "Company X hires React engineers"

Result:

- Segment: SaaS
- Intent: Developer Hiring
- Technology: React
- Opportunity: React Development

**Signal:** "Company Y migrates WooCommerce store to Shopify Plus"

Result:

- Segment: Ecommerce
- Intent: Shopify/Ecommerce Opportunity
- Technology: Shopify
- Opportunity: Shopify Migration

If adding columns is risky for the existing sheet, do not break the sheet. At minimum include the detected technology/service in the existing `Reason` or `Intents` output.

---

# 5. Add Service Opportunity Classification

This is important for PixlerLab.

For every qualified lead, attempt to identify the most likely PixlerLab service.

Possible values:

- Shopify Development
- Ecommerce Development
- AI Development
- AI Integration
- React Development
- Node.js Development
- Python Development
- Laravel Development
- Mobile App Development
- React Native Development
- Flutter Development
- Custom Software Development
- Software Modernization
- API / Integration Development
- Dedicated Development Team

This should be derived from the actual signal.

Examples:

### Funding + React hiring

Opportunity:

`React / Full-Stack Development`

### Shopify migration

Opportunity:

`Shopify Development / Migration`

### AI product launch

Opportunity:

`AI Development / Integration`

### Mobile app launch

Opportunity:

`Mobile App Development`

### Legacy modernization

Opportunity:

`Software Modernization`

Do not invent a service if there is no clear signal.

---

# 6. Add Recommended Outreach Angle

If practical within the current script, add a field called:

`Recommended Outreach`

This should be short and based on the actual trigger.

Examples:

### Developer hiring

"Company is hiring React engineers. Pitch outsourced React development capacity to accelerate the roadmap."

### Funding

"Company recently raised funding. Pitch product development support to help turn the new capital into faster product execution."

### Shopify migration

"Company appears to be migrating to Shopify Plus. Pitch Shopify migration, customization, and integrations."

### AI launch

"Company is launching an AI product. Pitch AI/LLM engineering and product development support."

### Mobile launch

"Company is launching a mobile product. Pitch React Native/mobile development support."

### Modernization

"Company is modernizing its technology stack. Pitch application modernization and full-stack engineering support."

Keep this deterministic/template-based in Phase 1. Do NOT add an LLM/API just for this.

---

# 7. Expand Google News Queries

Add queries to `NEWS_QUERIES`.

The goal is not to create hundreds of queries.

Start with approximately 2-4 focused queries per major segment.

## Ecommerce / Shopify

Examples:

- `"Shopify Plus" migration OR replatform OR redesign when:14d`
- `Shopify migration OR "WooCommerce to Shopify" when:14d`
- `ecommerce replatform OR ecommerce redesign when:14d`
- `ecommerce funding OR ecommerce startup raises when:7d`

## AI

Examples:

- `AI startup raises funding when:7d`
- `"AI-powered" launches platform when:14d`
- `company "adopts AI" OR "AI integration" when:14d`
- `"AI agents" launches OR funding when:14d`

## Startups / Funding

Examples:

- `startup "Series A" raises when:7d`
- `startup "Series B" raises when:7d`
- `startup "seed round" raises when:7d`
- `"emerges from stealth" startup when:14d`

## Developer Hiring

Use headline-shaped searches where possible:

- `"hiring React developer" OR "hiring React engineer" when:14d`
- `"hiring Node.js" OR "hiring Python developer" when:14d`
- `"hiring software engineers" startup when:14d`
- `"hiring AI engineer" startup when:14d`

## Mobile

Examples:

- `"launches mobile app" startup when:14d`
- `"launches iOS app" OR "launches Android app" when:14d`
- `"mobile app" startup raises when:14d`

## Modernization

Examples:

- `"legacy modernization" company when:14d`
- `"application modernization" company when:14d`
- `"cloud migration" company software when:14d`
- `"digital transformation" company platform when:14d`

## Fintech

Examples:

- `fintech startup raises funding when:7d`
- `fintech launches platform when:14d`
- `fintech hiring engineers when:14d`

## Real Estate

Examples:

- `proptech startup raises funding when:7d`
- `"real estate platform" launches when:14d`
- `"property management software" startup raises when:14d`

## Logistics

Examples:

- `logistics startup raises funding when:7d`
- `"logistics platform" launches when:14d`
- `"fleet management" software startup when:14d`

## EdTech

Examples:

- `edtech startup raises funding when:7d`
- `"learning platform" launches startup when:14d`
- `education technology startup funding when:14d`

Do not blindly add every possible keyword to every query. Keep queries focused so source quality can be measured.

---

# 8. Important: Do Not Create 14 Equal Quotas

The existing code currently applies a segment quota and has:

- `MAX_SEGMENT_SHARE`
- `MIN_PER_SEGMENT`
- `MAX_LEADS_PER_RUN`

With many more segments, the current `MIN_PER_SEGMENT = 4` can become problematic.

For Phase 1:

**Do not force a minimum of 4 leads for every segment.**

If a segment has no good leads, it should simply produce zero leads.

Recommended behavior:

- Rank all qualified leads globally by score.
- Apply the maximum segment share.
- Do NOT manufacture a minimum quota.
- Do not downgrade a good lead merely because another segment has fewer leads.

If changing the quota function is necessary, make it a quality-first quota rather than a guaranteed-per-segment quota.

Target:

**30 excellent leads > 60 leads padded with weak leads.**

---

# 9. Preserve US Targeting

Keep the existing US geography logic.

Do not weaken the current hard rejection system just to get more volume.

The goal is still US prospects.

However, avoid rejecting a genuine US company merely because the article mentions international expansion.

Keep the current distinction between:

- hard non-US signals
- soft non-US signals
- positive US signals

---

# 10. Preserve Existing Anti-Noise Rules

Do not remove the current:

- disqualify list
- stock-market publisher filtering
- wrong-buyer filtering
- publisher protection
- recency filtering
- company deduplication
- URL deduplication
- headline fingerprinting
- job-specific handling
- source statistics

The goal is to **add coverage without bringing back the noise that v2 was designed to remove.**

---

# 11. Improve Job Board Technology Coverage

The current job board logic is heavily AI/ML oriented.

Expand it to detect PixlerLab's full development capabilities.

Relevant job title patterns should include:

- React
- React Native
- Node.js
- Node
- Python
- Django
- Flask
- Laravel
- PHP
- Shopify
- Full Stack
- Frontend
- Backend
- Software Engineer
- Mobile Engineer
- iOS
- Android
- Flutter
- AI
- ML
- LLM
- Automation
- Integration
- Platform Engineer
- Data Engineer

Important:

A job posting is an explicit budget signal, so this is one of the highest-value parts of the scraper.

Do not require the job to contain AI/ML anymore.

---

# 12. Segment Priority

Use these priorities conceptually for testing:

### Tier 1

- ecommerce
- ai
- startup
- saas
- mobile

### Tier 2

- health
- fintech
- real_estate
- logistics
- edtech

### Tier 3

- retail
- manufacturing
- hospitality

Priority should influence query volume and testing, not artificially inflate lead scores.

---

# 13. Do Not Add More Complexity Than Necessary

This is Phase 1.

Do NOT add:

- OpenAI API
- Claude API
- paid enrichment
- Apollo
- Hunter
- Clearbit
- Supabase
- Neon
- external databases
- complex scraping infrastructure
- vector databases
- embeddings
- AI classification

We are intentionally keeping this zero-cost and inside Apps Script for validation.

---

# 14. Add Better Run Log Diagnostics

The existing Run Log is useful.

Extend source diagnostics so we can see:

- fetched
- qualified
- rejected
- segment
- intent
- technology/service if available

For example:

`GNews: Shopify Migration | fetched 25 | qualified 4`

`GNews: React Hiring | fetched 31 | qualified 7`

This will help determine which categories are actually worth keeping.

---

# 15. Add a Preview / Test Capability

Do not remove the existing `previewScoring()`.

Improve it so it can help inspect examples from the new categories.

For each candidate, ideally show:

- title
- company
- segment
- score
- intents
- technology
- service opportunity
- reason
- keep/reject

This will allow manual review before changing `MIN_SCORE`.

---

# 16. Important Scoring Guidance

Do not let one article stack points simply because it contains many synonyms.

Each intent group should fire once.

Suggested weights:

| Intent | Weight |
|---|---:|
| Funding | 4 |
| Developer Hiring | 4 |
| Shopify / Ecommerce Opportunity | 4 |
| AI Hiring | 4 |
| AI Initiative / Adoption | 3 |
| Software Modernization | 3 |
| Mobile App Opportunity | 3 |
| New Leadership | 3 |
| Product / Platform Launch | 2 |
| Engineering Expansion | 2 |

Keep the existing bonuses for:

- real company
- known domain
- recent publication
- US marker

Keep penalties for:

- non-US soft signals
- sponsored/press-release content
- acquisitions
- layoffs/bankruptcy

Do not make category keywords score points.

---

# 17. Critical Quality Rule

A company should only become a lead when there is evidence that **something is happening now that could create a development requirement**.

Good:

> "Startup X raises $8M Series A"

Good:

> "Startup X hiring 4 React engineers"

Good:

> "Brand X migrates from WooCommerce to Shopify Plus"

Good:

> "Company X launches AI-powered platform"

Good:

> "Company X begins legacy application modernization"

Bad:

> "AI market expected to grow 40%"

Bad:

> "Best Shopify apps for ecommerce"

Bad:

> "Healthcare AI trends for 2026"

Bad:

> "What is React Native?"

Bad:

> "Top fintech startups to watch"

The scraper should prefer **company action** over **topic relevance**.

---

# 18. Do Not Break Existing Sheet Compatibility

Before changing columns:

1. Inspect `setupSheet()`
2. Inspect `migrateSheet()`
3. Inspect `buildLeadRow_()`
4. Inspect `backfillCompanyNames()`
5. Inspect digest generation
6. Inspect any code that assumes fixed column positions

If adding new columns is safe, add:

- Technology
- Service Opportunity
- Recommended Outreach

If adding columns risks breaking existing data or migration, keep the existing schema and put the additional information into existing fields.

Do not wipe existing leads.

Do not require the user to recreate the spreadsheet.

---

# 19. Deliverables

After implementation, provide:

### A. Updated Apps Script

The complete updated code, not only snippets.

### B. Change summary

List exactly what changed.

### C. New segments

List all added segments.

### D. New intent groups

List all added intent groups and weights.

### E. New queries

List the new Google News queries.

### F. Testing instructions

Tell me exactly which functions to run in what order.

Prefer:

1. `previewScoring()`
2. inspect results
3. `auditFeeds()`
4. run the real scraper
5. inspect Run Log
6. adjust `MIN_SCORE` only if necessary

### G. Do not change the architecture

This task is strictly Phase 1 validation.

---

# 20. Success Criteria

The update is successful if:

1. The scraper covers substantially more PixlerLab-relevant opportunities.
2. Shopify/ecommerce opportunities are detected.
3. AI opportunities are detected.
4. Developer hiring across PixlerLab's stack is detected.
5. Mobile opportunities are detected.
6. Startup/funding signals are detected.
7. Software modernization opportunities are detected.
8. Fintech, real estate, logistics and EdTech are available as secondary segments.
9. Industry keywords do not add intent points.
10. Topic articles do not become leads merely because they contain category keywords.
11. US filtering still works.
12. Existing deduplication still works.
13. Existing healthcare and SaaS coverage is preserved.
14. The system does not force weak leads to satisfy segment quotas.
15. The existing Google Sheet continues to work.
16. No paid APIs or external services are introduced.

---

# Final instruction to Claude

Treat the existing Apps Script as a working production prototype.

**Do not rewrite it unnecessarily.**

Make the smallest clean changes required to expand coverage and improve lead classification.

The goal of Phase 1 is not to build the perfect lead intelligence platform.

The goal is to answer:

> **Which PixlerLab buying signals and categories consistently produce high-quality US software-development prospects?**

Once we have that data, we will use the winning signals to design the future Python + Supabase version.
