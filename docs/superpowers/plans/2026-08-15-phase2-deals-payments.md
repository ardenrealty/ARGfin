# Этап 2 — Сделки и платежи: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deals (`deals`) and payments (`payments`) get full CRUD, revenue recognition (`recognized_at`) is computed automatically by database triggers per the spec's rules, cancellation stops future collection without reversing recognized revenue, and every deal shows a live paid/remaining indicator — all backed by pgTAP tests proving the four recognition/cancellation scenarios from spec §8 items 3, 4, 5, 10.

**Architecture:** `deals` and `payments` tables already exist (Phase 1's `0001_init_schema.sql`) but have no CRUD UI and no recognition logic yet. This phase adds two Postgres trigger functions (`recognized_at` computed at write-time per spec §5 — this is the one column that's an input, not a read-time aggregate) and one read-time view (`deal_payment_summary`, following the same `security_invoker` / no-stored-balance pattern as Phase 1's `account_balances`). UI follows the exact server-actions + form + list-page pattern established in Phase 1's CRUD tasks, extended with a per-deal detail page for the nested payments list.

**Tech Stack:** Same as Phase 1 — Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres + Auth), pgTAP, Vitest.

## Global Constraints

(Carried over from the design spec — apply to every task in this plan exactly as they applied in Phase 1.)

- RLS must be enabled on every table; `deals` and `payments` already have it from Phase 1 migration `0002_rls_policies.sql` — no new RLS work needed here, but any new view must use `security_invoker = true`.
- Only the `anon` key is ever sent to the browser. `service_role` stays server-side only (not used anywhere in this app's own code, only in this session's sandbox tooling).
- No physical deletes anywhere — soft delete via `deleted_at`, every read filters `deleted_at is null`.
- No stored/cached aggregates — `deal_payment_summary` is a view computed on read, exactly like `account_balances`.
- All dates are user-editable, default to today, never blocked from past/future — applies to `payments.paid_at`, `deals.booking_date`/`checkin_date`/`checkout_date`. Use the existing `isStaleOrFutureDate` helper (`src/lib/dates.ts`, Phase 1 Task 16) on `paid_at` in the payment form, same as the transactions form does for `date`.
- `amount` columns store positive magnitudes (already enforced by `payments.amount > 0` check constraint from Phase 1).
- `recognized_at` is never manually editable by the user — it is set exclusively by the `payments_set_recognized_at` trigger (Task 1) and re-synced by the `deals_sync_balance_recognized_at` trigger (Task 1) when `checkin_date` changes. No form in this plan exposes a `recognized_at` input field.
- Cancellation rule (spec §5): predoplata (already-made payments) is non-refundable — cancelling a deal never touches existing `payments` rows or their `recognized_at`. Only the deal's own `status` changes, and the `deal_payment_summary` view's `remaining` column drops to 0 for cancelled deals (no further collection expected). Deals are never hard-deleted, and cancellation is a status change, not a delete.

---

## File Structure

```
supabase/
  migrations/
    0004_payment_recognition_triggers.sql   (payments_set_recognized_at, deals_sync_balance_recognized_at)
    0005_deal_payment_summary_view.sql      (deal_payment_summary view)
  tests/
    database/
      004_payment_recognition.test.sql      (spec §8 items 3, 4, 5, 10)

src/
  types/
    database.ts                              (MODIFY — add Deal, Payment, DealPaymentSummary types)
  app/
    (app)/
      layout.tsx                             (MODIFY — add "Сделки" nav link)
      deals/
        page.tsx                             (list + filters)
        actions.ts                           (createDeal, updateDeal, cancelDeal, softDeleteDeal)
        DealForm.tsx                         (create/edit, client-side commission_pct <-> commission_amount sync)
        [id]/
          page.tsx                           (deal card: fields + payments list + paid/remaining + add-payment form)
          actions.ts                         (addPayment, softDeletePayment)
          PaymentForm.tsx                    (add-payment form)
```

---

### Task 1: Database migration — payment recognition triggers

**Files:**
- Create: `supabase/migrations/0004_payment_recognition_triggers.sql`

**Interfaces:**
- Consumes: `deals`, `payments` tables (Phase 1, `0001_init_schema.sql`).
- Produces: `payments.recognized_at` is set automatically on insert/update of a payment; changing `deals.checkin_date` re-syncs `recognized_at` for that deal's `kind = 'balance'` payments.

