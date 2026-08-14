begin;
select plan(7);

insert into auth.users (id, email) values
  ('20000000-0000-0000-0000-000000000001', 'recog-owner@example.com');

insert into accounts (id, user_id, name, kind) values
  ('20000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000001', 'Cash', 'cash');

-- Deal 1: item 3 + item 10 — prepay in January, checkin (and balance
-- recognition) in February, then checkin_date moves to March.
insert into deals (id, user_id, client_name, booking_date, checkin_date, deal_amount, commission_amount, status)
values (
  '20000000-0000-0000-0000-000000000100', '20000000-0000-0000-0000-000000000001',
  'Client A', '2026-01-05', '2026-02-10', 100000, 10000, 'prepaid'
);

insert into payments (id, user_id, deal_id, kind, amount, paid_at, account_id)
values (
  '20000000-0000-0000-0000-000000000200', '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000100', 'prepay', 3000, '2026-01-05',
  '20000000-0000-0000-0000-000000000010'
);
insert into payments (id, user_id, deal_id, kind, amount, paid_at, account_id)
values (
  '20000000-0000-0000-0000-000000000201', '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000100', 'balance', 7000, '2026-02-10',
  '20000000-0000-0000-0000-000000000010'
);

select is(
  (select date_trunc('month', recognized_at)::date from payments where id = '20000000-0000-0000-0000-000000000200'),
  '2026-01-01'::date,
  'item 3: prepay recognized in January (paid_at month)'
);
select is(
  (select date_trunc('month', recognized_at)::date from payments where id = '20000000-0000-0000-0000-000000000201'),
  '2026-02-01'::date,
  'item 3: balance recognized in February (checkin_date month)'
);

-- item 10: move checkin_date to March, balance payment's recognized_at
-- must follow; the prepay payment must NOT move.
update deals set checkin_date = '2026-03-15' where id = '20000000-0000-0000-0000-000000000100';

select is(
  (select date_trunc('month', recognized_at)::date from payments where id = '20000000-0000-0000-0000-000000000201'),
  '2026-03-01'::date,
  'item 10: changing checkin_date moves balance payment recognition to the new month'
);
select is(
  (select date_trunc('month', recognized_at)::date from payments where id = '20000000-0000-0000-0000-000000000200'),
  '2026-01-01'::date,
  'item 10: prepay payment recognition is unaffected by checkin_date change'
);

-- Deal 2: item 4 — one full payment, recognized immediately at paid_at.
insert into deals (id, user_id, client_name, booking_date, checkin_date, deal_amount, commission_amount, status)
values (
  '20000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000001',
  'Client B', '2026-04-01', '2026-04-01', 50000, 5000, 'completed'
);
insert into payments (id, user_id, deal_id, kind, amount, paid_at, account_id)
values (
  '20000000-0000-0000-0000-000000000202', '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000101', 'full', 5000, '2026-04-01',
  '20000000-0000-0000-0000-000000000010'
);

select is(
  (select recognized_at from payments where id = '20000000-0000-0000-0000-000000000202'),
  '2026-04-01'::date,
  'item 4: full payment recognized at its own paid_at'
);

-- Deal 3: item 5 — prepay made, then deal cancelled. Prepay stays
-- recognized (recognized_at unchanged); remaining collapses to 0 in the
-- paid/remaining view regardless of unpaid commission balance.
insert into deals (id, user_id, client_name, booking_date, checkin_date, deal_amount, commission_amount, status)
values (
  '20000000-0000-0000-0000-000000000102', '20000000-0000-0000-0000-000000000001',
  'Client C', '2026-05-01', '2026-05-20', 80000, 8000, 'prepaid'
);
insert into payments (id, user_id, deal_id, kind, amount, paid_at, account_id)
values (
  '20000000-0000-0000-0000-000000000203', '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000102', 'prepay', 2000, '2026-05-01',
  '20000000-0000-0000-0000-000000000010'
);

update deals set status = 'cancelled' where id = '20000000-0000-0000-0000-000000000102';

select is(
  (select recognized_at from payments where id = '20000000-0000-0000-0000-000000000203'),
  '2026-05-01'::date,
  'item 5: cancellation does not reverse the prepay''s recognized_at'
);
select is(
  (select remaining from deal_payment_summary where deal_id = '20000000-0000-0000-0000-000000000102'),
  0::numeric,
  'item 5: cancellation zeroes the remaining/expected amount even though only 2000 of 8000 was paid'
);

select * from finish();
rollback;
