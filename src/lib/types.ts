/**
 * Mirrors the Leads sheet written by Code.gs (columns A–R) and serialised by
 * Api.gs. Field names match the JSON keys in Api.gs's API_FIELDS map — if you
 * add a column there, add it here too.
 */
export type Lead = {
  /** 1-based sheet row. Sent back on update so the server can find the row fast. */
  row: number;
  /** Content fingerprint, used to re-find the row if the sheet was reordered. */
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

/** The subset of fields Api.gs will accept a write for. */
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
 * The Status dropdown values from applyLeadsFormatting_() in Code.gs. Keeping
 * these identical means a status set here still passes the sheet's own data
 * validation.
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
 * Code.gs writes Priority as an emoji label ("🔥 Hot"). Derive from Score
 * instead so the dashboard is not emoji-parsing, and thresholds stay in one
 * place — they match scoreLabel_() in Code.gs.
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
