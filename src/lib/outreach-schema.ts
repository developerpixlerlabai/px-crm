import { z } from "zod";

/**
 * What Claude drafts for one lead. Shared by the server (which constrains the
 * model's output to it) and the panel (which renders it) — import the type,
 * not the schema, on the client.
 *
 * Bodies are written WITHOUT a sign-off: the server appends the signature and
 * the opt-out line itself, so neither can be missing or reworded.
 */
export const OutreachDraftSchema = z.object({
  email: z.object({
    subject: z.string().describe("Under 6 words"),
    body: z.string().describe("60-90 words, greeting included, no sign-off"),
  }),
  linkedin_note: z.string().describe("Under 280 characters, no pitch"),
  follow_ups: z
    .array(
      z.object({
        day: z.number().int().describe("3, 7 or 14"),
        subject: z.string(),
        body: z.string().describe("Short, no sign-off"),
        adds: z.string().describe("The new proof point or resource this one adds"),
      }),
    )
    .describe("Exactly three: day 3, day 7, day 14"),
  case_study: z.string().describe("Proof-library name used in the first email, or empty"),
  compliance_flags: z.array(z.string()).describe("Jurisdiction concerns, or empty"),
});

export type OutreachDraft = z.infer<typeof OutreachDraftSchema>;

/** As stored on the lead: signed bodies, plus the checks run before signing. */
export type StoredOutreach = OutreachDraft & { warnings: string[] };

/** Appended to every email body by the server. */
export function signature(sender: string): string {
  return `${sender}\nPixlerLab\n\nReply "no thanks" and I won't follow up.`;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * The playbook's hard limits, checked in code rather than trusted to the
 * model. Returned as human-readable warnings for the panel.
 */
export function draftWarnings(d: OutreachDraft): string[] {
  const warnings: string[] = [];
  const subjectWords = wordCount(d.email.subject);
  if (subjectWords >= 6) warnings.push(`Subject is ${subjectWords} words (keep it under 6).`);
  const words = wordCount(d.email.body);
  if (words < 60 || words > 90) warnings.push(`Email body is ${words} words (target 60–90).`);
  if (d.linkedin_note.length > 280) {
    warnings.push(`LinkedIn note is ${d.linkedin_note.length} characters (limit 280).`);
  }
  const links = (d.email.body.match(/https?:\/\/\S+|www\.\S+/gi) ?? []).filter(
    (l) => !/pixlerlab\.com/i.test(l),
  );
  if (links.length) warnings.push("First email has a link other than pixlerlab.com.");
  if (d.follow_ups.length !== 3) warnings.push(`${d.follow_ups.length} follow-ups (expected 3).`);
  return warnings;
}
