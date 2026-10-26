import { XMLParser } from "fast-xml-parser";

import { stripPublisherSuffix } from "./company.ts";
import { CONFIG } from "./config.ts";
import { HN_ROLE_NOISE, HN_SEGMENT_NOISE, HN_TECH_STACK } from "./keywords.ts";
import { cleanText, hostOf, isGenericHost, parseDate, unwrapGoogleRedirect } from "./text.ts";
import type { Item, SourceStat } from "./types.ts";

// ── FETCHING ─────────────────────────────────────────────────

const USER_AGENT = "Mozilla/5.0 (compatible; PixlerLab-IntentScraper/2.0)";

type Fetched = { status: number; body: string };

async function get(url: string): Promise<Fetched> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
    signal: AbortSignal.timeout(CONFIG.FETCH_TIMEOUT_SECONDS * 1000),
  });
  return { status: res.status, body: await res.text() };
}

async function getOk(url: string, what: string): Promise<string> {
  const res = await get(url);
  if (res.status !== 200) throw new Error(`${what}HTTP ${res.status}`);
  return res.body;
}

function errorText(e: unknown): string {
  return String((e instanceof Error && e.message) || e);
}

// ── XML ──────────────────────────────────────────────────────
//
// Stands in for Apps Script's XmlService: entities decoded once, elements
// addressed by local name, and a missing child reads as "".

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  removeNSPrefix: true,
  isArray: (name) => name === "item" || name === "entry",
});

type XmlNode = Record<string, unknown>;

function childText(node: unknown, name: string): string {
  return textOf((node as XmlNode | undefined)?.[name]);
}

function textOf(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return textOf(value[0]);
  if (typeof value === "object") return textOf((value as XmlNode)["#text"]);
  return String(value);
}

function attrOf(node: unknown, child: string, attr: string): string {
  const value = (node as XmlNode | undefined)?.[child];
  const el = Array.isArray(value) ? value[0] : value;
  if (!el || typeof el !== "object") return "";
  return String((el as XmlNode)["@_" + attr] ?? "");
}

function rssItems(text: string): XmlNode[] {
  const doc = xml.parse(text) as XmlNode;
  const channel = (doc.rss as XmlNode | undefined)?.channel as XmlNode | undefined;
  return (channel?.item as XmlNode[] | undefined) ?? [];
}

// ── NEWS ─────────────────────────────────────────────────────

type NewsQuery = (typeof CONFIG.NEWS_QUERIES)[number];
type AlertFeed = (typeof CONFIG.LEGACY_ALERT_FEEDS)[number];

/**
 * Google News RSS. Structure:
 *   <item><title>Headline - Publisher</title><link>redirect</link>
 *         <pubDate>RFC822</pubDate><source url="https://domain">Name</source>
 * There is no usable <description>, so scoring runs on the headline — keep
 * queries headline-shaped.
 */
export function googleNewsUrl(nq: NewsQuery): string {
  return (
    "https://news.google.com/rss/search?q=" + encodeURIComponent(nq.q) +
    "&hl=en-US&gl=US&ceid=US:en"
  );
}

/** Bing News RSS — free, no key. Bing doesn't understand `when:Nd`. */
export function bingNewsUrl(nq: NewsQuery): string {
  const q = nq.q.replace(/\bwhen:\d+d\b/g, "").trim();
  return "https://www.bing.com/news/search?q=" + encodeURIComponent(q) + "&format=RSS";
}

/** Shared RSS 2.0 parser for Google News + Bing News. Pure — no I/O. */
export function parseRss2Text(text: string, label: string, segment: string): Item[] {
  const out: Item[] = [];
  for (const item of rssItems(text)) {
    let title = cleanText(childText(item, "title"));
    const link = childText(item, "link").trim();
    if (!title || !link) continue;

    // <source url="https://tracxn.com">Tracxn</source>
    const publisher = cleanText(childText(item, "source"));

    // Google News appends " - Publisher" to every headline. Strip it so the
    // publisher name can't be mistaken for the company.
    title = stripPublisherSuffix(title, publisher);

    out.push({
      kind: "news",
      title,
      snippet: "", // Google News has no real snippet
      url: link,
      publishedAt: parseDate(childText(item, "pubDate")),
      sourceLabel: label,
      segmentHint: segment,
      company: "", // resolved later by the extractor
      contactTitle: "",
      publisher,
      domain: "", // the <source> domain is the PUBLISHER, not the lead
    });
  }
  return out;
}

