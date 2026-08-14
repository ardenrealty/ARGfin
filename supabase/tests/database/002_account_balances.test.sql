begin;
select plan(4);

-- fixture: one auth user, two accounts
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'owner@example.com');

insert into accounts (id, user_id, name, kind) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Cash', 'cash'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Bank', 'bank');

-- act as that user for RLS-aware selects
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

reset role;

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

select * from finish();
rollback;
