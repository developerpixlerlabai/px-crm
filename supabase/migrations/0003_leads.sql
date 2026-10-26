-- ---------------------------------------------------------------------------
-- Leads, moved off the Google Sheet.
--
-- One column per sheet column A-U from LEAD_HEADERS in google-app-script/Code.gs,
-- in the same order, so the import and the scraper port map 1:1. Everything is
-- text unless the sheet itself typed it (Date Found, Score), and blanks are ''
-- rather than null, because that is what the dashboard has always received.
-- ---------------------------------------------------------------------------

create table if not exists public.leads (
  id                    uuid primary key default gen_random_uuid(),

  -- Insertion order. The sheet appended, and the dashboard lists newest first;
  -- date_found alone cannot do that, since a whole scrape shares one morning.
  seq                   bigint generated always as identity,

  date_found            timestamptz,                -- A
  priority              text not null default '',   -- B  emoji label from scoreLabel_()
  score                 integer not null default 0, -- C  0-10
  company               text not null default '',   -- D
  contact_name          text not null default '',   -- E
  title_role            text not null default '',   -- F
  email                 text not null default '',   -- G
  signal_source         text not null default '',   -- H
  matched_signals       text not null default '',   -- I
  headline              text not null default '',   -- J
  snippet               text not null default '',   -- K
  source_url            text not null default '',   -- L
  status                text not null default 'New',-- M
  notes                 text not null default '',   -- N
  outreach_sent         text not null default '',   -- O
  segment               text not null default '',   -- P
  intent                text not null default '',   -- Q
  domain                text not null default '',   -- R
  technology            text not null default '',   -- S
  service_opportunity   text not null default '',   -- T
  recommended_outreach  text not null default '',   -- U

  -- Dedup fingerprint, identical to apiKey_() in Api.gs: the source URL, else
  -- company|headline. Generated so no writer can compute it differently -- the
  -- scraper dedupes on it and the dashboard addresses leads by it.
  key                   text generated always as (
                          coalesce(
                            nullif(lower(trim(source_url)), ''),
                            trim(regexp_replace(lower(company || '|' || headline), '\s+', ' ', 'g'))
                          )
                        ) stored,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists leads_key_unique on public.leads (key);
create index if not exists leads_seq_desc on public.leads (seq desc);

drop trigger if exists leads_touch_updated_at on public.leads;
create trigger leads_touch_updated_at
  before update on public.leads
  for each row execute function private.touch_updated_at();

-- Same posture as connected_mailboxes: RLS on, zero policies. Only our server
-- code, on the service role, reads or writes leads.
alter table public.leads enable row level security;
