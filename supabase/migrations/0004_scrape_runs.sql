-- ---------------------------------------------------------------------------
-- One row per scraper run -- the Supabase home of the sheet's "Run Log" tab.
--
-- `sources` keeps the per-source accounting (fetched / qualified / rejected and
-- why), so a feed that quietly dies is visible the next morning instead of
-- failing silently for months.
-- ---------------------------------------------------------------------------

create table if not exists public.scrape_runs (
  id           uuid primary key default gen_random_uuid(),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running'
                 check (status in ('running', 'success', 'error')),

  fetched      integer not null default 0,
  qualified    integer not null default 0,
  saved        integer not null default 0,
  -- Qualified but held back by the segment/source quota. Not marked seen, so
  -- the next run reconsiders them.
  deferred     integer not null default 0,

  segments     jsonb not null default '{}'::jsonb,  -- { "saas": 12, ... } of saved leads
  sources      jsonb not null default '[]'::jsonb,  -- [{ label, status, fetched, qualified, detail }]
  digest       text,                                -- "sent to ..." or why it was skipped
  error        text
);

create index if not exists scrape_runs_started_at_desc on public.scrape_runs (started_at desc);

-- Server-only, like leads: RLS on, no policies.
alter table public.scrape_runs enable row level security;
