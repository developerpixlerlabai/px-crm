import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * A single shared login, no database.
 *
 * This is a doormat, not a lock: it keeps the CRM off the open web while it is
 * being demoed. Everyone signs in as the same user, so there is no per-user
 * state to store and nothing to migrate later beyond deleting this module.
 */

export const SESSION_COOKIE = "crm_session";

/** A week — long enough that nobody re-types the password during a work sprint. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: SESSION_MAX_AGE,
  path: "/",
};

const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "pixlerlab";

/**
 * Read at call time rather than at module load, so editing `.env.local` takes
 * effect on the next request instead of needing a server restart.
 */
function credentials() {
  return {
    username: process.env.CRM_USERNAME || DEFAULT_USERNAME,
    password: process.env.CRM_PASSWORD || DEFAULT_PASSWORD,
  };
}

/**
 * The cookie carries no session id — there is no session store to look one up
 * in. It carries an HMAC that only this server can produce, and the key is
 * derived from the password, so changing the password silently invalidates
 * every cookie already out there.
 */
export function sessionToken(): string {
  const { username, password } = credentials();
  const key = process.env.CRM_AUTH_SECRET || `${username}:${password}`;
  return createHmac("sha256", key).update("crm-session-v1").digest("hex");
}

export function isValidSession(token: string | undefined): boolean {
  return typeof token === "string" && equals(token, sessionToken());
}

export function isValidLogin(username: string, password: string): boolean {
  const expected = credentials();
  // Both halves are always compared, so a wrong username costs the same time as
  // a wrong password and the response reveals nothing about which was wrong.
  const user = equals(username, expected.username);
  const pass = equals(password, expected.password);
  return user && pass;
}

/**
 * Compares digests rather than the raw strings: `timingSafeEqual` throws on a
 * length mismatch, and hashing first makes every comparison the same width.
 */
function equals(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}
