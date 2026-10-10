create or replace function public.kutt_settle_linked_profits(p_settlement_day date default null)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_settlement_day date := coalesce(p_settlement_day, (now() at time zone 'America/Sao_Paulo')::date);
  group_row record;
  account_row record;
  positive_total bigint;
  account_details jsonb;
  settled_groups bigint := 0;
begin
  if extract(day from v_settlement_day) not in (14, 19) then return 0; end if;
  for group_row in select distinct u.account_group_id from public.kutt_users u loop
    positive_total := 0;
    account_details := '[]'::jsonb;
    for account_row in
      select u.account_number, b.earned_cents
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
      values (group_row.account_group_id, v_settlement_day, positive_total, account_details)
      on conflict (account_group_id, settlement_day) do update set
        total_positive_cents = excluded.total_positive_cents,
        accounts = excluded.accounts;
    settled_groups := settled_groups + 1;
  end loop;
  return settled_groups;
end;
$$;
