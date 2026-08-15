begin;
select plan(7);

insert into auth.users (id, email) values
  ('70000000-0000-0000-0000-000000000010', 'retro-owner@example.com');

insert into accounts (id, user_id, name, kind) values
  ('70000000-0000-0000-0000-000000000020', '70000000-0000-0000-0000-000000000010', 'Cash', 'cash');

-- an 'invest' transaction dated in a past month
insert into transactions (id, user_id, type, amount, account_id, date)
values (
  '70000000-0000-0000-0000-000000000030', '70000000-0000-0000-0000-000000000010',
  'invest', 1000, '70000000-0000-0000-0000-000000000020', '2026-02-10'
);

select is(
  (select balance from account_balances where account_id = '70000000-0000-0000-0000-000000000020'),
  1000::numeric,
  'before edit: account balance reflects the original 1000 invest amount'
);
select is(
  (select revenue + ads_expense + salary_expense + team_expense + staff_expense
   from pnl_report('2026-02-01', '2026-02-28')),
  0::numeric,
  'sanity: an invest transaction contributes nothing to February''s P&L revenue/expense lines (it is capital, not revenue)'
);

-- edit the old transaction's amount — no new row, an UPDATE on the existing one
update transactions set amount = 4000 where id = '70000000-0000-0000-0000-000000000030';

select is(
  (select balance from account_balances where account_id = '70000000-0000-0000-0000-000000000020'),
  4000::numeric,
  'item 9: after editing the amount, the account balance immediately reflects 4000, computed live — no manual recalculation, no stale cache'
);

-- a transaction dated in a different, unrelated month (March) must be
-- completely unaffected by the February edit above.
insert into transactions (id, user_id, type, amount, account_id, date)
values (
  '70000000-0000-0000-0000-000000000031', '70000000-0000-0000-0000-000000000010',
  'invest', 500, '70000000-0000-0000-0000-000000000020', '2026-03-05'
);

select is(
  (select balance from account_balances where account_id = '70000000-0000-0000-0000-000000000020'),
  4500::numeric,
  'item 9: the balance after the March transaction is 4000 (edited February amount) + 500 (March), proving the February edit is durable and the two periods combine correctly, not just today''s figure'
);

-- an 'ads' transaction dated in the same February period, to prove the
-- "profit" half of item 9 (not just the balance half): pnl_report's
-- ads_expense line must also recalculate live on an edit to a historical row.
-- (Placed after the balance assertions above so its own effect on
-- account_balances — 'ads' also withdraws from the account — doesn't
-- disturb the balance figures already asserted.)
insert into transactions (id, user_id, type, amount, account_id, date)
values (
  '70000000-0000-0000-0000-000000000032', '70000000-0000-0000-0000-000000000010',
  'ads', 1000, '70000000-0000-0000-0000-000000000020', '2026-02-20'
);

select is(
  (select ads_expense from pnl_report('2026-02-01', '2026-02-28')),
  1000::numeric,
  'before edit: February''s ads_expense reflects the original 1000 ads amount'
);

-- edit the old ads transaction's amount — same pattern as the invest edit
-- above, to prove the profit half of item 9.
update transactions set amount = 4000 where id = '70000000-0000-0000-0000-000000000032';

select is(
  (select ads_expense from pnl_report('2026-02-01', '2026-02-28')),
  4000::numeric,
  'item 9 (profit half): after editing the amount, February''s ads_expense immediately reflects 4000, computed live for the edited historical transaction'
);

select is(
  (select ads_expense from pnl_report('2026-03-01', '2026-03-31')),
  0::numeric,
  'item 9 (profit half): March''s ads_expense is 0 — the February ads edit does not leak into an unrelated period ("а не за сегодняшний")'
);

select * from finish();
rollback;
