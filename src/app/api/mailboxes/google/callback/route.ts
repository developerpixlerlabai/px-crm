import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { GoogleOAuthError, exchangeCode } from "@/lib/google/oauth";
import { OAUTH_STATE_COOKIE } from "@/lib/google/oauth-state";
import {
  findOrCreateMailbox,
  markMailboxError,
  recordGrantedScopes,
  storeRefreshToken,
} from "@/lib/google/mailboxes";

/**
 * Google redirects the user back here after consent.
 *
 * The order below is load-bearing and every step fails closed: state is read and
 * destroyed before anything else happens, nothing is persisted before the code
 * exchange succeeds, and the row only reaches 'connected' via the Vault RPC.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");
  const oauthError = searchParams.get("error");

  // 1. Read AND delete the state cookie immediately — single use, whatever
  //    happens next, so a failed attempt cannot be replayed.
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(OAUTH_STATE_COOKIE);

  // 2. Verify. `error` here is usually the user clicking Cancel on the consent
  //    screen, which is not a failure worth shouting about.
  if (oauthError) {
    return redirectWith(origin, { mailbox_error: "cancelled" });
  }
  if (!code || !returnedState || !expectedState || returnedState !== expectedState) {
    return redirectWith(origin, { mailbox_error: "state" });
  }

  // 3. Exchange the code. Nothing has been written yet, so a failure here leaves
  //    no partial row behind.
  let exchanged;
  try {
    exchanged = await exchangeCode(code);
  } catch (err) {
    const code =
      err instanceof GoogleOAuthError && err.code === "NO_REFRESH_TOKEN"
        ? "no_refresh_token"
        : "exchange";
    return redirectWith(origin, { mailbox_error: code });
  }

  // 4. Find-or-create — never a blind insert.
  let mailboxId: string;
  try {
    mailboxId = await findOrCreateMailbox(exchanged.address);
  } catch {
    return redirectWith(origin, { mailbox_error: "store" });
  }

  // 5. Granted scopes are bookkeeping: best-effort, never fail a good connect.
  try {
    await recordGrantedScopes(mailboxId, exchanged.scopes);
  } catch {
    // Intentionally ignored — the mailbox still works without the scope record.
  }

  // 6. Vault. This is what flips the row to 'connected'.
  try {
    await storeRefreshToken(mailboxId, exchanged.refreshToken);
  } catch (err) {
    // The row exists but has no token. Mark it errored rather than leaving a
    // permanently-'connecting' row the user cannot act on.
    await markMailboxError(
      mailboxId,
      err instanceof Error ? err.message : "Could not store the refresh token.",
    ).catch(() => {});
    return redirectWith(origin, { mailbox_error: "store" });
  }

  // The dashboard's first paint reads the mailbox list on the server, so expire
  // it or the newly connected account is missing until the next navigation.
  revalidatePath("/");

  return redirectWith(origin, { mailbox_connected: exchanged.address });
}

function redirectWith(origin: string, params: Record<string, string>) {
  const url = new URL("/", origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}
