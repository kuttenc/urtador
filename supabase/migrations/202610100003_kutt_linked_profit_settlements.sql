create table if not exists public.kutt_linked_profit_settlements (
  id bigint generated always as identity primary key,
  account_group_id uuid not null,
  settlement_day date not null,
  total_positive_cents bigint not null default 0 check (total_positive_cents >= 0),
  accounts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (account_group_id, settlement_day)
);

alter table public.kutt_linked_profit_settlements enable row level security;
revoke all on public.kutt_linked_profit_settlements from anon, authenticated;
grant all on public.kutt_linked_profit_settlements to service_role;

create or replace function public.kutt_settle_linked_profits(p_settlement_day date default null)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  settlement_day date := coalesce(p_settlement_day, (now() at time zone 'America/Sao_Paulo')::date);
  group_row record;
  account_row record;
  positive_total bigint;
  account_details jsonb;
  inserted_count bigint := 0;
begin
  if extract(day from settlement_day) not in (14, 19) then return 0; end if;
  for group_row in select distinct account_group_id from public.kutt_users loop
    positive_total := 0;
    account_details := '[]'::jsonb;
    for account_row in
      select u.id, u.account_number, b.earned_cents
      from public.kutt_users u
      cross join lateral public.kutt_read_reward_balance(u.id) b
      where u.account_group_id = group_row.account_group_id
      order by u.account_number
    loop
      if greatest(0, coalesce(account_row.earned_cents, 0)) > 0 then
        positive_total := positive_total + greatest(0, account_row.earned_cents);
        account_details := account_details || jsonb_build_array(jsonb_build_object(
          'accountNumber', account_row.account_number,
          'positiveCents', greatest(0, account_row.earned_cents)
        ));
      end if;
    end loop;
    insert into public.kutt_linked_profit_settlements(account_group_id, settlement_day, total_positive_cents, accounts)
      values (group_row.account_group_id, settlement_day, positive_total, account_details)
      on conflict (account_group_id, settlement_day) do update set
        total_positive_cents = excluded.total_positive_cents,
        accounts = excluded.accounts;
    inserted_count := inserted_count + 1;
  end loop;
  return inserted_count;
end;
$$;

revoke all on function public.kutt_settle_linked_profits(date) from public, anon, authenticated;
grant execute on function public.kutt_settle_linked_profits(date) to service_role;

do $do$
declare job_id bigint;
begin
  select cron.schedule(
    'kutt-linked-profit-settlement',
    '10 3 * * *',
    $job$select public.kutt_settle_linked_profits();$job$
  ) into job_id;
exception when duplicate_object then null;
end
$do$;