/**
 * Legacy Google Alerts Atom feed. The title is decoded and tag-stripped:
 * Google wraps matched terms in <b>, and `Series <b>A</b>` can't match
 * "series a" otherwise.
 */
export function parseAtomText(text: string, feed: AlertFeed): Item[] {
  const doc = xml.parse(text) as XmlNode;
  const entries = ((doc.feed as XmlNode | undefined)?.entry as XmlNode[] | undefined) ?? [];
  const out: Item[] = [];

  for (const entry of entries) {
    const title = cleanText(childText(entry, "title"));
    const snippet = cleanText(childText(entry, "summary"));
    const href = attrOf(entry, "link", "href");
    if (!title || !href) continue;

    out.push({
      kind: "news",
      title,
      snippet,
      url: unwrapGoogleRedirect(href), // the real article URL
      publishedAt: parseDate(childText(entry, "updated")),
      sourceLabel: feed.label,
      segmentHint: feed.segment,
      company: "",
      contactTitle: "",
      publisher: "",
      domain: "",
    });
  }
  return out;
}

// ── HACKER NEWS ──────────────────────────────────────────────

const HN_KEYWORD_RES = CONFIG.HN_KEYWORDS.map((k) => new RegExp(k, "i"));

/**
 * Hacker News "Ask HN: Who is hiring?". Comments conventionally read
 * `Company | Location | Role | https://url`, so you get the company AND their
 * own domain — the lead is outreach-ready.
 */
export async function fetchHackerNewsHiring(): Promise<Item[]> {
  // MUST be search_by_date: the default `search` sorts by relevance and returns
  // the 2020 thread, whose comments all fail the recency filter.
  const threads = JSON.parse(
    await getOk(
      "https://hn.algolia.com/api/v1/search_by_date?query=" +
        encodeURIComponent("Ask HN Who is hiring") + "&tags=story&hitsPerPage=20",
      "HN thread lookup ",
    ),
  ) as { hits?: Array<{ title?: string; objectID: string }> };

  // Date order also surfaces "Why is the Who is hiring post..." discussions,
  // so match the real monthly thread's title shape.
  const thread = (threads.hits ?? []).find((h) => /who is hiring\?\s*\(/i.test(h.title || ""));
  if (!thread) return [];

  const comments = JSON.parse(
    await getOk(
      "https://hn.algolia.com/api/v1/search?tags=comment,story_" + thread.objectID +
        "&hitsPerPage=200",
      "HN comments ",
    ),
  ) as { hits: Array<{ comment_text?: string; objectID: string; created_at?: string }> };

  const out: Item[] = [];
  for (const hit of comments.hits) {
    const raw = cleanText(hit.comment_text || "");
    if (!raw) continue;

    // Only postings for work we do
    if (!HN_KEYWORD_RES.some((re) => re.test(raw))) continue;

    // Their own domain — from the first URL in the post
    const urlMatch = raw.match(/https?:\/\/[^\s)|]+/);
    const domain = urlMatch ? hostOf(urlMatch[0]) : "";
    const company = parseHnCompany(raw, domain);
    const posting = parseHnPosting(raw, company);

    out.push({
      kind: "job",
      title: (posting.role || "Hiring") + (company ? " at " + company : ""),
      role: posting.role,
      location: posting.location,
      salary: posting.salary,
      snippet: raw.substring(0, 400),
      url: "https://news.ycombinator.com/item?id=" + hit.objectID,
      publishedAt: parseDate(hit.created_at),
      sourceLabel: "HN Who is hiring",
      segmentHint: "saas", // HN's hiring thread is tech/startup
      // The pipe header carries the location — that's what the reach check reads
      locationHint: raw.split("|").slice(0, 4).join(" "),
      // No structured location on HN, so jobReach falls back to free text.
      locationField: "",
      company,
      contactTitle: "Hiring Manager",
      publisher: "Hacker News",
      domain,
    });
  }
  return out;
}

