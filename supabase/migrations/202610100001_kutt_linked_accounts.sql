alter table public.kutt_users
  add column if not exists account_group_id uuid,
  add column if not exists account_number smallint;

update public.kutt_users
set account_group_id = coalesce(account_group_id, id),
    account_number = coalesce(account_number, 1)
where account_group_id is null or account_number is null;

alter table public.kutt_users
  alter column account_group_id set not null,
  alter column account_number set not null,
  alter column account_number set default 1,
  add constraint kutt_users_account_number_check check (account_number between 1 and 3);

alter table public.kutt_users drop constraint if exists kutt_users_phone_key;

create unique index if not exists kutt_users_group_number_idx
  on public.kutt_users(account_group_id, account_number);

create index if not exists kutt_users_phone_group_idx
  on public.kutt_users(phone, account_group_id, account_number);

-- Each phone can have up to three separately authenticated accounts. Extra
-- accounts are created only from an already authenticated session.
create or replace function public.kutt_create_linked_account(
  p_parent_user_id uuid,
  p_password_hash text,
  p_password_salt text
)
returns public.kutt_users
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  parent public.kutt_users%rowtype;
  next_number smallint;
  created public.kutt_users%rowtype;
begin
  select * into parent from public.kutt_users where id = p_parent_user_id for update;
  if not found then raise exception 'Conta de origem não encontrada.' using errcode = 'P0002'; end if;
  select coalesce(min(candidate), 4)::smallint into next_number
    from generate_series(1, 3) candidate
    where not exists (
      select 1 from public.kutt_users u
      where u.account_group_id = parent.account_group_id and u.account_number = candidate
    );
  if next_number > 3 then raise exception 'Este telefone já possui três contas.' using errcode = '22023'; end if;
  insert into public.kutt_users(phone, role, account_group_id, account_number, password_hash, password_salt)
    values (parent.phone, 'user', parent.account_group_id, next_number, p_password_hash, p_password_salt)
    returning * into created;
  return created;
end;
$$;

revoke all on function public.kutt_create_linked_account(uuid, text, text) from public, anon, authenticated;
grant execute on function public.kutt_create_linked_account(uuid, text, text) to service_role;