- [ ] **Step 1: Write the migration file**

`supabase/migrations/0004_payment_recognition_triggers.sql`:

```sql
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
```

- [ ] **Step 2: Apply and verify**

Direct Postgres connections are unavailable in this sandbox (established in Phase 1) — apply and verify via the HTTPS Management API helper:

```bash
source "C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\supabase-credentials.env"
export PROJECT_REF=irjfrlitedlzzbzinewt
"C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\scripts\db-exec" supabase/migrations/0004_payment_recognition_triggers.sql
```

Expected: `[]` (DDL, no rows returned), no error exit code. Then write a small scratch SQL file querying `information_schema.triggers where event_object_table in ('payments','deals')` via the same helper and confirm both triggers appear.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0004_payment_recognition_triggers.sql
git commit -m "feat(db): add payment recognition triggers (recognized_at derivation)"
```

---

### Task 2: pgTAP test — payment recognition and cancellation (spec §8 items 3, 4, 5, 10)

**Files:**
- Create: `supabase/tests/database/004_payment_recognition.test.sql`

**Interfaces:**
- Consumes: triggers from Task 1, `deal_payment_summary` view from Task 3 (write this test after Task 3 lands, or stub the `remaining` assertion against a direct `commission_amount - sum(payments)` calculation if sequencing before Task 3 — this plan sequences Task 3 first specifically so this test can use the real view).
- Produces: proof of spec §8 items 3 (revenue split across two months), 4 (full payment recognized immediately), 5 (cancellation keeps prepay recognized but zeroes remaining), 10 (checkin_date change moves recognition to another month).

- [ ] **Step 1: Write the test**

`supabase/tests/database/004_payment_recognition.test.sql`:

```sql
begin;
select plan(8);

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
```

- [ ] **Step 2: Run it and verify it passes**

Apply the same HTTPS-Management-API verification approach used in Phase 1 (Tasks 5/7): a scratch copy of this file with `set search_path = public, extensions;` prepended, run via `db-exec`, confirming all 8 assertions pass. The committed file stays in the portable form shown above (no schema qualification), matching Phase 1's convention.

```bash
source "C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\supabase-credentials.env"
export PROJECT_REF=irjfrlitedlzzbzinewt
# (build the scratch copy with search_path prepended, run via db-exec — see Phase 1 Task 5/7 reports for the exact technique)
```

Expected: 8/8 pgTAP assertions pass.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/database/004_payment_recognition.test.sql
git commit -m "test(db): assert payment recognition and cancellation rules (spec items 3,4,5,10)"
```

---

### Task 3: Database migration — `deal_payment_summary` view

**Files:**
- Create: `supabase/migrations/0005_deal_payment_summary_view.sql`

**Interfaces:**
- Consumes: `deals`, `payments` (Phase 1).
- Produces: view `deal_payment_summary(deal_id uuid, user_id uuid, commission_amount numeric, status text, total_paid numeric, remaining numeric)`.

- [ ] **Step 1: Write the migration file**

`supabase/migrations/0005_deal_payment_summary_view.sql`:

```sql
create view deal_payment_summary
with (security_invoker = true) as
select
  d.id as deal_id,
  d.user_id,
  d.commission_amount,
  d.status,
  coalesce(p.total_paid, 0) as total_paid,
  case
    when d.status = 'cancelled' then 0
    else greatest(d.commission_amount - coalesce(p.total_paid, 0), 0)
  end as remaining
from deals d
left join (
  select deal_id, sum(amount) as total_paid
  from payments
  where deleted_at is null
  group by deal_id
) p on p.deal_id = d.id
where d.deleted_at is null;
```

`security_invoker = true` for the same reason as `account_balances` in Phase 1: without it, RLS on `deals`/`payments` would be silently bypassed through the view. `remaining` is clamped to zero both for cancelled deals (spec §5: prepayment is non-refundable, no further collection expected) and for any deal that happens to be overpaid (`greatest(..., 0)` — a negative "remaining" would be a confusing UI signal, not a real receivable).

- [ ] **Step 2: Apply and verify**

```bash
source "C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\supabase-credentials.env"
export PROJECT_REF=irjfrlitedlzzbzinewt
"C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\scripts\db-exec" supabase/migrations/0005_deal_payment_summary_view.sql
```

