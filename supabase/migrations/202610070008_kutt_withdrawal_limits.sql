drop index if exists public.kutt_one_open_withdrawal_per_user_idx;

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

  if v_earned_cents < 7000 then
    raise exception 'É necessário acumular R$ 70,00 em visitas qualificadas reais para liberar saques.' using errcode = '22023';
  end if;

  select coalesce(sum(amount_cents), 0)::bigint into v_reserved_cents
    from public.kutt_withdrawals where user_id = p_user_id and status <> 'rejected';
  v_available_cents := greatest(0, v_earned_cents - v_reserved_cents);
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
