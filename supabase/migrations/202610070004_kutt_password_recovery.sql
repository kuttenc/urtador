alter table public.kutt_otp_challenges
  add column if not exists password_recovery boolean not null default false;

alter table public.kutt_sessions
  add column if not exists password_recovery boolean not null default false;
