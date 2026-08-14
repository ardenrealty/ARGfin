begin;
select plan(4);

-- fixture: two distinct auth users
insert into auth.users (id, email) values
  ('20000000-0000-0000-0000-000000000001', 'rls-user-a@example.com'),
  ('20000000-0000-0000-0000-000000000002', 'rls-user-b@example.com');

-- act as user A to create an account and a balance-affecting transaction
set local role authenticated;
set local request.jwt.claims to '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}';

insert into accounts (id, user_id, name, kind) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'A Cash', 'cash');

insert into transactions (user_id, type, amount, account_id, date)
values ('20000000-0000-0000-0000-000000000001', 'invest', 1000,
        '30000000-0000-0000-0000-000000000001', current_date);

-- switch to impersonate user B *without* resetting role in between --
-- this is the exact bug the old test had: `reset role` before any
-- query meant RLS was never actually exercised. Here we stay in role
-- `authenticated` and just swap the JWT claims to user B, then query
-- immediately, in the same session.
set local request.jwt.claims to '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*) from accounts)::int,
  0,
  'user B cannot see user A''s account row'
);

select is(
  (select count(*) from account_balances)::int,
  0,
  'user B cannot see user A''s balance via account_balances view'
);

-- switch back to impersonate user A (still no reset role) to prove the
-- negative results above aren't just an artifact of a broken query --
-- the same query pattern must succeed for the rightful owner.
set local request.jwt.claims to '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select count(*) from accounts)::int,
  1,
  'user A can see their own account row'
);

select is(
  (select count(*) from account_balances)::int,
  1,
  'user A can see their own balance via account_balances view'
);

select * from finish();
rollback;
