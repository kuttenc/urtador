alter table public.kutt_ad_revenue_reports
  add column if not exists revenue_amount numeric(20, 10) not null default 0;

update public.kutt_ad_revenue_reports
set revenue_amount = revenue_cents::numeric / 100
where revenue_amount = 0 and revenue_cents > 0;

create or replace function public.kutt_ad_revenue_daily_visit_share(
  target_user_id uuid,
  start_day date,
  end_day date
)
returns table(report_date date, user_visits bigint, total_visits bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    visit_day as report_date,
    count(*) filter (where owner_user_id = target_user_id)::bigint as user_visits,
    count(*)::bigint as total_visits
  from public.kutt_reward_visits
  where visit_day between start_day and end_day
  group by visit_day
  order by visit_day;
$$;

revoke all on function public.kutt_ad_revenue_daily_visit_share(uuid, date, date) from public, anon, authenticated;
grant execute on function public.kutt_ad_revenue_daily_visit_share(uuid, date, date) to service_role;
