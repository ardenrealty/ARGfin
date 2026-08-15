-- The dashboard's horizontal money-distribution bar (spec §6): реклама,
-- ФОТ, команда, подотчёт, личное, остаток. The first four segments are
-- this month's expense breakdown (same numbers as pnl_report); "личное"
-- is this month's personal withdrawals (excluded from profit, but shown
-- here because it did leave the accounts); "остаток" is what's left of
-- this month's revenue after every other segment is subtracted — it can
-- go negative if the month spent more than it earned, which the UI must
-- render as a zero-width (not negative-width) segment.
create or replace function money_distribution()
returns table (
  ads_expense numeric,
  salary_expense numeric,
  team_expense numeric,
  staff_expense numeric,
  personal_expense numeric,
  remaining numeric
)
language sql
stable
as $$
  select
    pnl.ads_expense,
    pnl.salary_expense,
    pnl.team_expense,
    pnl.staff_expense,
    coalesce(personal.total, 0) as personal_expense,
    pnl.revenue - pnl.ads_expense - pnl.salary_expense - pnl.team_expense
      - pnl.staff_expense - coalesce(personal.total, 0) as remaining
  from pnl_report(
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date
  ) pnl,
  (
    select sum(amount) as total
    from transactions
    where deleted_at is null and type = 'personal'
      and date between date_trunc('month', current_date)::date
                    and (date_trunc('month', current_date) + interval '1 month - 1 day')::date
  ) personal;
$$;
