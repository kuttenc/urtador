create table if not exists public.kutt_admin_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username ~ '^[A-Za-z0-9_.-]{3,40}$'),
  password_hash text not null,
  password_salt text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kutt_admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.kutt_admin_accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists kutt_admin_sessions_active_idx on public.kutt_admin_sessions(token_hash, expires_at) where revoked_at is null;

create table if not exists public.kutt_emulator_catalog (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  platform text not null default 'PS2' check (platform in ('PS2', 'Android', 'Outro')),
  download_url text not null check (download_url ~* '^https?://'),
  cover_url text check (cover_url is null or cover_url ~* '^https?://'),
  notes text not null default '' check (char_length(notes) <= 1000),
  created_by uuid not null references public.kutt_admin_accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kutt_emulator_catalog_created_idx on public.kutt_emulator_catalog(created_at desc);
alter table public.kutt_admin_accounts enable row level security;
alter table public.kutt_admin_sessions enable row level security;
alter table public.kutt_emulator_catalog enable row level security;
