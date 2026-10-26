import { extractCompanyName, isRealCompany } from "./company.ts";
import { CONFIG } from "./config.ts";
import {
  DISQUALIFY,
  INTENT_GROUPS,
  JOB_FENCED_RE,
  JOB_OPEN_RE,
  JOB_POSTING_INTENT,
  JOB_REMOTE_RE,
  NON_US_HARD,
  NON_US_SOFT,
  OUTREACH_ANGLES,
  PENALTIES,
  REGION_INCLUDES_INDIA,
  SEGMENT_KEYWORDS,
  STOCK_PUBLISHERS,
  TECHNOLOGIES,
  US_MARKERS,
  WRONG_BUYER,
} from "./keywords.ts";
import { findKeyword, hasKeyword } from "./text.ts";
import type { Candidate, Item, Quota, Rejection, SourceStat, Verdict } from "./types.ts";

export type Reach = "open" | "unclear" | "fenced" | "onsite";

/**
 * How far does this job posting reach — can Pixler Lab take it on from India?
 *
 *   "open"    explicitly includes India (or is worldwide)
 *   "unclear" remote, but the region is never stated
 *   "fenced"  remote, but restricted to a region that excludes us
 *   "onsite"  no remote marker at all — an office job somewhere we are not
 *
 * `structured` is the source's own location field (Remotive, WWR, Jobicy).
 * When present it is authoritative and treated as an ALLOWLIST: a field that
 * names regions but not ours is a fence, even though it contains no "only".
 * When absent (Hacker News) we fall back to reading the free text, where the
 * absence of a fence has to be read as permission — HN posters write "REMOTE"
 * and leave it at that far too often to reject them all.
 */
export function jobReach(freeText: string, structured: string | undefined): Reach {
  const struct = String(structured || "").toLowerCase().trim();

  if (struct) {
    // Split on the separators these fields actually use, so "USA" from
    // "LATAM, Europe, USA, Canada, APAC" is one token among five.
    const tokens = struct
      .split(/[,;/|]|\band\b|\+/)
      .map((t) => t.trim())
      .filter((t) => t);
    const open = tokens.some((t) => REGION_INCLUDES_INDIA.some((r) => t.indexOf(r) !== -1));
    if (open) return "open";
    if (tokens.length) return "fenced";
  }

  const text = String(freeText || "");
  if (JOB_FENCED_RE.test(text)) return "fenced";
  if (JOB_OPEN_RE.test(text)) return "open";
  if (JOB_REMOTE_RE.test(text)) return "unclear";
  return "onsite";
}

/**
 * The hard gate plus the two-axis score.
 *
 * An item must show at least one real trigger event. Without that gate a
 * competitor's blog post ("Your Healthcare AI Strategy Has a Data Problem")
 * scored 6+ on vertical keywords alone and was saved as a lead.
 */
