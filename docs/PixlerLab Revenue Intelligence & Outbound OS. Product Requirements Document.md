# PixlerLab Revenue Intelligence & Outbound OS

## Product Requirements Document

**Product:** PixlerLab Revenue Intelligence & Outbound OS  
**Company:** PixlerLab  
**Version:** 1.0  
**Date:** August 2026  
**Primary implementation partner:** Claude + PixlerLab engineering team

---

# 1. Executive Summary

PixlerLab currently generates a significant portion of its new business through Upwork. The company has a 20-person delivery team and wants to build a predictable, diversified sales pipeline that does not depend on a single marketplace.

PixlerLab has already built several pieces of an internal sales infrastructure:

- Automated Google-based lead discovery
- Detection of companies hiring AI developers
- Detection of recently funded companies
- Healthcare company discovery
- A custom Shopify data-generation system built with Apify
- Shopify store intelligence including products, themes, apps, activity, catalog size, contact information and lead scoring
- Email verification
- Instantly for outbound email campaigns
- Multiple warmed email mailboxes and domains
- A CRM containing lead intelligence
- Direct email functionality inside the CRM
- Automated 5-step email sequences
- Lead scoring
- Google Sheets-based data collection for some sources

The objective of this project is to combine these capabilities into a single intelligent system.

The system should evolve from a traditional CRM into a **Revenue Intelligence & Outbound Operating System**.

The system should answer five questions automatically:

1. **Who should PixlerLab contact?**
2. **Why should PixlerLab contact them now?**
3. **What should PixlerLab offer them?**
4. **How should PixlerLab approach them?**
5. **Did that activity generate revenue?**

The long-term objective is to create a predictable acquisition engine capable of continuously generating qualified opportunities for PixlerLab's development team.

---

# 2. Product Vision

## Vision

Build an internal AI-powered revenue OS that continuously discovers companies with relevant buying signals, enriches and scores them, identifies likely technical/business opportunities, routes them into the correct campaign, executes personalized outreach, manages follow-ups, learns from outcomes and measures the resulting revenue.

The system should eventually operate as:

```text
DISCOVER
    ↓
IDENTIFY
    ↓
ENRICH
    ↓
UNDERSTAND
    ↓
SCORE
    ↓
FIND OPPORTUNITY
    ↓
SELECT OFFER
    ↓
GENERATE MESSAGE
    ↓
OUTREACH
    ↓
CAPTURE RESPONSE
    ↓
QUALIFY
    ↓
SALES
    ↓
PROJECT
    ↓
REVENUE
    ↓
LEARNING LOOP
```

The system should become increasingly intelligent as PixlerLab accumulates its own historical sales data.

---

# 3. Business Objectives

## Primary objective

Create a predictable sales pipeline that significantly reduces PixlerLab's dependency on Upwork.

## Secondary objectives

### 3.1 Diversify lead sources

Support multiple acquisition channels:

- AI hiring signals
- Recent funding
- Shopify
- Healthcare
- Digital agencies
- WordPress
- WooCommerce
- SaaS
- General technology companies
- Future sources

### 3.2 Improve lead quality

Prioritize companies based on:

- Buying intent
- Company fit
- Service fit
- Pain signals
- Business quality
- Timing
- Contactability

### 3.3 Increase outbound efficiency

Allow a small sales team to manage a large number of highly relevant prospects.

### 3.4 Improve personalization

Messages should be generated from actual company intelligence rather than generic templates.

### 3.5 Build institutional knowledge

Every successful and unsuccessful outreach should improve future lead scoring, campaign selection and messaging.

### 3.6 Connect sales activity to revenue

The system must eventually answer:

> Which lead source, trigger, campaign, offer and message generated revenue?

---

# 4. Core Product Principles

## Principle 1. Intent over volume

The objective is not to collect the largest number of companies.

The objective is to identify companies that have a reason to buy PixlerLab services.

---

## Principle 2. Trigger-based outbound

Every outbound lead should ideally have a reason for contact.

Examples:

- Hiring AI developers
- Recently raised funding
- Rapid product expansion
- Large Shopify catalog
- Shopify performance issue
- Multiple Shopify apps
- Agency without development capability
- New technology initiative
- Hiring engineering team
- Expansion into new market

---

## Principle 3. One lead. One source of truth.

Google Sheets, Apify, Instantly and other systems should not become separate databases.

The CRM should become the canonical system of record.

---

## Principle 4. AI assists humans. It does not blindly replace them.

High-value leads should receive human review.

