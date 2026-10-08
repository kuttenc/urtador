alter table public.kutt_ad_revenue_reports
  add column if not exists ctr numeric(12, 6),
  add column if not exists cpm numeric(12, 6);

alter table public.kutt_ad_revenue_reports
  drop constraint if exists kutt_ad_revenue_reports_ctr_check,
  drop constraint if exists kutt_ad_revenue_reports_cpm_check;

alter table public.kutt_ad_revenue_reports
  add constraint kutt_ad_revenue_reports_ctr_check check (ctr is null or (ctr >= 0 and ctr <= 100)),
  add constraint kutt_ad_revenue_reports_cpm_check check (cpm is null or cpm >= 0);
