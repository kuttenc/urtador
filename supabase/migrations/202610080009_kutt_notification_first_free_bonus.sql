alter table public.kutt_ad_notification_preferences
  add column if not exists free_notice_sent_at timestamptz;

create table if not exists public.kutt_ad_notification_credits (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.kutt_users(id) on delete cascade,
  service_day date not null,
  amount_cents bigint not null default 1 check (amount_cents = 1),
  reason text not null check (reason = 'first_free_notice_bonus'),
  delivery_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, reason),
  unique (delivery_id),
  foreign key (delivery_id, user_id, service_day)
    references public.kutt_ad_notification_deliveries(id, user_id, service_day) on delete cascade
);

alter table public.kutt_ad_notification_credits enable row level security;
drop policy if exists "No direct public access to kutt ad notification credits" on public.kutt_ad_notification_credits;
create policy "No direct public access to kutt ad notification credits"
  on public.kutt_ad_notification_credits for all using (false) with check (false);

create or replace function public.kutt_request_withdrawal(
  p_user_id uuid,
  p_amount_cents bigint
)
returns public.kutt_withdrawals
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.kutt_users%rowtype;
  v_earned_cents bigint;
  v_notification_fees_cents bigint;
  v_notification_bonus_cents bigint;
  v_net_cents bigint;
  v_reserved_cents bigint;
  v_available_cents bigint;
  v_daily_requests integer;
  v_day_start timestamptz;
  v_withdrawal public.kutt_withdrawals%rowtype;
begin
  if p_amount_cents is null or p_amount_cents < 1000 or mod(p_amount_cents, 1000) <> 0 then
    raise exception 'O saque mínimo é R$ 10,00 e os valores devem ser múltiplos de R$ 10,00.' using errcode = '22023';
  end if;

  select * into v_user from public.kutt_users where id = p_user_id for update;
  if not found then raise exception 'Conta não encontrada.' using errcode = 'P0002'; end if;
  if coalesce(v_user.pix_key, '') = '' then raise exception 'Cadastre sua chave Pix antes de solicitar saque.' using errcode = '22023'; end if;

  select coalesce(floor(sum(round(coalesce(payout_percent, 100.00) * 100) * coalesce(reward_base_cents, 7000)) / 10000000), 0)::bigint
    into v_earned_cents
    from public.kutt_reward_visits where owner_user_id = p_user_id;

  select coalesce(sum(amount_cents), 0)::bigint into v_notification_fees_cents
    from public.kutt_ad_notification_charges where user_id = p_user_id;
  select coalesce(sum(amount_cents), 0)::bigint into v_notification_bonus_cents
    from public.kutt_ad_notification_credits where user_id = p_user_id;
  v_net_cents := v_earned_cents - v_notification_fees_cents + v_notification_bonus_cents;

  if v_net_cents < 7000 then
    raise exception 'É necessário ter saldo líquido de R$ 70,00 após as tarifas para liberar saques.' using errcode = '22023';
  end if;

  select coalesce(sum(amount_cents), 0)::bigint into v_reserved_cents
    from public.kutt_withdrawals where user_id = p_user_id and status <> 'rejected';
  v_available_cents := greatest(0, v_net_cents - v_reserved_cents);
  if v_available_cents < 7000 then
    raise exception 'É necessário ter mais de R$ 70,00 disponíveis após tarifas e saques já solicitados.' using errcode = '22023';
  end if;
  if p_amount_cents > v_available_cents then
    raise exception 'O valor solicitado excede o saldo disponível de R$ %.', to_char(v_available_cents / 100.0, 'FM999999990D00');
  end if;

  v_day_start := ((now() at time zone 'America/Sao_Paulo')::date::timestamp at time zone 'America/Sao_Paulo');
  select count(*)::integer into v_daily_requests from public.kutt_withdrawals
    where user_id = p_user_id and requested_at >= v_day_start and requested_at < v_day_start + interval '1 day';
  if v_daily_requests >= 3 then
    raise exception 'Você já fez 3 solicitações de saque hoje. Tente novamente amanhã.' using errcode = '22023';
  end if;

  insert into public.kutt_withdrawals(user_id, amount_cents, pix_key)
    values (p_user_id, p_amount_cents, v_user.pix_key)
    returning * into v_withdrawal;
  return v_withdrawal;
end;
$$;

revoke all on function public.kutt_request_withdrawal(uuid, bigint) from public, anon, authenticated;
grant execute on function public.kutt_request_withdrawal(uuid, bigint) to service_role;