Low-risk, high-volume segments can be automated.

---

## Principle 5. Every decision should be explainable.

If the system says:

> "This is an 89/100 opportunity."

It should explain why.

---

## Principle 6. Revenue is the ultimate feedback signal.

Open rates and clicks are secondary.

The system should optimize toward:

```text
Positive Reply
→ Meeting
→ Qualified Opportunity
→ Proposal
→ Won
→ Revenue
→ Gross Margin / Client Value
```

---

# 5. PixlerLab Service Catalog

The system must maintain a structured service catalog.

Initial services:

### Web Development

- WordPress development
- Custom WordPress development
- WordPress plugin development
- WordPress theme development
- WordPress troubleshooting
- WordPress performance optimization
- WooCommerce development
- WooCommerce customization

### Shopify

- Shopify development
- Shopify theme development
- Shopify theme customization
- Shopify app development
- Shopify integrations
- Shopify performance optimization
- Shopify migration
- Shopify custom functionality
- Shopify catalog optimization

### Custom Development

- PHP
- Laravel
- React
- Node.js
- APIs
- Third-party integrations
- Custom software
- SaaS development

### AI

- AI application development
- AI integrations
- AI automation
- AI engineering
- AI development teams
- AI MVP development
- LLM integrations

### Agency Services

- White-label development
- White-label WordPress
- White-label Shopify
- White-label WooCommerce
- White-label custom development
- Development overflow teams

### Healthcare

- Healthcare software
- Healthcare portals
- Healthcare integrations
- Custom healthcare applications
- AI healthcare applications

The service catalog must be editable by administrators.

---

# 6. Lead Sources

The system must support pluggable lead sources.

## Source A. Google Intent Engine

Current functionality:

- Companies hiring AI developers
- Recently funded companies
- Healthcare companies
- Other Google-discovered opportunities

The new system should ingest this automatically.

---

## Source B. Shopify Intelligence Engine

Current Apify system.

Example data:

```json
{
  "source": "shop.app",
  "name": "Fresh Beauty Co. New Zealand",
  "websiteUrl": "https://freshbeautyco.co.nz",
  "productCount": 25001,
  "collectionCount": 5006,
  "theme": {
    "name": "The-one-beauty - No app product filter",
    "schemaName": "Prestige",
    "schemaVersion": "4.11.0",
    "isCustomTheme": true
  },
  "apps": [
    {
      "app": "Klaviyo",
      "category": "email"
    }
  ],
  "rating": 4.6765,
  "totalProductRatings": 102,
  "storefrontReachable": true,
  "catalogAvailable": true,
  "primaryEmail": "support@freshbeautyco.co.nz",
  "leadScore": 87
}
```

The system must preserve the raw source data while also generating normalized fields.

---

## Source C. Agency Discovery

Potential sources:

- Google
- LinkedIn
- Agency directories
- Clutch
- Agency websites
- Other future sources

Target:

Digital agencies that may require white-label development.

---

## Source D. Future Sources

Architecture must allow additional lead sources without rebuilding the CRM.

Examples:

- LinkedIn signals
- Job boards
- Product Hunt
- Crunchbase-style funding data
- Technology detection
- Website changes
- Hiring changes
- News
- Government/company registries
- Ecommerce platforms
- Competitor intelligence

---

# 7. Canonical Lead Model

Every source should normalize into the same Lead model.

## Company

```text
company_id
company_name
legal_name
website
domain
industry
sub_industry
country
state
city
company_size
estimated_revenue
description
linkedin_url
social_profiles
source
created_at
updated_at
```

## Contact

```text
contact_id
company_id
name
first_name
last_name
job_title
email
email_status
email_confidence
linkedin_url
phone
decision_maker_score
```

## Technology

```text
technology_id
company_id
platform
framework
cms
ecommerce_platform
theme
theme_version
apps
technology_signals
```

## Intent

```text
intent_score
intent_type
intent_strength
intent_detected_at
intent_source
intent_expiry
```

## Opportunity

```text
opportunity_score
service_fit_score
pain_score
timing_score
company_fit_score
contactability_score
recommended_service
recommended_campaign
recommended_persona
```

## Outreach

```text
campaign_id
sequence_id
channel
first_contact_at
last_contact_at
next_contact_at
touch_count
reply_status
reply_sentiment
meeting_status
```

## Revenue

```text
opportunity_id
deal_value
currency
proposal_value
closed_value
deal_status
won_date
lost_date
service_sold
lead_source
campaign
```

---

# 8. Lead Deduplication

This is mandatory.

