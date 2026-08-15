-- Chart data for the dashboard's monthly revenue/expenses/profit bar chart
-- (spec §6). Loops pnl_report once per month rather than re-deriving the
-- revenue/expense formulas — same numbers as the P&L report (Phase 3) and
-- the dashboard cards (Task 1), by construction, not by coincidence.
create or replace function monthly_pnl_series(p_months int default 6)
returns table (
  month date,
  revenue numeric,
  expenses numeric,
  profit numeric
)
language plpgsql
stable
as $$
declare
  m date;
begin
  for m in
    select date_trunc('month', current_date - (n || ' months')::interval)::date
    from generate_series(0, p_months - 1) as n
    order by 1
  loop
    return query
    select
      m,
      pnl.revenue,
      pnl.ads_expense + pnl.salary_expense + pnl.team_expense + pnl.staff_expense,
      pnl.profit
    from pnl_report(m, (m + interval '1 month - 1 day')::date) pnl;
  end loop;
end;
$$;
