# Sales CRM — intent leads dashboard

A Next.js dashboard over the leads that `AS/Code.gs` (the intent-signal scraper)
writes into the **Leads** tab of the spreadsheet each morning.

The sheet stays the source of truth. This app reads it and writes back to it —
nothing is duplicated into a second database.

```
Google News / HN / alerts
        │
        ▼
   Code.gs  (daily 8am trigger)
        │  appends rows A–R
        ▼
  Leads sheet ◄──────────────┐
        │                    │ writes (status, notes, contact)
        │ reads              │
        ▼                    │
   Api.gs  (web app, JSON) ──┘
        │  token-authenticated
        ▼
  Next.js route handlers  ──►  Dashboard (React)
```

The Apps Script token lives only in the Next.js server process. The browser
talks to `/api/leads`, never to Google directly.

---

## Setup

### 1. Add the API to your Apps Script project

Open the spreadsheet → **Extensions → Apps Script**. Add a second script file
(**Files → + → Script**), name it `Api`, and paste in the contents of
`../px-sales/AS/Api.gs`. Save.

`Code.gs` is untouched — `Api.gs` only reads `CONFIG` and `LEAD_HEADERS` from it.

### 2. Generate the shared secret

Pick `setupApi` in the Run dropdown and run it. Authorise when prompted, then
open **View → Logs** and copy the line that reads:

```
SHEETS_API_TOKEN=abc123...
```

### 3. Deploy as a web app

**Deploy → New deployment → type: Web app**

| Setting         | Value    |
| --------------- | -------- |
| Execute as      | Me       |
| Who has access  | Anyone   |

"Anyone" is required for a server-to-server call, and is safe here because every
request must carry the token from step 2 — without it the API returns 401.

Copy the `/exec` URL.

> After any future edit to `Api.gs` you must redeploy
> (**Deploy → Manage deployments → ✏️ → Version: New version**), otherwise the
> live URL keeps serving the old code.

### 4. Configure and run

```bash
cp .env.example .env.local   # already done if .env.local exists
```

```dotenv
SHEETS_API_URL=https://script.google.com/macros/s/AKfy.../exec
SHEETS_API_TOKEN=abc123...
NEXT_PUBLIC_SHEET_URL=https://docs.google.com/spreadsheets/d/1fdygmk.../edit
```

`NEXT_PUBLIC_SHEET_URL` is only the href of the "Open sheet" button. No data
flows through it — the two `SHEETS_API_*` values are what reach the sheet.

```bash
npm run dev
```

Open http://localhost:3000. If the credentials are missing or wrong, the page
shows these setup steps instead of an empty table.

### Developing against a scratch tab

To build against throwaway data — so collaborators never see real leads — add
an optional `SHEETS_TAB` and restart:

```dotenv
SHEETS_TAB="Copy of Leads"
```

The dashboard then reads *and writes* that tab, while `Code.gs` keeps appending
real leads to the live `Leads` tab on its usual schedule. Delete the line and
restart to go back to live data; nothing else changes. Requires the `tab`
support added to `Api.gs` — redeploy it with **Version: New version** first.

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
the sheet rejects it.

### What can be edited

Only these six columns, enforced on both sides (`EDITABLE_FIELDS` here,
`API_EDITABLE` in `Api.gs`):

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

Status values match the sheet's own data validation list from
`applyLeadsFormatting_()`, so a status set here still passes it.

### Rows that move

Updates send both the sheet row number and a content fingerprint (`key`, derived
from Source URL). `Api.gs` verifies the fingerprint before writing and falls back
to scanning for it — so if you sort or insert rows in the Sheet directly, an edit
still lands on the right lead instead of overwriting its new neighbour.

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
    setup-notice.tsx      shown when the sheet isn't connected
  lib/
    sheets.ts             server-only client for the Apps Script web app
    types.ts              Lead shape, statuses, priority thresholds
    format.ts             hydration-safe date and URL helpers
```

`src/lib/types.ts` is the contract with the sheet. If you add a column in
`Code.gs`, update `LEAD_HEADERS` there, `API_FIELDS` in `Api.gs`, and `Lead`
here.

---

## Caching

The lead list is fetched with a 60-second ISR window tagged `leads`. The Refresh
button bypasses it (`/api/leads?fresh=1`), and a successful write expires the tag
so a reload shows the change immediately.

## Scripts

```bash
npm run dev     # dev server
npm run build   # production build
npm run lint    # eslint
npx tsc --noEmit
```
