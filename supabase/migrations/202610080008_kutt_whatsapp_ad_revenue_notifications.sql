create table if not exists public.kutt_ad_notification_preferences (
  user_id uuid primary key references public.kutt_users(id) on delete cascade,
  enabled boolean not null default false,
  consent_version text,
  consented_at timestamptz,
  enabled_at timestamptz,
  disabled_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.kutt_ad_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.kutt_users(id) on delete cascade,
  service_day date not null,
  slot text not null check (slot in ('08', '20')),
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed', 'skipped')),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (user_id, service_day, slot),
  unique (id, user_id, service_day)
);

create table if not exists public.kutt_ad_notification_charges (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.kutt_users(id) on delete cascade,
  service_day date not null,
  amount_cents bigint not null default 1 check (amount_cents = 1),
  delivery_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, service_day),
  unique (delivery_id),
  foreign key (delivery_id, user_id, service_day)
    references public.kutt_ad_notification_deliveries(id, user_id, service_day) on delete cascade
);

create index if not exists kutt_ad_notification_charges_user_day_idx
  on public.kutt_ad_notification_charges(user_id, service_day desc);

alter table public.kutt_ad_notification_preferences enable row level security;
alter table public.kutt_ad_notification_deliveries enable row level security;
alter table public.kutt_ad_notification_charges enable row level security;

drop policy if exists "No direct public access to kutt ad notification preferences" on public.kutt_ad_notification_preferences;
drop policy if exists "No direct public access to kutt ad notification deliveries" on public.kutt_ad_notification_deliveries;
drop policy if exists "No direct public access to kutt ad notification charges" on public.kutt_ad_notification_charges;

create policy "No direct public access to kutt ad notification preferences"
  on public.kutt_ad_notification_preferences for all using (false) with check (false);
create policy "No direct public access to kutt ad notification deliveries"
  on public.kutt_ad_notification_deliveries for all using (false) with check (false);
create policy "No direct public access to kutt ad notification charges"
  on public.kutt_ad_notification_charges for all using (false) with check (false);

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
  v_notification_fees_cents bigint;
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
  v_net_cents := v_earned_cents - v_notification_fees_cents;

  if v_net_cents < 7000 then
    raise exception 'É necessário ter saldo líquido de R$ 70,00 após as tarifas para liberar saques.' using errcode = '22023';
  end if;

  select coalesce(sum(amount_cents), 0)::bigint into v_reserved_cents
    from public.kutt_withdrawals where user_id = p_user_id and status <> 'rejected';
  v_available_cents := greatest(0, v_net_cents - v_reserved_cents);
  if v_available_cents < 7000 then
    raise exception 'É necessário ter pelo menos R$ 70,00 disponíveis após tarifas e saques já solicitados.' using errcode = '22023';
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

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job
    where jobname in ('kutt-adsterra-report-morning', 'kutt-adsterra-report-evening')
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end
$$;

select cron.schedule(
  'kutt-adsterra-report-morning',
  '0 11 * * *',
  $$
    select net.http_post(
      url := 'https://ggufcvrwctieacvbbwim.supabase.co/functions/v1/kutt-short-links',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'kutt_publishable_key'),
        'x-kutt-report-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'kutt_report_cron_secret')
      ),
      body := '{"action":"scheduled-adsterra-report","notifySlot":"08"}'::jsonb,
      timeout_milliseconds := 30000
    )
  $$
);

select cron.schedule(
  'kutt-adsterra-report-evening',
  '0 23 * * *',
  $$
    select net.http_post(
      url := 'https://ggufcvrwctieacvbbwim.supabase.co/functions/v1/kutt-short-links',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'kutt_publishable_key'),
        'x-kutt-report-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'kutt_report_cron_secret')
      ),
      body := '{"action":"scheduled-adsterra-report","notifySlot":"20"}'::jsonb,
      timeout_milliseconds := 30000
    )
  $$
);
