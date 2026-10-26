import { NextResponse } from "next/server";

import { LeadsError, getLead, saveResearch } from "@/lib/leads";
import { ResearchError, researchLead } from "@/lib/research";
import { researchVerdict, type LeadResearch } from "@/lib/research-schema";
import { SupabaseConfigError } from "@/lib/supabase/service";

/**
 * POST { key } — researches one lead with Claude + web search, stores the
 * result, fills the lead's empty contact fields, and returns the updated lead.
 *
 * Behind the login wall like the rest of /api/leads. One run makes up to six
 * web searches, so it is triggered by a person, never in bulk.
 */

// Research with several searches typically takes well under a minute; this is
// headroom for a slow one.
export const maxDuration = 300;

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

    const research = await researchLead({
      company: lead.company.includes("extract manually") ? "" : lead.company,
      headline: lead.headline,
      snippet: lead.snippet,
      sourceUrl: lead.sourceUrl,
      domain: lead.domain,
    });

    const updated = await saveResearch(lead, research, noteFor(research));
    return NextResponse.json({ lead: updated });
  } catch (err) {
    if (
      err instanceof ResearchError ||
      err instanceof LeadsError ||
      err instanceof SupabaseConfigError
    ) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/leads/research]", err);
    return NextResponse.json({ error: "The research failed unexpectedly." }, { status: 500 });
  }
}

/** The paragraph written into an empty Notes field. */
function noteFor(r: LeadResearch): string {
  const { total, action } = researchVerdict(r);
  const segment = r.fit.segment === "none" ? "no ICP segment" : `segment ${r.fit.segment}`;
  return [
    r.company.what_they_sell,
    [r.company.stage, r.company.funding, r.company.employees && `${r.company.employees} staff`]
      .filter(Boolean)
      .join(" · "),
    `Fit ${total}/100 (${segment}) — ${action}.`,
    r.outreach_angle && `Angle: ${r.outreach_angle}`,
    r.case_study && `Case study: ${r.case_study}`,
  ]
    .filter(Boolean)
    .join("\n");
}
