-- Adds a fixed 15-minute access window per short link and visitor IP hash.
-- Reversal: drop table public.kutt_link_access_windows.
create table if not exists public.kutt_link_access_windows (
  link_id uuid not null references public.kutt_short_links(id) on delete cascade,
  visitor_ip_hash text not null,
  first_accessed_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (link_id, visitor_ip_hash)
);

create index if not exists kutt_link_access_windows_expires_idx
  on public.kutt_link_access_windows (expires_at);

alter table public.kutt_link_access_windows enable row level security;
revoke all on table public.kutt_link_access_windows from anon, authenticated;

comment on table public.kutt_link_access_windows is
  'Opaque visitor IP hashes used only to enforce the first 15-minute access window for each short link.';
