import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import type { LeadResearch } from "@/lib/research-schema";
import type { EditableField, Lead, LeadUpdates, LeadsResponse } from "@/lib/types";

/**
 * Leads in Supabase (supabase/migrations/0003_leads.sql). Replaces the Apps
 * Script web app the dashboard used to proxy; the route handlers and the page
 * call this, and the service key never leaves the server process.
 */

export class LeadsError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "LeadsError";
    this.status = status;
  }
}

/** Database row, as PostgREST returns it. */
type LeadRow = {
  key: string;
  date_found: string | null;
  priority: string;
  score: number;
  company: string;
  contact_name: string;
  title_role: string;
  email: string;
  signal_source: string;
  matched_signals: string;
  headline: string;
  snippet: string;
  source_url: string;
  status: string;
  notes: string;
  outreach_sent: string;
  segment: string;
  intent: string;
  domain: string;
  research: LeadResearch | null;
  researched_at: string | null;
};

const COLUMNS =
  "key, date_found, priority, score, company, contact_name, title_role, email, " +
  "signal_source, matched_signals, headline, snippet, source_url, status, notes, " +
  "outreach_sent, segment, intent, domain, research, researched_at";

const EDITABLE_COLUMNS: Record<EditableField, keyof LeadRow> = {
  contactName: "contact_name",
  titleRole: "title_role",
  email: "email",
  status: "status",
  notes: "notes",
  outreachSent: "outreach_sent",
};

function toLead(row: LeadRow): Lead {
  return {
    key: row.key,
    dateFound: row.date_found ?? "",
    priority: row.priority,
    score: row.score,
    company: row.company,
    contactName: row.contact_name,
    titleRole: row.title_role,
    email: row.email,
    signalSource: row.signal_source,
    matchedSignals: row.matched_signals,
    headline: row.headline,
    snippet: row.snippet,
    sourceUrl: row.source_url,
    status: row.status,
    notes: row.notes,
    outreachSent: row.outreach_sent,
    segment: row.segment,
    intent: row.intent,
    domain: row.domain,
    research: row.research,
    researchedAt: row.researched_at ?? "",
  };
}

/**
 * Pulls every lead, newest first. The dashboard filters client-side, so this
 * returns the lot; a few thousand rows is well within one response.
 */
export async function fetchLeads(): Promise<LeadsResponse> {
  const supabase = createServiceClient();

  // PostgREST caps a response at the project's max-rows (1000 by default), so
  // the leads come in pages. The first page also returns the total, and every
  // other page is then requested at once — two round trips however many leads
  // there are, instead of one per thousand.
  const PAGE = 1000;
  const page = (from: number, maxSeq?: number) => {
    let query = supabase
      .from("leads")
      .select(`seq, ${COLUMNS}`, from === 0 ? { count: "exact" } : undefined)
      .order("seq", { ascending: false });
    // Pin the later pages to the first page's newest lead, so a scrape that
    // inserts mid-load cannot shift the offsets and duplicate a row.
    if (maxSeq !== undefined) query = query.lte("seq", maxSeq);
    return query.range(from, from + PAGE - 1).returns<Array<LeadRow & { seq: number }>>();
  };

  const first = await page(0);
  if (first.error) {
    throw new LeadsError(`Could not load leads: ${first.error.message}`, 502);
  }

  const rows: LeadRow[] = [...first.data];
  const total = first.count ?? first.data.length;
  if (first.data.length === PAGE && total > PAGE) {
    const maxSeq = first.data[0].seq;
    const rest = await Promise.all(
      Array.from({ length: Math.ceil(total / PAGE) - 1 }, (_, i) => page((i + 1) * PAGE, maxSeq)),
    );
    for (const result of rest) {
      if (result.error) {
        throw new LeadsError(`Could not load leads: ${result.error.message}`, 502);
      }
      rows.push(...result.data);
    }
  }

  return {
    leads: rows.map(toLead),
    meta: {
      total: rows.length,
      returned: rows.length,
      fetchedAt: new Date().toISOString(),
    },
  };
}

export type UpdateResult = {
  ok: boolean;
  results: Array<{ key: string; ok: boolean; error?: string; lead?: Lead }>;
  updated: number;
  failed: number;
};

/**
 * Applies partial updates, one statement per lead. Each item succeeds or fails
 * on its own, so a bulk save reports exactly which leads did not land.
 */
export async function updateLeads(
  items: Array<{ key: string; updates: LeadUpdates }>,
): Promise<UpdateResult> {
  const supabase = createServiceClient();

  const results = await Promise.all(
    items.map(async ({ key, updates }) => {
      const patch: Partial<LeadRow> = {};
      for (const [field, value] of Object.entries(updates)) {
        const column = EDITABLE_COLUMNS[field as EditableField];
        if (column) patch[column] = value as never;
      }

      if (!Object.keys(patch).length) {
        return { key, ok: false, error: "No editable fields in this update." };
      }

      const { data, error } = await supabase
        .from("leads")
        .update(patch)
        .eq("key", key)
        .select(COLUMNS)
        .returns<LeadRow[]>();

      if (error) return { key, ok: false, error: error.message };
      if (!data.length) {
        return { key, ok: false, error: "Lead not found — it may have been deleted." };
      }
      return { key, ok: true, lead: toLead(data[0]) };
    }),
  );

  const failed = results.filter((r) => !r.ok).length;
  return { ok: failed === 0, results, updated: results.length - failed, failed };
}

/** One lead by its key, or null. */
export async function getLead(key: string): Promise<Lead | null> {
  const { data, error } = await createServiceClient()
    .from("leads")
    .select(COLUMNS)
    .eq("key", key)
    .returns<LeadRow[]>()
    .maybeSingle();
  if (error) throw new LeadsError(`Could not load the lead: ${error.message}`, 502);
  return data ? toLead(data) : null;
}

/**
 * Stores a research result and fills the lead's empty fields from it — the
 * domain, the decision-maker's name and title, and a one-paragraph note.
 * Anything a person has already typed is left exactly as it is.
 */
export async function saveResearch(lead: Lead, research: LeadResearch, note: string): Promise<Lead> {
  const domain = hostOf(research.company.website);
  const patch: Partial<LeadRow> = {
    research,
    researched_at: new Date().toISOString(),
    ...(lead.domain ? {} : domain ? { domain } : {}),
    ...(lead.contactName ? {} : { contact_name: research.decision_maker.name }),
    ...(lead.titleRole ? {} : { title_role: research.decision_maker.title }),
    ...(lead.notes ? {} : { notes: note }),
  };

  const { data, error } = await createServiceClient()
    .from("leads")
    .update(patch)
    .eq("key", lead.key)
    .select(COLUMNS)
    .returns<LeadRow[]>();
  if (error) throw new LeadsError(`Could not save the research: ${error.message}`, 502);
  if (!data.length) throw new LeadsError("Lead not found — it may have been deleted.", 404);
  return toLead(data[0]);
}

function hostOf(url: string): string {
  const m = String(url || "").match(/^https?:\/\/([^/\s?#]+)/i);
  return m ? m[1].replace(/^www\./, "").toLowerCase() : "";
}