The same company may appear from:

- Google
- Shopify
- LinkedIn
- Funding
- Hiring
- Agency discovery

The system must merge these into one company.

Example:

```text
Company:
ABC Technologies

Signals:
AI Hiring
+
$8M Funding
+
React/Node
+
Recent product launch
```

Do not create four leads.

Create one company with four signals.

---

# 9. Intent Engine

This is one of the most important components.

The system should detect buying signals.

## Initial intent categories

### Hiring intent

Examples:

- Hiring AI developer
- Hiring WordPress developer
- Hiring Shopify developer
- Hiring React developer
- Hiring Laravel developer
- Hiring software engineers

### Funding intent

Examples:

- Raised seed
- Raised Series A
- Raised Series B
- Recently funded

### Growth intent

Examples:

- Rapid hiring
- New market
- Product expansion
- New website
- New ecommerce store

### Technology intent

Examples:

- Shopify
- WooCommerce
- WordPress
- React
- Laravel
- AI
- APIs

### Ecommerce intent

Examples:

- Large catalog
- Large number of variants
- Heavy app usage
- Custom theme
- Poor performance
- Active catalog expansion

### Agency intent

Examples:

- Offers marketing
- Offers SEO
- Offers PPC
- Offers branding
- Does not appear to have significant development capability

---

# 10. Intent Scoring

Each signal should receive a configurable score.

Example:

```text
Hiring AI developer              +35
Hiring 3+ engineers              +45
Raised funding <30 days          +40
Raised funding <90 days          +25
Large Shopify catalog            +20
Shopify performance problem      +25
Custom Shopify theme             +10
Multiple apps                    +10
Recent website activity          +10
Strong business reputation       +10
Verified decision maker          +15
```

Scores should not be hardcoded permanently.

Administrators must be able to change weights.

---

# 11. Opportunity Score

Separate:

**Lead Quality**

from:

**Buying Intent**

from:

**PixlerLab Opportunity**

Final score:

```text
Opportunity Score =
Company Fit
+
Intent
+
Pain
+
Service Fit
+
Timing
+
Contactability
```

Score:

**0-100**

Categories:

```text
90-100 = Hot
75-89  = High
60-74  = Medium
40-59  = Low
0-39   = Ignore
```

---

# 12. Pain Detection Engine

The system should identify likely problems.

## Shopify examples

- Poor performance
- Huge catalog
- Complex filtering
- Large number of variants
- App dependency
- Custom theme
- Theme customization
- Large JS payload
- Mobile UX issues
- Broken functionality
- Search problems

## WordPress examples

- Slow website
- Old WordPress version
- Plugin conflicts
- Poor mobile performance
- WooCommerce
- Broken functionality
- Outdated theme
- Custom functionality needs

## AI hiring

Pain hypothesis:

> The company is actively hiring technical talent and may benefit from outsourced engineering capacity.

## Funding

Pain hypothesis:

> The company has fresh capital and may need additional engineering capacity to accelerate product development.

The system must label these as **hypotheses**, not facts.

---

# 13. Opportunity Recommendation Engine

The system should recommend:

### Who to contact

Examples:

- Founder
- CEO
- CTO
- Head of Engineering
- Ecommerce Director
- Head of Marketing
- Agency Owner

### What to sell

Example:

```text
Recommended service:
Shopify Performance Optimization

Reason:
25K+ products
+
large catalog
+
custom theme
+
large ecommerce operation
```

### Why now

Example:

```text
Store is actively publishing products
and has a large catalog.
```

### Recommended approach

Example:

```text
Offer a short technical audit.
Avoid generic development pitch.
```

---

# 14. Campaign Router

The system automatically assigns leads to campaigns.

Example rules:

```text
IF AI hiring detected
→ AI Engineering Campaign

IF recent funding AND technology company
→ Funded Company Campaign

IF Shopify AND product_count > 5000
→ Large Shopify Campaign

IF Shopify AND performance issue
→ Shopify Performance Campaign

IF agency AND no obvious development offering
→ White-label Agency Campaign

IF healthcare AND software opportunity
→ Healthcare Development Campaign
```

A lead can belong to multiple potential campaigns, but the system must select:

**Primary Campaign**

and optionally:

**Secondary Campaign**

---

# 15. Campaign Types

Initial campaigns:

## Campaign 1. White-label Agencies

ICP:

Digital marketing agencies.

Offer:

White-label technical delivery.

---

## Campaign 2. Shopify Performance

ICP:

Shopify stores with detectable performance opportunities.

Offer:

