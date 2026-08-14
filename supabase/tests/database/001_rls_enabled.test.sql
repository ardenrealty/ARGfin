begin;
select plan(8);

select ok(
  (select relrowsecurity from pg_class where relname = 'accounts' and relnamespace = 'public'::regnamespace),
  'accounts has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'objects' and relnamespace = 'public'::regnamespace),
  'objects has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'employees' and relnamespace = 'public'::regnamespace),
  'employees has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'categories' and relnamespace = 'public'::regnamespace),
  'categories has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'deals' and relnamespace = 'public'::regnamespace),
  'deals has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'payments' and relnamespace = 'public'::regnamespace),
  'payments has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'transactions' and relnamespace = 'public'::regnamespace),
  'transactions has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'audit_log' and relnamespace = 'public'::regnamespace),
  'audit_log has RLS enabled'
);

select * from finish();
rollback;
