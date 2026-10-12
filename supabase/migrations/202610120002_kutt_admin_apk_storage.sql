insert into storage.buckets (id, name, public)
values ('kutt-apks', 'kutt-apks', false)
on conflict (id) do update set public = false;

alter table public.kutt_emulator_catalog drop constraint if exists kutt_emulator_catalog_download_url_check;
alter table public.kutt_emulator_catalog alter column download_url drop not null;
alter table public.kutt_emulator_catalog add column if not exists storage_path text;
alter table public.kutt_emulator_catalog add constraint kutt_emulator_catalog_download_url_check
  check (download_url is null or download_url ~* '^https?://');
alter table public.kutt_emulator_catalog add constraint kutt_emulator_catalog_source_check
  check (download_url is not null or storage_path is not null);
