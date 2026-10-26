import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendMessage } from "@/lib/google/gmail";
import { accessTokenForMailbox, listMailboxes } from "@/lib/google/mailboxes";
import { isGoogleConfigured } from "@/lib/google/oauth";
import { GMAIL_SEND_SCOPE } from "@/lib/google/types";
import { createServiceClient } from "@/lib/supabase/service";

import { CONFIG } from "./config.ts";
import { buildDigest } from "./digest.ts";
import { applySegmentQuota, companyKeyOf, evaluate, scoreLabel, statDetail } from "./evaluate.ts";
import { collectAll } from "./sources.ts";
import { fingerprint, normalizeUrl, parseDate } from "./text.ts";
import type { Candidate, Quota, SourceStat } from "./types.ts";

/**
 * The daily run: what runDailyIntentScrape() did in Apps Script, with the
 * Leads sheet replaced by public.leads and the Run Log tab by scrape_runs.
 */

export type RunSummary = {
  dryRun: boolean;
  fetched: number;
  qualified: number;
  saved: number;
  deferred: number;
  segments: Record<string, number>;
  sources: SourceRow[];
  digest: string;
  /** Dry runs only: what would have been saved. */
  preview?: Array<Pick<Candidate, "score" | "company" | "segment" | "intents" | "title" | "url">>;
};

type SourceRow = {
  label: string;
  status: "OK" | "EMPTY" | "ERROR";
  fetched: number;
  qualified: number;
  detail: string;
};

export async function runScrape({ dryRun = false } = {}): Promise<RunSummary> {
  const supabase = createServiceClient();
  const startedAt = new Date().toISOString();

  try {
    const summary = await scrape(supabase, dryRun);
    if (!dryRun) await logRun(supabase, startedAt, "success", summary);
    return summary;
  } catch (err) {
    if (!dryRun) {
      // The failure itself is the most useful row in the log; never let a
      // logging error replace it.
      await logRun(supabase, startedAt, "error", null, String(err)).catch(() => {});
    }
    throw err;
  }
}

async function scrape(supabase: SupabaseClient, dryRun: boolean): Promise<RunSummary> {
  const seen = await getSeenKeys(supabase);
  const stats: SourceStat[] = [];
  const candidates: Candidate[] = [];

  // 1. COLLECT from every source
  const collected = await collectAll(stats);

  for (const item of collected) {
    // Dedupe on URL *and* a normalized headline fingerprint: Google News links
    // are opaque per-query redirects, so the same story arrives with a
    // different URL from each query.
    if (!item.url || seen.urls.has(normalizeUrl(item.url))) continue;

    // Fingerprinting is NEWS only. Anonymous HN posts share one generic title
    // prefix — fingerprinting them collapsed 80 distinct postings into one.
    const fp = item.kind === "job" ? "" : fingerprint(item.title);
    if (fp && seen.prints.has(fp)) continue;

    const verdict = evaluate(item, { fundedCompanies: seen.funded });
    if (!verdict.keep) continue;

    // Company-level dedupe — the same event covered by several outlets
    if (verdict.companyKey && seen.companies.has(verdict.companyKey)) continue;

    if (fp) seen.prints.add(fp); // in-run dedupe as well
    seen.urls.add(normalizeUrl(item.url));
    if (verdict.companyKey) seen.companies.add(verdict.companyKey);

    candidates.push({ ...item, ...verdict });
  }

  // 2. RANK + APPLY SEGMENT QUOTA
  candidates.sort((a, b) => b.score - a.score);
  const quota = applySegmentQuota(candidates);

  // 3. SAVE + DIGEST
  const saved = dryRun ? 0 : await saveLeads(supabase, quota.kept);
  const digest = dryRun
    ? "skipped: dry run"
    : quota.kept.length
      ? await sendDigest(quota, stats)
      : "skipped: no new leads";

  return {
    dryRun,
    fetched: stats.reduce((n, s) => n + s.fetched, 0),
    qualified: candidates.length,
    saved,
    deferred: quota.deferred.length,
    segments: quota.counts,
    sources: stats.map((s) => ({
      label: s.label,
      status: s.fetched === 0 ? "EMPTY" : s.error ? "ERROR" : "OK",
      fetched: s.fetched,
      qualified: s.qualified,
      detail:
        statDetail(s) +
        (s.fetched === 0 && !s.error ? "  ← SOURCE RETURNED NOTHING, check the query" : ""),
    })),
    digest,
    ...(dryRun
      ? {
          preview: quota.kept.map(({ score, company, segment, intents, title, url }) => ({
            score, company, segment, intents, title, url,
          })),
        }
      : {}),
  };
}

// ── DUPLICATE PREVENTION ─────────────────────────────────────

/**
 * Three dedupe keys from the leads already stored:
 *   urls      — normalized Source URL
 *   prints    — headline fingerprint
 *   companies — company name, only from leads newer than COMPANY_DEDUPE_DAYS
 *
 * The company key is the one that matters in practice: one funding round gets
 * four publications, four headlines and four redirect URLs. A live test
 * produced "Superleap" 4x in one run before it existed.
 *
 * Also returns `funded`: companies whose funding news we saved within
 * FUNDED_LOOKBACK_DAYS. A job posting from one of them is the strongest
 * signal the system has — new money, now spending it on engineering.
 */
