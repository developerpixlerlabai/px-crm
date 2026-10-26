/**
 * Every source funnels into one normalized Item. Field names follow the Apps
 * Script scraper this was ported from, so the two can be compared in history.
 */
export type Item = {
  kind: "news" | "job";
  title: string;
  snippet: string;
  url: string;
  publishedAt: Date | null;
  sourceLabel: string;
  segmentHint: string;
  company: string;
  contactTitle: string;
  publisher: string;
  domain: string;

  // Job postings only.
  role?: string;
  location?: string;
  salary?: string;
  /** Free text the reach check reads (HN's pipe header). */
  locationHint?: string;
  /** The source's own structured location, when it has one. Authoritative. */
  locationField?: string;

  /** The source this item came from. evaluate() writes its reject reasons here. */
  stat?: SourceStat;
};

/** Per-source diagnostics, written to scrape_runs so a dead feed is visible. */
export type SourceStat = {
  label: string;
  fetched: number;
  qualified: number;
  error: string | null;
  rejected?: number;
  reasons?: Record<string, number>;
};

export type Rejection = { keep: false; reason: string };

export type Verdict = {
  keep: true;
  score: number;
  intents: string;
  segment: string;
  technology: string;
  opportunity: string;
  outreach: string;
  /** The resolved name, or "— extract manually —". */
  company: string;
  /** Company-level dedupe key; "" when the company could not be named. */
  companyKey: string;
  reason: "ok";
};

/** An item that passed evaluation, with its verdict merged over it. */
export type Candidate = Omit<Item, "company"> & Verdict;

export type Quota = {
  kept: Candidate[];
  deferred: Candidate[];
  cap: number;
  counts: Record<string, number>;
  perSource: Record<string, number>;
};
