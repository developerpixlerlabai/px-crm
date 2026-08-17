/**
 * Shapes shared between the server (mailbox IO, OAuth) and the client (the
 * connect dialog). Deliberately free of `server-only` so the UI can import the
 * same types and the same pure health derivation the server uses.
 */

export const MAILBOX_STATUSES = [
  "connecting",
  "connected",
  "error",
  "disconnected",
] as const;

export type MailboxStatus = (typeof MAILBOX_STATUSES)[number];

/**
 * A connected account as the UI sees it.
 *
 * Note what is absent: `vault_secret_id` never leaves the server. Every query
 * selects columns explicitly so it cannot leak by accident.
 */
export type Mailbox = {
  id: string;
  address: string;
  status: MailboxStatus;
  scopes: string[] | null;
  syncError: string | null;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  /** Gmail label ids this mailbox may read. Null/empty while gated. */
  syncedLabelIds: string[] | null;
  /** True until someone has explicitly chosen what this mailbox syncs. */
  syncScopeRequired: boolean;
};

/**
 * A mailbox reads NOTHING until someone picks its labels.
 *
 * Connecting an account is not consent to read all of it. The second clause
 * makes the gate self-clearing: the moment a selection exists the mailbox is
 * ungated, so a save that races the flag write still opens it.
 *
 * Pure and dependency-free on purpose — the sync engine, the routes and the UI
 * must all agree on one definition of "gated".
 */
export function needsSyncScopeConsent(mailbox: {
  syncScopeRequired: boolean;
  syncedLabelIds: readonly string[] | null | undefined;
}): boolean {
  return mailbox.syncScopeRequired && (mailbox.syncedLabelIds?.length ?? 0) === 0;
}

export type MailboxHealth =
  | "connecting"
  | "awaiting-scope"
  | "connected"
  | "issue";

/**
 * One badge from the row's columns.
 *
 * Two rankings matter:
 * - `syncError` outranks everything. A mailbox whose background work fails every
 *   run would otherwise keep showing "Connected" while nothing arrives and
 *   nothing says so.
 * - `awaiting-scope` outranks `connected`. A gated mailbox is healthy but
 *   deliberately reading nothing, and must not claim to be connected and syncing.
 */
export function mailboxHealth(
  mailbox: Pick<Mailbox, "status" | "syncError" | "syncedLabelIds" | "syncScopeRequired">,
): MailboxHealth {
  if (mailbox.syncError) return "issue";
  if (mailbox.status === "connecting") return "connecting";
  if (mailbox.status === "connected") {
    return needsSyncScopeConsent(mailbox) ? "awaiting-scope" : "connected";
  }
  return "issue";
}

export const MAILBOX_HEALTH_LABEL: Record<MailboxHealth, string> = {
  connecting: "Connecting",
  "awaiting-scope": "Choose labels",
  connected: "Connected",
  issue: "Needs attention",
};

/** A Gmail label as the picker sees it. */
export type GmailLabel = {
  id: string;
  name: string;
  /** 'user' labels are the ones a person created; 'system' means INBOX, SENT, … */
  type: "user" | "system";
};

/** Read labels, threads and messages. */
export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

/** Create a label from the CRM. Sensitive, but NOT restricted like gmail.modify. */
export const GMAIL_LABELS_SCOPE = "https://www.googleapis.com/auth/gmail.labels";

/** Send mail as the connected account. */
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

/**
 * Capability checks against the scopes actually GRANTED at the last connect.
 *
 * Google lets a user grant a subset, and a mailbox connected before we asked for
 * a scope simply does not have it. `scopes === null` is a legacy grant recorded
 * before we tracked them — treated as not-granted, so the UI offers a reconnect
 * instead of letting the user hit a runtime 403.
 */
function hasScope(mailbox: Pick<Mailbox, "scopes">, scope: string): boolean {
  return mailbox.scopes?.includes(scope) ?? false;
}

export function canSend(mailbox: Pick<Mailbox, "scopes">): boolean {
  return hasScope(mailbox, GMAIL_SEND_SCOPE);
}

export function canManageLabels(mailbox: Pick<Mailbox, "scopes">): boolean {
  return hasScope(mailbox, GMAIL_LABELS_SCOPE);
}
