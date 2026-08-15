begin;
select plan(6);

-- fixture: one auth user, two accounts
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'owner@example.com');

insert into accounts (id, user_id, name, kind) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Cash', 'cash'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Bank', 'bank');

-- act as that user for RLS-aware selects and inserts. This role/JWT scoping
-- must stay active for the rest of the file (no `reset role`) because the
-- pnl_report(...) assertions below have no SECURITY DEFINER and no manual
-- user_id filter — they rely entirely on RLS to scope results. Running them
-- under the table-owner role would aggregate every user's transactions in
-- the whole database instead of just this fixture's rows (same technique as
-- 007_report_isolation.test.sql and 008_dashboard_formulas.test.sql).
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- invest 1000 into Cash
insert into transactions (user_id, type, amount, account_id, date)
values ('00000000-0000-0000-0000-000000000001', 'invest', 1000,
        '10000000-0000-0000-0000-000000000001', current_date);

select is(
  (select balance from account_balances where account_id = '10000000-0000-0000-0000-000000000001'),
  1000::numeric,
  'invest increases account balance'
);

-- personal withdrawal of 200 from Cash
insert into transactions (user_id, type, amount, account_id, date)
values ('00000000-0000-0000-0000-000000000001', 'personal', 200,
        '10000000-0000-0000-0000-000000000001', current_date);

select is(
  (select balance from account_balances where account_id = '10000000-0000-0000-0000-000000000001'),
  800::numeric,
  'personal withdrawal decreases account balance'
);

select is(
  (select profit from pnl_report(current_date, current_date)),
  0::numeric,
  'item 2: a personal withdrawal does not affect profit (personal is not in pnl_report''s revenue/expense whitelist)'
);

-- transfer 300 from Cash to Bank
insert into transactions (user_id, type, amount, account_id, account_to_id, date)
values ('00000000-0000-0000-0000-000000000001', 'transfer', 300,
        '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', current_date);

select is(
  (select balance from account_balances where account_id = '10000000-0000-0000-0000-000000000001'),
  500::numeric,
  'transfer decreases source account balance'
);

select is(
  (select sum(balance) from account_balances
   where account_id in (
     '10000000-0000-0000-0000-000000000001',
     '10000000-0000-0000-0000-000000000002'
   )),
  800::numeric,
  'transfer does not change combined balance across accounts'
);

select is(
  (select profit from pnl_report(current_date, current_date)),
  0::numeric,
  'item 6: a transfer between accounts does not affect profit (transfer is not in pnl_report''s revenue/expense whitelist)'
);

select * from finish();
rollback;