Shopify performance optimization.

---

## Campaign 3. Large Shopify Stores

ICP:

Large Shopify catalogs.

Offer:

Custom Shopify development and optimization.

---

## Campaign 4. Shopify Custom Development

ICP:

Stores with complex requirements.

Offer:

Custom Shopify functionality.

---

## Campaign 5. AI Hiring

ICP:

Companies actively hiring AI engineers.

Offer:

AI development capacity / engineering team.

---

## Campaign 6. Recently Funded

ICP:

Recently funded technology companies.

Offer:

Product engineering capacity.

---

## Campaign 7. Healthcare

ICP:

Healthcare businesses with software opportunities.

Offer:

Healthcare software development.

---

# 16. AI Personalization Engine

The system should generate personalized outreach using structured facts.

Inputs:

```text
Company
Industry
Trigger
Intent
Technology
Pain signals
Recent events
Contact
Recommended service
Campaign
PixlerLab capabilities
```

The AI must follow these rules:

### Rule 1

Never invent facts.

### Rule 2

Only use verified data.

### Rule 3

Do not mention internal scoring.

### Rule 4

Do not over-personalize with irrelevant information.

### Rule 5

The opening sentence should explain why the company was selected.

### Rule 6

The offer should directly relate to the detected trigger.

### Rule 7

Avoid generic agency language.

---

# 17. Personalization Levels

## Level A. Automated

For large campaigns.

Uses verified company facts.

---

## Level B. AI-reviewed

AI generates message and assigns confidence.

Human can approve.

---

## Level C. Human-assisted

For high-value leads.

CRM displays:

```text
Why this lead
What we detected
What we should sell
Suggested opening
Suggested email
Suggested LinkedIn message
```

Salesperson edits and sends.

---

# 18. Email Infrastructure

The system must support:

### Instantly

For automated outbound sequences.

### CRM direct email

For manual/high-value outreach.

The CRM should track:

- Sent
- Delivered
- Bounced
- Replied
- Positive reply
- Negative reply
- Interested
- Meeting requested
- Meeting booked
- Not now
- Unsubscribe
- Wrong person
- Lost

---

# 19. Sequence Management

Campaigns should support multiple sequences.

Example:

```text
Email 1
↓
Wait
↓
Email 2
↓
Wait
↓
Email 3
↓
Wait
↓
Email 4
↓
Email 5
```

Sequence timing must be configurable.

The system should prevent additional outreach when:

- Prospect replies
- Prospect unsubscribes
- Prospect becomes qualified
- Meeting booked
- Deal created
- Manual stop requested

---

# 20. Reply Intelligence

Incoming replies should be classified automatically.

Categories:

```text
Positive
Interested
Question
Meeting request
Pricing request
Not now
Negative
Unsubscribe
Wrong person
Out of office
Referral
Spam
Unknown
```

AI should also extract:

```text
Intent
Objection
Requested service
Timeline
Budget if explicitly stated
Next action
```

Example:

> "We're interested but probably next quarter."

System:

```text
Classification:
Not now

Intent:
Positive

Timeline:
Next quarter

Action:
Follow up in 60 days
```

---

# 21. Sales Workflow

CRM pipeline:

```text
New
↓
Contacted
↓
Replied
↓
Positive
↓
Qualified
↓
Meeting
↓
Proposal
↓
Negotiation
↓
Won
↓
Lost
```

Each stage should have:

- Owner
- Timestamp
- Value
- Next action
- Next action date
- Notes

---

# 22. AI Sales Assistant

Every lead should have an AI-generated summary.

Example:

```text
WHY THIS LEAD MATTERS

Fresh Beauty Co. is a large Shopify ecommerce operation
with 25K+ products and a custom Prestige-based theme.

Signals:
• Large catalog
• Active publishing
• Custom theme
• International shipping
• Strong product/review activity

Recommended service:
Shopify performance/custom development

Recommended persona:
Head of Ecommerce / CTO / Founder

Recommended approach:
Lead with technical observation rather than generic development offer.

Opportunity:
High
```

---

# 23. Daily Sales Command Center

The CRM home screen should answer:

## Today's Opportunities

```text
🔥 14 Hot leads
🟠 31 High-value leads
💰 7 recently funded
🤖 12 AI hiring
🛒 25 Shopify opportunities
🤝 9 agency opportunities
```

---

# 24. Daily Action Queue

The system should automatically create today's actions.

Example:

