alter table public.kutt_ad_configuration
  add column if not exists reward_base_cents integer not null default 7000
  check (reward_base_cents >= 0 and reward_base_cents <= 50000);

alter table public.kutt_reward_visits
  add column if not exists reward_base_cents integer not null default 7000
  check (reward_base_cents >= 0 and reward_base_cents <= 50000);
