// Copies leads from the Google Sheet into public.leads.
//
//   npm run import:sheet
//
// Reads through the existing Apps Script web app (Api.gs), so it needs the old
// SHEETS_API_URL / SHEETS_API_TOKEN (and SHEETS_TAB, if you used one) alongside
// the Supabase keys in .env.local.
//
// Insert-only: a lead whose key is already in Supabase is skipped, never
// overwritten. That makes it safe to re-run while Code.gs is still appending to
// the sheet each morning — new leads come across, and status/notes edited in
// the dashboard are left alone. Edits made in the sheet after a lead was
// imported do NOT come across.
//
// Api.gs only exposes columns A–R, so Technology / Service Opportunity /
// Recommended Outreach (S–U) arrive empty.

import { createClient } from "@supabase/supabase-js";

const env = (name) => process.env[name]?.trim();

const sheetsUrl = env("SHEETS_API_URL");
const sheetsToken = env("SHEETS_API_TOKEN");
const sheetsTab = env("SHEETS_TAB");
const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
const secretKey = env("SUPABASE_SECRET_KEY") ?? env("SUPABASE_SERVICE_ROLE_KEY");

const missing = Object.entries({
  SHEETS_API_URL: sheetsUrl,
  SHEETS_API_TOKEN: sheetsToken,
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  SUPABASE_SECRET_KEY: secretKey,
})
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length) {
  console.error(`Missing in .env.local: ${missing.join(", ")}`);
  process.exit(1);
}

const endpoint = new URL(sheetsUrl);
endpoint.searchParams.set("token", sheetsToken);
endpoint.searchParams.set("action", "leads");
if (sheetsTab) endpoint.searchParams.set("tab", sheetsTab);

const res = await fetch(endpoint, { redirect: "follow" });
const body = await res.json().catch(() => null);
if (!res.ok || !body?.ok) {
  console.error("Could not read the sheet:", body?.error ?? `HTTP ${res.status}`);
  process.exit(1);
}

/** Sheet cells come back as '' when blank; Date Found is an ISO string. */
function toRow(lead) {
  const parsed = Date.parse(lead.dateFound);
  return {
    date_found: Number.isNaN(parsed) ? null : new Date(parsed).toISOString(),
    priority: String(lead.priority ?? ""),
    score: Math.round(Number(lead.score)) || 0,
    company: String(lead.company ?? ""),
    contact_name: String(lead.contactName ?? ""),
    title_role: String(lead.titleRole ?? ""),
    email: String(lead.email ?? ""),
    signal_source: String(lead.signalSource ?? ""),
    matched_signals: String(lead.matchedSignals ?? ""),
    headline: String(lead.headline ?? ""),
    snippet: String(lead.snippet ?? ""),
    source_url: String(lead.sourceUrl ?? ""),
    status: String(lead.status ?? "") || "New",
    notes: String(lead.notes ?? ""),
    outreach_sent: String(lead.outreachSent ?? ""),
    segment: String(lead.segment ?? ""),
    intent: String(lead.intent ?? ""),
    domain: String(lead.domain ?? ""),
  };
}

// Api.gs returns newest first. Insert oldest first so `seq` keeps sheet order.
const rows = body.leads.slice().reverse().map(toRow);

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BATCH = 500;
let inserted = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const { data, error } = await supabase
    .from("leads")
    .upsert(rows.slice(i, i + BATCH), { onConflict: "key", ignoreDuplicates: true })
    .select("id");

  if (error) {
    console.error(`Batch starting at row ${i} failed:`, error.message);
    process.exit(1);
  }
  inserted += data.length;
}

console.log(
  `Read ${rows.length} leads from the sheet; inserted ${inserted}, ` +
    `skipped ${rows.length - inserted} already in Supabase.`,
);