```text
TODAY

1. Contact 5 hot Shopify leads
2. Follow up with 12 positive replies
3. Respond to 4 interested prospects
4. Review 8 AI hiring leads
5. Follow up with 3 proposals
6. Call 2 qualified opportunities
```

The salesperson should not have to manually search for what to do.

---

# 25. Revenue Dashboard

Management dashboard should display:

### Pipeline

- Total pipeline value
- Qualified pipeline
- Proposal pipeline
- Weighted pipeline

### Acquisition

- Leads discovered
- Leads contacted
- Replies
- Positive replies
- Meetings
- Proposals
- Wins

### Conversion

- Reply rate
- Positive reply rate
- Meeting rate
- Proposal rate
- Close rate

### Revenue

- Won revenue
- Revenue by source
- Revenue by campaign
- Revenue by service
- Revenue by salesperson

---

# 26. Source Attribution

Every opportunity must preserve its origin.

Example:

```text
Source:
Shopify Apify

Trigger:
Large Shopify catalog

Campaign:
Shopify Large Catalog

Service:
Custom Shopify Development

Deal:
$8,500

Status:
Won
```

The system should eventually answer:

> How much revenue came from Shopify?

> How much came from AI hiring?

> How much came from funding signals?

> Which campaign has the highest close rate?

> Which trigger produces the highest average project value?

---

# 27. Campaign Analytics

Every campaign should have:

```text
Prospects
Delivered
Replies
Positive replies
Meetings
Proposals
Wins
Revenue
Average deal value
Cost
ROI
```

Most important metric:

**Revenue per 1,000 prospects**

and eventually:

**Revenue per $1 spent on acquisition.**

---

# 28. Learning Engine

The system should learn from historical outcomes.

For example:

If:

```text
AI hiring + US SaaS
```

produces significantly more wins than:

```text
AI hiring + small businesses
```

the system should increase the priority of the first segment.

Similarly:

If:

```text
Shopify + >10K products + performance issue
```

produces more revenue than:

```text
Shopify + generic development
```

the system should prioritize that segment.

The system must **not automatically change critical scoring rules without approval**.

Instead:

```text
AI recommendation:

"Shopify stores with >10K products generated
3.4x higher positive reply rate than stores with
500-2K products.

Recommendation:
Increase segment priority."
```

Admin approves.

---

# 29. Lead Quality Feedback

Salespeople should be able to mark:

```text
Good lead
Bad lead
Wrong company
Wrong contact
Poor intent
Excellent opportunity
Already has developer
Not relevant
```

These labels should feed back into the scoring model.

---

# 30. CRM Data Architecture

Recommended high-level structure:

```text
companies
contacts
leads
lead_sources
signals
technologies
opportunities
campaigns
sequences
messages
activities
replies
meetings
proposals
deals
revenue
tasks
users
service_catalog
scoring_rules
ai_recommendations
```

Avoid putting everything into one giant `leads` table.

---

# 31. Event-Based Architecture

Important events should be recorded.

Examples:

```text
lead.discovered
lead.enriched
lead.scored
signal.detected
campaign.assigned
email.sent
email.delivered
email.replied
reply.classified
meeting.booked
proposal.created
deal.won
deal.lost
```

This will make future analytics and AI capabilities much easier.

---

# 32. API Requirements

The system should expose APIs for:

### Lead ingestion

```text
POST /leads
POST /companies
POST /signals
```

### Enrichment

```text
POST /leads/:id/enrich
```

### Scoring

```text
POST /leads/:id/score
```

### Campaigns

```text
POST /campaigns
POST /campaigns/:id/assign
```

### Outreach

```text
POST /leads/:id/send
POST /leads/:id/sequence
```

### Reply

```text
POST /messages/inbound
POST /replies/classify
```

### Revenue

```text
POST /opportunities
POST /deals
POST /revenue
```

Exact endpoint naming may be adapted to the existing architecture.

---

# 33. Integration Requirements

## Required

### Apify

Shopify lead discovery.

### Instantly

Outbound sequences and email infrastructure.

### Google Sheets

Existing lead ingestion should continue temporarily.

Long-term, CRM should become primary storage.

### Email provider

For CRM direct email.

### Calendar

For meeting booking and tracking.

---

# 34. AI Architecture

The AI layer should not be a single giant prompt.

Create separate AI tasks.

### Agent 1. Lead Analyst

Determines:

> Is this company worth pursuing?

### Agent 2. Intent Analyst

Determines:

> Why might they need us now?

### Agent 3. Opportunity Analyst

Determines:

> What can PixlerLab sell them?

### Agent 4. Personalization Agent

