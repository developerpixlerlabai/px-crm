import { NextResponse } from "next/server";

import { LeadsError, fetchLeads, updateLeads } from "@/lib/leads";
import { SupabaseConfigError } from "@/lib/supabase/service";
import { EDITABLE_FIELDS, type EditableField, type LeadUpdates } from "@/lib/types";

/**
 * The dashboard's own API. The browser talks to this; only the server talks to
 * Supabase, so the service key never ships to the client.
 */

function errorResponse(err: unknown) {
  if (err instanceof LeadsError || err instanceof SupabaseConfigError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[api/leads]", err);
  return NextResponse.json(
    { error: "Unexpected error loading leads." },
    { status: 500 },
  );
}

export async function GET() {
  try {
    return NextResponse.json(await fetchLeads());
  } catch (err) {
    return errorResponse(err);
  }
}

type PatchItem = { key: string; updates: LeadUpdates };

/**
 * Accepts either a single { key, updates } or { items: [...] } so the UI can
 * save one field inline or a whole detail panel in one round-trip.
 */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as
      | (PatchItem & { items?: undefined })
      | { items: PatchItem[] };

    const raw = "items" in body && body.items ? body.items : [body as PatchItem];

    const items = raw
      .map((item) => ({
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
    return NextResponse.json(result, { status: result.ok ? 200 : 207 });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Drops anything not on the editable whitelist and coerces to string. */
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
