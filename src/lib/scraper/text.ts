import { CONFIG } from "./config.ts";
import { GENERIC_HOSTS, TRACKING_PARAMS } from "./keywords.ts";

// ── KEYWORD MATCHING ─────────────────────────────────────────

/**
 * Compiles a scoring keyword into a matcher anchored at its LEADING edge.
 *
 * Every list used to be scanned with `indexOf`, which matches a keyword
 * anywhere inside a longer word. Measured over 606 live items on 2026-09-02,
 * that was silently costing real leads:
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
 * 4 "engineering teams", 3 "patients" and 3 "medical devices".
 *
 * The \b is omitted when the keyword does not START with a word character —
 * "₹", " rs " and "$…" have no word boundary in front of them to assert, and
 * demanding one would match nothing at all.
 */
const keywordCache = new Map<string, RegExp>();

export function keywordRe(kw: string): RegExp {
  let re = keywordCache.get(kw);
  if (!re) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp((/^\w/.test(kw) ? "\\b" : "") + escaped, "i");
    keywordCache.set(kw, re);
  }
  return re;
}

/** True when `text` contains `kw` as a word rather than as a fragment. */
export function hasKeyword(text: string, kw: string): boolean {
  return keywordRe(kw).test(text);
}

/** The first keyword in `list` that `text` contains, or undefined. */
export function findKeyword(text: string, list: string[]): string | undefined {
  return list.find((k) => hasKeyword(text, k));
}

// ── TEXT / URL UTILITIES ─────────────────────────────────────

/**
 * Decode HTML entities, then strip tags, then collapse whitespace.
 * Runs the decode twice because feeds are frequently double-encoded
 * (`&amp;#39;` → `&#39;` → `'`).
 */
export function cleanText(s: string | null | undefined): string {
  if (!s) return "";
  let out = String(s);
  for (let i = 0; i < 2; i++) {
    out = out
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(parseInt(d, 10)))
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }
  return out.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Pulls the real article URL out of a Google redirect wrapper, e.g.
 *   google.com/url?rct=j&sa=t&url=https://real.site/story&ct=ga&usg=...
 * The separator class allows ";" because the href often arrives with its
 * ampersands still entity-encoded (`&amp;url=`).
 */
export function unwrapGoogleRedirect(url: string): string {
  const s = String(url || "").replace(/&amp;/g, "&");
  const m = s.match(/[?&;]url=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  return s;
}

/**
 * Strips protocol, www, trailing slash and tracking params so dedupe works.
 *
 * It must NOT strip the whole query string: some sources put the item's
 * identity there. Hacker News URLs are `item?id=49192593`, so blanket
 * query-stripping normalized all 84 hiring posts to the same key and 83 of
 * them were silently thrown away as duplicates.
 */
export function normalizeUrl(url: string): string {
  const s = String(url || "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/#.*$/, "");
  const qi = s.indexOf("?");
  if (qi === -1) return s.replace(/\/+$/, "").toLowerCase();

  const path = s.slice(0, qi).replace(/\/+$/, "");
  const kept = s
    .slice(qi + 1)
    .split("&")
    .filter((pair) => {
      const k = pair.split("=")[0];
      return k && !TRACKING_PARAMS.test(k);
    })
    .sort();

  return (kept.length ? path + "?" + kept.join("&") : path).toLowerCase();
}

/**
 * Headline fingerprint — the secondary dedupe key, because Google News returns
 * a different opaque redirect URL for the same story on every query.
 *
 * Strips a trailing " - Publisher" first so the same story from several feeds
 * collapses to one key. Keeps ALL tokens, numbers and single letters included —
 * dropping them made "Series A" and "Series B" fingerprint identically.
 */
export function fingerprint(title: string): string {
  return cleanText(title)
    .replace(/\s+-\s+[^-]{2,30}$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w)
    .slice(0, 10)
    .join(" ");
}

export function hostOf(url: string): string {
  const m = String(url || "").match(/^https?:\/\/([^/\s?#]+)/i);
  return m ? m[1].replace(/^www\./, "") : "";
}

export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * True when a hostname tells you nothing about the employer.
 *
 * Written out longhand deliberately. The terse suffix test
 *   d.indexOf("." + g) === d.length - g.length - 1
 * matched whenever host and entry were the same length (-1 === -1), which
 * rejected "adalat.ai" because "notion.so" is also 9 characters.
 */
export function isGenericHost(host: string): boolean {
  const d = String(host || "").toLowerCase().replace(/^www\./, "");
  if (!d) return false;

  return GENERIC_HOSTS.some((g) => {
    if (d === g) return true; // bit.ly
    if (d.indexOf(g + ".") === 0) return true; // linkedin.com
    if (d.indexOf("." + g + ".") !== -1) return true; // drive.google.com
    const suffix = "." + g; // sub.example.notion
    return d.length > suffix.length && d.slice(d.length - suffix.length) === suffix;
  });
}

export function escapeHtml(str: unknown): string {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "Thu 6 Aug 2026", in CONFIG.TIME_ZONE rather than the server's UTC. */
export function fmtDate(d: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: CONFIG.TIME_ZONE,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`;
}
