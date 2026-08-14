import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { SheetsError, fetchLeads, updateLeads } from "@/lib/sheets";
import { EDITABLE_FIELDS, type EditableField, type LeadUpdates } from "@/lib/types";

/**
 * The dashboard's own API. The browser talks to this; only the server talks to
 * Apps Script, so SHEETS_API_TOKEN never ships to the client.
 */

function errorResponse(err: unknown) {
  if (err instanceof SheetsError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[api/leads]", err);
  return NextResponse.json(
    { error: "Unexpected error talking to Google Sheets." },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    // ?fresh=1 skips the ISR window — used by the Refresh button.
    const fresh = new URL(request.url).searchParams.get("fresh") === "1";
    const data = await fetchLeads(fresh ? 0 : 60);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

type PatchItem = { row: number; key: string; updates: LeadUpdates };

/**
 * Accepts either a single { row, key, updates } or { items: [...] } so the UI
 * can save one field inline or a whole detail panel in one round-trip.
 */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as
      | (PatchItem & { items?: undefined })
      | { items: PatchItem[] };

    const raw = "items" in body && body.items ? body.items : [body as PatchItem];

    const items = raw
      .map((item) => ({
        row: Number(item?.row) || 0,
        key: String(item?.key ?? ""),
        updates: sanitize(item?.updates),
      }))
      .filter((item) => item.key && Object.keys(item.updates).length > 0);

    if (!items.length) {
      return NextResponse.json(
        { error: "Nothing to update. Provide a key and at least one editable field." },
        { status: 400 },
      );
    }

    const result = await updateLeads(items);

    // The list is cached with tag "leads"; expire it immediately so the next
    // page load shows the write instead of a stale row for up to a minute.
    revalidateTag("leads", { expire: 0 });

    return NextResponse.json(result, { status: result.ok ? 200 : 207 });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Drops anything not on Api.gs's editable whitelist and coerces to string. */
function sanitize(updates: unknown): LeadUpdates {
  if (!updates || typeof updates !== "object") return {};

  const source = updates as Record<string, unknown>;
  const clean: LeadUpdates = {};

  for (const field of EDITABLE_FIELDS as readonly EditableField[]) {
    if (!(field in source)) continue;
    const value = source[field];
    clean[field] = value === null || value === undefined ? "" : String(value);
  }

  return clean;
}
