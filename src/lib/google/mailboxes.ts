import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { refreshAccessToken } from "@/lib/google/oauth";
import { needsSyncScopeConsent, type Mailbox, type MailboxStatus } from "@/lib/google/types";

/**
 * Mailbox registry IO.
 *
 * Every select lists its columns explicitly — never `*` — so `vault_secret_id`
 * cannot escape into a response by accident.
 */

const TABLE = "connected_mailboxes";

/**
 * Columns safe to hand outwards — `vault_secret_id` is deliberately absent.
 *
 * Kept as ONE string literal, not a concatenation: supabase-js infers row types
 * from this at the type level, and a concatenated string degrades every query's
 * result to an error type.
 */
const PUBLIC_COLUMNS =
  "id, address, status, scopes, sync_error, connected_at, last_synced_at, synced_label_ids, sync_scope_required";

type MailboxRow = {
  id: string;
  address: string;
  status: MailboxStatus;
  scopes: string[] | null;
  sync_error: string | null;
  connected_at: string | null;
  last_synced_at: string | null;
  synced_label_ids: string[] | null;
  sync_scope_required: boolean;
};

export class MailboxError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "MailboxError";
    this.status = status;
  }
}

function toMailbox(row: MailboxRow): Mailbox {
  return {
    id: row.id,
    address: row.address,
    status: row.status,
    scopes: row.scopes,
    syncError: row.sync_error,
    connectedAt: row.connected_at,
    lastSyncedAt: row.last_synced_at,
    syncedLabelIds: row.synced_label_ids,
    syncScopeRequired: row.sync_scope_required,
  };
}

/** One mailbox, or null when it does not exist. */
export async function getMailbox(mailboxId: string): Promise<Mailbox | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from(TABLE)
    .select(PUBLIC_COLUMNS)
    .eq("id", mailboxId)
    .maybeSingle();

  if (error) {
    throw new MailboxError(`Could not load the mailbox: ${error.message}`);
  }
  return data ? toMailbox(data as MailboxRow) : null;
}

/**
 * Saves the label selection and retires the consent gate for this mailbox.
 *
 * Clearing `sync_scope_required` is permanent: once a human has chosen, later
 * edits are just edits, and an empty selection then means "read nothing" rather
 * than "never asked".
 */
export async function updateSyncedLabels(
  mailboxId: string,
  labelIds: readonly string[],
): Promise<Mailbox> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from(TABLE)
    .update({
      synced_label_ids: labelIds.length ? [...labelIds] : null,
      sync_scope_required: false,
      sync_error: null,
    })
    .eq("id", mailboxId)
    .select(PUBLIC_COLUMNS)
    .single();

  if (error || !data) {
    throw new MailboxError(
      `Could not save the label selection: ${error?.message ?? "no row returned"}`,
    );
  }

  return toMailbox(data as MailboxRow);
}

/** Every mailbox still in play, oldest connection first so the list is stable. */
export async function listMailboxes(): Promise<Mailbox[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from(TABLE)
    .select(PUBLIC_COLUMNS)
    .neq("status", "disconnected")
    .order("connected_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new MailboxError(`Could not load mailboxes: ${error.message}`);
  }

  return ((data ?? []) as MailboxRow[]).map(toMailbox);
}

/**
 * Idempotent row for an address — reuse, else revive, else insert.
 *
 * A blind insert is the bug this exists to prevent: a retry or a reconnect of an
 * already-connected address mints a second row with a different id, the UI shows
 * the account twice, and history splits across the two.
 */
export async function findOrCreateMailbox(
  address: string,
  connectedBy?: string | null,
): Promise<string> {
  const supabase = createServiceClient();
  const normalized = address.trim().toLowerCase();

  // (a) A live row already exists — reuse it.
  const { data: existing, error: existingError } = await supabase
    .from(TABLE)
    .select("id")
    .eq("provider", "gmail")
    .eq("address", normalized)
    .neq("status", "disconnected")
    .maybeSingle();

  if (existingError) {
    throw new MailboxError(`Could not look up the mailbox: ${existingError.message}`);
  }
  if (existing) return (existing as { id: string }).id;

  // (b) A previously disconnected row — revive the newest one. Limit 1: a repeat
  //     connect/disconnect cycle can leave several, and reviving two would breach
  //     the partial unique index the moment both went live.
  const { data: revivable } = await supabase
    .from(TABLE)
    .select("id")
    .eq("provider", "gmail")
    .eq("address", normalized)
    .eq("status", "disconnected")
    .order("connected_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (revivable) {
    const id = (revivable as { id: string }).id;
    // Clear stale bookkeeping so it starts clean rather than resuming state that
    // expired while it was disconnected.
    const { error: reviveError } = await supabase
      .from(TABLE)
      .update({
        status: "connecting",
        sync_error: null,
        last_synced_at: null,
        connected_by: connectedBy ?? null,
      })
      .eq("id", id);

    if (reviveError) {
      throw new MailboxError(`Could not revive the mailbox: ${reviveError.message}`);
    }
    return id;
  }

  // (c) Genuinely new. `status` is left at its 'connecting' default on purpose —
  //     only configure_mailbox_tokens() flips it to 'connected', so a failed
  //     exchange cannot leave a tokenless mailbox looking live.
  const { data: inserted, error: insertError } = await supabase
    .from(TABLE)
    .insert({ provider: "gmail", address: normalized, connected_by: connectedBy ?? null })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new MailboxError(
      `Could not create the mailbox: ${insertError?.message ?? "no row returned"}`,
    );
  }

  return (inserted as { id: string }).id;
}

