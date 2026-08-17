-- ---------------------------------------------------------------------------
-- Label scope for Gmail sync.  See docs/GMAIL-SYNC.md.
--
-- A connected mailbox grants access to the whole account. This adds the consent
-- gate: a mailbox reads NOTHING until someone picks the labels it may read.
-- ---------------------------------------------------------------------------

alter table public.connected_mailboxes
  add column if not exists synced_label_ids    text[],
  add column if not exists sync_scope_required boolean not null default true;

-- Gate the mailbox that already exists as well.
--
-- The reference implementation grandfathers pre-existing rows to `false` so a
-- live sync is not cut off mid-flight. We have no sync running yet, so there is
-- nothing to cut off and gating everything is both correct and the safer
-- default: no mailbox should be readable without an explicit label choice.
update public.connected_mailboxes
   set sync_scope_required = true
 where sync_scope_required is distinct from true;

comment on column public.connected_mailboxes.synced_label_ids is
  'Gmail label ids this mailbox may read. Empty/null + sync_scope_required means gated.';
comment on column public.connected_mailboxes.sync_scope_required is
  'True until someone has explicitly chosen what this mailbox syncs.';
