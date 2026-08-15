-- The dashboard's 7 summary cards (spec §6), all computed live, no
-- parameters — this function always answers "as of right now".
--
-- unrecognized_received treats a payment as "not yet recognized" when
-- recognized_at is null (a balance payment whose deal has no checkin_date
-- yet — its recognition date is genuinely unknown, not "never") OR when
-- recognized_at is a real date still in the future. Spec §5's literal
-- formula only names the future-date case; the null case is included
-- deliberately so a received-but-unrecognized balance payment isn't
-- silently dropped from this card before its deal even has a checkin_date.
drop function if exists dashboard_summary();
create or replace function dashboard_summary()
returns table (
  account_balance_total numeric,
  revenue_month numeric,
  expenses_month numeric,
  profit_month numeric,
  expected_receivables numeric,
  unrecognized_received numeric,
  personal_withdrawn numeric
)
language sql
stable
as $$
  select
    coalesce((select sum(balance) from account_balances), 0) as account_balance_total,
    pnl.revenue,
    pnl.ads_expense + pnl.salary_expense + pnl.team_expense + pnl.staff_expense as expenses_month,
    pnl.profit,
    coalesce(
      (select sum(remaining) from deal_payment_summary
       where status in ('booked', 'prepaid', 'checked_in')),
      0
    ) as expected_receivables,
    coalesce(
      (select sum(amount) from payments
       where deleted_at is null
         and paid_at <= current_date
         and (recognized_at is null or recognized_at > current_date)),
      0
    ) as unrecognized_received,
    coalesce((select sum(amount) from transactions where deleted_at is null and type = 'personal'), 0) as personal_withdrawn
  from pnl_report(
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date
  ) pnl;
$$;
