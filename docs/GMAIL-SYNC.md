# Gmail Sync for px-crm — Phased Implementation Doc

> **Owner:** amanjot · **Created:** 2026-08-17 · **Reference:** `~/Desktop/my-flyCrm/flycrm/GOOGLE-GMAIL-SYNC.md` (FlyCRM, 1882 lines)
> This is the living checklist. Tick each step as it lands. Every phase ends with a **Done when** gate — do not start the next phase until it passes.

## Progress tracker

**Legend:** ⬜ not started · 🟡 in progress · ✅ done · ⛔ blocked · ⏭️ skipped

**Current slice:** label scope — *pick or create a Gmail label, read only that, send through it*.

**State as of 2026-08-17.** Connect works end to end: `kuljeet.pixlerlab@gmail.com` is connected, and Vault-decrypt → token-refresh → Gmail API is verified. Label scope is built and tested against that live mailbox:

| Check | Result |
|---|---|
| `GET /api/mailboxes/:id/labels` on a **readonly** grant | 17 labels, user-created first: `CRM1`, `Crm2` |
| `POST …/labels` on a readonly grant | `403 needsReconnect` with a reconnect message, not a raw Google 403 |
| Save `CRM1` | gate cleared, **13 threads in scope** |
| Save `Crm2` | 0 threads (that label is empty) |
| Save **both** | **13** — the union. A single multi-label request would have returned 0 (the AND trap) |
| Save an empty selection | `synced_label_ids` null, gate stays cleared, no threads — "read nothing" |
| `POST /api/mail/send` without the send scope | `403 needsReconnect` before any Google call |

**Blocked on you:** reconnect that mailbox once to grant `gmail.labels` + `gmail.send`. Until then, selecting labels works but creating and sending do not. Reconnecting revives the same row id.

**Not yet run:** the `labelIds`-on-send experiment (step 10 of the slice) — it needs the send scope. That result decides whether `gmail.modify` is ever required.

| # | Phase / block | Status | Done when |
|---|---|---|---|
| **0** | **Lock the door** — Supabase Auth + middleware gate | ⏭️ **deferred — REQUIRED BEFORE DEPLOY** | `/` redirects when logged out; dashboard unchanged when logged in |
| **1A** | Schema + token vault | ✅ applied and verified | anon key returns zero rows; only `service_role` can decrypt |
| **1B** | Google Cloud setup | 🟡 creds set, **redirect URI not registered** | redirect URI matches env byte for byte |
| **1C** | OAuth layer | ✅ connect verified end to end | `status='connected'`, no plaintext token in any column |
| **1D** | Connect UI on the dashboard | ✅ single account; multi/revive untested | two accounts listed; reconnect revives the same row id |
| **1L** | **Label scope** — pick/create a label, read only it | 🟡 built + tested; needs reconnect for create/send | union count correct; gated mailbox reads nothing |
| **1M** | **Mail view** — read the in-scope threads in the UI | ✅ verified on 13 live threads | list + reader render; bodies sandboxed; out-of-scope 404s |
| **1N** | **Gmail-look pass** — density, names, sanitised reader | ✅ verified on 15 live threads | no entities; real names; body sizes naturally; XSS probes clean |
| **1E** | Per-lead conversation | ⬜ | thread merges across mailboxes; hostile HTML sandboxed |
| **1F** | Reply → Status automation | ⬜ | `Replied` flip works; second run is a no-op |
| **1G** | Tests for pure helpers | ⬜ | `vitest` green |
| **2** | Mirror + search | ⬜ | mail arrives via push within seconds; search returns hits |
| **3** | Send | ⬜ | outreach sends, threads correctly, stamps the sheet |

Update the **Status** cell and the phase heading together, and record anything that diverged from this doc as you go — a stale checklist is worse than none.

## Ground rules

