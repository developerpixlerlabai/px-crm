// Offline regression suite for the scraper. Run: npm test
//
// Ported from the most load-bearing cases in google-app-script/test/test.js;
// each one pins a bug that was found against live data.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { extractCompanyName, isRealCompany } from "../company.ts";
import { CONFIG } from "../config.ts";
import { buildDigest } from "../digest.ts";
import { applySegmentQuota, evaluate, jobReach } from "../evaluate.ts";
import { parseAtomText, parseRss2Text, parseWwrText } from "../sources.ts";
import { cleanText, hasKeyword, isGenericHost, normalizeUrl } from "../text.ts";
import type { Candidate, Item } from "../types.ts";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const news = (title: string, extra: Partial<Item> = {}): Item => ({
  kind: "news",
  title,
  snippet: "",
  url: "https://example.com/" + encodeURIComponent(title),
  publishedAt: new Date(),
  sourceLabel: "test",
  segmentHint: "saas",
  company: "",
  contactTitle: "",
  publisher: "",
  domain: "",
  ...extra,
});

test("cleanText decodes double-encoded entities and strips Google's <b> tags", () => {
  const raw = "Your &lt;b&gt;Healthcare AI&lt;/b&gt; Problem. And It&amp;#39;s Hard.";
  assert.equal(cleanText(raw), "Your Healthcare AI Problem. And It's Hard.");
  assert.match(cleanText("LemonEdge lands $21m &lt;b&gt;Series A&lt;/b&gt;").toLowerCase(), /series a/);
});

test("Google News RSS: every item parsed, publisher suffix stripped", () => {
  const items = parseRss2Text(fixture("google-news-rss.xml"), "T", "saas");
  assert.ok(items.length >= 25, `parsed ${items.length}`);
  assert.ok(items.every((i) => i.title && i.url));
  assert.ok(items.filter((i) => i.publisher).length >= 25);
  assert.ok(items.every((i) => !/ - (Tracxn|Unite\.AI|Benzinga)$/.test(i.title)));
  assert.ok(items.some((i) => i.publishedAt instanceof Date));
});

test("Google Alerts Atom: no raw <b> survives and redirects are unwrapped", () => {
  const feed = CONFIG.LEGACY_ALERT_FEEDS[0];
  const items = parseAtomText(fixture("google-alert-atom.xml"), feed);
  assert.ok(items.length >= 18, `parsed ${items.length}`);
  assert.ok(items.every((i) => !i.title.includes("<b>")));
  assert.ok(items.every((i) => !/^https?:\/\/www\.google\.com\/url/.test(i.url)));
});

test("WeWorkRemotely: company, role, region and the employer's own domain", () => {
  const items = parseWwrText(fixture("wwr-programming.rss"), CONFIG.WWR_FEEDS[1]);
  const mule = items.find((w) => w.company === "Sticker Mule");
  assert.ok(mule, "company taken from the 'Company: Role' title");
  assert.equal(mule.role, "Software engineer");
  assert.equal(mule.locationField, "Anywhere in the World");
  // Entity-encoded inside the description: must be pulled out before cleanText.
  assert.equal(mule.domain, "stickermule.com");
  assert.ok(items.some((w) => w.company === "Proxify AB"), "plain backend roles are admitted");
  assert.ok(items.every((w) => !/&lt;|<p>/.test(w.snippet)));
  assert.ok(!items.some((w) => /Counsel|Regulatory/i.test(w.role ?? "")));

  // The region field decides, and differently per row. Dated today so the
  // fixture's age cannot fail the recency gate.
  const fresh = (w: Item) => ({ ...w, publishedAt: new Date() });
  const asia = items.find((w) => w.locationField === "Asia Only");
  const na = items.find((w) => w.locationField === "North America Only");
  assert.ok(asia && evaluate(fresh(asia)).keep, '"Asia Only" includes India');
  assert.ok(na && !evaluate(fresh(na)).keep, '"North America Only" does not');
});

test("normalizeUrl keeps identity params and drops tracking ones", () => {
  // Stripping the whole query collapsed 84 HN posts (item?id=N) into one key.
  assert.notEqual(
    normalizeUrl("https://news.ycombinator.com/item?id=1"),
    normalizeUrl("https://news.ycombinator.com/item?id=2"),
  );
  assert.equal(
    normalizeUrl("https://www.Example.com/a/?utm_source=x&id=7#frag"),
    normalizeUrl("http://example.com/a?id=7"),
  );
});

test("keywords match at the leading word edge only", () => {
  assert.ok(!hasKeyword("in ongoing series b", "ngo"));
  assert.ok(!hasKeyword("livestock tech platform", "stock"));
  assert.ok(!hasKeyword("capacity raises $54m", "apac"));
  assert.ok(hasKeyword("two startups raised", "startup"), "stems still match");
});

