"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

import { buildAuthUrl, isGoogleConfigured } from "@/lib/google/oauth";
import { OAUTH_COOKIE_OPTIONS, OAUTH_STATE_COOKIE } from "@/lib/google/oauth-state";
import { isSupabaseConfigured } from "@/lib/supabase/service";

export type StartConnectResult = { url: string } | { error: string };

/**
 * Begins the Gmail connect handshake.
 *
 * Returns the consent URL rather than redirecting, because the client must do a
 * FULL-PAGE navigation to Google — a popup or a `fetch` cannot complete an OAuth
 * redirect flow.
 *
 * Configuration is checked here, before the user is bounced to Google, so a
 * missing env var produces a readable message instead of a 500 on the way back.
 */
export async function startGoogleConnect(): Promise<StartConnectResult> {
  if (!isGoogleConfigured()) {
    return {
      error:
        "Gmail is not configured yet. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET " +
        "and GOOGLE_GMAIL_REDIRECT_URI to .env.local.",
    };
  }

  // Checked up front too: without Supabase there is nowhere to put the token, and
  // discovering that after consent wastes the user's trip through Google.
  if (!isSupabaseConfigured()) {
    return {
      error:
        "Supabase is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and " +
        "SUPABASE_SERVICE_ROLE_KEY to .env.local.",
    };
  }

  const state = randomUUID();

  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, state, OAUTH_COOKIE_OPTIONS);

  try {
    return { url: buildAuthUrl(state) };
  } catch {
    return { error: "Could not build the Google consent URL." };
  }
}