Then insert a tiny fixture deal + payment for the test user via `db-exec`, query `deal_payment_summary` for it, confirm `total_paid`/`remaining` match, clean up.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0005_deal_payment_summary_view.sql
git commit -m "feat(db): add deal_payment_summary view (paid/remaining, no stored state)"
```

---

### Task 4: Extend row types for deals and payments

**Files:**
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces: `Deal`, `Payment`, `DealPaymentSummary` types, consumed by every task below.

- [ ] **Step 1: Add the new types**

Append to `src/types/database.ts` (after the existing `AccountBalance` interface):

```typescript
export type DealStatus = 'booked' | 'prepaid' | 'checked_in' | 'completed' | 'cancelled'
export type DealSource = 'avito' | 'cian' | 'recommend' | 'other'

export interface Deal {
  id: string
  user_id: string
  object_id: string | null
  client_name: string
  client_phone: string | null
  booking_date: string
  checkin_date: string | null
  checkout_date: string | null
  deal_amount: number
  commission_pct: number | null
  commission_amount: number | null
  source: DealSource | null
  closed_by_employee_id: string | null
  status: DealStatus
  note: string | null
}

export type PaymentKind = 'prepay' | 'balance' | 'full'

export interface Payment {
  id: string
  user_id: string
  deal_id: string
  kind: PaymentKind
  amount: number
  paid_at: string
  recognized_at: string | null
  account_id: string
  note: string | null
}

export interface DealPaymentSummary {
  deal_id: string
  user_id: string
  commission_amount: number
  status: DealStatus
  total_paid: number
  remaining: number
}
```

- [ ] **Step 2: Verify it type-checks**

```bash
npx tsc --noEmit
```

Expected: no errors (these are pure additive type declarations).

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add Deal, Payment, DealPaymentSummary types"
```

---

### Task 5: Add "Сделки" nav link

**Files:**
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Produces: a `/deals` link in the nav bar, positioned first (deals are the primary daily workflow, ahead of the directory screens).

- [ ] **Step 1: Edit `NAV_LINKS`**

In `src/app/(app)/layout.tsx`, change:

```typescript
const NAV_LINKS = [
  { href: '/accounts', label: 'Счета' },
  { href: '/objects', label: 'Объекты' },
  { href: '/employees', label: 'Сотрудники' },
  { href: '/categories', label: 'Категории' },
  { href: '/transactions', label: 'Операции' },
]
```

to:

```typescript
const NAV_LINKS = [
  { href: '/deals', label: 'Сделки' },
  { href: '/accounts', label: 'Счета' },
  { href: '/objects', label: 'Объекты' },
  { href: '/employees', label: 'Сотрудники' },
  { href: '/categories', label: 'Категории' },
  { href: '/transactions', label: 'Операции' },
]
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/layout.tsx"
git commit -m "feat: add Сделки nav link"
```

---

### Task 6: Deals — list page with filters

**Files:**
- Create: `src/app/(app)/deals/page.tsx`

**Interfaces:**
- Consumes: `Deal`, `DealPaymentSummary`, `ObjectRecord`, `Employee` types (Task 4, Phase 1 Task 8).
- Produces: a filterable list page. Does NOT yet include the create form — that's Task 7, added to this same page.

- [ ] **Step 1: Write the list page**

`src/app/(app)/deals/page.tsx`:

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Deal, DealPaymentSummary, DealStatus, Employee, ObjectRecord } from '@/types/database'

const STATUS_LABELS: Record<DealStatus, string> = {
  booked: 'Забронирована',
  prepaid: 'Предоплата',
  checked_in: 'Заселение',
  completed: 'Завершена',
  cancelled: 'Отменена',
}

