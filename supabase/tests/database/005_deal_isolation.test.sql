begin;
select plan(6);

-- fixture: two distinct auth users
insert into auth.users (id, email) values
  ('40000000-0000-0000-0000-000000000001', 'deal-user-a@example.com'),
  ('40000000-0000-0000-0000-000000000002', 'deal-user-b@example.com');

-- act as user A to create a deal and a payment against it
set local role authenticated;
set local request.jwt.claims to '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}';

insert into accounts (id, user_id, name, kind) values
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'A Cash', 'cash');

insert into deals (id, user_id, client_name, booking_date, deal_amount, commission_amount, status)
values (
  '60000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'Test Client A',
  current_date,
  100000,
  10000,
  'booked'
);

insert into payments (user_id, deal_id, kind, amount, paid_at, account_id)
values (
  '40000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  'prepay',
  4000,
  current_date,
  '50000000-0000-0000-0000-000000000001'
);

-- switch to impersonate user B *without* resetting role in between --
-- stay in role `authenticated` and just swap the JWT claims to user B,
-- then query immediately, in the same session.
set local request.jwt.claims to '{"sub":"40000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*) from deals)::int,
  0,
  'user B cannot see user A''s deal row'
);

select is(
  (select count(*) from deal_payment_summary)::int,
  0,
  'user B cannot see user A''s deal via deal_payment_summary view'
);

-- switch back to impersonate user A (still no reset role) to prove the
-- negative results above aren't just an artifact of a broken query --
-- the same query pattern must succeed for the rightful owner.
set local request.jwt.claims to '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select count(*) from deals)::int,
  1,
  'user A can see their own deal row'
);

select is(
  (select count(*) from deal_payment_summary)::int,
  1,
  'user A can see their own deal via deal_payment_summary view'
);

select is(
  (select total_paid from deal_payment_summary where deal_id = '60000000-0000-0000-0000-000000000001'),
  4000::numeric,
  'deal_payment_summary reports the correct total_paid for user A''s deal'
);

select is(
  (select remaining from deal_payment_summary where deal_id = '60000000-0000-0000-0000-000000000001'),
  6000::numeric,
  'deal_payment_summary reports the correct remaining for user A''s deal'
);

select * from finish();
rollback;
