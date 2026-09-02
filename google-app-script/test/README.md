# Test harness for `Code.gs`

Runs the **real** `../Code.gs` in Node behind minimal Apps Script stubs
(`XmlService`, `UrlFetchApp`, `SpreadsheetApp`, `GmailApp`, `ScriptApp`), so the
parsing and scoring logic can be verified without deploying to Apps Script.

No dependencies. Node 18+.

```bash
cd google-app-script/test
node test.js      # offline, ~1s   → exit 1 on failure
node live.js      # hits every real source, writes nothing, ~16s
node preview.js   # renders the digest email to digest-preview.html
```

`CODE_PATH` overrides which file the harness loads. That is what makes an A/B
possible: copy `Code.gs`, patch the one function you are changing back to its
old behaviour, and run the same corpus through both to prove a scoring change
does what you think before it ships.

```bash
CODE_PATH=/tmp/Code.old.gs node -e '...'   # see "no-op proofs" below
```

## `test.js` — unit + regression suite

Offline. Feeds captured real responses from `fixtures/` through the actual
parsers. Every assertion in section 13+ is a regression test for a bug that was
found by running `live.js` against real data, including:

| Bug | Symptom it caused |
|---|---|
| `normalizeUrl` stripped the whole query string | HN URLs are `item?id=N`, so all 84 hiring posts collapsed to one key — 83 leads silently discarded as duplicates |
| HN thread looked up via Algolia's relevance sort | Returned the **2020** thread; every comment failed the recency filter |
| News-noise blocklist applied to job descriptions | "university" (degree requirement), "how to", "vs." rejected **100%** of job leads |
| Titles never HTML-decoded | `Series <b>A</b>` could not match the keyword `"series a"` |
| Vertical keywords scored as intent | One healthcare article stacked 5 synonyms for +15 → every lead was healthcare |
| Geography unfiltered | Indian / Saudi / UAE / Bulgarian rounds were ~⅓ of results |
| Same event from 4 outlets | Superleap ×4, Decade ×3 in a single run |
| Company extractor too narrow | 40 of 193 saved rows read `— extract manually —` |
| Funding keywords all dollar-anchored | with the geo gate off, "raises 270,000 euro in pre-seed" scored as "no trigger event" |

Section 5 scores the same inputs through **both** v1 and v2 scoring side by side,
so the healthcare skew fix is visible rather than asserted.

Sections 29–31 are the company-name extractor, built from every headline in the
live sheet that produced `— extract manually —` on 2026-08-08. They come in
three parts, and all three matter:

- **29** headlines that must now resolve to a name,
- **30** headlines that must stay unnamed — an unnameable topic article
  ("Two LA Startups Raised $2.37B") must not be given a company, because the
  Company column is the 30-day dedupe key,
