alter table public.kutt_ad_revenue_reports
  drop constraint if exists kutt_ad_revenue_reports_source_check;

alter table public.kutt_ad_revenue_reports
  add constraint kutt_ad_revenue_reports_source_check
  check (source in ('official_dashboard', 'adsense_api'));
