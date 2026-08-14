do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts','objects','employees','categories',
    'deals','payments','transactions','audit_log'
  ]
  loop
    execute format('alter table %I enable row level security', t);

    execute format(
      'create policy %I on %I for select using (user_id = auth.uid())',
      t || '_select_own', t
    );
    execute format(
      'create policy %I on %I for insert with check (user_id = auth.uid())',
      t || '_insert_own', t
    );
    execute format(
      'create policy %I on %I for update using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_update_own', t
    );
    execute format(
      'create policy %I on %I for delete using (user_id = auth.uid())',
      t || '_delete_own', t
    );
  end loop;
end $$;
