/**
 * Cookie names for the OAuth handshake.
 *
 * Their own module because the server action that sets them is a `'use server'`
 * file, and such a file may only export async functions — a plain string const
 * there is a build error.
 */

export const OAUTH_STATE_COOKIE = "gmail_oauth_state";

/** Consent does not take ten minutes; a short window limits replay. */
export const OAUTH_STATE_MAX_AGE = 600;

export const OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  // MUST be 'lax'. With 'strict' the browser drops this cookie on the redirect
  // back from accounts.google.com, so the callback can never verify state and
  // every single connect fails.
  sameSite: "lax" as const,
  maxAge: OAUTH_STATE_MAX_AGE,
  path: "/",
};
