alter table public.kutt_users
  add column if not exists pix_key_confirmed_at timestamptz;

create table if not exists public.kutt_pix_confirmation_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.kutt_users(id) on delete cascade,
  pix_key_hash text not null,
  code_hash text not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  confirmed_at timestamptz
);

create index if not exists kutt_pix_confirmation_challenges_user_created_idx
  on public.kutt_pix_confirmation_challenges(user_id, created_at desc);

alter table public.kutt_pix_confirmation_challenges enable row level security;
drop policy if exists "No direct public access to kutt Pix confirmation challenges" on public.kutt_pix_confirmation_challenges;
create policy "No direct public access to kutt Pix confirmation challenges"
  on public.kutt_pix_confirmation_challenges for all using (false) with check (false);
