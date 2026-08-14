create view deal_payment_summary
with (security_invoker = true) as
select
  d.id as deal_id,
  d.user_id,
  d.commission_amount,
  d.status,
  coalesce(p.total_paid, 0) as total_paid,
  case
    when d.status = 'cancelled' then 0
    else greatest(d.commission_amount - coalesce(p.total_paid, 0), 0)
  end as remaining
from deals d
left join (
  select deal_id, sum(amount) as total_paid
  from payments
  where deleted_at is null
  group by deal_id
) p on p.deal_id = d.id
where d.deleted_at is null;