const SOURCE_LABELS: Record<string, string> = {
  avito: 'Avito',
  cian: 'Циан',
  recommend: 'Рекомендация',
  other: 'Другое',
}

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string
    to?: string
    object_id?: string
    status?: string
    source?: string
    employee_id?: string
  }>
}) {
  const filters = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('deals')
    .select('*')
    .is('deleted_at', null)
    .order('booking_date', { ascending: false })

  if (filters.from) query = query.gte('booking_date', filters.from)
  if (filters.to) query = query.lte('booking_date', filters.to)
  if (filters.object_id) query = query.eq('object_id', filters.object_id)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.source) query = query.eq('source', filters.source)
  if (filters.employee_id) query = query.eq('closed_by_employee_id', filters.employee_id)

  const [{ data: deals }, { data: summaries }, { data: objects }, { data: employees }] = await Promise.all([
    query as unknown as Promise<{ data: Deal[] }>,
    supabase.from('deal_payment_summary').select('*') as unknown as Promise<{ data: DealPaymentSummary[] }>,
    supabase.from('objects').select('*').is('deleted_at', null).order('title') as unknown as Promise<{ data: ObjectRecord[] }>,
    supabase.from('employees').select('*').is('deleted_at', null).order('name') as unknown as Promise<{ data: Employee[] }>,
  ])

  const summaryByDeal = new Map((summaries ?? []).map((s) => [s.deal_id, s]))
  const objectTitle = new Map((objects ?? []).map((o) => [o.id, o.title]))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Сделки</h1>
        <Link href="/deals?new=1" className="rounded bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700">
          Добавить сделку
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded border bg-white p-4 text-sm">
        <label className="flex flex-col">
          С даты
          <input type="date" name="from" defaultValue={filters.from} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          По дату
          <input type="date" name="to" defaultValue={filters.to} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          Объект
          <select name="object_id" defaultValue={filters.object_id ?? ''} className="rounded border px-2 py-1">
            <option value="">Все</option>
            {(objects ?? []).map((o) => (
              <option key={o.id} value={o.id}>{o.title}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          Статус
          <select name="status" defaultValue={filters.status ?? ''} className="rounded border px-2 py-1">
            <option value="">Все</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          Источник
          <select name="source" defaultValue={filters.source ?? ''} className="rounded border px-2 py-1">
            <option value="">Все</option>
            {Object.entries(SOURCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          Сотрудник
          <select name="employee_id" defaultValue={filters.employee_id ?? ''} className="rounded border px-2 py-1">
            <option value="">Все</option>
            {(employees ?? []).map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded border px-3 py-1 hover:bg-gray-50">
          Применить
        </button>
      </form>

      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Клиент</th>
            <th className="p-2">Объект</th>
            <th className="p-2">Бронь</th>
            <th className="p-2">Заселение</th>
            <th className="p-2">Комиссия</th>
            <th className="p-2">Оплачено / осталось</th>
            <th className="p-2">Статус</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {(deals ?? []).map((d) => {
            const summary = summaryByDeal.get(d.id)
            return (
              <tr key={d.id} className="border-b">
                <td className="p-2">{d.client_name}</td>
                <td className="p-2">{d.object_id ? objectTitle.get(d.object_id) : '—'}</td>
                <td className="p-2">{d.booking_date}</td>
                <td className="p-2">{d.checkin_date ?? '—'}</td>
                <td className="p-2">{d.commission_amount?.toLocaleString('ru-RU') ?? '—'}</td>
                <td className="p-2">
                  {(summary?.total_paid ?? 0).toLocaleString('ru-RU')} / {(summary?.remaining ?? 0).toLocaleString('ru-RU')}
                </td>
                <td className="p-2">{STATUS_LABELS[d.status]}</td>
                <td className="p-2">
                  <Link href={`/deals/${d.id}`} className="text-xs text-blue-600 hover:underline">
                    Открыть
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Manual verification (auth-gated redirect only — full data verification happens after Task 7 adds the create form)**

```bash
npm run dev &
```

`curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/deals` — expect `307` to `/login` (unauthenticated). Stop dev server.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/deals/page.tsx"
git commit -m "feat: add deals list page with filters"
```

---

### Task 7: Deals — create/edit form and actions

**Files:**
- Create: `src/app/(app)/deals/actions.ts`, `src/app/(app)/deals/DealForm.tsx`
- Modify: `src/app/(app)/deals/page.tsx` (render the form)

**Interfaces:**
- Produces: `createDeal`, `updateDeal`, `cancelDeal`, `softDeleteDeal` server actions.
- Consumes: `Deal`, `ObjectRecord`, `Employee` types.

- [ ] **Step 1: Write server actions**

`src/app/(app)/deals/actions.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { DealSource, DealStatus } from '@/types/database'

function dealFieldsFromForm(formData: FormData) {
  return {
    object_id: formData.get('object_id') ? String(formData.get('object_id')) : null,
    client_name: String(formData.get('client_name')),
    client_phone: String(formData.get('client_phone') || '') || null,
    booking_date: String(formData.get('booking_date')),
    checkin_date: String(formData.get('checkin_date') || '') || null,
    checkout_date: String(formData.get('checkout_date') || '') || null,
    deal_amount: Number(formData.get('deal_amount')),
    commission_pct: formData.get('commission_pct') ? Number(formData.get('commission_pct')) : null,
    commission_amount: formData.get('commission_amount') ? Number(formData.get('commission_amount')) : null,
    source: (String(formData.get('source') || '') || null) as DealSource | null,
    closed_by_employee_id: formData.get('closed_by_employee_id') ? String(formData.get('closed_by_employee_id')) : null,
    note: String(formData.get('note') || '') || null,
  }
}

export async function createDeal(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.from('deals').insert({
    user_id: user.id,
    ...dealFieldsFromForm(formData),
    status: 'booked',
  })
  if (error) throw new Error(error.message)
  revalidatePath('/deals')
}

export async function updateDeal(id: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('deals')
    .update({
      ...dealFieldsFromForm(formData),
      status: String(formData.get('status')) as DealStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/deals')
  revalidatePath(`/deals/${id}`)
}

export async function cancelDeal(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('deals')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/deals')
  revalidatePath(`/deals/${id}`)
}

export async function softDeleteDeal(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('deals')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/deals')
}
```

- [ ] **Step 2: Write the form component**

`src/app/(app)/deals/DealForm.tsx`:

```tsx
'use client'

import { useRef, useState } from 'react'
import type { Deal, DealStatus, Employee, ObjectRecord } from '@/types/database'
import { createDeal, updateDeal } from './actions'

const STATUS_OPTIONS: { value: DealStatus; label: string }[] = [
  { value: 'booked', label: 'Забронирована' },
  { value: 'prepaid', label: 'Предоплата' },
  { value: 'checked_in', label: 'Заселение' },
  { value: 'completed', label: 'Завершена' },
  { value: 'cancelled', label: 'Отменена' },
]

export function DealForm({
  deal,
  objects,
  employees,
}: {
  deal?: Deal
  objects: ObjectRecord[]
  employees: Employee[]
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [dealAmount, setDealAmount] = useState(deal?.deal_amount ?? 0)
  const [commissionPct, setCommissionPct] = useState(deal?.commission_pct ?? 0)
  const [commissionAmount, setCommissionAmount] = useState(deal?.commission_amount ?? 0)

  function onPctChange(pct: number) {
    setCommissionPct(pct)
    setCommissionAmount(Math.round(dealAmount * (pct / 100) * 100) / 100)
  }

  function onAmountChange(amount: number) {
    setCommissionAmount(amount)
    setCommissionPct(dealAmount > 0 ? Math.round((amount / dealAmount) * 100 * 100) / 100 : 0)
  }

  function onDealAmountChange(amount: number) {
    setDealAmount(amount)
    setCommissionAmount(Math.round(amount * (commissionPct / 100) * 100) / 100)
  }

  async function action(formData: FormData) {
    if (deal) {
      await updateDeal(deal.id, formData)
    } else {
      await createDeal(formData)
      formRef.current?.reset()
      setDealAmount(0)
      setCommissionPct(0)
      setCommissionAmount(0)
    }
  }

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3 rounded border bg-white p-4 text-sm">
      <label className="flex flex-col">
        Клиент
        <input name="client_name" defaultValue={deal?.client_name} required className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col">
        Телефон
        <input name="client_phone" defaultValue={deal?.client_phone ?? ''} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col">
        Объект
        <select name="object_id" defaultValue={deal?.object_id ?? ''} className="rounded border px-2 py-1">
          <option value="">—</option>
          {objects.map((o) => (
            <option key={o.id} value={o.id}>{o.title}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col">
        Дата брони
        <input type="date" name="booking_date" defaultValue={deal?.booking_date ?? new Date().toISOString().slice(0, 10)} required className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col">
        Заселение
        <input type="date" name="checkin_date" defaultValue={deal?.checkin_date ?? ''} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col">
        Выселение
        <input type="date" name="checkout_date" defaultValue={deal?.checkout_date ?? ''} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col">
        Сумма сделки
        <input
          name="deal_amount"
          type="number"
          step="0.01"
          value={dealAmount}
          onChange={(e) => onDealAmountChange(Number(e.target.value))}
          required
          className="w-28 rounded border px-2 py-1"
        />
      </label>
      <label className="flex flex-col">
        Комиссия, %
        <input
          name="commission_pct"
          type="number"
          step="0.01"
          value={commissionPct}
          onChange={(e) => onPctChange(Number(e.target.value))}
          className="w-24 rounded border px-2 py-1"
        />
      </label>
      <label className="flex flex-col">
        Комиссия, сумма
        <input
          name="commission_amount"
          type="number"
          step="0.01"
          value={commissionAmount}
          onChange={(e) => onAmountChange(Number(e.target.value))}
          className="w-28 rounded border px-2 py-1"
        />
      </label>
      <label className="flex flex-col">
        Источник
        <select name="source" defaultValue={deal?.source ?? ''} className="rounded border px-2 py-1">
          <option value="">—</option>
          <option value="avito">Avito</option>
          <option value="cian">Циан</option>
          <option value="recommend">Рекомендация</option>
          <option value="other">Другое</option>
        </select>
      </label>
      <label className="flex flex-col">
        Сотрудник
        <select name="closed_by_employee_id" defaultValue={deal?.closed_by_employee_id ?? ''} className="rounded border px-2 py-1">
          <option value="">—</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </label>
      {deal && (
        <label className="flex flex-col">
          Статус
          <select name="status" defaultValue={deal.status} className="rounded border px-2 py-1">
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col">
        Комментарий
        <input name="note" defaultValue={deal?.note ?? ''} className="rounded border px-2 py-1" />
      </label>
      <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-white hover:bg-gray-700">
        {deal ? 'Сохранить' : 'Добавить сделку'}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Wire the form into the list page**

Modify `src/app/(app)/deals/page.tsx`: import `DealForm`, and render it conditionally when `?new=1` is present in `searchParams` (mirroring the "Добавить сделку" link added in Task 6):

Add to the `searchParams` type: `new?: string`. After destructuring `filters`, add:

```tsx
const showCreateForm = filters.new === '1'
```

Replace the `<Link href="/deals?new=1" ...>Добавить сделку</Link>` button: if `showCreateForm` is true, hide the button and instead render `<DealForm objects={objects ?? []} employees={employees ?? []} />` above the filter form, with a "Отмена" link back to `/deals` next to it.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
```

Then manually verify via `authed-curl`: `/deals?new=1` renders the create form with all fields; submitting via a direct `db-exec` insert (simulating the form) followed by an `authed-curl` on `/deals` confirms the row appears with correct paid/remaining (0 / commission_amount, since no payments exist yet).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/deals"
git commit -m "feat: add deal create/edit form with commission_pct/amount sync"
```

---

### Task 8: Deal detail page — card, payments list, paid/remaining

**Files:**
- Create: `src/app/(app)/deals/[id]/page.tsx`

**Interfaces:**
- Consumes: `Deal`, `Payment`, `DealPaymentSummary`, `Account` types; `cancelDeal`, `softDeleteDeal` actions (Task 7); `DealForm` (Task 7, reused in edit mode).
- Produces: the deal card screen linked from the list page's "Открыть".

- [ ] **Step 1: Write the detail page**

`src/app/(app)/deals/[id]/page.tsx`:

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Account, Deal, DealPaymentSummary, Employee, ObjectRecord, Payment } from '@/types/database'
import { DealForm } from '../DealForm'
import { cancelDeal, softDeleteDeal } from '../actions'
import { PaymentForm } from './PaymentForm'
import { softDeletePayment } from './actions'

const KIND_LABELS: Record<string, string> = {
  prepay: 'Предоплата',
  balance: 'Доплата',
  full: 'Полная оплата',
}

export default async function DealDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ edit?: string }>
}) {
  const { id } = await params
  const { edit } = await searchParams
  const supabase = await createClient()

  const [{ data: deal }, { data: summary }, { data: payments }, { data: accounts }, { data: objects }, { data: employees }] =
    await Promise.all([
      supabase.from('deals').select('*').eq('id', id).is('deleted_at', null).maybeSingle() as unknown as Promise<{ data: Deal | null }>,
      supabase.from('deal_payment_summary').select('*').eq('deal_id', id).maybeSingle() as unknown as Promise<{ data: DealPaymentSummary | null }>,
      supabase.from('payments').select('*').eq('deal_id', id).is('deleted_at', null).order('paid_at') as unknown as Promise<{ data: Payment[] }>,
      supabase.from('accounts').select('*').is('deleted_at', null).order('name') as unknown as Promise<{ data: Account[] }>,
      supabase.from('objects').select('*').is('deleted_at', null).order('title') as unknown as Promise<{ data: ObjectRecord[] }>,
      supabase.from('employees').select('*').is('deleted_at', null).order('name') as unknown as Promise<{ data: Employee[] }>,
    ])

  if (!deal) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{deal.client_name}</h1>
        <Link href="/deals" className="text-sm text-gray-500 hover:underline">
          ← К списку сделок
        </Link>
      </div>

      {edit === '1' ? (
        <DealForm deal={deal} objects={objects ?? []} employees={employees ?? []} />
      ) : (
        <div className="flex flex-wrap items-center gap-4 rounded border bg-white p-4 text-sm">
          <span>Комиссия: {deal.commission_amount?.toLocaleString('ru-RU')}</span>
          <span>Оплачено: {(summary?.total_paid ?? 0).toLocaleString('ru-RU')}</span>
          <span>Осталось: {(summary?.remaining ?? 0).toLocaleString('ru-RU')}</span>
          <span>Статус: {deal.status}</span>
          <Link href={`/deals/${deal.id}?edit=1`} className="text-xs text-blue-600 hover:underline">
            Редактировать
          </Link>
          {deal.status !== 'cancelled' && (
            <form action={cancelDeal.bind(null, deal.id)}>
              <button type="submit" className="text-xs text-amber-600 hover:underline">
                Отменить сделку
              </button>
            </form>
          )}
          <form action={softDeleteDeal.bind(null, deal.id)}>
            <button type="submit" className="text-xs text-red-600 hover:underline">
              Удалить
            </button>
          </form>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Платежи</h2>
        <PaymentForm dealId={deal.id} accounts={accounts ?? []} />
        <table className="w-full border-collapse rounded border bg-white text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="p-2">Тип</th>
              <th className="p-2">Сумма</th>
              <th className="p-2">Дата оплаты</th>
              <th className="p-2">Признано</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {(payments ?? []).map((p) => (
              <tr key={p.id} className="border-b">
                <td className="p-2">{KIND_LABELS[p.kind]}</td>
                <td className="p-2">{p.amount.toLocaleString('ru-RU')}</td>
                <td className="p-2">{p.paid_at}</td>
                <td className="p-2">{p.recognized_at ?? '—'}</td>
                <td className="p-2">
                  <form action={softDeletePayment.bind(null, p.id)}>
                    <button type="submit" className="text-xs text-red-600 hover:underline">
                      Удалить
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

Full data verification happens in Task 9 once `PaymentForm`/`actions.ts` for payments exist (this page imports them) — this task's `tsc` check will fail until Task 9 lands, same disclosed cross-task-dependency pattern as Phase 1 Task 15/16. Note this in the report; do not stub the missing files.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/deals/[id]/page.tsx"
git commit -m "feat: add deal detail page with payments list and paid/remaining"
```

---

### Task 9: Payments — add-payment form and actions

**Files:**
- Create: `src/app/(app)/deals/[id]/actions.ts`, `src/app/(app)/deals/[id]/PaymentForm.tsx`

**Interfaces:**
- Produces: `addPayment`, `softDeletePayment` server actions; the form component imported by Task 8's detail page.
- Consumes: `Account` type, `isStaleOrFutureDate` helper (Phase 1 Task 16).

- [ ] **Step 1: Write server actions**

`src/app/(app)/deals/[id]/actions.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { PaymentKind } from '@/types/database'

export async function addPayment(dealId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.from('payments').insert({
    user_id: user.id,
    deal_id: dealId,
    kind: String(formData.get('kind')) as PaymentKind,
    amount: Number(formData.get('amount')),
    paid_at: String(formData.get('paid_at')),
    account_id: String(formData.get('account_id')),
    note: String(formData.get('note') || '') || null,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/deals/${dealId}`)
  revalidatePath('/deals')
}

export async function softDeletePayment(id: string) {
  const supabase = await createClient()
  const { data: payment } = await supabase.from('payments').select('deal_id').eq('id', id).single()
  const { error } = await supabase
    .from('payments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  if (payment) revalidatePath(`/deals/${payment.deal_id}`)
  revalidatePath('/deals')
}
```

- [ ] **Step 2: Write the form component**

`src/app/(app)/deals/[id]/PaymentForm.tsx`:

```tsx
'use client'

import { useRef, useState } from 'react'
import type { Account } from '@/types/database'
import { isStaleOrFutureDate } from '@/lib/dates'
import { addPayment } from './actions'

export function PaymentForm({ dealId, accounts }: { dealId: string; accounts: Account[] }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10))
  const dateWarning = isStaleOrFutureDate(paidAt)

  async function action(formData: FormData) {
    await addPayment(dealId, formData)
    formRef.current?.reset()
    setPaidAt(new Date().toISOString().slice(0, 10))
  }

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3 rounded border bg-white p-4 text-sm">
      <label className="flex flex-col">
        Тип
        <select name="kind" defaultValue="prepay" className="rounded border px-2 py-1">
          <option value="prepay">Предоплата</option>
          <option value="balance">Доплата</option>
          <option value="full">Полная оплата</option>
        </select>
      </label>
      <label className="flex flex-col">
        Сумма
        <input name="amount" type="number" step="0.01" min="0.01" required className="w-28 rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col">
        Дата оплаты
        <input
          name="paid_at"
          type="date"
          value={paidAt}
          onChange={(e) => setPaidAt(e.target.value)}
          className="rounded border px-2 py-1"
        />
        {dateWarning && <span className="text-xs text-amber-600">{dateWarning}</span>}
      </label>
      <label className="flex flex-col">
        Счёт
        <select name="account_id" required className="rounded border px-2 py-1">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col">
        Комментарий
        <input name="note" className="rounded border px-2 py-1" />
      </label>
      <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-white hover:bg-gray-700">
        Добавить платёж
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Verify — whole-project type-check and live data flow**

```bash
npx tsc --noEmit
```

Expected: clean (Task 8's dependency on these files now resolves).

Live verification via `db-exec` + `authed-curl`: create a fixture deal (or reuse one from Task 6/7's verification), open `/deals/<id>`, add a `prepay` payment through a direct `db-exec` insert simulating the form (or, if time permits, confirm the form's server action path by checking the resulting `recognized_at` was set by the Task 1 trigger — query the payment row and confirm `recognized_at = paid_at` for a `prepay`), confirm it appears in the payments table and the paid/remaining figures update, then soft-delete it and confirm it disappears from the list (the underlying deal row itself is untouched).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/deals/[id]/actions.ts" "src/app/(app)/deals/[id]/PaymentForm.tsx"
git commit -m "feat: add payment creation with recognition trigger integration"
```

---

## Self-Review Notes

**Spec coverage:** §5 recognition rules — Task 1 (triggers) + Task 2 (test). §5 cancellation rule — Task 1 note + Task 3 view + Task 2 test item 5. §4 `deals`/`payments` model — already existed from Phase 1; this plan adds the missing behavior (recognition, cancellation semantics) and UI. §6 "Сделки" screen — Task 6 (list+filters), Task 7 (card fields + add-payment button is the create form + detail page's payment form), Task 8 (indicator оплачено/осталось). §8 test items 3, 4, 5, 10 — Task 2. Items 1, 2, 6 were already covered in Phase 1; items 7, 8, 9 require `ads`/reports (Phase 3) and are out of this phase's scope, consistent with the phased rollout in §7.

**Placeholder scan:** none — every step has literal code or exact commands.

**Type consistency:** `Deal`, `Payment`, `DealPaymentSummary`, `DealStatus`, `DealSource`, `PaymentKind` defined once in Task 4 and imported everywhere else. `DealForm` is defined once (Task 7) and reused in both create mode (Task 7's list page) and edit mode (Task 8's detail page) via the same optional `deal` prop pattern established in Phase 1's CRUD forms. `cancelDeal`/`softDeleteDeal` (Task 7) and `addPayment`/`softDeletePayment` (Task 9) are imported into Task 8's detail page with consistent signatures.

**Known cross-task dependency (disclosed, not a gap):** Task 8's detail page imports `PaymentForm` and `softDeletePayment` from Task 9's files, which don't exist until Task 9 runs — `tsc --noEmit` will fail on Task 8 alone, exactly like Phase 1 Tasks 15→16. This plan sequences Task 8 before Task 9 deliberately (the detail page is the more architecturally significant piece; the payment form is comparatively mechanical) but implementers should not stub around it — same discipline as Phase 1.
