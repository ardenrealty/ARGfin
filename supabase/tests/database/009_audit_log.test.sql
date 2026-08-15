begin;
select plan(5);

insert into auth.users (id, email) values
  ('60000000-0000-0000-0000-000000000001', 'audit-owner@example.com');

-- insert: old_data null, new_data has the inserted values
insert into accounts (id, user_id, name, kind)
values ('60000000-0000-0000-0000-000000000010', '60000000-0000-0000-0000-000000000001', 'Original Name', 'cash');

select is(
  (select action from audit_log where record_id = '60000000-0000-0000-0000-000000000010' and action = 'insert'),
  'insert',
  'insert on accounts creates an insert audit_log row'
);
select ok(
  (select old_data is null from audit_log where record_id = '60000000-0000-0000-0000-000000000010' and action = 'insert'),
  'insert audit row has null old_data'
);
select is(
  (select new_data->>'name' from audit_log where record_id = '60000000-0000-0000-0000-000000000010' and action = 'insert'),
  'Original Name',
  'insert audit row''s new_data captures the inserted name'
);

-- update (soft delete is implemented as an update): old_data and new_data both populated
update accounts set deleted_at = now() where id = '60000000-0000-0000-0000-000000000010';

select is(
  (select old_data->>'deleted_at' from audit_log where record_id = '60000000-0000-0000-0000-000000000010' and action = 'update'),
  null,
  'update audit row''s old_data shows deleted_at was null before the soft delete'
);
select ok(
  (select (new_data->>'deleted_at') is not null from audit_log where record_id = '60000000-0000-0000-0000-000000000010' and action = 'update'),
  'update audit row''s new_data shows deleted_at is now set'
);

select * from finish();
rollback;
