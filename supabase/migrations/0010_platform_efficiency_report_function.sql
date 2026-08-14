-- Deals are grouped by their source (avito/cian/recommend/other) and matched
-- against ad spend recorded on transactions.platform for the same period.
-- transactions.platform is free text (spec §4) while deals.source is a fixed
-- enum, so the match is case-insensitive equality between the two — this is
-- an intentional simplification: it only reconciles ad spend whose recorded
-- platform name matches a deal source value verbatim (case-insensitively).
-- Ad spend logged under an unrelated platform name (or is_general = true)
-- simply won't appear here; that's expected, not a bug.
create or replace function platform_efficiency_report(p_from date, p_to date)
returns table (
  source text,
  deals_count bigint,
  commission_total numeric,
  ads_spend numeric,
  cost_per_deal numeric
)
language sql
stable
as $$
  select
    d.source,
    count(*) as deals_count,
    coalesce(sum(d.commission_amount), 0) as commission_total,
    coalesce(max(ads.total), 0) as ads_spend,
    case when count(*) > 0 then coalesce(max(ads.total), 0) / count(*) else 0 end as cost_per_deal
  from deals d
  left join (
    select lower(platform) as platform, sum(amount) as total
    from transactions
    where deleted_at is null and type = 'ads' and platform is not null
      and date between p_from and p_to
    group by lower(platform)
  ) ads on ads.platform = d.source::text
  where d.deleted_at is null
    and d.source is not null
    and d.booking_date between p_from and p_to
  group by d.source, ads.total;
$$;
