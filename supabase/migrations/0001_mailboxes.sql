-- ---------------------------------------------------------------------------
-- Mailbox registry for Gmail sync.  See docs/GMAIL-SYNC.md (slice 1A).
--
-- SETUP STEP THAT IS NOT IN THIS FILE:
--   Supabase Dashboard -> Project Settings -> API -> Exposed schemas
--   must include `private`, or the RPCs below are unreachable over PostgREST
--   and every connect ends with "could not store the refresh token".
--   The grants at the bottom are what actually protect them; exposure alone
--   grants nothing.
-- ---------------------------------------------------------------------------

create extension if not exists supabase_vault with schema vault cascade;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- connected_mailboxes -- one row per connected Google account
-- ---------------------------------------------------------------------------
create table if not exists public.connected_mailboxes (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null default 'gmail' check (provider in ('gmail')),
  address         text not null,

  -- Who clicked Connect. Plain text for now; becomes a real
  -- `user_id uuid references auth.users` once Phase 0 lands a login.
  connected_by    text,

  -- Vault reference. The refresh token itself is NEVER in a plain column.
  vault_secret_id uuid,

  -- Scopes GRANTED at the last connect, not the ones we asked for. Google lets
  -- a user grant a subset, and this is what lets the UI prompt for a reconnect
  -- instead of discovering the gap as a runtime 403.
  scopes          text[],

  status          text not null default 'connecting'
                    check (status in ('connecting','connected','error','disconnected')),
  sync_error      text,
  last_synced_at  timestamptz,
  connected_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One LIVE connection per address. Disconnected rows are excluded so the same
-- account can be reconnected later -- and so the revive path in
-- findOrCreateMailbox() cannot breach this by reviving two rows at once.
create unique index if not exists connected_mailboxes_unique_active_address
  on public.connected_mailboxes (address)
  where status <> 'disconnected';

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists connected_mailboxes_touch_updated_at on public.connected_mailboxes;
create trigger connected_mailboxes_touch_updated_at
  before update on public.connected_mailboxes
  for each row execute function private.touch_updated_at();

-- RLS on with ZERO policies: `anon` and `authenticated` get nothing at all,
-- while `service_role` bypasses RLS entirely. This is deliberately MORE closed
-- than the policy set Phase 0 will introduce -- the app has no login yet, so
-- nothing should reach this table except our own server code.
alter table public.connected_mailboxes enable row level security;

-- ---------------------------------------------------------------------------
-- Token storage.  Two SECURITY DEFINER functions are the only code allowed to
-- touch `vault`.
--
-- Four rules, all load-bearing:
--   * LANGUAGE plpgsql, never sql -- a SECURITY DEFINER sql function can hit
--     Postgres error 42P17 (infinite recursion) in a policy context.
--   * SET search_path = '' on every one, and fully-qualify every identifier
--     inside, or the search_path can be hijacked by the caller.
--   * These bypass RLS by design, so they must not rely on it for safety.
--   * Grant to service_role ONLY, and explicitly revoke from PUBLIC/anon/
--     authenticated. Skipping the revoke hands out a decrypt oracle.
-- ---------------------------------------------------------------------------

-- (a) WRITE -- store/rotate the refresh token and mark the mailbox live.
create or replace function private.configure_mailbox_tokens(
  p_mailbox_id uuid,
  p_refresh_token text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exists boolean;
  v_secret_id uuid;
  v_name text;
begin
  if p_refresh_token is null or length(trim(p_refresh_token)) = 0 then
    raise exception 'configure_mailbox_tokens: refresh token is empty';
  end if;

  select true into v_exists
  from public.connected_mailboxes
  where id = p_mailbox_id;

  if v_exists is null then
    raise exception 'configure_mailbox_tokens: mailbox not found';
  end if;

  -- UPSERT BY DETERMINISTIC NAME. vault.secrets.name is uniquely indexed, so a
  -- bare create_secret() fails on the second connect of the same mailbox.
  v_name := 'mailbox_refresh_' || p_mailbox_id::text;

  select id into v_secret_id from vault.secrets where name = v_name;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      p_refresh_token,
      v_name,
      'Gmail OAuth refresh token for mailbox ' || p_mailbox_id::text
    );
  else
    perform vault.update_secret(
      v_secret_id,
      p_refresh_token,
      v_name,
      'Gmail OAuth refresh token for mailbox ' || p_mailbox_id::text
    );
  end if;

  -- Flipping to 'connected' happens HERE and nowhere else, so a mailbox can
  -- never look live without a usable token behind it.
  update public.connected_mailboxes
     set vault_secret_id = v_secret_id,
         status          = 'connected',
         sync_error      = null,
         connected_at    = now()
   where id = p_mailbox_id;
end;
$$;

revoke all on function private.configure_mailbox_tokens(uuid, text) from public, anon, authenticated;
grant execute on function private.configure_mailbox_tokens(uuid, text) to service_role;

-- (b) READ, service context -- for our server code and later background jobs.
create or replace function private.resolve_mailbox_refresh_token_service(
  p_mailbox_id uuid
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
  v_status text;
  v_token text;
begin
  select vault_secret_id, status
    into v_secret_id, v_status
  from public.connected_mailboxes
  where id = p_mailbox_id;

  -- A disconnected mailbox must not mint tokens, even for a trusted caller.
  if v_secret_id is null or v_status = 'disconnected' then
    return null;
  end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where id = v_secret_id;

  return v_token;
end;
$$;

revoke all on function private.resolve_mailbox_refresh_token_service(uuid) from public, anon, authenticated;
grant execute on function private.resolve_mailbox_refresh_token_service(uuid) to service_role;

grant usage on schema private to service_role;