export function evaluate(item: Item): Verdict | Rejection {
  const isJob = item.kind === "job";
  const text = (item.title + " " + item.snippet).toLowerCase();
  const stat = item.stat;

  // Every rejection is counted on its source, so the run log can say WHY a
  // source produced nothing — duplicates, topic articles and wrong geography
  // need opposite fixes.
  const reject = (reason: string): Rejection => {
    if (stat) {
      stat.rejected = (stat.rejected || 0) + 1;
      // "score 4" and "score 7" are the same finding; bucket them together.
      const bucket =
        reason.indexOf(":") !== -1
          ? reason.split(":")[0].trim()
          : reason.indexOf("score") === 0
            ? "low score"
            : reason;
      stat.reasons = stat.reasons || {};
      stat.reasons[bucket] = (stat.reasons[bucket] || 0) + 1;
    }
    return { keep: false, reason };
  };

  // 1. Recency. Job postings stay open far longer than news stays relevant.
  const maxAge = isJob ? CONFIG.JOB_RECENCY_DAYS : CONFIG.RECENCY_DAYS;
  let ageDays: number | null = null;
  if (item.publishedAt) {
    ageDays = (Date.now() - item.publishedAt.getTime()) / 86400000;
    if (maxAge > 0 && ageDays > maxAge) return reject("too old");
  }

  // 2. Geography — "can we deliver this?", not "is this American?".
  //    Jobs read the title + the source's location field only, never the
  //    description, which lists every office the employer has ever had.
  let reach: Reach | null = null;
  if (isJob) {
    reach = jobReach(item.title + " " + (item.locationHint || ""), item.locationField);
    if (CONFIG.REQUIRE_REMOTE_JOB && (reach === "fenced" || reach === "onsite")) {
      return reject("out of reach: " + reach);
    }
  } else if (CONFIG.NEWS_GEO === "us") {
    const foreign = findKeyword(text, NON_US_HARD);
    if (foreign) return reject("non-US: " + foreign.trim());
  }

  // 3. Wrong buyer type. Jobs get the title-only check for the same reason.
  const buyerText = isJob ? (item.title + " " + (item.company || "")).toLowerCase() : text;
  const badBuyer = findKeyword(buyerText, WRONG_BUYER);
  if (badBuyer) return reject("wrong buyer: " + badBuyer.trim());

  // 4. Content-type noise — NEWS ONLY. "university", "how to" and "vs." are
  //    everywhere in job descriptions; applied to jobs this rejected all of them.
  if (!isJob) {
    const dq = findKeyword(text, DISQUALIFY);
    if (dq) return reject("disqualified: " + dq);

    // Substring, NOT hasKeyword: publication names matched against a longer
    // publication string — "motley fool" must match "The Motley Fool".
    const pub = String(item.publisher || "").toLowerCase();
    if (pub && STOCK_PUBLISHERS.some((p) => pub.indexOf(p) !== -1)) {
      return reject("stock-coverage publisher: " + item.publisher);
    }
  }

  // 5. Intent groups — each fires ONCE (no synonym stacking)
  let fired = INTENT_GROUPS.filter((g) => g.kw.some((k) => hasKeyword(text, k)));

  // A job posting IS the trigger event — an open req is committed budget, and
  // the source already filtered for relevance. Without this, 52 of 84 real HN
  // posts were thrown away for saying "Software Engineer, ML platform".
  if (fired.length === 0 && isJob) fired = [JOB_POSTING_INTENT];

  if (fired.length === 0) return reject("no trigger event");

  // Count the 3 strongest groups only, so a keyword-dense article can't run away
  const counted = fired
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);
  let score = counted.reduce((n, g) => n + g.weight, 0);

  // 6. Segment classification (tag only — contributes ZERO points)
  const segment = classifySegment(text, item.segmentHint);

  // 7. Outreach-readiness + locality bonuses
  const company = item.company || extractCompanyName(item.title, item.publisher);
  if (isRealCompany(company)) score += 2;
  if (item.domain) score += 1; // we already have their website
  if (ageDays !== null && ageDays <= 3) score += 1;
  // A posting that names India (or the whole world) beats a bare "Remote".
  if (reach === "open") score += 1;
  if (CONFIG.NEWS_GEO === "us" && !isJob && US_MARKERS.some((k) => hasKeyword(text, k))) {
    score += 1;
  }

  // 8. Soft penalties
  if (CONFIG.NEWS_GEO === "us" && !isJob && NON_US_SOFT.some((k) => hasKeyword(text, k))) {
    score -= 3;
  }
  PENALTIES.forEach((p) => {
    if (p.kw.some((k) => hasKeyword(text, k))) score += p.points;
  });

  score = Math.max(0, Math.min(10, score));
  if (score < CONFIG.MIN_SCORE) return reject("score " + score);

  if (stat) stat.qualified++;

  const resolved = isRealCompany(company) ? company : "";
  const displayCompany = resolved || "— extract manually —";

  // Derived AFTER the lead has earned its place; none of these score.
  // Technology reads the role too: a WWR title is "Company: Role".
  const intents = fired.map((g) => g.key).join(", ");
  const technologies = detectTechnology(text + " " + String(item.role || "").toLowerCase());

  return {
    keep: true,
    score,
    intents,
    segment,
    technology: technologies.join(", "),
    opportunity: deriveOpportunity(technologies, intents, segment),
    outreach: outreachAngle(intents, technologies, displayCompany),
    company: displayCompany,
    // Empty when we couldn't name the company, so unnamed leads never collapse
    // into each other.
    companyKey: resolved ? resolved.toLowerCase().replace(/[^a-z0-9]/g, "") : "",
    reason: "ok",
  };
}

/**
 * Vertical tag. Falls back to the source's own hint, then "other".
 *
 * FIRST segment that matches at all wins, in SEGMENT_KEYWORDS declaration
 * order. Counting hits looks fairer and is not: it hands the tag to whichever
 * list owns the most synonyms for one phrase.
 */
export function classifySegment(text: string, hint: string): string {
  for (const [segment, keywords] of Object.entries(SEGMENT_KEYWORDS)) {
    if (keywords.some((k) => hasKeyword(text, k))) return segment;
  }
  return hint || "other";
}

/**
 * Which of Pixler Lab's technologies this signal is about. At most three, most
 * specific first; a technology that `covers` another suppresses it.
 */
export function detectTechnology(text: string): string[] {
  const hits = TECHNOLOGIES.filter((t) => t.kw.some((k) => hasKeyword(text, k)));
  const covered: Record<string, boolean> = {};
  hits.forEach((t) => t.covers.forEach((c) => (covered[c] = true)));
  return hits
    .filter((t) => !covered[t.name])
    .map((t) => t.name)
    .slice(0, 3);
}

