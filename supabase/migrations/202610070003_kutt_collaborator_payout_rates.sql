alter table public.kutt_users
  add column if not exists payout_percent numeric(5,2) not null default 100.00
  check (payout_percent >= 0 and payout_percent <= 100);

alter table public.kutt_reward_visits
  add column if not exists payout_percent numeric(5,2) not null default 100.00
  check (payout_percent >= 0 and payout_percent <= 100);
