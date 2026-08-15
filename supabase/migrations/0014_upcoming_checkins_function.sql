-- Dashboard's "ближайшие заселения" list (spec §6): upcoming check-ins
-- with the expected balance payment still due. Excludes cancelled and
-- completed deals (nothing left to collect or nothing left to happen).
create or replace function upcoming_checkins(p_limit int default 10)
returns table (
  deal_id uuid,
  client_name text,
  checkin_date date,
  remaining numeric
)
language sql
stable
as $$
  select d.id, d.client_name, d.checkin_date, s.remaining
  from deals d
  join deal_payment_summary s on s.deal_id = d.id
  where d.deleted_at is null
    and d.checkin_date is not null
    and d.checkin_date >= current_date
    and d.status not in ('cancelled', 'completed')
  order by d.checkin_date asc
  limit p_limit;
$$;