/**
 * The service Pixler Lab would actually pitch, ordered by how specific the
 * evidence is. Returns "" when nothing supports a claim — a service must not
 * be invented.
 */
export function deriveOpportunity(technologies: string[], intents: string, segment: string): string {
  const has = (t: string) => technologies.indexOf(t) !== -1;
  const fired = (k: string) => intents.indexOf(k) !== -1;

  if (has("Shopify") || fired("Shopify / Ecommerce")) return "Shopify Development / Migration";
  if (segment === "ecommerce") return "Ecommerce Development";
  if (
    fired("Mobile App") || has("React Native") || has("Flutter") ||
    has("iOS") || has("Android") || has("Mobile")
  ) {
    if (has("React Native")) return "React Native Development";
    if (has("Flutter")) return "Flutter Development";
    return "Mobile App Development";
  }
  if (fired("Modernization")) return "Software Modernization";
  if (fired("AI Hiring") || fired("AI Initiative") || has("AI/LLM")) {
    return "AI Development / Integration";
  }

  if (fired("Developer Hiring")) {
    if (has("React")) return "React Development";
    if (has("Node.js")) return "Node.js Development";
    if (has("Python")) return "Python Development";
    if (has("Laravel")) return "Laravel Development";
    if (has("PHP")) return "PHP Development";
    return "Dedicated Development Team";
  }
  if (fired("Engineering Expansion")) return "Dedicated Development Team";
  if (has("API/Integration")) return "API / Integration Development";
  if (fired("Funding") || fired("New Leadership")) return "Custom Software Development";
  if (fired("Product Launch")) return "Custom Software Development";
  if (fired("Open AI Role")) return "Dedicated Development Team";
  return "";
}

/** One sentence a human can act on, or "" when nothing fired. */
export function outreachAngle(intents: string, technologies: string[], company: string): string {
  for (const [intent, angle] of OUTREACH_ANGLES) {
    if (intents.indexOf(intent) === -1) continue;
    const who = company && company.indexOf("extract manually") === -1 ? company : "This company";
    const tech = technologies.length ? technologies[0] : "software";
    return who + " " + angle.replace(/\{TECH\}/g, tech);
  }
  return "";
}

/**
 * Caps any one segment's share of a run, and any one source's count, so a
 * single noisy vertical or board can't own the digest. Deferred items are
 * neither saved nor marked seen, so they come back on the next run.
 *
 * The cap is a share of the RUN (MAX_LEADS_PER_RUN), not of the qualified
 * pool — against the pool it was 175 per segment and never once bound. It is a
 * ceiling only; nothing is ever padded.
 */
export function applySegmentQuota(sorted: Candidate[]): Quota {
  const cap = Math.max(
    CONFIG.MIN_PER_SEGMENT,
    Math.ceil(Math.min(sorted.length, CONFIG.MAX_LEADS_PER_RUN) * CONFIG.MAX_SEGMENT_SHARE),
  );
  const counts: Record<string, number> = {};
  const perSource: Record<string, number> = {};
  const kept: Candidate[] = [];
  const deferred: Candidate[] = [];

  sorted.forEach((c) => {
    const seg = c.segment || "other";
    const src = c.sourceLabel || "?";
    counts[seg] = counts[seg] || 0;
    perSource[src] = perSource[src] || 0;

    if (
      counts[seg] < cap &&
      perSource[src] < CONFIG.MAX_PER_SOURCE &&
      kept.length < CONFIG.MAX_LEADS_PER_RUN
    ) {
      counts[seg]++;
      perSource[src]++;
      kept.push(c);
    } else {
      deferred.push(c);
    }
  });

  return { kept, deferred, cap, counts, perSource };
}

/**
 * "fetched 25 · qualified 0 · rejected 25 · no trigger event 18, disqualified 7"
 *
 * `rejected` comes from evaluate(), not `fetched - qualified`: duplicates never
 * reach evaluate(), so that subtraction blamed the scoring for the deduper.
 */
export function statDetail(s: SourceStat): string {
  if (s.error) return s.error;
  const parts = ["fetched " + s.fetched, "qualified " + s.qualified];
  if (s.rejected) parts.push("rejected " + s.rejected);
  const reasons = s.reasons ?? {};
  const top = Object.keys(reasons)
    .sort((a, b) => reasons[b] - reasons[a])
    .slice(0, 4)
    .map((r) => r + " " + reasons[r]);
  return parts.join(" · ") + (top.length ? " · " + top.join(", ") : "");
}

export function scoreLabel(score: number): string {
  if (score >= 8) return "🔥 Hot";
  if (score >= 6) return "⚡ Warm";
  return "❄️ Cool";
}
