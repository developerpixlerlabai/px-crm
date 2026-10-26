import { z } from "zod";

/**
 * The shape Claude returns for one researched lead. Shared by the server
 * (which constrains the model's output to it) and the panel (which renders
 * it) — import the type, not the schema, on the client.
 *
 * Every field is required and uses "" for unknown. Structured outputs need an
 * exhaustive schema, and an explicit empty string makes "not found" visible
 * instead of silently missing.
 */
export const LeadResearchSchema = z.object({
  company: z.object({
    name: z.string(),
    website: z.string().describe("Homepage URL, or empty if not found"),
    what_they_sell: z.string().describe("One or two sentences"),
    headquarters: z.string().describe("City, country"),
    employees: z.string().describe('Headcount estimate with its source, e.g. "11-50 (LinkedIn)"'),
    stage: z.string().describe('e.g. "Pre-seed", "Series A", "Public", "Bootstrapped"'),
    funding: z.string().describe('Latest round with amount, date and lead investor'),
    ai_signals: z.string().describe("AI products, AI hiring or AI roadmap evidence"),
  }),
  decision_maker: z.object({
    name: z.string(),
    title: z.string(),
    linkedin_url: z.string(),
    why: z.string().describe("Why this person is the buyer for this segment"),
  }),
  fit: z.object({
    segment: z.enum(["1", "2", "3", "4", "none"]),
    segment_reason: z.string(),
    fit_points: z.number().int().describe("0-40: segment 20, size in range 10, priority market 10"),
    intent_points: z.number().int().describe("0-35: recent funding 15, relevant hiring 10, AI launch or pressure 10"),
    access_points: z.number().int().describe("0-25: named decision-maker 15, warm path 10"),
  }),
  case_study: z.string().describe("Name from the proof library, or empty if none fits"),
  outreach_angle: z.string().describe("One specific observation to open with"),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
  unverified: z.array(z.string()).describe("Claims you could not confirm from a source"),
});

export type LeadResearch = z.infer<typeof LeadResearchSchema>;

/** The playbook's thresholds: 70+ draft now, 50–69 nurture, under 50 skip. */
export function researchVerdict(r: LeadResearch): { total: number; action: string } {
  const total =
    clamp(r.fit.fit_points, 40) + clamp(r.fit.intent_points, 35) + clamp(r.fit.access_points, 25);
  return {
    total,
    action: total >= 70 ? "Draft outreach now" : total >= 50 ? "Nurture" : "Skip",
  };
}

function clamp(n: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(n)));
}
