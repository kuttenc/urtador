create table if not exists public.kutt_ad_revenue_reports (
  provider text not null check (provider in ('adsense', 'adsterra')),
  report_date date not null,
  impressions bigint not null default 0 check (impressions >= 0),
  clicks bigint not null default 0 check (clicks >= 0),
  revenue_cents bigint not null default 0 check (revenue_cents >= 0),
  currency_code text not null default 'BRL' check (currency_code = 'BRL'),
  source text not null default 'official_dashboard' check (source = 'official_dashboard'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.kutt_users(id) on delete set null,
  primary key (provider, report_date)
);

alter table public.kutt_ad_revenue_reports enable row level security;
drop policy if exists "No direct public access to kutt ad revenue reports" on public.kutt_ad_revenue_reports;
create policy "No direct public access to kutt ad revenue reports"
  on public.kutt_ad_revenue_reports for all using (false) with check (false);
