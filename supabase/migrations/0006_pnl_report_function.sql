-- P&L for a period: выручка -> реклама -> ФОТ -> команда -> подотчёт -> прибыль (spec §6).
-- Revenue is scoped by payments.recognized_at (when it counts as earned, spec §5),
-- not paid_at; other_income and every expense type are scoped by transactions.date
-- (when the flow happened), never created_at (spec §8 item 8).
create or replace function pnl_report(p_from date, p_to date)
returns table (
  revenue numeric,
  ads_expense numeric,
  salary_expense numeric,
  team_expense numeric,
  staff_expense numeric,
  profit numeric
)
language sql
stable
as $$
  select
    coalesce(pay.total, 0) + coalesce(oi.total, 0) as revenue,
    coalesce(ads.total, 0) as ads_expense,
    coalesce(salary.total, 0) as salary_expense,
    coalesce(team.total, 0) as team_expense,
    coalesce(staff.total, 0) as staff_expense,
    coalesce(pay.total, 0) + coalesce(oi.total, 0)
      - coalesce(ads.total, 0) - coalesce(salary.total, 0)
      - coalesce(team.total, 0) - coalesce(staff.total, 0) as profit
  from
    (select sum(amount) as total from payments
     where deleted_at is null and recognized_at between p_from and p_to) pay,
    (select sum(amount) as total from transactions
     where deleted_at is null and type = 'other_income' and date between p_from and p_to) oi,
    (select sum(amount) as total from transactions
     where deleted_at is null and type = 'ads' and date between p_from and p_to) ads,
    (select sum(amount) as total from transactions
     where deleted_at is null and type = 'salary' and date between p_from and p_to) salary,
    (select sum(amount) as total from transactions
     where deleted_at is null and type = 'team' and date between p_from and p_to) team,
    (select sum(amount) as total from transactions
     where deleted_at is null and type = 'staff_expense' and date between p_from and p_to) staff;
$$;
