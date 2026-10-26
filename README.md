# Sales CRM — intent leads dashboard

A Next.js CRM over the intent leads its scraper finds each morning.

Leads live in **Supabase Postgres** (`public.leads`). The scraper
(`src/lib/scraper/`) is a TypeScript port of the old Apps Script
`google-app-script/Code.gs`; a scheduled GitHub Action calls it once a day.

```
Google News / HN / WWR / Remotive / Jobicy / alerts
        │
        ▼
GitHub Actions (02:30 UTC = 08:00 IST)
        │  GET /api/cron/scrape   (Bearer CRON_SECRET)
        ▼
src/lib/scraper  ── score, dedupe, quota ──►  public.leads
        │                                     public.scrape_runs (run log)
        └──►  digest email, via a Gmail mailbox connected in the CRM
                                          │
                        Next.js route handlers  ──►  Dashboard (React)
```

The service key lives only in the Next.js server process. The browser talks to
`/api/leads`, never to Supabase directly, and every table has RLS on with no
policies.

---

## Setup

### 1. Create the tables

In the Supabase SQL editor, run every file in `supabase/migrations/` in order.
`0003_leads.sql` creates `public.leads`, `0004_scrape_runs.sql` the run log.

### 2. Configure and run

```bash
cp .env.example .env.local   # already done if .env.local exists
```

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
```

```bash
npm run dev
```

Open http://localhost:3000. If the credentials are missing or wrong, the page
shows setup steps instead of an empty table.

### 3. Import the existing leads

The import reads the sheet through the old Apps Script web app (`Api.gs`), so
keep its credentials in `.env.local` for now:

```dotenv
SHEETS_API_URL=https://script.google.com/macros/s/AKfy.../exec
SHEETS_API_TOKEN=abc123...
# SHEETS_TAB="Copy of Leads"   # optional: import a different tab
```

```bash
npm run import:sheet
```

It is insert-only: leads already in Supabase are skipped, never overwritten, so
re-running it after each morning's scrape brings new leads across without
touching statuses or notes edited in the dashboard. Edits made in the sheet
after a lead was imported do not come across. `Api.gs` only exposes columns
A–R, so Technology / Service Opportunity / Recommended Outreach arrive empty.

---

## The scraper

`src/lib/scraper/` is `Code.gs` ported to TypeScript: the same sources, keyword
lists, scoring, dedupe and quota. Tuning lives in `config.ts` (sources,
thresholds) and `keywords.ts` (every scoring list); their comments record what
was measured and why each value is what it is. The port was checked against
`Code.gs` on identical inputs — 1,370 live items and all 2,811 stored
headlines — with zero differences.

| | |
| --- | --- |
| `GET /api/cron/scrape` | the real run: saves leads, logs to `scrape_runs`, sends the digest |
| `GET /api/cron/scrape?dry=1` | fetch, dedupe against saved leads, score; returns what *would* be saved |
| `npm run scrape:audit` | local, no server or DB: per-source health and service mix (`-- --items` for every item) |
| `npm test` | offline regression suite against `src/lib/scraper/test/fixtures/` |

Both routes need `Authorization: Bearer $CRON_SECRET`; `/api/cron/*` is exempt
from the login wall for that reason.

### Scheduling

`.github/workflows/scrape.yml` calls the route daily at 08:00 IST and can be
run by hand (Actions → Daily scrape → Run workflow, with an optional dry run).
It needs two repository secrets: `CRM_URL` (the deployed CRM) and `CRON_SECRET`.
Any other scheduler works the same way — it is one authenticated GET.

### Environment

| Variable | |
| --- | --- |
| `CRON_SECRET` | required; long random string (`openssl rand -hex 32`) |
| `APP_URL` | the CRM's URL, for the "Open the CRM" link in the digest |
| `DIGEST_TO` | digest recipient; defaults to `CONFIG.NOTIFICATION_EMAIL` |
| `DIGEST_MAILBOX` | which connected mailbox sends it; defaults to the first with send access |

The digest needs Google OAuth configured and a mailbox connected in the CRM.
Until then runs still save leads, and `scrape_runs.digest` records why the
email was skipped.

---

## What the dashboard does

- **Stat cards** — open leads, hot & open, still untriaged, meetings booked with
  reply rate.
- **Filter** by priority (derived from Score, matching `scoreLabel_`), status,
  segment, signal source, and free-text search across company / headline /
  snippet / signals / notes.
- **Sort** by score, company, date found, or funnel position.
- **Inline status edit** straight from the table row.
- **Detail panel** (click a row) with the full snippet, matched signals, source
  link, and editable contact + notes fields.

Writes are optimistic: the row updates immediately, then reverts with a toast if
the server rejects it.

### What can be edited

Only these six fields, enforced server-side by `EDITABLE_FIELDS` in
`src/lib/types.ts`:

| Column | Field |
| ------ | ----- |
| E | Contact Name |
| F | Title / Role |
| G | Email |
| M | Status |
| N | Notes |
| O | Outreach Sent? |

Everything the scraper produces — Score, Headline, Source URL, Segment, Intent —
is read-only, so a dashboard bug cannot corrupt it.

Status values match the sheet's old data validation list from
`applyLeadsFormatting_()`, so imported and new leads share one vocabulary.

### Lead identity

Each lead is addressed by `key`: its Source URL, or `company|headline` when
there is none. It is a generated, unique column in Postgres, so the scraper,
the import and the dashboard can never compute it differently.

---

## Project layout

```
src/
  app/
    page.tsx              server component; fetches leads for the first paint
    api/leads/route.ts    GET (list) + PATCH (single or bulk update)
  components/
    dashboard.tsx         state, filtering, sorting, optimistic writes
    leads-table.tsx       table + inline status select
    lead-detail-panel.tsx side panel with the editable form
    lead-filters.tsx      search, priority tabs, dropdowns
    stat-cards.tsx        summary tiles
    badges.tsx            priority / status / segment styling
    setup-notice.tsx      shown when Supabase isn't configured
  lib/
    leads.ts              server-only reads and writes on public.leads
    types.ts              Lead shape, statuses, priority thresholds
    format.ts             hydration-safe date and URL helpers
    scraper/              the daily scrape (config, keywords, sources, scoring, digest)
scripts/
  import-sheet.mjs        copies leads from the Google Sheet into Supabase
  scrape-audit.ts         npm run scrape:audit
supabase/migrations/      schema; run in order
```

To expose another column, add it to the migration, to `LeadRow` / `COLUMNS` /
`toLead()` in `src/lib/leads.ts`, and to `Lead` in `src/lib/types.ts`.

---

## Caching

None. The page and `/api/leads` query Postgres on every request, which is fast
enough that the old 60-second ISR window is gone, and a write is visible on the
next read.

## Scripts

```bash
npm run dev     # dev server
npm run build   # production build
npm run lint    # eslint
npm run import:sheet  # copy new leads from the Google Sheet
npm run scrape:audit  # check every scraper source, writes nothing
npm test              # scraper regression suite
npx tsc --noEmit
```
