alter table public.kutt_users
  add column if not exists password_salt text,
  add column if not exists password_hash text,
  add column if not exists otp_verified_at timestamptz;

alter table public.kutt_otp_challenges
  add column if not exists password_verified boolean not null default false;

create index if not exists kutt_users_otp_verified_idx
  on public.kutt_users(otp_verified_at desc);
