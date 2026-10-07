-- Count only explicit, human-confirmed destination opens. The event, click counter,
-- and reward ledger entry are committed together to prevent partial or duplicate accrual.
alter table public.kutt_short_links
  add column if not exists qualified_click_count bigint not null default 0;

-- Rebuild the visible counter from previously qualified, deduplicated events;
-- never copy the legacy raw click_count, which may include bot requests.
update public.kutt_short_links as links
set qualified_click_count = counts.total
from (
  select link_id, count(*)::bigint as total
  from public.kutt_short_link_events
  where eligible_for_reward and visitor_ip_hash is not null
  group by link_id
) as counts
where links.id = counts.link_id and links.qualified_click_count = 0;

create or replace function public.kutt_record_qualified_click(
  row_id uuid,
  visitor_ip_hash text,
  event_user_agent text,
  event_referer text,
  qualified_visit_day date
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  link_owner_id uuid;
  creator_hash text;
  inserted_event_id bigint;
  owner_rate numeric(5,2);
  base_cents integer;
begin
  if visitor_ip_hash is null or length(visitor_ip_hash) <> 64 then
    return false;
  end if;

  if coalesce(event_user_agent, '') ~* '(bot|crawler|spider|preview|facebookexternalhit|whatsapp|slack|discord|curl|wget|headless|phantom|monitor|uptime)' then
    return false;
  end if;

  select owner_user_id, creator_ip_hash
    into link_owner_id, creator_hash
    from public.kutt_short_links
    where id = row_id and disabled_at is null
    for update;

  if link_owner_id is null or creator_hash = visitor_ip_hash then
    return false;
  end if;

  insert into public.kutt_short_link_events (
    link_id, visitor_ip_hash, user_agent, referer, eligible_for_reward, visit_day
  ) values (
    row_id, visitor_ip_hash, nullif(event_user_agent, ''), nullif(event_referer, ''), true, qualified_visit_day
  )
  on conflict do nothing
  returning id into inserted_event_id;

  if inserted_event_id is null then
    return false;
  end if;

  update public.kutt_short_links
    set qualified_click_count = qualified_click_count + 1,
        updated_at = now()
    where id = row_id;

  select coalesce(payout_percent, 100.00)
    into owner_rate
    from public.kutt_users
    where id = link_owner_id;

  select coalesce(reward_base_cents, 7000)
    into base_cents
    from public.kutt_ad_configuration
    where id = true;

  insert into public.kutt_reward_visits (
    owner_user_id, visitor_ip_hash, visit_day, first_link_id, payout_percent, reward_base_cents
  ) values (
    link_owner_id, visitor_ip_hash, qualified_visit_day, row_id,
    coalesce(owner_rate, 100.00), coalesce(base_cents, 7000)
  )
  on conflict (owner_user_id, visitor_ip_hash, visit_day) do nothing;

  return true;
end;
$$;

revoke all on function public.kutt_record_qualified_click(uuid, text, text, text, date) from public, anon, authenticated;
grant execute on function public.kutt_record_qualified_click(uuid, text, text, text, date) to service_role;

-- The new transaction function is the only click-counter writer used by the edge function.
revoke all on function public.kutt_increment_short_link_click(uuid) from service_role;
