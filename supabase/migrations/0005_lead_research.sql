-- ---------------------------------------------------------------------------
-- On-demand company research (the "Research" button in the lead panel).
--
-- `research` holds the whole structured result -- company facts, decision
-- maker, ICP fit score, sources -- so the panel can show it without parsing
-- notes. The contact fields it fills (contact_name, title_role, notes) are the
-- existing columns, and only when they were empty.
-- ---------------------------------------------------------------------------

alter table public.leads
  add column if not exists research      jsonb,
  add column if not exists researched_at timestamptz;
