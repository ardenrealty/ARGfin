begin;
select plan(4);

insert into auth.users (id, email) values
  ('40000000-0000-0000-0000-000000000001', 'reports-owner@example.com');

insert into accounts (id, user_id, name, kind) values
  ('40000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000001', 'Cash', 'cash');

insert into objects (id, user_id, title) values
  ('40000000-0000-0000-0000-000000000020', '40000000-0000-0000-0000-000000000001', 'Object A');

-- item 7: is_general ads spend tagged to an object must not count toward
-- that object's margin; non-general ads spend for the same object must.
insert into transactions (id, user_id, type, amount, account_id, object_id, is_general, date)
values (
  '40000000-0000-0000-0000-000000000100', '40000000-0000-0000-0000-000000000001',
  'ads', 500, '40000000-0000-0000-0000-000000000010',
  '40000000-0000-0000-0000-000000000020', true, '2026-06-05'
);
insert into transactions (id, user_id, type, amount, account_id, object_id, is_general, date)
values (
  '40000000-0000-0000-0000-000000000101', '40000000-0000-0000-0000-000000000001',
  'ads', 300, '40000000-0000-0000-0000-000000000010',
  '40000000-0000-0000-0000-000000000020', false, '2026-06-10'
);

select is(
  (select ads_spend from object_margin_report('2026-06-01', '2026-06-30')
   where object_id = '40000000-0000-0000-0000-000000000020'),
  300::numeric,
  'item 7: general ads spend excluded, non-general ads spend included in object margin'
);
select ok(
  (select ads_spend from object_margin_report('2026-06-01', '2026-06-30')
   where object_id = '40000000-0000-0000-0000-000000000020') <> 800::numeric,
  'item 7: the excluded general ads amount (500) is not silently summed in anyway'
);

-- item 8: a transaction dated in a past month appears in that month's P&L,
-- never in an unrelated month's, regardless of when the row was inserted.
insert into transactions (id, user_id, type, amount, account_id, date)
values (
  '40000000-0000-0000-0000-000000000102', '40000000-0000-0000-0000-000000000001',
  'team', 1000, '40000000-0000-0000-0000-000000000010', '2026-01-15'
);

select is(
  (select team_expense from pnl_report('2026-01-01', '2026-01-31')),
  1000::numeric,
  'item 8: backdated transaction appears in its own month''s P&L'
);
select is(
  (select team_expense from pnl_report('2026-02-01', '2026-02-28')),
  0::numeric,
  'item 8: backdated transaction does not leak into an unrelated month''s P&L'
);

select * from finish();
rollback;
