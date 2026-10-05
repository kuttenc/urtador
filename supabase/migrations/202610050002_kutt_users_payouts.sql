create table if not exists public.kutt_users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  role text not null default 'user' check (role in ('user', 'admin')),
  pix_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kutt_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists kutt_otp_phone_created_idx
  on public.kutt_otp_challenges(phone, created_at desc);

create table if not exists public.kutt_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.kutt_users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists kutt_sessions_user_expires_idx
  on public.kutt_sessions(user_id, expires_at desc);

alter table public.kutt_short_links
  add column if not exists owner_user_id uuid references public.kutt_users(id) on delete set null;

alter table public.kutt_short_link_events
  add column if not exists eligible_for_reward boolean not null default false,
  add column if not exists visit_day date not null default ((now() at time zone 'utc')::date);

create unique index if not exists kutt_unique_eligible_visit_per_link_day
  on public.kutt_short_link_events(link_id, visitor_ip_hash, visit_day)
  where eligible_for_reward and visitor_ip_hash is not null;

create table if not exists public.kutt_reward_visits (
  id bigint generated always as identity primary key,
  owner_user_id uuid not null references public.kutt_users(id) on delete cascade,
  visitor_ip_hash text not null,
  visit_day date not null default ((now() at time zone 'utc')::date),
  first_link_id uuid not null references public.kutt_short_links(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (owner_user_id, visitor_ip_hash, visit_day)
);

create index if not exists kutt_reward_visits_owner_day_idx
  on public.kutt_reward_visits(owner_user_id, visit_day desc);

create table if not exists public.kutt_withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.kutt_users(id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  pix_key text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'rejected')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references public.kutt_users(id) on delete set null,
  admin_note text
);

create index if not exists kutt_withdrawals_status_requested_idx
  on public.kutt_withdrawals(status, requested_at desc);
create index if not exists kutt_withdrawals_user_requested_idx
  on public.kutt_withdrawals(user_id, requested_at desc);
create unique index if not exists kutt_one_open_withdrawal_per_user_idx
  on public.kutt_withdrawals(user_id) where status in ('pending', 'approved');

alter table public.kutt_users enable row level security;
alter table public.kutt_otp_challenges enable row level security;
alter table public.kutt_sessions enable row level security;
alter table public.kutt_withdrawals enable row level security;
alter table public.kutt_reward_visits enable row level security;

drop policy if exists "No direct public access to kutt users" on public.kutt_users;
drop policy if exists "No direct public access to kutt otp" on public.kutt_otp_challenges;
drop policy if exists "No direct public access to kutt sessions" on public.kutt_sessions;
drop policy if exists "No direct public access to kutt withdrawals" on public.kutt_withdrawals;
drop policy if exists "No direct public access to kutt reward visits" on public.kutt_reward_visits;

create policy "No direct public access to kutt users"
  on public.kutt_users for all using (false) with check (false);
create policy "No direct public access to kutt otp"
  on public.kutt_otp_challenges for all using (false) with check (false);
create policy "No direct public access to kutt sessions"
  on public.kutt_sessions for all using (false) with check (false);
create policy "No direct public access to kutt withdrawals"
  on public.kutt_withdrawals for all using (false) with check (false);
create policy "No direct public access to kutt reward visits"
  on public.kutt_reward_visits for all using (false) with check (false);