- **31** headlines the descriptor strip used to eat ("Thryv Launches AI-Native
  Growth **Platform** for Small Businesses" briefly extracted nothing).

Section 32 covers `backfillCompanyNames()`, which rewrites rows already in the
sheet. Its two load-bearing assertions are that a hand-typed company is never
overwritten and that a second run is byte-for-byte a no-op.

Sections 33–36 cover v3's geography model — "can we deliver this from India?"
in place of "is this US?".

- **33** `jobReach_()`, in both of its modes. A source with a structured
  location field (Remotive, WWR, Jobicy) is judged against an **allowlist**,
  because the absence of a fence is not permission: `Americas, Europe, Israel`
  bars nobody by name and still has no door for us. Free text (Hacker News)
  has to work the other way round — HN posters write `REMOTE` and stop, so
  only an explicit fence closes the door. Two assertions guard the substrings
  most likely to misfire: `campus based` must not read as `US based`, and
  `consensus` must not trigger the EU fence.
- **34** the WeWorkRemotely parser against a captured feed, including the one
  ordering bug that matters: the employer's URL is entity-encoded inside the
  description, so it has to be pulled out **before** `cleanText_` strips tags
  — decode first and the tag-stripper eats the anchor, href and all.
- **35** the Jobicy parser.
- **36** that `NEWS_GEO` is a real switch in both directions, and that the job
  reach gate does not read it — remote work is the only work we can staff
  regardless of how the news half is configured.

## `live.js` — end-to-end dry run

Hits every source in `CONFIG` for real and reports per-source health, drop
reasons, segment mix, priority split and outreach readiness. Same accounting as
`auditFeeds()` inside Apps Script, but without touching the sheet.

Run this after editing `NEWS_QUERIES`, the scoring lists or the geo filters — it
shows the effect on real data before you deploy. A source showing `DEAD` (0
fetched) or `NOISE` (items but 0 qualified) is one to fix or disable.

## `preview.js` — see the email without sending it

Builds the digest from real live leads and writes `digest-preview.html`. Open it
in a browser to check the layout, then delete it. It also asserts the things
email clients actually care about: balanced table markup, no `display:flex`
(Gmail strips it), no astral-plane emoji (they render as diamonds), and no
external image or font requests.

Use this before changing anything in `sendDailyDigest_`.

## `fixtures/`

Captured 2026-08-06 from the live endpoints:

- `google-news-rss.xml` — Google News RSS, 27 items. Note `<source url="…">`
  and the ` - Publisher` title suffix the parser has to strip.
- `google-alert-atom.xml` — one of the surviving Google Alerts feeds, 20
  entries, with the `&lt;b&gt;` highlighting that broke v1's keyword matching.

Captured 2026-09-02:

- `wwr-programming.rss` — WeWorkRemotely, 6 items trimmed from 25, picked for
  their `<region>` spread: `Anywhere in the World`, `Asia Only` (which is us)
  and `North America Only` (which is not). Descriptions are truncated after
  the `Headquarters:` / `URL:` header block that the domain extractor reads.

Sections 39–41 cover the Phase 1 expansion: the 13-segment taxonomy, the 10
intent groups, and the two invariants that keep them honest.

- **39** every segment list is **self-disjoint** — no keyword may match another
  keyword in its own list, or that segment double-counts on a single phrase.
  This is the v1 healthcare skew in a new costume: taken literally the spec
  added 27 such pairs. Also pins that industry tags beat the technology tags
  `ai`/`mobile`, that `startup` loses to every real vertical, and that piling
  on vertical keywords changes the tag and never the score.
- **40** the ten groups and their weights, and that `AI Hiring` /
  `Developer Hiring` share no keyword — the assertion that lets both exist at
  weight 4 without one job req scoring 8. Also pins the keywords deliberately
  left OUT: bare `raises` / `seed` (word boundaries cannot save them —
  `\braises` matches "raises concerns") and bare `launches` / `ai-powered`.
- **41** proves `Shopify / Ecommerce` and `Mobile App` work, because the live
  corpus cannot reach them until step 5 adds ecommerce and mobile queries.

Sections 42–44 cover step 3, the job-filter widening.

- **42** the hyphen bug that made this more than a widening: `full ?stack`
  never matched **"full-stack"**, and "Backend" had no pattern at all. Also
  pins the whole accepted stack and — just as load-bearing — what stays
  rejected, because bare `engineer`/`developer` would readmit every Product
  Manager and Mechanical Engineer on the boards.
- **43** `HN_KEYWORDS`, which gates whole comments rather than titles: real
  postings in, thread chatter out, original AI/ML patterns intact.
- **44** institutions as wrong buyers, in both directions. The entries are
  **phrases** (`research hospital`, `university of`) rather than bare words
  precisely so `HospitalIQ` and `UniversityNow` — vendors, not institutions —
  still qualify.

Sections 45–47 cover steps 4–6.

- **45** the S/T/U columns. Half of it asserts what did NOT move: D, J, L and M
  are still where `getSeenKeys_`, the fingerprint deduper and the M2:M5000
  validation expect them. The columns are appended, never inserted, so a
  migration cannot corrupt live rows. Also runs the spec's own §4/§5 worked
  examples end to end, and pins that a specific technology suppresses the
  broader one it implies (React Native, not "React Native, React, Mobile").
- **46** the quota. Both halves matter: nothing is padded (the spec claims
  otherwise), and the ceiling now actually binds — it is a share of the RUN,
  not of the qualified pool, where it had never once triggered.
- **47** the Run Log reason histogram. The load-bearing assertion is that the
  rejected count comes from `evaluate_` and not from `fetched - qualified`:
  duplicates never reach `evaluate_`, so the old subtraction blamed the scoring
  for the deduper's work.

## No-op proofs

Sections 37–38 cover `hasKeyword_`, which replaced the `indexOf` scan every
keyword list used to run on. Substring matching was quietly costing leads:
`ngo` matched **ongoing**, `rs.` matched **engineers.**, `sar` matched
**Samsara**, `apac` matched **capacity**, `stock` matched **livestock**.

Only the LEADING word edge is anchored. Measured over 606 live items, anchoring
the trailing edge too would have lost 17 `startups`, 6 `ml engineers`, 4
`engineering teams`, 3 `patients` and 3 `medical devices` — these lists depend
on matching stems.

The change was A/B'd against a patched copy of `Code.gs` over a frozen corpus
of those 606 items before shipping: **0 leads lost, 2 rescued, 0 score
changes**, 2 segment retags. Section 38 pins the two rescued leads so they
cannot regress. Re-run that A/B for any future change to scoring or matching.

## Caveats

The Apps Script stubs are minimal. `harness.js` ships a small regex-based XML
parser — good enough for RSS 2.0 and Atom, but **not** a faithful `XmlService`.
Sheet writes are stubbed out entirely and are not covered here. A green suite
means the parsing/scoring logic is correct, not that a deploy works: run
`auditFeeds()` in Apps Script for that.
