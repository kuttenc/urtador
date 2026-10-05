create extension if not exists pgcrypto;

create table if not exists public.kutt_short_links (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  target_url text not null,
  title text,
  creator_ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,
  click_count bigint not null default 0
);

create table if not exists public.kutt_short_link_events (
  id bigint generated always as identity primary key,
  link_id uuid not null references public.kutt_short_links(id) on delete cascade,
  visitor_ip_hash text,
  user_agent text,
  referer text,
  created_at timestamptz not null default now()
);

create table if not exists public.kutt_short_link_rate_limits (
  id bigint generated always as identity primary key,
  action text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists kutt_short_links_slug_idx on public.kutt_short_links(slug);
create index if not exists kutt_short_link_events_link_created_idx on public.kutt_short_link_events(link_id, created_at desc);
create index if not exists kutt_short_link_rate_limits_action_ip_created_idx on public.kutt_short_link_rate_limits(action, ip_hash, created_at desc);

alter table public.kutt_short_links enable row level security;
alter table public.kutt_short_link_events enable row level security;
alter table public.kutt_short_link_rate_limits enable row level security;

drop policy if exists "No direct public access to kutt links" on public.kutt_short_links;
drop policy if exists "No direct public access to kutt events" on public.kutt_short_link_events;
drop policy if exists "No direct public access to kutt rate limits" on public.kutt_short_link_rate_limits;

create policy "No direct public access to kutt links"
on public.kutt_short_links
for all
using (false)
with check (false);

create policy "No direct public access to kutt events"
on public.kutt_short_link_events
for all
using (false)
with check (false);

create policy "No direct public access to kutt rate limits"
on public.kutt_short_link_rate_limits
for all
using (false)
with check (false);

create or replace function public.kutt_increment_short_link_click(row_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.kutt_short_links
  set click_count = click_count + 1,
      updated_at = now()
  where id = row_id;
$$;
