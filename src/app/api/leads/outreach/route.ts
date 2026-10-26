import { NextResponse } from "next/server";

import { LeadsError, getLead, saveOutreach } from "@/lib/leads";
import { draftOutreach } from "@/lib/outreach";
import { ResearchError } from "@/lib/research";
import { SupabaseConfigError } from "@/lib/supabase/service";

/**
 * POST { key } — drafts outreach for one researched lead and returns the
 * updated lead. Drafts only: nothing here sends an email or a message.
 *
 * Behind the login wall like the rest of /api/leads, and triggered only by a
 * person clicking "Draft outreach".
 */

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { key } = (await request.json().catch(() => ({}))) as { key?: unknown };
    if (typeof key !== "string" || !key) {
      return NextResponse.json({ error: "Provide the lead's key." }, { status: 400 });
    }

    const lead = await getLead(key);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }
    // Drafts are built on the research: without it there is no observation,
    // no named contact and no case study to work from.
    if (!lead.research) {
      return NextResponse.json(
        { error: "Research this company first — the drafts are built on it." },
        { status: 409 },
      );
    }

    const outreach = await draftOutreach(lead, lead.research);
    return NextResponse.json({ lead: await saveOutreach(lead, outreach) });
  } catch (err) {
    if (
      err instanceof ResearchError ||
      err instanceof LeadsError ||
      err instanceof SupabaseConfigError
    ) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/leads/outreach]", err);
    return NextResponse.json({ error: "Drafting failed unexpectedly." }, { status: 500 });
  }
}