test("isGenericHost: same-length hosts are not mistaken for a blocklist entry", () => {
  assert.equal(isGenericHost("adalat.ai"), false); // as long as "notion.so"
  assert.equal(isGenericHost("www.linkedin.com"), true);
  assert.equal(isGenericHost("drive.google.com"), true);
});

test("company extraction names companies and refuses non-companies", () => {
  const cases: Array<[string, string | null]> = [
    ["Obsidian Security Raises $85 Million Series D at $1.1 Billion Valuation", "Obsidian Security"],
    ["Acme Health raises $12M to expand AI triage", "Acme Health"],
    ["Brightwave, a B2B software startup, hires its first Head of AI", "Brightwave"],
    ["Nuvia Labs announces AI-powered claims platform", "Nuvia Labs"],
    ["TechCrunch launches a new newsletter", null],
    ["How to build an AI strategy", null],
    ["Two LA Startups Raised $2.37B to Build What AI Needs", null],
  ];
  for (const [title, want] of cases) {
    const got = extractCompanyName(title, "");
    if (want === null) assert.ok(!isRealCompany(got), `${title} -> ${got}`);
    else assert.equal(got, want, title);
  }
});

test("jobReach: structured fields are an allowlist, free text needs a fence", () => {
  const structured: Array<[string, string]> = [
    ["Worldwide", "open"],
    ["Asia Only", "open"],
    ["LATAM, Europe, USA, Canada, APAC", "open"],
    ["Americas, Europe, Israel", "fenced"],
    ["North America Only", "fenced"],
    ["EMEA", "fenced"],
  ];
  for (const [field, want] of structured) assert.equal(jobReach("", field), want, field);

  const free: Array<[string, string]> = [
    ["Acme | REMOTE | ML Engineer", "unclear"],
    ["Acme | Remote (US only) | ML Engineer", "fenced"],
    ["Acme | REMOTE (US) | ML Engineer", "fenced"],
    ["Acme | Remote | must be authorized to work in the US", "fenced"],
    ["Acme | Remote — Worldwide | ML Engineer", "open"],
    ["Acme | NYC ONSITE | ML Engineer", "onsite"],
  ];
  for (const [text, want] of free) assert.equal(jobReach(text, ""), want, text);

  assert.notEqual(jobReach("Campus based role, remote", ""), "fenced");
  assert.equal(jobReach("Remote | Building consensus across teams", ""), "unclear");
});

test("evaluate: a trigger event is required, and vertical words score nothing", () => {
  const topic = evaluate(news("Healthcare AI, digital health and telehealth: a clinical outlook"));
  assert.deepEqual(topic, { keep: false, reason: "no trigger event" });

  const funded = evaluate(news("Acme Health raises $12M Series A to expand AI triage"));
  assert.ok(funded.keep);
  assert.equal(funded.company, "Acme Health");
  assert.ok(funded.score >= CONFIG.MIN_SCORE);

  const report = evaluate(news("AI market size to reach $1T, report says"));
  assert.ok(!report.keep);
});

test("segment quota is a ceiling on the run, never padding", () => {
  const lead = (i: number, segment: string, sourceLabel = `src${i % 9}`) =>
    ({ ...news(`lead ${i}`), ...{ keep: true, score: 7, segment, sourceLabel } }) as unknown as Candidate;
  const pool = [...Array.from({ length: 40 }, (_, i) => lead(i, "saas")), lead(99, "fintech")];
  const quota = applySegmentQuota(pool);
  assert.equal(quota.counts.fintech, 1, "a thin segment is not padded");
  assert.ok(quota.counts.saas <= quota.cap, "the ceiling binds");
  assert.equal(quota.cap, Math.ceil(41 * CONFIG.MAX_SEGMENT_SHARE));
});

test("digest HTML stays email-safe", () => {
  const verdict = evaluate(news("Acme Health raises $12M Series A to expand AI triage"));
  assert.ok(verdict.keep);
  const lead = { ...news("Acme Health raises $12M Series A"), ...verdict } as Candidate;
  const quota = applySegmentQuota([lead]);
  const { html, subject } = buildDigest(quota.kept, quota, [], "https://crm.example.com");

  const balanced = (tag: string) =>
    (html.match(new RegExp(`<${tag}\\b`, "g")) ?? []).length ===
    (html.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
  assert.ok(["table", "tr", "td"].every(balanced));
  assert.ok(!/display\s*:\s*flex/.test(html), "Gmail strips flexbox");
  assert.ok(![...html].some((c) => (c.codePointAt(0) ?? 0) > 0xffff), "no astral emoji");
  assert.match(subject, /1 new/);
});
