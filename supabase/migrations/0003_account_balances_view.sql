create view account_balances
with (security_invoker = true) as
select
  a.id as account_id,
  a.user_id,
  a.name,
  coalesce(pay.total, 0)
    + coalesce(txn_in.total, 0)
    - coalesce(txn_out.total, 0)
    - coalesce(transfer_out.total, 0)
    + coalesce(transfer_in.total, 0)
  as balance
from accounts a
left join (
  select account_id, sum(amount) as total
  from payments
  where deleted_at is null
  group by account_id
) pay on pay.account_id = a.id
left join (
  select account_id, sum(amount) as total
  from transactions
  where deleted_at is null and type in ('invest','other_income')
  group by account_id
) txn_in on txn_in.account_id = a.id
left join (
  select account_id, sum(amount) as total
  from transactions
  where deleted_at is null and type in ('ads','team','salary','staff_expense','personal')
  group by account_id
) txn_out on txn_out.account_id = a.id
left join (
  select account_id, sum(amount) as total
  from transactions
  where deleted_at is null and type = 'transfer'
  group by account_id
) transfer_out on transfer_out.account_id = a.id
left join (
  select account_to_id as account_id, sum(amount) as total
  from transactions
  where deleted_at is null and type = 'transfer'
  group by account_to_id
) transfer_in on transfer_in.account_id = a.id
where a.deleted_at is null;
