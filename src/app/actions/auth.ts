"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  isLoginConfigured,
  isValidLogin,
  sessionToken,
} from "@/lib/auth/session";

export type LoginState = { error?: string };

/**
 * Checks the shared credentials and, on success, drops the session cookie and
 * sends the visitor on to whatever they were trying to reach.
 */
export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Enter both a username and a password." };
  }

  // Said plainly rather than as "wrong credentials", or a deploy missing its
  // env vars looks exactly like a forgotten password.
  if (!isLoginConfigured()) {
    return { error: "Sign-in is not set up: CRM_USERNAME and CRM_PASSWORD are missing on the server." };
  }

  if (!isValidLogin(username, password)) {
    return { error: "Those credentials are not right." };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionToken(), SESSION_COOKIE_OPTIONS);

  // `redirect` throws to unwind, so nothing after it runs.
  redirect(safeNext(formData.get("next")));
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}

/**
 * The `next` parameter arrives from the query string, so it is attacker-shaped:
 * only same-site absolute paths are honoured, and `//evil.com` (a protocol
 * relative URL the browser would treat as another origin) is rejected too.
 */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}
