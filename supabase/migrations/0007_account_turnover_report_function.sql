-- Per-account opening balance (everything before p_from), period turnover
-- (in/out within [p_from, p_to]), and closing balance (opening + period net).
-- Same fan-out-avoidance shape as account_balances: every aggregation is
-- pre-grouped by account_id in its own subquery before joining onto accounts.
create or replace function account_turnover_report(p_from date, p_to date)
returns table (
  account_id uuid,
  account_name text,
  opening_balance numeric,
  period_in numeric,
  period_out numeric,
  closing_balance numeric
)
language sql
stable
as $$
  select
    a.id,
    a.name,
    coalesce(op_pay.total, 0) + coalesce(op_in.total, 0) - coalesce(op_out.total, 0)
      - coalesce(op_xfer_out.total, 0) + coalesce(op_xfer_in.total, 0) as opening_balance,
    coalesce(per_pay.total, 0) + coalesce(per_in.total, 0) + coalesce(per_xfer_in.total, 0) as period_in,
    coalesce(per_out.total, 0) + coalesce(per_xfer_out.total, 0) as period_out,
    coalesce(op_pay.total, 0) + coalesce(op_in.total, 0) - coalesce(op_out.total, 0)
      - coalesce(op_xfer_out.total, 0) + coalesce(op_xfer_in.total, 0)
      + coalesce(per_pay.total, 0) + coalesce(per_in.total, 0) + coalesce(per_xfer_in.total, 0)
      - coalesce(per_out.total, 0) - coalesce(per_xfer_out.total, 0) as closing_balance
  from accounts a
  left join (select account_id, sum(amount) total from payments
             where deleted_at is null and paid_at < p_from group by account_id) op_pay
    on op_pay.account_id = a.id
  left join (select account_id, sum(amount) total from transactions
             where deleted_at is null and type in ('invest','other_income') and date < p_from
             group by account_id) op_in
    on op_in.account_id = a.id
  left join (select account_id, sum(amount) total from transactions
             where deleted_at is null and type in ('ads','team','salary','staff_expense','personal') and date < p_from
             group by account_id) op_out
    on op_out.account_id = a.id
  left join (select account_id, sum(amount) total from transactions
             where deleted_at is null and type = 'transfer' and date < p_from group by account_id) op_xfer_out
    on op_xfer_out.account_id = a.id
  left join (select account_to_id as account_id, sum(amount) total from transactions
             where deleted_at is null and type = 'transfer' and date < p_from group by account_to_id) op_xfer_in
    on op_xfer_in.account_id = a.id
  left join (select account_id, sum(amount) total from payments
             where deleted_at is null and paid_at between p_from and p_to group by account_id) per_pay
    on per_pay.account_id = a.id
  left join (select account_id, sum(amount) total from transactions
             where deleted_at is null and type in ('invest','other_income') and date between p_from and p_to
             group by account_id) per_in
    on per_in.account_id = a.id
  left join (select account_id, sum(amount) total from transactions
             where deleted_at is null and type in ('ads','team','salary','staff_expense','personal') and date between p_from and p_to
             group by account_id) per_out
    on per_out.account_id = a.id
  left join (select account_id, sum(amount) total from transactions
             where deleted_at is null and type = 'transfer' and date between p_from and p_to group by account_id) per_xfer_out
    on per_xfer_out.account_id = a.id
  left join (select account_to_id as account_id, sum(amount) total from transactions
             where deleted_at is null and type = 'transfer' and date between p_from and p_to group by account_to_id) per_xfer_in
    on per_xfer_in.account_id = a.id
  where a.deleted_at is null;
$$;
