/**
 * Date helpers pinned to a fixed locale and UTC.
 *
 * The lead list is rendered on the server and hydrated on the client, so any
 * formatter that reads the visitor's locale or timezone produces a hydration
 * mismatch. Everything here is deterministic for a given input.
 */

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const FULL = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function parseDate(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatShortDate(value: string): string {
  const date = parseDate(value);
  return date ? DAY_MONTH.format(date) : "—";
}

export function formatFullDate(value: string): string {
  const date = parseDate(value);
  return date ? FULL.format(date) : "—";
}

/** Whole days between `value` and now. Client-only — depends on the clock. */
export function daysAgo(value: string): number | null {
  const date = parseDate(value);
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

export function formatRelative(value: string): string {
  const days = daysAgo(value);
  if (days === null) return "—";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1mo ago" : `${months}mo ago`;
}

export function formatClock(value: string): string {
  const date = parseDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

/** "https://news.google.com/rss/articles/..." -> "news.google.com" */
export function hostOf(url: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Splits Code.gs's comma-joined "Funding, Product Launch" into chips. */
export function splitSignals(value: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
