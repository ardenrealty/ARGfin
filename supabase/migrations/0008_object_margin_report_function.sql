-- Маржа по объекту = признанные комиссии по объекту - реклама по объекту
-- (spec §5). Ads with is_general = true are deliberately excluded (spec §8
-- item 7: general ad spend, not tied to one object, must never appear in a
-- single object's margin).
create or replace function object_margin_report(p_from date, p_to date)
returns table (
  object_id uuid,
  object_title text,
  recognized_commission numeric,
  ads_spend numeric,
  margin numeric
)
language sql
stable
as $$
  select
    o.id,
    o.title,
    coalesce(comm.total, 0) as recognized_commission,
    coalesce(ads.total, 0) as ads_spend,
    coalesce(comm.total, 0) - coalesce(ads.total, 0) as margin
  from objects o
  left join (
    select d.object_id, sum(p.amount) as total
    from payments p
    join deals d on d.id = p.deal_id
    where p.deleted_at is null and d.deleted_at is null
      and p.recognized_at between p_from and p_to
      and d.object_id is not null
    group by d.object_id
  ) comm on comm.object_id = o.id
  left join (
    select object_id, sum(amount) as total
    from transactions
    where deleted_at is null and type = 'ads'
      and coalesce(is_general, false) = false
      and object_id is not null
      and date between p_from and p_to
    group by object_id
  ) ads on ads.object_id = o.id
  where o.deleted_at is null;
$$;
