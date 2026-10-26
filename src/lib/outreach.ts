import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";

import {
  OutreachDraftSchema,
  draftWarnings,
  signature,
  type StoredOutreach,
} from "@/lib/outreach-schema";
import { researchVerdict, type LeadResearch } from "@/lib/research-schema";
import { ResearchError, isResearchConfigured } from "@/lib/research";
import type { Lead } from "@/lib/types";

/**
 * Drafts first-touch outreach for one researched lead: an email, a LinkedIn
 * note and three follow-ups, per the PixlerLab playbook. Drafts only — this
 * module never sends anything, and nothing calls it except a person clicking
 * "Draft outreach".
 */

const MODEL = "claude-opus-5-5";

/** Who the drafts are signed by. The playbook names Mukesh Rana as co-founder. */
const SENDER = process.env.OUTREACH_SENDER_NAME?.trim() || "Mukesh Rana";

// Stable across requests so it is served from the prompt cache; everything
// about the lead goes in the user message. Proof lines are copied verbatim
// from the playbook — the model may use only these.
const SYSTEM = `You draft first-touch B2B outreach for PixlerLab, an independent, in-house Claude-powered AI development agency in Mohali, India (12+ years, 140+ projects, 16 published case studies). A person reviews and sends every draft; you never send anything.

Write:
1. email: a subject under 6 words, and a body of 60-90 words that opens with a greeting using the contact's first name ("Hi Priya,"; "Hi there," if no name is known). It makes one specific observation about the company, gives one proof line, and ends with one low-friction ask: offer to send a one-page plan, or the free Agent Opportunity Audit (one workflow mapped: agent design, hours saved, risk, ballpark). No attachments and no links except, optionally, pixlerlab.com. Do not sign off; the signature and opt-out line are added for you.
2. linkedin_note: under 280 characters, no pitch, referencing the same observation.
3. follow_ups: exactly three, for day 3, day 7 and day 14. Each is short, adds ONE new proof point or useful resource (offer to send our AI cost guide or MVP checklist; do not invent links), and does not repeat the first email. Set "adds" to what it adds. Do not sign off. The third is the last: close the loop politely.

Proof library — use ONLY these proof lines, word for word in substance; never invent a number, client or outcome:
- FlyCRM (segments 1, 3; field sales): AI field CRM, photo + GPS becomes a record; live in 5 weeks; 0 records written without a human confirm.
- PowrMatch (segments 1, 2; marketplaces, energy): B2B energy marketplace live in 5 months vs a year quoted by two other firms.
- Cashflo (segment 3; fintech): 70% less manual ops work, 60% of queries auto-resolved, 3X faster onboarding.
- GTM AI Engine (segment 4): 14 agents across 6 layers; email, SMS, voice; 3-minute auto-reply SLA for interested leads.
- AI Content Engine (segment 2; marketing): 8-agent pipeline researching, writing and publishing a blog; prototype to production in 4 weeks.
- Opshire (segment 2; HR/careers): job-search agent; 96% of listings ruled out before a human looked, every match explained.
- HadsUp (segment 2; adtech/DOOH): 16 user roles on one policy layer; one API serving web, admin and mobile.
- Paltu / VREA (segment 1; consumer): two apps on one backend in 3 weeks / Claude beauty advisor in 5 weeks.
- Simba Tasker (segment 4; emerging-market marketplaces): works on poor connections and cheap phones.
General claims you may also use: 6 MVPs, 6 launch dates held; 100% in-house, nothing subcontracted; full handover (the client owns the repo and cloud); human-approval gates on every write. Brand names (Starbucks, Lipton, Reliance General Insurance, Livongo, Haptik) only as "brands we've built for".
If no case study fits, say nothing about case studies: lead with the process instead (a 5-Day Scoping Sprint ending in a fixed quote) and leave case_study empty.

Tone: plain, direct, peer to peer. No hype words (revolutionary, cutting-edge, synergy, game-changing, leverage). No fake familiarity ("hope you're well", "I've been following you"). Every fact about the company must come from the research you are given; do not add facts.

Compliance: list a flag in compliance_flags when the company is in Canada (CASL needs implied consent — confirm before emailing), the UK or EU (rely on legitimate interest; the opt-out line must stay), or wherever consent is uncertain. Empty list when none applies.`;

export async function draftOutreach(lead: Lead, research: LeadResearch): Promise<StoredOutreach> {
  if (!isResearchConfigured()) {
    throw new ResearchError("ANTHROPIC_API_KEY is not set on the server.", 503);
  }

  const { total, action } = researchVerdict(research);
  const contact = [lead.contactName || research.decision_maker.name, lead.titleRole || research.decision_maker.title]
    .filter(Boolean)
    .join(", ");

  const brief = [
    `Company: ${research.company.name || lead.company}`,
    contact ? `Contact: ${contact}` : "Contact: unknown — greet with \"Hi there,\"",
    `Signal that surfaced them: ${lead.headline}`,
    `What they sell: ${research.company.what_they_sell}`,
    `Stage and funding: ${[research.company.stage, research.company.funding].filter(Boolean).join(" — ")}`,
    `Size: ${research.company.employees || "unknown"}`,
    `Headquarters: ${research.company.headquarters || "unknown"}`,
    `AI signals: ${research.company.ai_signals || "none found"}`,
    `ICP: ${research.fit.segment === "none" ? "no segment" : `segment ${research.fit.segment}`}, score ${total}/100 (${action}). ${research.fit.segment_reason}`,
    `Suggested opening observation: ${research.outreach_angle}`,
    `Suggested case study: ${research.case_study || "none fits"}`,
    research.unverified.length ? `Not verified (do not state as fact): ${research.unverified.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const client = new Anthropic();
  let response;
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium", format: betaZodOutputFormat(OutreachDraftSchema) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Draft outreach for this lead.\n\n${brief}` }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new ResearchError("ANTHROPIC_API_KEY was rejected.", 503);
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new ResearchError("Claude is rate-limited right now — try again in a minute.", 429);
    }
    if (err instanceof Anthropic.APIError) {
      throw new ResearchError(`Claude API error ${err.status}: ${err.message}`, 502);
    }
    throw err;
  }

  if (response.stop_reason === "refusal") {
    throw new ResearchError("Claude declined to draft outreach for this lead.", 422);
  }
  const draft = response.parsed_output;
  if (response.stop_reason === "max_tokens" || !draft) {
    throw new ResearchError("The draft came back incomplete. Try again.", 502);
  }

  console.info(
    `[outreach] ${lead.company}: ${response.usage.input_tokens} in, ` +
      `${response.usage.cache_read_input_tokens ?? 0} cache read, ${response.usage.output_tokens} out`,
  );

  // The sign-off is ours, not the model's: same name, same opt-out, every time.
  // Checked first, so the signature does not count toward the word limits.
  const sign = (body: string) => `${body.trim()}\n\n${signature(SENDER)}`;
  return {
    ...draft,
    warnings: draftWarnings(draft),
    email: { ...draft.email, body: sign(draft.email.body) },
    follow_ups: draft.follow_ups.map((f) => ({ ...f, body: sign(f.body) })),
  };
}
