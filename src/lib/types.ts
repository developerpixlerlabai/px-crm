/**
 * One row of public.leads (supabase/migrations/0003_leads.sql), camel-cased by
 * toLead() in lib/leads.ts. If you expose another column, add it in both places.
 */
export type Lead = {
  /** Dedup fingerprint (source URL, else company|headline). Unique; identifies the lead. */
  key: string;

  dateFound: string;
  priority: string;
  score: number;
  company: string;
  contactName: string;
  titleRole: string;
  email: string;
  signalSource: string;
  matchedSignals: string;
  headline: string;
  snippet: string;
  sourceUrl: string;
  status: string;
  notes: string;
  outreachSent: string;
  segment: string;
  intent: string;
  domain: string;
};

/**
 * The only fields the dashboard may write. Everything else comes from the
 * scraper, so a dashboard bug cannot corrupt Score, Headline or Source URL.
 */
export const EDITABLE_FIELDS = [
  "contactName",
  "titleRole",
  "email",
  "status",
  "notes",
  "outreachSent",
] as const;

export type EditableField = (typeof EDITABLE_FIELDS)[number];
export type LeadUpdates = Partial<Record<EditableField, string>>;

export type LeadsResponse = {
  leads: Lead[];
  meta: {
    total: number;
    returned: number;
    fetchedAt: string;
  };
};

/**
 * The Status values every lead uses, inherited from the old Google Sheet's
 * dropdown so imported leads and new ones share one vocabulary.
 */
export const STATUSES = [
  "New",
  "Researching",
  "Outreach Sent",
  "Replied",
  "Meeting Booked",
  "Not a Fit",
  "Closed Won",
] as const;

export type Status = (typeof STATUSES)[number];

/** Statuses that mean the lead is no longer in play. */
export const CLOSED_STATUSES: string[] = ["Not a Fit", "Closed Won"];

export type Priority = "hot" | "warm" | "cool";

/**
 * The scraper stores Priority as an emoji label ("🔥 Hot"). Derive from Score
 * instead so the dashboard is not emoji-parsing — the thresholds match
 * scoreLabel() in lib/scraper/evaluate.ts.
 */
export function priorityOf(lead: Pick<Lead, "score">): Priority {
  if (lead.score >= 8) return "hot";
  if (lead.score >= 6) return "warm";
  return "cool";
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  hot: "Hot",
  warm: "Warm",
  cool: "Cool",
};
