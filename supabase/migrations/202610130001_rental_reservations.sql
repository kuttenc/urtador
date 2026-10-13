create extension if not exists pgcrypto;

create table if not exists public.rental_items (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Item para aluguel',
  description text not null default '',
  daily_price_cents integer not null default 2000 check (daily_price_cents > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rental_reservations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.rental_items(id),
  customer_name text not null check (length(trim(customer_name)) between 2 and 160),
  customer_phone text not null check (length(trim(customer_phone)) between 8 and 40),
  customer_email text,
  start_date date not null,
  end_date date not null,
  daily_price_cents integer not null check (daily_price_cents > 0),
  total_days integer generated always as ((end_date - start_date) + 1) stored,
  total_price_cents integer generated always as (((end_date - start_date) + 1) * daily_price_cents) stored,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled', 'completed')),
  customer_note text not null default '',
  admin_note text not null default '',
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (end_date - start_date < 366)
);

create index if not exists rental_reservations_item_dates_idx
  on public.rental_reservations (item_id, start_date, end_date);
create index if not exists rental_reservations_customer_phone_idx
  on public.rental_reservations (customer_phone);
create index if not exists rental_reservations_status_idx
  on public.rental_reservations (status);

create or replace function public.rental_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rental_items_updated_at on public.rental_items;
create trigger rental_items_updated_at before update on public.rental_items
for each row execute function public.rental_set_updated_at();

drop trigger if exists rental_reservations_updated_at on public.rental_reservations;
create trigger rental_reservations_updated_at before update on public.rental_reservations
for each row execute function public.rental_set_updated_at();

create or replace function public.rental_has_conflict(
  p_item_id uuid, p_start_date date, p_end_date date, p_ignore_id uuid default null
)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.rental_reservations r
    where r.item_id = p_item_id
      and r.status in ('pending', 'approved')
      and (p_ignore_id is null or r.id <> p_ignore_id)
      and r.start_date <= p_end_date
      and r.end_date >= p_start_date
  );
$$;

revoke all on function public.rental_has_conflict(uuid, date, date, uuid) from public, anon, authenticated;

insert into public.rental_items (name, description, daily_price_cents)
select 'Item para aluguel', 'Item configurável pelo administrador.', 2000
where not exists (select 1 from public.rental_items);