Creates:

> Relevant outreach.

### Agent 5. Reply Classifier

Determines:

> What does the prospect's response mean?

### Agent 6. Sales Assistant

Determines:

> What should the salesperson do next?

### Agent 7. Revenue Analyst

Determines:

> What patterns are producing revenue?

---

# 35. AI Guardrails

AI must never:

- Invent company information
- Invent funding
- Invent hiring activity
- Claim a technical issue without evidence
- Pretend PixlerLab performed an audit if it did not
- Make unsupported revenue claims
- Send high-risk messages automatically without approval
- Ignore unsubscribe requests

All factual personalization should reference structured source data.

---

# 36. Human Approval Modes

Campaigns should have:

### Auto

AI can generate and send within configured rules.

### Review

AI generates. Human approves.

### Manual

AI assists but human sends.

Default:

**New campaigns should start in Review mode.**

Only proven campaigns should move toward Auto.

---

# 37. Lead Lifecycle

```text
DISCOVERED
↓
ENRICHED
↓
QUALIFIED
↓
SCORED
↓
CAMPAIGN ASSIGNED
↓
READY
↓
CONTACTED
↓
REPLIED
↓
QUALIFIED OPPORTUNITY
↓
MEETING
↓
PROPOSAL
↓
WON / LOST
```

---

# 38. Lead Suppression

The system must automatically suppress:

- Unsubscribed contacts
- Invalid emails
- Hard bounces
- Existing clients where inappropriate
- Existing active opportunities
- Existing conversations
- Duplicate contacts
- Companies explicitly marked "Do Not Contact"

Suppression must work across every campaign.

---

# 39. Existing Client Protection

Before sending any automated email, check:

```text
Is this company already a client?
Is this company already an opportunity?
Has someone contacted them recently?
Is there an active conversation?
Is the contact already in another campaign?
```

If yes, automatically prevent duplicate outreach.

---

# 40. Account-Level Intelligence

The company should be the primary intelligence entity.

A company may have:

```text
5 contacts
3 buying signals
2 campaigns
1 active opportunity
1 previous lost deal
1 existing client relationship
```

The AI should see the entire company context.

---

# 41. Contact-Level Intelligence

For each contact:

```text
Role
Seniority
Department
Likely decision authority
Previous interactions
Email history
LinkedIn
Relationship status
```

The system should prioritize decision makers.

---

# 42. Smart Follow-Up Engine

Instead of blindly following a fixed sequence, eventually allow follow-ups to react to context.

Example:

```text
No response
→ continue sequence

Positive response
→ stop sequence

Question
→ stop automated sequence + notify salesperson

Not now
→ schedule future follow-up

Referral
→ create new contact

Unsubscribe
→ suppress
```

---

# 43. Opportunity Memory

If a company previously said:

> "We're currently working with another development agency."

Store that.

Six months later:

> "Their previous agency relationship ended."

The system can surface:

**Reactivation Opportunity**

---

# 44. Sales Intelligence Timeline

Every company should have a timeline:

```text
Aug 1
Raised $5M

Aug 5
Started hiring AI engineers

Aug 10
PixlerLab discovered lead

Aug 11
Email sent

Aug 14
Positive reply

Aug 18
Meeting

Aug 22
Proposal $12,000

Aug 30
Won $10,000
```

This becomes extremely valuable.

---

# 45. Search

CRM search should support natural-language queries.

Examples:

> "Show Shopify stores with more than 10,000 products in the US."

> "Show companies that raised funding in the last 30 days and are hiring engineers."

> "Show agencies contacted more than 30 days ago with no response."

> "Show all healthcare companies with high opportunity scores."

---

# 46. AI Natural Language Interface

Eventually allow:

> "Find me 20 leads I should contact today."

The system should return:

```text
1. Company A
   Why:
   Raised $12M + hiring AI engineers

   Recommended:
   AI development team

2. Company B
   Why:
   Shopify 15K products + performance issue

   Recommended:
   Shopify optimization
```

Another example:

> "Why has our Shopify campaign underperformed?"

AI should analyze:

- Segment
- Copy
- Sending volume
- Replies
- Lead quality
- Offer
- Industry
- Geography

and provide recommendations.

---

# 47. Management Command Center

Management should see:

## Pipeline Health

```text
Current qualified pipeline
Expected revenue
Pipeline coverage
```

## Acquisition

```text
Leads discovered today
Leads discovered this week
```

## Intent

```text
AI hiring
Funding
Shopify
Healthcare
Agency
```

## Sales