// Must carry a "k" or comma-thousands. The looser version pulled "$30" out of
// "$30M raised" and printed it as the salary.
const SALARY = new RegExp(
  "\\$\\s?\\d{2,3}\\s?[kK]\\b(?:\\s?(?:-|–|—|to)\\s?\\$?\\s?\\d{2,3}\\s?[kK]\\b)?" +
    "|\\$\\s?\\d{2,3},\\d{3}(?:\\s?(?:-|–|—|to)\\s?\\$?\\s?\\d{2,3},\\d{3})?",
);
// Case-INsensitive: HN posts shout "REMOTE" and "ONSITE" as often as not.
const WORK_MODE = /\b(remote|hybrid|on-?site|anywhere|worldwide|distributed)\b/i;
// Case-SENSITIVE: "Austin, TX" is a place, "growth, ai" is not.
const CITY = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?,\s*[A-Z]{2})\b|\b(NYC|SF|Bay Area|Silicon Valley)\b/;
const isPlace = (t: string) => WORK_MODE.test(t) || CITY.test(t);

/**
 * Role / location / salary from an HN hiring post. The pipe order varies
 * wildly, so each field is identified by what it looks like, not its position.
 */
export function parseHnPosting(
  raw: string,
  company: string,
): { role: string; location: string; salary: string } {
  const segs = String(raw || "").split("|").map((s) => s.trim()).filter((s) => s);
  const out = { role: "", location: "", salary: "" };

  for (const s of segs) {
    if (company && s === company) continue; // don't repeat the company
    if (/^https?:/i.test(s)) continue;

    if (!out.salary) {
      const m = s.match(SALARY);
      if (m) out.salary = m[0].replace(/\s+/g, "");
    }
    // A role reads like a job title and is not just a location
    if (!out.role && HN_ROLE_NOISE.test(s) && s.length <= 70 && !isPlace(s)) {
      out.role = s.replace(/\s*\(.*$/, "").trim();
    }
    if (!out.location && isPlace(s) && s.length <= 60) {
      out.location = s.replace(/\s*\|.*$/, "").trim();
    }
  }

  // Salary often sits mid-sentence rather than in its own segment
  if (!out.salary) {
    const m = raw.match(SALARY);
    if (m) out.salary = m[0].replace(/\s+/g, "");
  }
  return out;
}

/**
 * HN posts nominally start with the company, but plenty lead with a location
 * or work mode ("NYC | ONSITE (hybrid) Norm Ai | ..."). Walk the first few
 * segments, skip the obvious non-companies, and fall back to the brand in
 * their own domain.
 */
export function parseHnCompany(raw: string, domain: string): string {
  const segs = String(raw || "").split("|").map((s) => s.trim()).filter((s) => s);

  const usable = segs.slice(0, 4).filter(
    (s) =>
      s &&
      s.length <= 60 &&
      !/^https?:/i.test(s) &&
      !HN_SEGMENT_NOISE.test(s) &&
      !HN_ROLE_NOISE.test(s) &&
      !HN_TECH_STACK.test(s) &&
      (s.match(/,/g) || []).length < 2 && // 2+ commas means it's a list
      // Short all-letter ALL-CAPS is a location or region ("NYC", "EMEA"); the
      // digit check keeps real names like "ML6".
      !(s.length <= 5 && !/[a-z0-9]/.test(s)),
  );

  if (usable.length) {
    return usable[0]
      .replace(/\s*\(.*$/, "") // drop parentheticals
      .replace(/\.(com|io|ai|co|dev|app|net|org|xyz|sh)$/i, "") // "Oscilar.com" -> "Oscilar"
      .trim();
  }

  if (domain) {
    if (isGenericHost(domain)) return "";
    const base = domain.split(".")[0];
    if (base && base.length > 1 && base !== "jobs" && base !== "www" && base !== "careers") {
      return base.charAt(0).toUpperCase() + base.slice(1);
    }
  }
  return "";
}

// ── REMOTE JOB BOARDS ────────────────────────────────────────

type WwrFeed = (typeof CONFIG.WWR_FEEDS)[number];
type JobicyQuery = (typeof CONFIG.JOBICY_QUERIES)[number];

/**
 * Remotive — free JSON, no key. Its `search` parameter is ignored by the API,
 * so RELEVANT_JOB_TITLE is the only filter between us and its copywriting and
 * patient-care listings.
 */
export async function fetchRemotive(): Promise<Item[]> {
  const body = await getOk(
    "https://remotive.com/api/remote-jobs?limit=" + CONFIG.REMOTIVE_LIMIT,
    "Remotive ",
  );
  const jobs = (JSON.parse(body).jobs ?? []) as Array<Record<string, string | undefined>>;
  const out: Item[] = [];

  for (const j of jobs) {
    const company = String(j.company_name || "").trim();
    const title = String(j.title || "").trim();
    if (!company || !title) continue;
    if (!CONFIG.RELEVANT_JOB_TITLE.test(title)) continue;

    // No geography check here — candidate_required_location goes to evaluate()
    // as locationField, so every drop shows up in one place in the audit.
    const location = j.candidate_required_location || "";
    out.push({
      kind: "job",
      title: title + " at " + company,
      role: title,
      location,
      salary: j.salary || "",
      snippet: cleanText(j.description || "").substring(0, 400),
      url: j.url ?? "",
      publishedAt: parseDate(j.publication_date),
      sourceLabel: "Remotive",
      segmentHint: "saas",
      locationHint: location,
      locationField: location,
      company,
      contactTitle: "Hiring Manager",
      publisher: "Remotive",
      domain: "",
    });
  }
  return out;
}

export async function fetchWeWorkRemotely(feed: WwrFeed): Promise<Item[]> {
  return parseWwrText(
    await getOk("https://weworkremotely.com/categories/" + feed.slug + ".rss", "WWR "),
    feed,
  );
}

/**
 * WeWorkRemotely category RSS. Every item carries three things we otherwise
 * guess at: <region> (an explicit eligibility field), a "Company: Role" title,
 * and the employer's own URL in the description.
 *
 * The URL has to be pulled BEFORE cleanText strips the tags — decoding first
 * turns the anchor into markup that the tag-stripper then eats, href and all.
 */
export function parseWwrText(text: string, feed: WwrFeed): Item[] {
  const out: Item[] = [];
  for (const item of rssItems(text)) {
    const rawTitle = cleanText(childText(item, "title"));
    const link = childText(item, "link").trim();
    if (!rawTitle || !link) continue;

    // "Proxify AB: Senior Backend Developer (Python)"
    const split = rawTitle.indexOf(":");
    const company = split > 0 ? rawTitle.slice(0, split).trim() : "";
    const role = split > 0 ? rawTitle.slice(split + 1).trim() : rawTitle;
    if (!CONFIG.RELEVANT_JOB_TITLE.test(role)) continue;

    const decoded = childText(item, "description")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    // The FIRST href is the "URL:" line — the employer's own site. Later hrefs
    // are apply links on WWR's domain.
    const hrefs = decoded.match(/href="(https?:\/\/[^"]+)"/i);
    const domain = hrefs ? hostOf(hrefs[1]) : "";
    const region = cleanText(childText(item, "region"));

    out.push({
      kind: "job",
      title: role + (company ? " at " + company : ""),
      role,
      location: region,
      salary: "",
      snippet: cleanText(decoded).substring(0, 400),
      url: link,
      publishedAt: parseDate(childText(item, "pubDate")),
      sourceLabel: feed.label,
      segmentHint: feed.segment,
      locationHint: region,
      locationField: region,
      company,
      contactTitle: "Hiring Manager",
      publisher: "WeWorkRemotely",
      domain: isGenericHost(domain) ? "" : domain,
    });
  }
  return out;
}

/** Jobicy — free JSON, no key. `jobGeo` is structured like Remotive's location. */
export async function fetchJobicy(jq: JobicyQuery): Promise<Item[]> {
  const body = await getOk(
    "https://jobicy.com/api/v2/remote-jobs?count=100&industry=" + encodeURIComponent(jq.industry),
    "Jobicy ",
  );
  const jobs = (JSON.parse(body).jobs ?? []) as Array<Record<string, string | number | undefined>>;
  const out: Item[] = [];

  for (const j of jobs) {
    const company = String(j.companyName || "").trim();
    const title = String(j.jobTitle || "").trim();
    if (!company || !title) continue;
    if (!CONFIG.RELEVANT_JOB_TITLE.test(title)) continue;

    const geo = String(j.jobGeo || "").trim();
    out.push({
      kind: "job",
      title: title + " at " + company,
      role: title,
      location: geo,
      salary: j.salaryMin ? String(j.salaryMin) : "",
      snippet: cleanText(String(j.jobExcerpt || j.jobDescription || "")).substring(0, 400),
      url: String(j.url ?? ""),
      publishedAt: parseDate(j.pubDate === undefined ? null : String(j.pubDate)),
      sourceLabel: jq.label,
      segmentHint: jq.segment,
      locationHint: geo,
      locationField: geo,
      company,
      contactTitle: "Hiring Manager",
      publisher: "Jobicy",
      domain: "",
    });
  }
  return out;
}

// ── COLLECTION ───────────────────────────────────────────────

type FeedRequest = {
  label: string;
  url: string;
  parse: (text: string) => Item[];
};

/**
 * Fetches every source concurrently and returns their items in a fixed order —
 * news feeds in CONFIG order, then the job boards — so dedupe (first seen
 * wins) does not depend on which server answered first.
 *
 * One source failing never aborts the run: it becomes an error row in `stats`.
 */
export async function collectAll(stats: SourceStat[]): Promise<Item[]> {
  const feeds: FeedRequest[] = [];

  // `enabled: false` switches a query off without deleting it, so the
  // measurement that killed it stays next to the query it killed.
  for (const nq of CONFIG.NEWS_QUERIES.filter((q) => q.enabled !== false)) {
    feeds.push({
      label: "GNews: " + nq.label,
      url: googleNewsUrl(nq),
      parse: (t) => parseRss2Text(t, "GNews: " + nq.label, nq.segment),
    });
    if (CONFIG.USE_BING && nq.bing) {
      feeds.push({
        label: "Bing: " + nq.label,
        url: bingNewsUrl(nq),
        parse: (t) => parseRss2Text(t, "Bing: " + nq.label, nq.segment),
      });
    }
  }
  for (const f of CONFIG.LEGACY_ALERT_FEEDS.filter((f) => f.enabled)) {
    feeds.push({
      label: "Alert: " + f.label,
      url: f.url,
      parse: (t) => parseAtomText(t, f),
    });
  }

  const boards: Array<{ label: string; run: () => Promise<Item[]> }> = [];
  if (CONFIG.USE_HN_WHO_IS_HIRING) {
    boards.push({ label: "HN: Who is hiring", run: fetchHackerNewsHiring });
  }
  if (CONFIG.USE_WWR) {
    for (const f of CONFIG.WWR_FEEDS) boards.push({ label: f.label, run: () => fetchWeWorkRemotely(f) });
  }
  if (CONFIG.USE_REMOTIVE) boards.push({ label: "Remotive", run: fetchRemotive });
  if (CONFIG.USE_JOBICY) {
    for (const jq of CONFIG.JOBICY_QUERIES) boards.push({ label: jq.label, run: () => fetchJobicy(jq) });
  }

  const tasks = [
    ...feeds.map((f) => ({
      label: f.label,
      run: async () => f.parse(await getOk(f.url, "")),
    })),
    ...boards,
  ];

  const results = await Promise.all(
    tasks.map(async (task) => {
      try {
        return { label: task.label, items: await task.run(), error: null };
      } catch (e) {
        return { label: task.label, items: [] as Item[], error: errorText(e) };
      }
    }),
  );

  const all: Item[] = [];
  for (const r of results) {
    const stat: SourceStat = {
      label: r.label,
      fetched: r.items.length,
      qualified: 0,
      error: r.error,
    };
    stats.push(stat);
    for (const item of r.items) {
      item.stat = stat;
      all.push(item);
    }
  }
  return all;
}
