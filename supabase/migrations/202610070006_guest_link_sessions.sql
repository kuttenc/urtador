alter table public.kutt_short_links
  add column if not exists guest_session_hash text;

create index if not exists kutt_short_links_guest_session_idx
  on public.kutt_short_links (guest_session_hash)
  where guest_session_hash is not null and owner_user_id is null;

comment on column public.kutt_short_links.guest_session_hash is
  'Hash of a browser-generated temporary session identifier; used only to claim anonymous links after the owner signs in.';
