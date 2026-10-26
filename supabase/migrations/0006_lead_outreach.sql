-- ---------------------------------------------------------------------------
-- On-demand outreach drafts (the "Draft outreach" button in the lead panel).
--
-- `outreach` holds the drafted email, LinkedIn note and three follow-ups.
-- Drafts only: nothing in this app sends them.
-- ---------------------------------------------------------------------------

alter table public.leads
  add column if not exists outreach            jsonb,
  add column if not exists outreach_drafted_at timestamptz;
