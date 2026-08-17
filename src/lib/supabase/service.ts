import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client.
 *
 * There is deliberately no browser client and no anon client: the mailbox table
 * has RLS on with zero policies, so `anon` and `authenticated` can read nothing
 * at all. Everything goes through here, server-side, exactly like the Apps
 * Script token in `sheets.ts` never leaves the server process.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * Supabase now issues `sb_secret_...` keys and calls the old one service_role.
 * Accept either name so a project on either scheme works, preferring the current
 * one. It must be the SECRET key: a publishable/anon key gets nothing here, since
 * `connected_mailboxes` has RLS on with no policies and the Vault RPCs are
 * revoked from `anon`.
 */
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

export class SupabaseConfigError extends Error {
  status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.name = "SupabaseConfigError";
    this.status = status;
  }
}

/** Non-throwing readiness check, for callers that want to degrade gracefully. */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);
}

let cached: SupabaseClient | null = null;

export function createServiceClient(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new SupabaseConfigError(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are not set. Copy them " +
        "from Supabase → Project Settings → API into .env.local. The secret " +
        "key (sb_secret_...), not the publishable one.",
    );
  }

  // Safe to reuse: with sessions disabled this client holds no per-request
  // state, and the service role is the same for every caller.
  if (cached) return cached;

  cached = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    // No cookies, no storage, no refresh loop — this is a server key, not a
    // user session. Leaving the defaults on makes the client try to persist a
    // session and keeps a refresh timer alive in a serverless runtime.
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return cached;
}
