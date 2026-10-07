create table if not exists public.kutt_ad_configuration (
  id boolean primary key default true check (id),
  adsense_enabled boolean not null default false,
  adsterra_slots jsonb not null default '[]'::jsonb check (case when jsonb_typeof(adsterra_slots) = 'array' then jsonb_array_length(adsterra_slots) <= 6 else false end),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.kutt_users(id) on delete set null
);

alter table public.kutt_ad_configuration enable row level security;
drop policy if exists "No direct public access to kutt ad configuration" on public.kutt_ad_configuration;
create policy "No direct public access to kutt ad configuration"
  on public.kutt_ad_configuration for all using (false) with check (false);

insert into public.kutt_ad_configuration (id) values (true) on conflict (id) do nothing;
