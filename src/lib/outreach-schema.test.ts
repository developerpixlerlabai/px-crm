// Run: npm test

import assert from "node:assert/strict";
import { test } from "node:test";

import { draftWarnings, signature, type OutreachDraft } from "./outreach-schema.ts";

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

const draft = (over: Partial<OutreachDraft> = {}): OutreachDraft => ({
  email: { subject: "Quick idea for Harbor", body: words(75) },
  linkedin_note: "Saw Harbor came out of stealth this month — congrats on the seed.",
  follow_ups: [3, 7, 14].map((day) => ({ day, subject: "Re", body: "short", adds: "x" })),
  case_study: "Cashflo",
  compliance_flags: [],
  ...over,
});

test("a draft inside the playbook's limits has no warnings", () => {
  assert.deepEqual(draftWarnings(draft()), []);
});

test("length, link and follow-up limits are flagged in code", () => {
  const w = draftWarnings(
    draft({
      email: { subject: "A subject that is far too long", body: words(120) + " https://example.com" },
      linkedin_note: "x".repeat(300),
      follow_ups: [],
    }),
  );
  assert.equal(w.length, 5, w.join(" | "));
  assert.ok(w.some((m) => m.includes("Subject is 7 words")));
  assert.ok(w.some((m) => m.includes("121 words")));
  assert.ok(w.some((m) => m.includes("300 characters")));
  assert.ok(w.some((m) => m.includes("link other than pixlerlab.com")));
});

test("pixlerlab.com is the one link allowed", () => {
  assert.deepEqual(draftWarnings(draft({ email: { subject: "Hi", body: words(70) + " pixlerlab.com https://pixlerlab.com" } })), []);
});

test("the signature always carries the opt-out line", () => {
  assert.match(signature("Mukesh Rana"), /^Mukesh Rana\nPixlerLab\n\nReply "no thanks" and I won't follow up\.$/);
});