async function getSeenKeys(supabase: SupabaseClient) {
  const keys = {
    urls: new Set<string>(),
    prints: new Set<string>(),
    companies: new Set<string>(),
    funded: new Set<string>(),
  };
  const cutoff =
    CONFIG.COMPANY_DEDUPE_DAYS > 0
      ? new Date(Date.now() - CONFIG.COMPANY_DEDUPE_DAYS * 86400000)
      : null;
  const fundedCutoff = new Date(Date.now() - CONFIG.FUNDED_LOOKBACK_DAYS * 86400000);

  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("leads")
      .select("date_found, company, headline, source_url, matched_signals")
      .order("seq", { ascending: true })
      .range(from, from + PAGE - 1)
      .returns<
        Array<{
          date_found: string | null;
          company: string;
          headline: string;
          source_url: string;
          matched_signals: string;
        }>
      >();
    if (error) throw new Error(`Could not read existing leads: ${error.message}`);

    for (const row of data) {
      if (row.source_url) keys.urls.add(normalizeUrl(row.source_url));
      if (row.headline) keys.prints.add(fingerprint(row.headline));

      const ck = companyKeyOf(row.company);
      if (!ck || ck.indexOf("extractmanually") !== -1) continue;
      const found = parseDate(row.date_found);

      if (cutoff && (!found || found >= cutoff)) keys.companies.add(ck);
      if (found && found >= fundedCutoff && /\bFunding\b/.test(row.matched_signals)) {
        keys.funded.add(ck);
      }
    }
    if (data.length < PAGE) break;
  }
  return keys;
}

// ── PERSISTENCE ──────────────────────────────────────────────

/** Inserts the run's leads; returns how many were actually new. */
async function saveLeads(supabase: SupabaseClient, kept: Candidate[]): Promise<number> {
  if (!kept.length) return 0;

  const now = new Date().toISOString();
  const rows = kept.map((c) => ({
    date_found: now,
    priority: scoreLabel(c.score),
    score: c.score,
    company: c.company,
    title_role: c.contactTitle || "",
    signal_source: c.sourceLabel,
    matched_signals: c.intents,
    headline: c.title,
    snippet: (c.snippet || "").substring(0, 300),
    source_url: c.url,
    status: "New",
    segment: c.segment,
    intent: c.intents,
    domain: c.domain || "",
    technology: c.technology || "",
    service_opportunity: c.opportunity || "",
    recommended_outreach: c.outreach || "",
  }));

  // `key` is unique, so a lead that slipped past the in-memory dedupe (say, a
  // run that overlapped another) is skipped rather than duplicated.
  const { data, error } = await supabase
    .from("leads")
    .upsert(rows, { onConflict: "key", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`Could not save leads: ${error.message}`);
  return data.length;
}

async function logRun(
  supabase: SupabaseClient,
  startedAt: string,
  status: "success" | "error",
  summary: RunSummary | null,
  error?: string,
) {
  const { error: insertError } = await supabase.from("scrape_runs").insert({
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status,
    ...(summary
      ? {
          fetched: summary.fetched,
          qualified: summary.qualified,
          saved: summary.saved,
          deferred: summary.deferred,
          segments: summary.segments,
          sources: summary.sources,
          digest: summary.digest,
        }
      : {}),
    error: error ?? null,
  });
  if (insertError) console.error("[scraper] could not log the run", insertError.message);
}

// ── DIGEST ───────────────────────────────────────────────────

/**
 * Sends the digest from a mailbox connected in the CRM. Never throws: a run
 * that saved its leads is a success even if the email could not go out, and
 * the reason lands in scrape_runs.digest instead.
 *
 * DIGEST_MAILBOX picks the sending account (default: the first connected one
 * with send access); DIGEST_TO overrides CONFIG.NOTIFICATION_EMAIL.
 */
async function sendDigest(quota: Quota, stats: SourceStat[]): Promise<string> {
  try {
    if (!isGoogleConfigured()) return "skipped: Google OAuth is not configured";

    const wanted = process.env.DIGEST_MAILBOX?.trim().toLowerCase();
    const mailbox = (await listMailboxes()).find(
      (m) =>
        m.status === "connected" &&
        (m.scopes ?? []).includes(GMAIL_SEND_SCOPE) &&
        (!wanted || m.address.toLowerCase() === wanted),
    );
    if (!mailbox) {
      return wanted
        ? `skipped: ${wanted} is not connected with send access`
        : "skipped: no mailbox is connected with send access";
    }

    const to = process.env.DIGEST_TO?.trim() || CONFIG.NOTIFICATION_EMAIL;
    const digest = buildDigest(quota.kept, quota, stats, process.env.APP_URL?.trim() ?? "");

    await sendMessage(await accessTokenForMailbox(mailbox.id), {
      from: `"${digest.fromName}" <${mailbox.address}>`,
      to,
      subject: digest.subject,
      body: digest.text,
      html: digest.html,
    });
    return `sent to ${to} from ${mailbox.address}`;
  } catch (err) {
    console.error("[scraper] digest failed", err);
    return `failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}
