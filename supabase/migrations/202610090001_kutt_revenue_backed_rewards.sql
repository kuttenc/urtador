-- Keep historical fixed rewards. All newly recorded visits participate in the
-- same revenue pool: 70% for publishers, capped at BRL 70 per 1,000 visits.
alter table public.kutt_ad_configuration
  add column if not exists reward_model text not null default 'adsterra_share'
    check (reward_model in ('fixed', 'adsterra_share'));

alter table public.kutt_reward_visits
  alter column reward_base_cents type numeric(20,10),
  add column if not exists reward_model text not null default 'fixed'
    check (reward_model in ('fixed', 'adsterra_share')),
  add column if not exists reward_cap_cents integer not null default 7000
    check (reward_cap_cents between 0 and 7000),
  add column if not exists revenue_applied_at timestamptz;

create table public.kutt_reward_fx (
  id boolean primary key default true check (id),
  usd_brl numeric(20,10) not null check (usd_brl > 0),
  quoted_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table public.kutt_reward_revenue_days (
  report_date date primary key,
  source_currency text not null check (source_currency in ('USD', 'BRL')),
  source_amount numeric(20,10) not null check (source_amount >= 0),
  conversion_rate numeric(20,10) not null check (conversion_rate > 0),
  fx_quoted_at timestamptz,
  revenue_brl numeric(24,10) not null check (revenue_brl >= 0),
  qualified_visits bigint not null check (qualified_visits > 0),
  rate_per_thousand_cents numeric(24,10) not null check (rate_per_thousand_cents >= 0),
  source_updated_at timestamptz not null,
  applied_at timestamptz not null default now()
);

alter table public.kutt_reward_fx enable row level security;
alter table public.kutt_reward_revenue_days enable row level security;
revoke all on public.kutt_reward_fx, public.kutt_reward_revenue_days from anon, authenticated;
grant all on public.kutt_reward_fx, public.kutt_reward_revenue_days to service_role;

create or replace function public.kutt_prepare_revenue_reward()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_model text;
  v_cap integer;
begin
  select reward_model, least(reward_base_cents, 7000)
    into v_model, v_cap from public.kutt_ad_configuration where id = true;
  if coalesce(v_model, 'adsterra_share') = 'adsterra_share' then
    new.reward_model := 'adsterra_share';
    new.reward_cap_cents := coalesce(v_cap, 7000);
    new.payout_percent := 100;
    new.reward_base_cents := 0;
    new.revenue_applied_at := null;
  end if;
  return new;
end;
$$;

create trigger kutt_prepare_revenue_reward
  before insert on public.kutt_reward_visits
  for each row execute function public.kutt_prepare_revenue_reward();

-- The ad provider's raw report is read only. CPM estimates never fund rewards.
-- Retain the first conversion rate for each day, so refreshing the exchange
-- quote cannot change a previously accounted day's balance.
create or replace function public.kutt_reconcile_ad_rewards()
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_updated bigint;
begin
  perform pg_advisory_xact_lock(71409301);
  with totals as (
    select visit_day, count(*) as visits from public.kutt_reward_visits group by visit_day
  ), amounts as (
    select r.report_date, r.currency_code, r.updated_at, t.visits,
      case when r.revenue_amount > 0 then r.revenue_amount else r.revenue_cents::numeric / 100 end as amount,
      case when r.currency_code = 'BRL' then 1::numeric
        else coalesce(case when previous.source_currency = 'USD' then previous.conversion_rate end,
          case when fx.quoted_at >= now() - interval '48 hours' then fx.usd_brl end) end as fx_rate,
      case when r.currency_code = 'BRL' then null
        else coalesce(case when previous.source_currency = 'USD' then previous.fx_quoted_at end, fx.quoted_at) end as fx_date
    from public.kutt_ad_revenue_reports r
    join totals t on t.visit_day = r.report_date
    left join public.kutt_reward_revenue_days previous on previous.report_date = r.report_date
    left join public.kutt_reward_fx fx on fx.id = true
    where r.provider = 'adsterra'
      and r.report_date < (now() at time zone 'America/Sao_Paulo')::date
      and r.currency_code in ('USD', 'BRL')
  )
  insert into public.kutt_reward_revenue_days (
    report_date, source_currency, source_amount, conversion_rate, fx_quoted_at,
    revenue_brl, qualified_visits, rate_per_thousand_cents, source_updated_at
  )
  select report_date, currency_code, amount, fx_rate, fx_date,
    trunc(amount * fx_rate, 10), visits,
    trunc(amount * fx_rate * 0.70 * 100 * 1000 / visits, 10), updated_at
  from amounts where fx_rate > 0
  on conflict (report_date) do update set
    source_currency = excluded.source_currency,
    source_amount = excluded.source_amount,
    conversion_rate = excluded.conversion_rate,
    fx_quoted_at = excluded.fx_quoted_at,
    revenue_brl = excluded.revenue_brl,
    qualified_visits = excluded.qualified_visits,
    rate_per_thousand_cents = excluded.rate_per_thousand_cents,
    source_updated_at = excluded.source_updated_at,
    applied_at = now()
  where (kutt_reward_revenue_days.source_currency, kutt_reward_revenue_days.source_amount,
         kutt_reward_revenue_days.qualified_visits, kutt_reward_revenue_days.source_updated_at)
    is distinct from (excluded.source_currency, excluded.source_amount,
                      excluded.qualified_visits, excluded.source_updated_at);

  update public.kutt_reward_visits v
    set reward_base_cents = least(v.reward_cap_cents, d.rate_per_thousand_cents),
        revenue_applied_at = now()
    from public.kutt_reward_revenue_days d
    where v.reward_model = 'adsterra_share' and v.visit_day = d.report_date
      and (v.revenue_applied_at is null or
           v.reward_base_cents is distinct from least(v.reward_cap_cents, d.rate_per_thousand_cents));
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

-- SQL numeric arithmetic is also used by kutt_request_withdrawal; accumulate
-- sub-cent earnings before flooring once, instead of rounding each visit.
create or replace function public.kutt_read_reward_balance(p_user_id uuid)
returns table (visit_count bigint, earned_cents bigint, pending_visits bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*),
    coalesce(floor(sum(round(payout_percent * 100) * reward_base_cents) / 10000000), 0)::bigint,
    count(*) filter (where reward_model = 'adsterra_share' and revenue_applied_at is null)
  from public.kutt_reward_visits where owner_user_id = p_user_id;
$$;

revoke all on function public.kutt_prepare_revenue_reward() from public, anon, authenticated;
revoke all on function public.kutt_reconcile_ad_rewards() from public, anon, authenticated;
revoke all on function public.kutt_read_reward_balance(uuid) from public, anon, authenticated;
grant execute on function public.kutt_reconcile_ad_rewards() to service_role;
grant execute on function public.kutt_read_reward_balance(uuid) to service_role;
