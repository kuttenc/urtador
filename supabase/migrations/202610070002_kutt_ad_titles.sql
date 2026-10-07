alter table public.kutt_ad_configuration
  add column if not exists adsense_title text not null default '';