```text
Meetings
Proposals
Wins
```

## Revenue

```text
Won this month
Won this quarter
Pipeline
```

---

# 48. Capacity Planning

Because PixlerLab has a sizeable delivery team, eventually connect sales pipeline with delivery capacity.

Example:

```text
Current team capacity:
3 WordPress teams
2 Shopify teams
1 AI team
```

If pipeline shows:

```text
Shopify:
$60K pipeline

WordPress:
$15K pipeline

AI:
$90K pipeline
```

Management can identify where hiring or allocation may be necessary.

---

# 49. Recommended Development Phases

## Phase 1. Foundation

Duration:

**1-2 weeks**

Build:

- Unified company model
- Unified contact model
- Lead ingestion
- Deduplication
- Source tracking
- Existing CRM migration
- Basic scoring

---

## Phase 2. Intelligence

Duration:

**2-3 weeks**

Build:

- Intent engine
- Signal engine
- Opportunity scoring
- Service matching
- Campaign routing
- AI lead summaries

---

## Phase 3. Outreach

Duration:

**2-3 weeks**

Build:

- Instantly integration
- CRM email
- Sequence management
- Suppression
- Reply ingestion
- Reply classification
- Follow-up tasks

---

## Phase 4. Sales OS

Duration:

**2-3 weeks**

Build:

- Pipeline
- Meetings
- Proposals
- Deal tracking
- Revenue attribution
- Sales dashboard
- Daily action queue

---

## Phase 5. Intelligence Loop

Duration:

**3-4 weeks**

Build:

- Campaign analytics
- Revenue analytics
- AI recommendations
- Historical learning
- Segment performance
- Offer performance
- Natural-language CRM queries

---

# 50. MVP Definition

Do NOT attempt to build the entire vision initially.

The MVP must achieve:

```text
Lead discovered
↓
Company created
↓
Contact created
↓
Signal detected
↓
Opportunity score
↓
Recommended service
↓
Recommended campaign
↓
AI personalization
↓
Human approval
↓
Email sent
↓
Reply captured
↓
Reply classified
↓
Salesperson notified
```

If this loop works reliably, the foundation is successful.

---

# 51. MVP Dashboard

Minimum dashboard:

### Today's Leads

- New
- High intent
- Hot

### Today's Actions

- Follow-ups
- Replies
- Meetings
- Manual reviews

### Campaign Performance

- Sent
- Replies
- Positive replies
- Meetings

### Pipeline

- Qualified
- Proposal
- Won
- Revenue

---

# 52. Database Priority

Do not destroy the existing CRM.

The implementation should first map the current database and identify:

- Existing tables
- Existing fields
- Existing relationships
- Current lead ingestion
- Google Sheets integration
- Email infrastructure
- Authentication
- User permissions
- Existing CRM workflows

Then produce a migration plan.

Claude must inspect the existing codebase before implementing major architectural changes.

---

# 53. Implementation Rules for Claude

Claude should follow these rules.

### Rule 1

Do not rewrite the existing application unnecessarily.

### Rule 2

Reuse existing components wherever possible.

### Rule 3

Before changing database architecture, inspect current schema.

### Rule 4

Do not remove existing functionality without explicit approval.

### Rule 5

Implement features incrementally.

### Rule 6

Every major feature should have tests.

### Rule 7

Every AI decision should have an explanation.

### Rule 8

Keep AI prompts/versioning separate from application logic.

### Rule 9

All external API calls must have error handling and retry logic.

### Rule 10

Every important action should create an audit/event record.

---

# 54. Security

The system contains sensitive business information.

Requirements:

- Role-based access
- Secure API keys
- Encrypt sensitive credentials
- Never expose API keys in frontend
- Audit logs
- Authentication
- Authorization
- Secure webhook validation
- Rate limiting
- Input validation
- Email sending safeguards

---

# 55. Reliability

Every integration should handle:

- API failures
- Rate limits
- Duplicate webhooks
- Network errors
- Partial imports
- Invalid records
- Email provider failures

Lead ingestion must be idempotent.

Running the same source twice should not create duplicate companies.

---

# 56. Observability

Admin should be able to see:

```text
Last Google ingestion
Last Apify run
Number of leads discovered
Number of leads imported
Number rejected
Number duplicated
Number enriched
Number scored
Number assigned to campaigns
Number sent
Number failed
```

---

# 57. Key KPIs

The system should ultimately optimize:

## Top-of-funnel

- Leads discovered
- Qualified leads
- High-intent leads

## Outreach

