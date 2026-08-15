-- Generic audit trigger (spec §3: "Журнал изменений: что изменено, когда,
-- старое и новое значение"). old_data/new_data store the full row as JSONB,
-- so any changed column — including a backdated date field — is captured
-- with both its old and new value (spec §5: "Правка задним числом пишется
-- в audit_log с обоими значениями дат") without any column-specific logic.
-- Runs as the invoking user (no SECURITY DEFINER), so its own insert into
-- audit_log is subject to the normal user_id = auth.uid() RLS policy.
create or replace function log_audit_event()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    insert into audit_log (user_id, table_name, record_id, action, old_data, new_data)
    values (new.user_id, tg_table_name, new.id, 'insert', null, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into audit_log (user_id, table_name, record_id, action, old_data, new_data)
    values (new.user_id, tg_table_name, new.id, 'update', to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into audit_log (user_id, table_name, record_id, action, old_data, new_data)
    values (old.user_id, tg_table_name, old.id, 'delete', to_jsonb(old), null);
    return old;
  end if;
  return null;
end;
$$ language plpgsql;

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'objects', 'employees', 'categories',
    'deals', 'payments', 'transactions'
  ]
  loop
    execute format(
      'create trigger %I after insert or update or delete on %I for each row execute function log_audit_event()',
      t || '_audit', t
    );
  end loop;
end $$;