/** Best-effort bookkeeping: a failure here must not fail an otherwise good connect. */
export async function recordGrantedScopes(
  mailboxId: string,
  scopes: string[],
): Promise<void> {
  if (scopes.length === 0) return;
  const supabase = createServiceClient();
  await supabase.from(TABLE).update({ scopes }).eq("id", mailboxId);
}

/**
 * Hands the refresh token to Vault. This RPC is also what flips the row to
 * 'connected', so the mailbox only ever looks live with a usable token behind it.
 */
export async function storeRefreshToken(
  mailboxId: string,
  refreshToken: string,
): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .schema("private")
    .rpc("configure_mailbox_tokens", {
      p_mailbox_id: mailboxId,
      p_refresh_token: refreshToken,
    });

  if (error) {
    throw new MailboxError(
      `Could not store the refresh token: ${error.message}. If this says the ` +
        `function or schema is missing, add "private" to Exposed schemas in ` +
        `Supabase → Project Settings → API.`,
    );
  }
}

/** Marks a mailbox as broken so the UI can show it instead of a silent no-op. */
export async function markMailboxError(
  mailboxId: string,
  message: string,
): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from(TABLE)
    .update({ status: "error", sync_error: message.slice(0, 500) })
    .eq("id", mailboxId);
}

/**
 * Soft delete. The row survives so a later reconnect revives it and its history
 * comes back with it.
 */
export async function disconnectMailbox(mailboxId: string): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from(TABLE)
    .update({ status: "disconnected", sync_error: null })
    .eq("id", mailboxId);

  if (error) {
    throw new MailboxError(`Could not disconnect the mailbox: ${error.message}`);
  }
}

/**
 * Access token for a mailbox, minted fresh per call and never stored.
 *
 * Unused by this slice — the connect flow does not read mail. It is the seam
 * every later phase calls, so it lives here next to the row it belongs to.
 */
export async function accessTokenForMailbox(mailboxId: string): Promise<string> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .schema("private")
    .rpc("resolve_mailbox_refresh_token_service", { p_mailbox_id: mailboxId });

  if (error) {
    throw new MailboxError(`Could not resolve the refresh token: ${error.message}`);
  }
  if (!data || typeof data !== "string") {
    throw new MailboxError(
      "This mailbox has no usable token — it needs reconnecting.",
      409,
    );
  }

  return refreshAccessToken(data);
}

/**
 * The seam every MAIL-READING path must go through.
 *
 * Returns null for a gated mailbox — and returns it BEFORE resolving a token, so
 * a mailbox awaiting its label choice makes zero Google calls.
 *
 * Deliberately not used by the label list/create routes: listing labels has to
 * work while gated, or there would be no way to ever choose one.
 */
export async function resolveReadableMailbox(mailboxId: string): Promise<{
  mailbox: Mailbox;
  labelIds: string[];
  accessToken: string;
} | null> {
  const mailbox = await getMailbox(mailboxId);
  if (!mailbox) throw new MailboxError("Mailbox not found.", 404);

  if (mailbox.status !== "connected") return null;
  if (needsSyncScopeConsent(mailbox)) return null;

  const labelIds = mailbox.syncedLabelIds ?? [];
  // An explicit empty selection after the gate cleared means "read nothing".
  if (labelIds.length === 0) return null;

  return { mailbox, labelIds, accessToken: await accessTokenForMailbox(mailboxId) };
}

/** Every readable mailbox, for fan-out across accounts. */
export async function resolveReadableMailboxes(): Promise<
  NonNullable<Awaited<ReturnType<typeof resolveReadableMailbox>>>[]
> {
  const mailboxes = await listMailboxes();

  const settled = await Promise.allSettled(
    mailboxes.map((m) => resolveReadableMailbox(m.id)),
  );

  // allSettled: one revoked token must not take down every other mailbox.
  return settled.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : [],
  );
}
