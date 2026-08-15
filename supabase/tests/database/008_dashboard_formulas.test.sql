begin;
select plan(3);

insert into auth.users (id, email) values
  ('50000000-0000-0000-0000-000000000001', 'dashboard-owner@example.com');

-- expected_receivables: a 'completed' deal with an unpaid remainder must
-- NOT count, only booked/prepaid/checked_in deals should.
insert into deals (id, user_id, client_name, booking_date, checkin_date, deal_amount, commission_amount, status)
values (
  '50000000-0000-0000-0000-000000000100', '50000000-0000-0000-0000-000000000001',
  'Completed Client', '2026-01-01', '2026-01-10', 100000, 10000, 'completed'
);
insert into deals (id, user_id, client_name, booking_date, checkin_date, deal_amount, commission_amount, status)
values (
  '50000000-0000-0000-0000-000000000101', '50000000-0000-0000-0000-000000000001',
  'Prepaid Client', '2026-01-01', '2026-01-15', 50000, 5000, 'prepaid'
);

select is(
  (select expected_receivables from dashboard_summary()),
  5000::numeric,
  'expected_receivables counts the prepaid deal''s full unpaid commission but excludes the completed deal''s unpaid commission entirely'
);

-- upcoming_checkins: a cancelled deal with a future checkin_date must not
-- appear even though its date qualifies.
insert into deals (id, user_id, client_name, booking_date, checkin_date, deal_amount, commission_amount, status)
values (
  '50000000-0000-0000-0000-000000000102', '50000000-0000-0000-0000-000000000001',
  'Cancelled Client', '2026-01-01', current_date + 7, 20000, 2000, 'cancelled'
);
insert into deals (id, user_id, client_name, booking_date, checkin_date, deal_amount, commission_amount, status)
values (
  '50000000-0000-0000-0000-000000000103', '50000000-0000-0000-0000-000000000001',
  'Upcoming Client', '2026-01-01', current_date + 3, 30000, 3000, 'booked'
);

select is(
  (select count(*)::int from upcoming_checkins(10)
   where deal_id = '50000000-0000-0000-0000-000000000102'),
  0,
  'upcoming_checkins excludes a cancelled deal even with a future checkin_date'
);
select is(
  (select count(*)::int from upcoming_checkins(10)
   where deal_id = '50000000-0000-0000-0000-000000000103'),
  1,
  'upcoming_checkins includes a booked deal with a future checkin_date'
);

select * from finish();
rollback;