- **No commits.** Leave every change in the working tree; the owner reviews and commits. No `git commit`, no `git push`, no new branches.
- Never add a second write path to the sheet — everything goes through `updateLeads()` in `src/lib/sheets.ts`.
- Secrets stay in `.env.local` (already covered by `.gitignore`'s blanket `.env*`). Never print a token into a log, a chat, or this doc.
- Each phase ends at its **Done when** gate. Stop there, report, and wait rather than rolling into the next phase.

---

## Context

px-crm is a dashboard over a Google Sheet with **no database, no login, and no tenancy**. Leads are scraped into the sheet by Apps Script (`Code.gs`, daily 8am); the app reads and writes 6 whitelisted columns through `src/lib/sheets.ts`. What it cannot show is *what actually happened with a lead* — every reply and every outreach lives in someone's Gmail.

**Goal:** connect **multiple Gmail accounts** so that, per lead, the team sees the real conversation; replies advance the lead's Status automatically; outreach can be sent from the dashboard; and eventually all synced mail is searchable.

The FlyCRM doc is the reference, but it assumes Supabase + RLS + Vault + QStash + Pub/Sub + multi-tenant `space_id`. Most of its bulk — history cursors, backfill windows, thread-level label scoping, idempotency keys — exists purely to maintain a **local mirror of Gmail**. Phase 1 here does not mirror, so that machinery is deferred to Phase 2 rather than ported up front.

### Decisions already taken

| Decision | Choice |
|---|---|
| Where mail lives | Phase 1 read live from Gmail; Phase 2 adds a mirror for search |
| Datastore | Supabase (our own project) |
| Token storage | Supabase Vault, encrypted at rest |
| Login gate | Supabase Auth |
| Hosting | Vercel, internal accounts (Google **test users**, no brand verification yet) |
| Capabilities wanted | Thread view · reply→status · send · search |

### Assumption — flag it if wrong

**One shared workspace.** Any logged-in user sees every connected mailbox and every lead's thread — right for an internal team CRM over a shared sheet. Only the connecting user can disconnect their own mailbox. Adding a `space_id` later is a mechanical change to the RLS predicates.

---

## Sequencing change — 2026-08-17

The connect UI was pulled forward ahead of the login gate, and moved onto the dashboard instead of a settings page. Two consequences, recorded here so nobody has to reverse-engineer them later.

**1. Phase 0 is deferred, and DEPLOY is now gated on it.**
Connecting Gmail with no login is genuinely fine on **localhost** — nothing is publicly reachable. It is *not* fine on Vercel: an unauthenticated public URL with a mailbox attached lets anyone who finds it read the team's mail. Phase 0 is therefore a hard prerequisite for **deploying**, not for building. Do not ship this to a public URL with Phase 0 still ⏭️.

**2. No `user_id` yet, and the browser never touches Supabase.**
With no `auth.users` to reference, the table drops `user_id` and keeps a nullable `connected_by` text column. Every Supabase call goes through the **service-role client, server-side only** — there is no anon client and nothing browser-side. RLS is enabled with **zero policies**, which denies `anon` and `authenticated` outright while `service_role` bypasses it. That is a deliberate interim posture, not an oversight: it is strictly *more* closed than the policy set Phase 0 will introduce. Phase 0 then adds `user_id` + the four real policies as a follow-up migration.

### Files the current slice touches

| Path | New? | Role |
|---|---|---|
| `supabase/migrations/0001_mailboxes.sql` | new | table, partial unique index, RLS, two Vault functions |
| `src/lib/supabase/service.ts` | new | service-role client, `server-only` |
| `src/lib/google/oauth-state.ts` | new | cookie-name constants |
| `src/lib/google/oauth.ts` | new | auth URL, code exchange, token refresh — plain `fetch` |
| `src/lib/google/mailboxes.ts` | new | list, disconnect, find-or-create + revive, token resolve |
| `src/app/actions/mailboxes.ts` | new | `startGoogleConnect()` server action |
| `src/app/api/mailboxes/google/callback/route.ts` | new | OAuth callback — step order is load-bearing |
| `src/app/api/mailboxes/route.ts` | new | `GET` list · `DELETE` disconnect |
| `src/components/mailbox-dialog.tsx` | new | the connect/manage dialog |
| `src/components/dashboard.tsx` | edit | header trigger + connect/error toast |
| `src/app/page.tsx` | edit | pass the initial mailbox list into the first paint |

---

## Two deliberate deviations from the reference doc

**1. Plain `fetch` against Gmail REST — no `googleapis` package.**
`src/lib/sheets.ts` already talks to a Google service with bare `fetch` plus an `unwrap()` that converts provider errors into actionable messages. Gmail needs the same treatment, and staying on `fetch` keeps Next's ISR (`next: { revalidate, tags }`) working. **`googleapis` would silently defeat that** — it uses gaxios/node-https, not Next's patched `fetch`, so `revalidate` never applies and every call would need `unstable_cache` instead. Cost: ~60 hand-rolled lines for auth-URL/exchange/refresh. Benefit: one less ~50MB dependency, faster cold starts, one idiom across the codebase. `google-auth-library` returns in Phase 2 solely to verify Pub/Sub OIDC tokens.

**2. No tenancy layer.** `space_id`, `spaces_members`, and the membership re-checks inside the Vault functions collapse to "is this an authenticated user". Two RLS rules carry over **verbatim**, because they are about correctness rather than tenancy:

- `TO authenticated` on every policy — omitting it silently includes the `anon` role.
- `(SELECT auth.uid())`, never bare `auth.uid()` — evaluated once per query instead of once per row.

---

# Phase 0 — Lock the door ⏭️ deferred (required before deploy)

**Why it matters:** the app has no auth and is going on a public Vercel URL. Attaching a mailbox to an ungated app publishes the team's mail.

**Why it is deferred:** the connect UI was pulled forward (see *Sequencing change*). Building and testing on localhost is safe without this. **Deploying is not.** This phase must be ✅ before the app is exposed on any public URL.

- [x] **0.1** This doc exists at `docs/GMAIL-SYNC.md`. Keep it updated as reality diverges.
- [x] **0.2** `npm i @supabase/supabase-js` — done. `@supabase/ssr` is only needed once there are sessions to refresh, i.e. when this phase actually runs.
- [ ] **0.3** Create the Supabase project; put `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
- [ ] **0.4** `src/lib/supabase/client.ts` · `server.ts` (cookie-bound) · `service.ts` (service-role — mark it `import "server-only"` exactly like `sheets.ts` does). **`service.ts` lands in the current slice**; the other two belong to this phase.
- [ ] **0.5** `src/middleware.ts` — refresh session, redirect unauthenticated → `/login`.
      **Matcher must exclude `/api/cron/*`** (bearer-auth, no session) and, in Phase 2, `/api/webhooks/*` + `/api/sync/*`.
- [ ] **0.6** `src/app/login/page.tsx` — magic link or Google sign-in, built from the existing `src/components/ui/` primitives.
- [ ] **0.7** Audit every identity decision to use **`getUser()`, never `getSession()`** — the latter only reads a cookie and is spoofable (ref gotcha #14).

> **Keep the two OAuth grants separate.** Never reuse the Supabase Auth session's `provider_token` for Gmail: sign-in requests no `access_type=offline`, so there is no refresh token, it carries no Gmail scopes, and it rotates on every login. Hand-rolled authorization-code flow only (ref §4.1).

**Done when:** logged out, `/` redirects to `/login` and `/api/leads` is not readable anonymously. Logged in, the dashboard still renders stat cards + table and inline status edit still saves. `npx tsc --noEmit` and `npm run lint` clean.

---

# Phase 1 — Connect mailboxes + live per-lead threads

## 1A · Schema and token vault ⬜

- [ ] **1A.1** `supabase/migrations/0001_mailboxes.sql`:

```sql
create table public.connected_mailboxes (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null default 'gmail' check (provider in ('gmail')),
  address         text not null,
  connected_by    text,             -- who clicked Connect; becomes user_id in Phase 0
  vault_secret_id uuid,             -- refresh token NEVER in a plain column
  scopes          text[],           -- GRANTED, not requested
  status          text not null default 'connecting'
                    check (status in ('connecting','connected','error','disconnected')),
  sync_error      text,
  last_synced_at  timestamptz,
  connected_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One LIVE connection per address; disconnected rows excluded so it can reconnect.
create unique index connected_mailboxes_unique_active_address
  on public.connected_mailboxes (address) where status <> 'disconnected';

-- RLS on with ZERO policies: anon and authenticated get nothing, service_role bypasses.
alter table public.connected_mailboxes enable row level security;
```

- [ ] **1A.2** RLS enabled, **no policies** for now (see *Sequencing change*). Phase 0 replaces this with four policies, every one `TO authenticated`: select/insert/update → any authenticated user (shared workspace); delete → `user_id = (SELECT auth.uid())`.
- [ ] **1A.3** Port the Vault functions (ref §3.3) — **two** for now, write + service-read; the user-context read variant is pointless with no sessions. Grant to `service_role` only, and **explicitly `revoke` from `PUBLIC`, `anon`, `authenticated`**. Four rules verbatim:
      `LANGUAGE plpgsql` never `sql` (a `SECURITY DEFINER` sql function can hit error 42P17) · `SET search_path = ''` on all three, fully-qualifying every identifier · **re-check authorization in the body**, since these bypass RLS by design · grant the `_service` variant to `service_role` only and **explicitly `revoke` from `anon`/`authenticated`** — skipping that revoke hands every logged-in user a decrypt oracle.
- [ ] **1A.4** Upsert the secret **by deterministic name** (`mailbox_refresh_<id>`): `vault.secrets.name` is uniquely indexed, so a bare `create_secret()` 500s on the second connect of the same mailbox (gotcha #9).

**Done when:** the table exists; querying it with the **anon** key returns zero rows; the service-role RPC can decrypt and the `authenticated` role cannot.

### ✅ Applied 2026-08-17 — how, and what was verified

The project's direct host (`db.<ref>.supabase.co`) is **IPv6-only** and unreachable from an IPv4-only machine, so the migration went through the **pooler in session mode**:

```
psql -h aws-0-ap-northeast-2.pooler.supabase.com -p 5432 \
     -U postgres.etijktdryvvimivpkong -d postgres \
     -v ON_ERROR_STOP=1 -f supabase/migrations/0001_mailboxes.sql
```

Region `ap-northeast-2` was found by probing: a wrong region answers `FATAL: (ENOTFOUND) tenant/user … not found`, which distinguishes it cleanly from a wrong password. Use port **5432** (session), not 6543 — transaction mode is unreliable for DDL.

**Exposing `private` did not need the dashboard.** PostgREST reads its config from the `authenticator` role, so this worked and persists:

```sql
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, private';
notify pgrst, 'reload config';
```

Verified afterwards:

| Check | Result |
|---|---|
| RLS enabled, policy count | `t`, **0 policies** |
| Partial unique index on address | present, `WHERE status <> 'disconnected'` |
| Vault fns `SECURITY DEFINER` + `search_path=""` | both `t`, both set |
| Execute grant | `service_role` only — `anon`/`authenticated` absent |
| anon calling the vault RPC | `42501 permission denied for schema private` (401) |
| anon selecting the table | `[]` |
| app `GET /api/mailboxes` | `{"mailboxes":[],"configured":true}` |

## 1B · Google Cloud setup ⬜

- [ ] **1B.1** New GCP project → enable the **Gmail API**.
- [ ] **1B.2** OAuth consent screen (External). Add teammates as **test users** — this is what lets us develop without brand verification.
- [ ] **1B.3** OAuth 2.0 **Web application** client. Redirect URIs, both:
      `http://localhost:3000/api/mailboxes/google/callback` and `https://<vercel-domain>/api/mailboxes/google/callback`
- [ ] **1B.4** Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_GMAIL_REDIRECT_URI`, `APP_URL` to `.env.local`.

**Done when:** the redirect URI in the Console matches `GOOGLE_GMAIL_REDIRECT_URI` byte for byte — Google requires an exact match with no query parameters.

## 1C · OAuth layer ⬜

- [ ] **1C.1** `src/lib/google/oauth-state.ts` — cookie-name constants in their own module (a `'use server'` file may only export async functions).
- [ ] **1C.2** `src/lib/google/oauth.ts` — `buildAuthUrl(state)`, `exchangeCode(code)`, `refreshAccessToken(token)`, all `fetch`.
      **`access_type=offline` AND `prompt=select_account consent`.** Two separate reasons, both load-bearing:
      · `select_account` is what makes **multi-account** work — without it Google silently reuses the already-signed-in account, so the second "Connect" just re-adds the first one and it looks like nothing happened.
      · `consent` is what guarantees a refresh token on a *re*-connect. With `offline` alone Google returns one only on the *first ever* authorization for that (user, client) pair, and the mailbox then dies the moment its access token expires.
      Throw loudly when `refresh_token` is absent rather than persisting a mailbox that can never sync.
      Address comes from `users.getProfile` — already covered by `gmail.readonly`, no extra userinfo scope.
      Record **granted** scopes from `tokens.scope` (space-delimited per the OAuth2 spec); users may grant a subset, and storing what was granted is what lets the UI say "reconnect to enable sending" instead of hitting a runtime 403.
- [ ] **1C.3** Scopes: **`gmail.readonly` only** this phase. `gmail.send` waits for Phase 3. **Never `gmail.modify`** — it is RESTRICTED and drags a CASA security assessment into launch; the reference only needed it to label a sent copy into a mirrored corpus, which we do not maintain.
- [ ] **1C.4** `src/lib/google/mailboxes.ts` — **find-or-create + revive**, never a blind insert (gotcha #6): reuse a live row → else revive the most recent `disconnected` row for that address (**limit 1**), clearing its stale cursors → else insert *without* setting status, so a failed exchange cannot resurrect a tokenless mailbox. Reviving keeps the row id stable, so history survives a disconnect→reconnect cycle instead of forking into two accounts.
- [ ] **1C.5** Server action `startGoogleConnect` — permission checks *before* redirecting, state cookie `httpOnly` + **`sameSite: 'lax'`** (`'strict'` is dropped on the redirect back from Google's domain and breaks every connect — gotcha #11), `maxAge` 600. Client does a **full-page** `window.location.href`, not a popup or `fetch`.
- [ ] **1C.6** `src/app/api/mailboxes/google/callback/route.ts` — order is load-bearing, every step fails closed:
      1. read **and delete** the state cookie immediately (single use, whatever happens)
      2. verify state matches
      3. `getUser()`
      4. exchange the code
      5. find-or-create the row
      6. record granted scopes (best-effort — bookkeeping must not fail a good connect)
      7. Vault RPC → this is what flips `status='connected'`
      8. redirect
      On Vault failure, mark the row `error` — otherwise it sticks in `connecting` forever with nothing the user can act on.

**Done when:** connecting produces a row with `status='connected'` and non-null `vault_secret_id`, and `select * from connected_mailboxes` shows **no refresh token in any column**.

## 1D · Connect UI on the dashboard ⬜

Lives in the dashboard header, not a settings page — connecting a mailbox is a first-class action here, not a buried preference.

- [ ] **1D.1** `src/components/mailbox-dialog.tsx` — a `Dialog` listing every connected account: address, status dot, "connected N days ago", per-row inline-confirm **Disconnect**. Footer holds **Connect Gmail account**, which stays enabled when accounts already exist — that is the multi-account path. Compose from `ui/dialog.tsx`, `ui/button.tsx`, `ui/badge.tsx`; colours follow `src/components/badges.tsx`.
- [ ] **1D.2** Header trigger in `src/components/dashboard.tsx`, beside the existing **Open sheet** / **Refresh** buttons: a `Mail` icon button labelled with the connected count. Non-native buttons there use the `nativeButton={false}` + `render` pattern — follow it.
- [ ] **1D.3** Simplified health badge (no watch until Phase 2): `connecting` → *connecting* · `sync_error` → *issue* (outranks everything) · `connected` → *connected* · else *issue*.
- [ ] **1D.4** Disconnect is a **soft delete** — flip `status='disconnected'`, keep the row so a reconnect revives it. Read anything you need from the row **before** flipping: the service token-resolve RPC returns NULL for a disconnected mailbox.
- [ ] **1D.5** Surface `?mailbox_connected=` / `?mailbox_error=` as a `sonner` toast, matching how `saveLead` already reports success and failure.
- [ ] **1D.6** Feed the initial list from the existing server component (`src/app/page.tsx`) so the header count is right on first paint — same reasoning as leads already being in the first paint, no loading flash.
- [ ] **1D.7** Extend the `SetupNotice` idiom (`src/components/setup-notice.tsx`) with a "Gmail not configured" state, driven by an `isGoogleConfigured()` check mirroring `isConfigured()` in `sheets.ts`. Missing env must produce a friendly message, never a 500.

**Done when:** two *different* Google accounts both connect and both list; Google offered an account picker rather than silently reusing the first; reconnecting one **revives the same row id** instead of duplicating it; disconnecting removes it from the list while the row survives as `disconnected`.

## 1L · Label scope 🟡

**The rule: a mailbox reads nothing until someone picks its labels, and only mail carrying them is ever fetched.** Connecting an account is not consent to read all of it.

`supabase/migrations/0002_label_scope.sql` adds `synced_label_ids text[]` and `sync_scope_required boolean default true`, and gates the mailbox that already existed. *Deviation from the reference:* it grandfathers pre-existing rows to `false` so a live sync is not cut off mid-flight — we had no sync running, so gating everything was both correct and safer.

### The five things that matter

1. **`labelIds` is AND, not OR.** `listLabelledThreadIds()` runs **one paginated request per label** and unions through a `Set`. Passing `['CRM1','Crm2']` in a single call matches only threads carrying *both* — near zero. Proven on live data: CRM1=13, Crm2=0, both=**13**. A single request would have returned 0, and it would have looked like "no mail found" rather than an error.
2. **Threads, not messages.** A thread matches when *any* of its messages carries the label — Gmail's own semantics, and the reason a reply Gmail never labelled stays in scope.
3. **The gate is one pure function.** `needsSyncScopeConsent()` in `types.ts`, shared by routes, engine and UI. Its second clause makes it self-clearing, so a save racing the flag write still opens the mailbox.
4. **Gated means zero Google calls.** `resolveReadableMailbox()` is the seam every mail-reading path uses; it returns null *before* minting a token. The label list/create routes deliberately bypass it — listing has to work while gated or you could never choose.
5. **Capability checks precede the API call.** Missing `gmail.labels`/`gmail.send` produces `403 { needsReconnect: true }` naming the fix, not a raw Google 403.
6. **Only user-created labels are offered.** System labels (`INBOX`, `SENT`, `IMPORTANT`, `STARRED`, the `CATEGORY_*` set) are hidden from the picker: ticking `INBOX` would mean reading the entire mailbox, which is exactly what label scoping exists to prevent. Choosing a label you made is a narrow, deliberate decision; ticking INBOX is not. One exception — a system label that is *already* selected stays visible, badged "untick to stop", so it can be turned off rather than being stuck on with no way to reach it.

### Scopes

`gmail.readonly` + `gmail.labels` + `gmail.send` — all **sensitive**, all fine with test users, no brand verification. `gmail.modify` is **RESTRICTED** (CASA assessment) and stays out unless the send experiment proves it necessary.

**Selecting** labels works on an old readonly grant; **creating** and **sending** need a reconnect, which revives the same row id.

### Send, and the one open question

`sendMessage()` builds RFC 2822, base64url-encoded. A reply passes `threadId` **and** `In-Reply-To`/`References` — `threadId` alone threads it in Gmail's UI but not in other mail clients.

A reply **inherits its thread's label for free**, so it stays in scope with no extra permission. A brand-new outbound thread has nothing to inherit from. `POST /api/mail/send` therefore passes the mailbox's `syncedLabelIds` on send and returns `inScope`, reporting honestly whether the label stuck. **Untested — needs the send scope.** If Gmail honours `labelIds`, no restricted scope is ever needed; if it ignores them, that is the decision point for `gmail.modify`.

### Files

`0002_label_scope.sql` · `src/lib/google/gmail.ts` (new: labels, threads, send, MIME helpers) · `src/components/mailbox-label-picker.tsx` (new) · `src/app/api/mailboxes/[id]/labels/route.ts` (new) · `src/app/api/mailboxes/[id]/route.ts` (new) · `src/app/api/mail/send/route.ts` (new) · edits to `types.ts`, `oauth.ts`, `mailboxes.ts`, `mailbox-dialog.tsx`.

Two implementation notes worth keeping: `PUBLIC_COLUMNS` must stay **one string literal** — supabase-js infers row types from it, and a concatenation degrades every query to an error type. And the picker takes `labels` as a prop rather than fetching in a `useEffect`, because `react-hooks/set-state-in-effect` (correctly) rejects a mount fetch that sets state; the parent loads them on expand instead.

## 1M · Mail view ✅

The label slice shipped a *count* and no reader, so the mail was invisible in the UI. This adds the third dashboard tab — **List · Board · Mail** — listing every in-scope thread and opening one in a side panel.

There is deliberately **no "all mail" view**: `listScopedThreads()` fans out only over `resolveReadableMailboxes()`, so a mailbox awaiting its label choice is never read and never has a token minted for it.

### Design notes

- **Provider HTML renders in a fully sandboxed iframe** — `sandbox=""` with no `allow-*` flags, plus `referrerPolicy="no-referrer"`. The markup was written by whoever sent the mail; `dangerouslySetInnerHTML` would have granted it script execution, form submission and same-origin access. The iframe cannot report its own height back (that would need script), so the reader offers a manual **Expand** rather than a guessed height — an honest trade rather than a broken one.
- **The parent owns every fetch.** `dashboard.tsx` loads threads on the tab click and a thread on the row click, passing everything to `MailView` as props. A mount-time fetch inside the view would mean `setState` from an effect, which `react-hooks/set-state-in-effect` correctly rejects — and an earlier draft that called `setState` during render was worse still, since StrictMode double-fires it.
- **Threads load once**, then the Refresh button is the only re-fetch. `threads.list` returns ids only, so each thread costs a `threads.get` — 13 threads in ~3.9s. That per-view cost is exactly what the Phase 2 mirror removes.
- **Newest message expanded, older ones collapsed.** A long thread otherwise opens as a wall of quoted replies.
- Deterministic avatar tints keyed off the address, so the same correspondent keeps the same colour across sessions.
- The per-mailbox filter chips only appear once more than one account contributes mail.

### Verified against the live mailbox

| Check | Result |
|---|---|
| `GET /api/mail/threads` | 200, **13 threads**, newest first, 3.9s |
| Thread detail | 3 messages, correct `outbound`/`inbound` split, bodies decoded |
| A thread id outside the label scope | **404** |
| Request without `mailboxId` | **400** — a thread id alone does not say whose it is |
| Dashboard | Mail tab renders alongside List and Board |

## 1E · Per-lead conversation ⬜

**The join key is `Lead.email`** (column G). Note **most scraped leads have a blank email** — all 4 currently do — so also offer a `Lead.domain` (column R) fallback query, rendered explicitly as a *weak, unconfirmed* match. The reference forbids domain matching, which is right when writing a `contact_id`; here it is a read-only "possibly related" panel with no write consequence, so the tradeoff differs.

- [ ] **1E.1** `src/lib/google/parse.ts` — `getHeader`, `extractEmail` (`"Jane <j@x.com>"` → `j@x.com`), `extractBody`, `decodeBase64Url`, `directionOf`.
      Bodies are **base64url** (`-`/`_`, not `+`/`/`) — standard base64 yields garbage for many bodies (gotcha #18).
      MIME is a **tree**: recurse, prefer `text/html`, fall back to `text/plain`.
      `internalDate` is **epoch millis as a string** — `new Date(Number(v))` (gotcha #17).
- [ ] **1E.2** `src/lib/google/gmail.ts` — `listMessages`, `getMessage` over REST with a bearer token. Token chain per call: Vault RPC → `refreshAccessToken` → attach. Access tokens are minted per invocation and **never stored**; Google refresh tokens do not rotate, so there is no write-back path.
- [ ] **1E.3** `src/lib/mail/lead-mail.ts` — `fetchLeadMail(address)`: for each connected mailbox, `messages.list?q=from:"x" OR to:"x"` capped ~25 → `messages.get?format=full` with bounded concurrency → merge across mailboxes, sort by `internalDate` desc, tag each message with its source mailbox. Quote the address inside the `q` string.
- [ ] **1E.4** `src/app/api/leads/mail/route.ts` — cache `next: { revalidate: 60, tags: ['mail:<address>'] }`.
- [ ] **1E.5** `src/components/lead-mail-thread.tsx` — a **new** component rendered inside `lead-detail-panel.tsx` (already 397 lines; do not grow it). Fetch on panel open, use the existing `ui/skeleton.tsx` while loading.
- [ ] **1E.6** **Render sanitised.** Message HTML is attacker-controlled: render in a sandboxed iframe (`sandbox=""` + `srcdoc`) or run it through `isomorphic-dompurify`. Never `dangerouslySetInnerHTML` on raw provider HTML.

**Done when:** a lead with a real address shows its conversation merged across both mailboxes, correctly labelled inbound/outbound, and an HTML-heavy marketing email renders without executing script.

## 1F · Reply → Status automation ⬜

- [ ] **1F.1** `src/app/api/cron/scan-replies/route.ts` — bearer `CRON_SECRET`, **fails closed** (unset secret ⇒ 401 everything).
- [ ] **1F.2** Query shape matters: do **not** loop leads × mailboxes. Per mailbox issue *one* `messages.list?q=newer_than:2d -from:me`, collect sender addresses, and intersect against lead emails in memory — turning N×M API calls into one list plus a bounded set of gets.
- [ ] **1F.3** Transition rules in a **pure, unit-testable function**: only ever advance `New`/`Outreach Sent` → `Replied`, on an inbound message newer than the outreach date. Never downgrade; never touch `CLOSED_STATUSES` (`Not a Fit`, `Closed Won`) or `Meeting Booked`; never write `notes` (a human's field). Compare before writing so re-runs are no-ops.
- [ ] **1F.4** Writes go through the **existing** `updateLeads()` in `src/lib/sheets.ts`, batched into one bulk PATCH — respecting `EDITABLE_FIELDS` and the `row` + `key` fingerprint that survives sheet reordering. Do **not** add a second write path to the sheet.
- [ ] **1F.5** `vercel.json` daily cron. **Vercel Hobby rejects any sub-daily schedule at deploy time**; a tighter cadence needs an external scheduler hitting the same route with the same bearer.

**Done when:** a lead at `Outreach Sent` flips to `Replied` after a real inbound mail; running the cron a second time writes nothing; a `Closed Won` lead with a fresh reply is left alone.

## 1G · Tests (new tooling — the project has none) ⬜

- [ ] **1G.1** Add Vitest, for the **pure helpers only**: `extractEmail`, `extractBody` (nested MIME + base64url), `directionOf`, the reply→status transition table, and the `q`-string builder. These are where the real bugs live and they need no mocking harness.

---

# Phase 2 — Mirror + search ⬜

Unlocks only after Phase 1 ships. Reuses Phase 1's OAuth layer untouched.

- [ ] **2.1** `messages` table, `unique (provider, provider_message_id)` per mailbox; add `history_id`, `watch_expiry_at`, `synced_label_ids` columns to `connected_mailboxes`.
- [ ] **2.2** Pub/Sub topic; grant **`gmail-api-push@system.gserviceaccount.com`** the Pub/Sub Publisher role (without it `users.watch` fails); push subscription → `/api/webhooks/gmail` with authentication on and the audience set to our app URL.
- [ ] **2.3** `users.watch` register/renew/stop — registration and renewal are literally the same call; watch **extends**, never stacks.
- [ ] **2.4** Webhook: verify OIDC **signature *and* `aud`**, decode base64, enqueue, ack 200.
- [ ] **2.5** Queue + `/api/sync/gmail` worker; backfill and incremental engines sharing one write path.
- [ ] **2.6** Daily watch-renewal cron with a **2-day buffer** — a 7-day watch renewed daily survives two missed runs, and Vercel adds up to ±59min of jitter.
- [ ] **2.7** Search UI over the mirrored corpus.

**Gotchas that only bite here, and all of which will:** `labelIds` is **AND not OR** (one paginated loop per label, union via a Set) · Gmail **never labels a reply**, so scope per **thread** not per message or you lose every response · the push `historyId` is a **wake-up signal, not a cursor** — start from your own stored one · history expires (~1 week), so 404/`failedPrecondition` must trigger re-watch + backfill or the mailbox wedges forever · Pub/Sub is **at-least-once**, so every write is `ON CONFLICT DO NOTHING` with `.select('id')` to distinguish a real insert from a replay · **ack 200** on malformed pushes or they redeliver forever · wrap the queue-signature verifier **per request**, not at module scope, or `next build` throws in any environment without queue env.

---

# Phase 3 — Send ⬜

- [ ] **3.1** Add `gmail.send` (SENSITIVE — fine for internal test users; brand verification only if this ever goes external). Existing mailboxes need a reconnect to grant it.
- [ ] **3.2** Compose UI in the detail panel with a from-mailbox selector.
- [ ] **3.3** RFC 2822 MIME, base64url-encoded; thread replies via `threadId` + `In-Reply-To`/`References`.
- [ ] **3.4** On success write `status='Outreach Sent'` and stamp `outreachSent` through the existing optimistic `saveLead` path in `dashboard.tsx`.
- [ ] **3.5** Gate the compose button on granted scopes. `scopes === null` is a legacy grant — treat as not-granted and prompt a reconnect rather than letting it 403.

---

## Environment variables

`cp .env.example .env.local` — the template documents every variable, where each value comes from, and which phase needs it. (`.gitignore` now carries a `!.env.example` negation; the blanket `.env*` rule was previously swallowing it.)

| Variable | Needed by | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **current slice** | |
| `SUPABASE_SERVICE_ROLE_KEY` | **current slice** | server only, never in a client bundle |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | **current slice** | |
| `GOOGLE_GMAIL_REDIRECT_URI` | **current slice** | must match the Console exactly |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Phase 0 | no browser-side Supabase until sessions exist |
| `APP_URL` | 1F | public https origin |
| `CRON_SECRET` | 1F | unset ⇒ cron 401s everything |
| `GMAIL_PUBSUB_TOPIC` / `GMAIL_PUBSUB_AUDIENCE` | 2 | topic is the **full** `projects/<p>/topics/<t>` |

**Blocked on you:** the current slice cannot be tested until the Supabase project exists and `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set, and a GCP OAuth client provides `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` with every connecting teammate added as a **test user**.

Existing `SHEETS_*` values stay untouched. `.gitignore` has a blanket `.env*`, which is also why no `.env.example` is committed today.

---

## Final verification sweep

Run in order; each step gates the next.

1. **Gate** — logged out, `/` redirects to `/login`; `/api/leads` not readable anonymously; `/api/cron/scan-replies` answers with its bearer and 401s without it.
2. **No regression** — dashboard renders from the sheet, inline status edit saves; `npx tsc --noEmit` + `npm run lint` clean.
3. **Connect** — `status='connected'`, non-null `vault_secret_id`, **no plaintext token in any column**.
4. **Multi-mailbox** — two accounts listed; reconnect revives the same row id.
5. **Anon check** — `connected_mailboxes` with the anon key returns zero rows.
6. **Thread** — conversation renders merged across mailboxes, inbound/outbound correct, hostile HTML sandboxed.
7. **Reply scan** — status flips to `Replied`; second run is a no-op.
8. **Guard rails** — `Closed Won` + fresh reply is left alone.
9. **Disconnect** — mailbox leaves lead threads; row survives as `disconnected`.
10. **Docs** — this file matches what was actually built, including both deviations and the gotchas that apply to *this* codebase.
