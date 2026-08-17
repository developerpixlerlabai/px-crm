import "server-only";

import {
  GMAIL_LABELS_SCOPE,
  GMAIL_READONLY_SCOPE,
  GMAIL_SEND_SCOPE,
} from "@/lib/google/types";

/**
 * Google OAuth over plain `fetch`, no `googleapis` package.
 *
 * Same reasoning as `sheets.ts`: one `fetch` idiom across the codebase, and
 * Next's ISR (`next: { revalidate, tags }`) only applies to the patched global
 * fetch. `googleapis` calls out through gaxios/node-https instead, so caching
 * would silently never take effect — and it costs ~50MB of cold start.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const PROFILE_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/profile";

/**
 * Read, create labels, send. All three are "sensitive" scopes, which work with
 * test users today and need Google brand verification only if this app is ever
 * opened to accounts outside the test-user list.
 *
 * `gmail.modify` is deliberately absent and should stay that way unless proven
 * necessary: it is RESTRICTED and drags a CASA security assessment into any such
 * launch. The one thing it would buy us is labelling a brand-new outbound thread
 * — see the labelIds-on-send experiment in docs/GMAIL-SYNC.md. Replies need no
 * such help, because a reply inherits the thread its label already covers.
 */
const SCOPES = [GMAIL_READONLY_SCOPE, GMAIL_LABELS_SCOPE, GMAIL_SEND_SCOPE];

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_GMAIL_REDIRECT_URI;

export type GoogleOAuthErrorCode =
  | "NOT_CONFIGURED"
  | "TOKEN_EXCHANGE_FAILED"
  | "NO_REFRESH_TOKEN"
  | "PROFILE_FAILED"
  | "TOKEN_REFRESH_FAILED";

export class GoogleOAuthError extends Error {
  code: GoogleOAuthErrorCode;
  constructor(code: GoogleOAuthErrorCode, message: string) {
    super(message);
    this.name = "GoogleOAuthError";
    this.code = code;
  }
}

/** Non-throwing readiness check, mirroring `isConfigured()` in `sheets.ts`. */
export function isGoogleConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);
}

function requireConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    throw new GoogleOAuthError(
      "NOT_CONFIGURED",
      "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_GMAIL_REDIRECT_URI are " +
        "not set. Create an OAuth client in Google Cloud Console and add them to " +
        ".env.local.",
    );
  }
  return { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: REDIRECT_URI };
}

/**
 * The consent URL.
 *
 * Both prompt values are load-bearing, for different reasons:
 *
 * - `select_account` is what makes MULTIPLE accounts possible. Without it Google
 *   silently reuses whichever account is already signed in, so the second
 *   "Connect" re-adds the first mailbox and looks like it did nothing.
 * - `consent` is what guarantees a refresh token on a RE-connect. With
 *   `access_type=offline` alone Google issues one only on the first ever
 *   authorisation for a (user, client) pair; a reconnect then yields none and the
 *   mailbox dies the moment its access token expires.
 */
export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = requireConfig();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "select_account consent",
    scope: SCOPES.join(" "),
    state,
  });

  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export type ExchangedTokens = {
  refreshToken: string;
  address: string;
  /** GRANTED scopes, not the ones we requested — users may grant a subset. */
  scopes: string[];
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  // Google returns the real reason in the body on a 4xx, so parse either way.
  const payload = (await res.json().catch(() => null)) as TokenResponse | null;

  if (!res.ok || !payload) {
    const reason =
      payload?.error_description ?? payload?.error ?? `HTTP ${res.status}`;
    throw new GoogleOAuthError(
      "TOKEN_EXCHANGE_FAILED",
      `Google rejected the token request: ${reason}`,
    );
  }

  return payload;
}

export async function exchangeCode(code: string): Promise<ExchangedTokens> {
  const { clientId, clientSecret, redirectUri } = requireConfig();

  const tokens = await postToken(
    new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  );

  // Fail loudly rather than persisting a mailbox that can never sync.
  if (!tokens.refresh_token) {
    throw new GoogleOAuthError(
      "NO_REFRESH_TOKEN",
      "Google returned no refresh token. The consent URL must carry both " +
        "access_type=offline and prompt=consent.",
    );
  }
  if (!tokens.access_token) {
    throw new GoogleOAuthError(
      "TOKEN_EXCHANGE_FAILED",
      "Google returned no access token.",
    );
  }

  const address = await fetchAddress(tokens.access_token);

  // `scope` is space-delimited per the OAuth2 spec.
  const scopes = (tokens.scope ?? "").split(/\s+/).filter(Boolean);

  return { refreshToken: tokens.refresh_token, address, scopes };
}

/**
 * The mailbox address, from Gmail's own profile endpoint — already covered by
 * `gmail.readonly`, so no extra userinfo/email scope is needed.
 */
async function fetchAddress(accessToken: string): Promise<string> {
  const res = await fetch(PROFILE_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new GoogleOAuthError(
      "PROFILE_FAILED",
      `Could not read the Gmail profile (HTTP ${res.status}). Check that the ` +
        "Gmail API is enabled for this project.",
    );
  }

  const profile = (await res.json()) as { emailAddress?: string };
  if (!profile.emailAddress) {
    throw new GoogleOAuthError("PROFILE_FAILED", "Gmail profile carried no address.");
  }

  return profile.emailAddress.toLowerCase();
}

/**
 * Mints a short-lived access token. Never stored — Google refresh tokens do not
 * rotate, so unlike Microsoft Graph there is no new credential to write back.
 */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = requireConfig();

  const tokens = await postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  );

  if (!tokens.access_token) {
    throw new GoogleOAuthError(
      "TOKEN_REFRESH_FAILED",
      "Google returned no access token for this refresh token. The user may have " +
        "revoked access — the mailbox needs reconnecting.",
    );
  }

  return tokens.access_token;
}
