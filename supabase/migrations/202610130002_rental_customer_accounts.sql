create table if not exists public.rental_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  phone text not null unique check (phone ~ '^[0-9]{8,15}$'),
  email text,
  password_hash text not null,
  password_salt text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rental_customer_sessions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.rental_customers(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists rental_customer_sessions_customer_idx
  on public.rental_customer_sessions (customer_id, expires_at desc);

alter table public.rental_reservations
  add column if not exists customer_id uuid references public.rental_customers(id) on delete set null;

alter table public.rental_reservations
  add column if not exists payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'refunded'));

create index if not exists rental_reservations_customer_id_idx
  on public.rental_reservations (customer_id, created_at desc);

drop trigger if exists rental_customers_updated_at on public.rental_customers;
create trigger rental_customers_updated_at before update on public.rental_customers
for each row execute function public.rental_set_updated_at();

alter table public.rental_items enable row level security;
alter table public.rental_reservations enable row level security;
alter table public.rental_customers enable row level security;
alter table public.rental_customer_sessions enable row level security;

revoke all on public.rental_items, public.rental_reservations, public.rental_customers, public.rental_customer_sessions
  from public, anon, authenticated;
grant all on public.rental_items, public.rental_reservations, public.rental_customers, public.rental_customer_sessions
  to service_role;

create or replace function public.rental_create_reservation(
  p_customer_id uuid,
  p_item_id uuid,
  p_start_date date,
  p_end_date date,
  p_customer_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.rental_items%rowtype;
  v_customer public.rental_customers%rowtype;
  v_reservation_id uuid;
begin
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Escolha um período válido.' using errcode = '22023';
  end if;
  if p_start_date < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data inicial não pode estar no passado.' using errcode = '22023';
  end if;
  if p_end_date - p_start_date >= 366 then
    raise exception 'A reserva pode ter no máximo 366 dias.' using errcode = '22023';
  end if;

  select * into v_customer from public.rental_customers where id = p_customer_id;
  if not found then raise exception 'Entre novamente para reservar.' using errcode = '28000'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_item_id::text, 0));
  select * into v_item from public.rental_items where id = p_item_id and active = true for update;
  if not found then raise exception 'Este item não está disponível para reserva.' using errcode = '22023'; end if;

  if public.rental_has_conflict(p_item_id, p_start_date, p_end_date) then
    raise exception 'Esse período já tem uma reserva aguardando aprovação ou confirmada.' using errcode = '23P01';
  end if;

  insert into public.rental_reservations (
    item_id, customer_id, customer_name, customer_phone, customer_email,
    start_date, end_date, daily_price_cents, customer_note
  ) values (
    v_item.id, v_customer.id, v_customer.name, v_customer.phone, v_customer.email,
    p_start_date, p_end_date, v_item.daily_price_cents, left(coalesce(p_customer_note, ''), 1000)
  ) returning id into v_reservation_id;
  return v_reservation_id;
end;
$$;

create or replace function public.rental_customer_cancel_reservation(
  p_customer_id uuid,
  p_reservation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.rental_reservations%rowtype;
begin
  select * into v_reservation from public.rental_reservations
    where id = p_reservation_id and customer_id = p_customer_id for update;
  if not found then raise exception 'Reserva não encontrada.' using errcode = 'P0002'; end if;
  if v_reservation.status <> 'pending' then
    raise exception 'Somente reservas aguardando aprovação podem ser canceladas por aqui.' using errcode = '22023';
  end if;
  update public.rental_reservations set status = 'cancelled' where id = v_reservation.id;
end;
$$;

create or replace function public.rental_admin_update_reservation(
  p_reservation_id uuid,
  p_status text default null,
  p_payment_status text default null,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.rental_reservations%rowtype;
  v_item_id uuid;
begin
  select item_id into v_item_id from public.rental_reservations where id = p_reservation_id;
  if not found then raise exception 'Reserva não encontrada.' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_item_id::text, 0));
  select * into v_reservation from public.rental_reservations where id = p_reservation_id for update;
  if not found then raise exception 'Reserva não encontrada.' using errcode = 'P0002'; end if;

  if p_status is not null and p_status <> v_reservation.status then
    if not (
      (v_reservation.status = 'pending' and p_status in ('approved', 'rejected', 'cancelled'))
      or (v_reservation.status = 'approved' and p_status in ('cancelled', 'completed'))
    ) then raise exception 'Essa mudança de status não é permitida.' using errcode = '22023'; end if;

    if p_status = 'approved' and public.rental_has_conflict(
      v_reservation.item_id, v_reservation.start_date, v_reservation.end_date, v_reservation.id
    ) then raise exception 'Outra reserva ocupa esse período.' using errcode = '23P01'; end if;

    update public.rental_reservations set
      status = p_status,
      admin_note = coalesce(left(p_admin_note, 500), admin_note),
      approved_at = case when p_status = 'approved' then now() else approved_at end,
      rejected_at = case when p_status = 'rejected' then now() else rejected_at end
    where id = v_reservation.id;
  elsif p_admin_note is not null then
    update public.rental_reservations set admin_note = left(p_admin_note, 500) where id = v_reservation.id;
  end if;

  if p_payment_status is not null then
    if p_payment_status not in ('pending', 'paid', 'refunded') then
      raise exception 'Status de pagamento inválido.' using errcode = '22023';
    end if;
    update public.rental_reservations set payment_status = p_payment_status where id = v_reservation.id;
  end if;
end;
$$;

revoke all on function public.rental_create_reservation(uuid, uuid, date, date, text) from public, anon, authenticated;
revoke all on function public.rental_customer_cancel_reservation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.rental_admin_update_reservation(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.rental_create_reservation(uuid, uuid, date, date, text) to service_role;
grant execute on function public.rental_customer_cancel_reservation(uuid, uuid) to service_role;
grant execute on function public.rental_admin_update_reservation(uuid, text, text, text) to service_role;
