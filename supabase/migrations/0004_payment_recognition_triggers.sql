-- Sets payments.recognized_at per spec §5:
--   kind = 'full'    -> recognized_at = paid_at
--   kind = 'prepay'  -> recognized_at = paid_at
--   kind = 'balance' -> recognized_at = deals.checkin_date (looked up by deal_id)
-- Runs on every insert, and on update whenever kind, paid_at, or deal_id change —
-- recognized_at is never accepted as user input, it is always derived here.
create or replace function set_payment_recognized_at()
returns trigger as $$
begin
  if new.kind in ('full', 'prepay') then
    new.recognized_at := new.paid_at;
  elsif new.kind = 'balance' then
    select checkin_date into new.recognized_at
    from deals
    where id = new.deal_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger payments_set_recognized_at
before insert or update of kind, paid_at, deal_id on payments
for each row
execute function set_payment_recognized_at();

-- Spec §5: "Изменение checkin_date пересчитывает recognized_at у связанного
-- платежа с kind = 'balance'." Only balance-kind payments move with the
-- checkin date; full/prepay payments are recognized at their own paid_at
-- and are unaffected by later checkin_date edits.
create or replace function sync_balance_payments_recognized_at()
returns trigger as $$
begin
  if new.checkin_date is distinct from old.checkin_date then
    update payments
    set recognized_at = new.checkin_date
    where deal_id = new.id
      and kind = 'balance'
      and deleted_at is null;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger deals_sync_balance_recognized_at
after update of checkin_date on deals
for each row
execute function sync_balance_payments_recognized_at();