- Delivery rate
- Positive reply rate
- Meeting rate

## Sales

- Qualified opportunity rate
- Proposal rate
- Close rate

## Revenue

- Revenue per lead
- Revenue per campaign
- Revenue per source
- Revenue per 1,000 prospects
- Average deal value
- Customer acquisition cost
- ROI

## Business

- Pipeline coverage
- Expected revenue
- Won revenue
- Revenue by service
- Revenue by source

---

# 58. Strategic Lead Sources Priority

Initial priority:

### Tier 1

**AI hiring**

Very strong buying signal.

**Recently funded companies**

Strong timing signal.

**White-label agencies**

Strong recurring revenue potential.

### Tier 2

**Large Shopify stores**

Strong service fit.

**Shopify pain signals**

Strong personalization opportunity.

### Tier 3

**Healthcare**

Potentially high-value but requires more precise qualification.

### Tier 4

General company discovery.

Use only when the system has insufficient higher-intent leads.

---

# 59. Recommended CRM Navigation

## Dashboard

Revenue command center.

## Leads

All companies and contacts.

## Hot Leads

High-intent opportunities.

## Signals

Recent buying signals.

## Campaigns

Outbound campaigns.

## Inbox

Replies and conversations.

## Opportunities

Sales pipeline.

## Companies

Company intelligence.

## Tasks

Today's actions.

## Analytics

Performance and revenue.

## AI Assistant

Natural-language interface.

## Settings

Scoring, campaigns, services, integrations.

---

# 60. Long-Term Vision

The final system should eventually be capable of this:

At 8:00 AM, PixlerLab's sales team opens the CRM.

The system says:

> **Good morning. I found 47 new opportunities overnight.**

> 8 are high-intent.

> 3 companies raised funding and are hiring engineers.

> 2 agencies appear to need white-label development.

> 3 Shopify stores have strong technical opportunities.

Then:

> **These are the 10 companies I recommend contacting today.**

For each:

```text
Company
Why now
Detected trigger
Evidence
Potential pain
Recommended service
Recommended contact
Recommended campaign
Suggested message
Opportunity score
Estimated deal size
```

The salesperson reviews them.

The system sends the appropriate outreach.

Replies come back.

AI classifies them.

The salesperson handles the opportunities.

Deals are recorded.

Revenue is attributed.

And the system learns.

---

# 61. Ultimate Goal

PixlerLab should eventually move from:

> "Where can we find our next project?"

to:

> **"Which companies are most likely to need PixlerLab right now?"**

And eventually:

> **"The system knows where our next $100K of pipeline is likely to come from."**

That is the actual purpose of this product.

The goal is not to build a better CRM.

The goal is to build a **predictable revenue acquisition machine for PixlerLab.**

---

# 62. Immediate Next Steps

Before asking Claude to implement anything:

### Step 1

Give Claude the existing CRM codebase.

### Step 2

Ask Claude to inspect the architecture without changing anything.

### Step 3

Have Claude produce:

- Current architecture
- Current database schema
- Existing integrations
- Existing CRM functionality
- Technical debt
- Recommended migration plan

### Step 4

Implement Phase 1:

**Unified lead/company/contact architecture.**

### Step 5

Connect:

**Google → CRM**

and

**Apify → CRM**

### Step 6

Build:

**Signals → Intent → Opportunity Score.**

### Step 7

Build:

**Opportunity → Campaign → AI Personalization.**

### Step 8

Connect:

**CRM → Instantly**

### Step 9

Build:

**Reply → AI Classification → Sales Task.**

### Step 10

Build:

**Opportunity → Deal → Revenue → Analytics.**

Only after these are stable should more sophisticated autonomous AI behavior be introduced.

---

# 63. Definition of Success

The product will be considered successful when PixlerLab can reliably execute this workflow:

```text
Company discovered automatically
        ↓
Company enriched automatically
        ↓
Buying signal detected automatically
        ↓
Lead scored automatically
        ↓
Opportunity identified automatically
        ↓
PixlerLab service selected automatically
        ↓
Campaign selected automatically
        ↓
Personalized message generated automatically
        ↓
Human approves or automated campaign sends
        ↓
Reply captured automatically
        ↓
Reply classified automatically
        ↓
Salesperson receives next action
        ↓
Meeting / proposal tracked
        ↓
Deal tracked
        ↓
Revenue attributed
        ↓
Outcome feeds back into intelligence
```

**The loop must close.**

That closed loop is the most important architectural principle of the entire PixlerLab Revenue Intelligence & Outbound OS.