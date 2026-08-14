import "server-only";

import type { Lead, LeadUpdates, LeadsResponse } from "@/lib/types";

/**
 * Server-side client for the Apps Script web app defined in AS/Api.gs.
 *
 * The token never reaches the browser: the dashboard calls our own
 * /api/leads routes, and only this module talks to Google. That also
 * sidesteps CORS entirely — Apps Script cannot set CORS headers.
 */

const API_URL = process.env.SHEETS_API_URL;
const API_TOKEN = process.env.SHEETS_API_TOKEN;

/**
 * Which tab to read and write. Unset means the live Leads tab, which is the
 * production default. Point it at a copy ("Copy of Leads") to develop against
 * throwaway data while the scraper keeps filling the real tab — collaborators
 * then see the copy, not real leads. Deliberately not NEXT_PUBLIC_: the tab
 * name is a server concern and nothing in the browser should choose it.
 */
const API_TAB = process.env.SHEETS_TAB?.trim() || "";

export class SheetsError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "SheetsError";
    this.status = status;
  }
}

function requireConfig(): { url: string; token: string } {
  if (!API_URL || !API_TOKEN) {
    throw new SheetsError(
      "SHEETS_API_URL and SHEETS_API_TOKEN are not set. Copy .env.example to " +
        ".env.local and fill in the values from setupApi() in Apps Script.",
      503,
    );
  }
  return { url: API_URL, token: API_TOKEN };
}

export function isConfigured(): boolean {
  return Boolean(API_URL && API_TOKEN);
}

/**
 * Apps Script always answers 200 and puts the real outcome in the body, so a
 * transport-level ok() check is not enough — unwrap and re-throw here.
 */
async function unwrap<T>(res: Response): Promise<T> {
  const text = await res.text();

  if (!res.ok) {
    throw new SheetsError(
      `Apps Script returned HTTP ${res.status}. Check that the deployment is ` +
        `set to "Anyone" access and that SHEETS_API_URL ends in /exec.`,
      502,
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    // A login page instead of JSON is the classic symptom of a deployment
    // whose access is set to "Only myself".
    throw new SheetsError(
      "Apps Script did not return JSON. The web app is most likely deployed " +
        'with restricted access — redeploy with "Who has access: Anyone".',
      502,
    );
  }

  const payload = body as {
    ok?: boolean;
    error?: string;
    status?: number;
    results?: unknown;
  };

  // A bulk update reports ok:false when only SOME items failed, and each
  // failure carries its own reason in `results`. Throwing there would replace
  // "Lead not found — it may have been deleted from the sheet" with a generic
  // 500, so only treat a result-less failure as fatal.
  if (payload.ok === false && !Array.isArray(payload.results)) {
    throw new SheetsError(
      payload.error ?? "The Apps Script API reported an error.",
      payload.status ?? 500,
    );
  }

  return body as T;
}

/**
 * Pulls every lead, newest first.
 *
 * `revalidate` seconds of ISR keeps the Apps Script round-trip (~1-2s) off the
 * critical path for most page loads; pass 0 after a write to read your own
 * change back.
 */
export async function fetchLeads(revalidate = 60): Promise<LeadsResponse> {
  const { url, token } = requireConfig();

  const endpoint = new URL(url);
  endpoint.searchParams.set("token", token);
  endpoint.searchParams.set("action", "leads");
  if (API_TAB) endpoint.searchParams.set("tab", API_TAB);

  const res = await fetch(endpoint, {
    // Apps Script redirects /exec to googleusercontent.com to serve the body.
    redirect: "follow",
    next: revalidate > 0 ? { revalidate, tags: ["leads"] } : { revalidate: 0 },
  });

  const data = await unwrap<{
    leads: Lead[];
    meta: { total: number; returned: number; fetchedAt: string };
  }>(res);

  return { leads: data.leads ?? [], meta: data.meta };
}

export type UpdateResult = {
  ok: boolean;
  results: Array<{ key: string; ok: boolean; error?: string; lead?: Lead }>;
  updated: number;
  failed: number;
};

/**
 * Writes a partial update back to the sheet.
 *
 * `row` is only a hint — Api.gs verifies `key` before writing and falls back to
 * scanning, so a lead that moved because someone sorted the sheet still lands
 * on the right row instead of overwriting its new neighbour.
 */
export async function updateLeads(
  items: Array<{ row: number; key: string; updates: LeadUpdates }>,
): Promise<UpdateResult> {
  const { url, token } = requireConfig();

  const res = await fetch(url, {
    method: "POST",
    // Apps Script rejects a preflight; text/plain keeps it a simple request
    // and doPost still reads the raw body from e.postData.contents.
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    // `tab` must match the one fetchLeads read from, so an edit lands on the
    // row the dashboard was actually showing.
    body: JSON.stringify({
      token,
      action: "bulkUpdate",
      items,
      ...(API_TAB ? { tab: API_TAB } : {}),
    }),
    redirect: "follow",
    cache: "no-store",
  });

  return unwrap<UpdateResult>(res);
}

export async function pingSheets(): Promise<{ sheet: string; rows: number }> {
  const { url, token } = requireConfig();

  const endpoint = new URL(url);
  endpoint.searchParams.set("token", token);
  endpoint.searchParams.set("action", "ping");
  if (API_TAB) endpoint.searchParams.set("tab", API_TAB);

  const res = await fetch(endpoint, { cache: "no-store", redirect: "follow" });
  return unwrap<{ sheet: string; rows: number }>(res);
}
