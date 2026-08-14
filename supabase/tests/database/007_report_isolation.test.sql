begin;
select plan(5);

-- fixture: two distinct auth users
insert into auth.users (id, email) values
  ('70000000-0000-0000-0000-000000000001', 'report-user-a@example.com'),
  ('70000000-0000-0000-0000-000000000002', 'report-user-b@example.com');

-- act as user A: create an account, an `invest` transaction on it (feeds
-- account_turnover_report's period_in) and an `other_income` transaction
-- (feeds pnl_report's revenue), both dated within a known period.
set local role authenticated;
set local request.jwt.claims to '{"sub":"70000000-0000-0000-0000-000000000001","role":"authenticated"}';

insert into accounts (id, user_id, name, kind) values
  ('70000000-0000-0000-0000-000000000010', '70000000-0000-0000-0000-000000000001', 'A Cash', 'cash');

insert into transactions (user_id, type, amount, account_id, date)
values (
  '70000000-0000-0000-0000-000000000001', 'invest', 2500,
  '70000000-0000-0000-0000-000000000010', '2026-03-10'
);

insert into transactions (user_id, type, amount, account_id, date)
values (
  '70000000-0000-0000-0000-000000000001', 'other_income', 1500,
  '70000000-0000-0000-0000-000000000010', '2026-03-15'
);

-- switch to impersonate user B *without* resetting role in between --
-- stay in role `authenticated` and just swap the JWT claims to user B,
-- then query immediately, in the same session.
set local request.jwt.claims to '{"sub":"70000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select revenue from pnl_report('2026-03-01', '2026-03-31')),
  0::numeric,
  'user B sees zero revenue from pnl_report for user A''s period (other_income not visible)'
);

-- Assert on user A's specific account_id, not merely a row-count of zero --
-- this proves RLS is actually filtering accounts.* out of the join inside
-- account_turnover_report, rather than the count just happening to be zero
-- because user B has no accounts of her own.
select is(
  (select count(*) from account_turnover_report('2026-03-01', '2026-03-31')
   where account_id = '70000000-0000-0000-0000-000000000010')::int,
  0,
  'user B cannot see user A''s specific account_id via account_turnover_report'
);

select is(
  (select count(*) from account_turnover_report('2026-03-01', '2026-03-31'))::int,
  0,
  'user B sees no rows at all from account_turnover_report (no accounts visible under RLS)'
);

-- switch back to impersonate user A (still no reset role) to prove the
-- negative results above aren't just an artifact of a broken query --
-- the same query pattern must succeed for the rightful owner.
set local request.jwt.claims to '{"sub":"70000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select revenue from pnl_report('2026-03-01', '2026-03-31')),
  1500::numeric,
  'user A sees their own other_income amount as revenue via pnl_report'
);

-- period_in aggregates both `invest` and `other_income` transaction types
-- (per migration 0007's per_in subquery), so it reflects the invest (2500)
-- plus the other_income (1500) fixture rows together.
select is(
  (select period_in from account_turnover_report('2026-03-01', '2026-03-31')
   where account_id = '70000000-0000-0000-0000-000000000010'),
  4000::numeric,
  'user A sees their own invest + other_income total as period_in via account_turnover_report'
);

select * from finish();
rollback;
