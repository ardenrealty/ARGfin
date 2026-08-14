# Этап 3 — Отчёты: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five period-parameterized reports (P&L, account balances/turnover, margin by object, employee summary, platform efficiency), each rendered as a page with a date-range picker and a CSV export button, all computed live from Postgres functions — no stored/cached report data anywhere. Backed by pgTAP tests proving spec §8 items 7 (general ads excluded from object margin) and 8 (a transaction's report month is its own `date`/`recognized_at`, never today's date).

**Architecture:** Every report is a Postgres function `report_name(p_from date, p_to date) returns table (...)`, called via `supabase.rpc('report_name', { p_from, p_to })`. Functions default to `SECURITY INVOKER` (no special clause needed, unlike views), so RLS on the underlying tables applies automatically — same guarantee `account_balances`/`deal_payment_summary` get from `security_invoker = true`. Each aggregation is pre-grouped in its own subquery before joining (the fan-out-avoidance pattern from `account_balances`), extended here to two time windows (opening balance / period turnover) for the account report. UI follows the established list-page pattern (server component, `searchParams` for the period, `Promise.all` fetch) with one new shared piece: a client-side `ExportCsvButton` that turns already-rendered table data into a downloaded `.csv` — no server round-trip, no new backend surface for export.

**Tech Stack:** Same as Phases 1-2 — Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres + Auth), pgTAP, Vitest.

## Global Constraints

(Carried over from the design spec and Phases 1-2.)

- No stored/cached aggregates anywhere — every report function is computed on read from `payments`/`transactions`/`deals`/`accounts`/`objects`/`employees`, never from a materialized snapshot.
- RLS must be respected in every report function — since functions default to `SECURITY INVOKER`, this holds automatically as long as no function is declared `SECURITY DEFINER`. Never add `SECURITY DEFINER` to any function in this plan.
- Report period filters use the same field the underlying formula already uses for recognition: `payments.recognized_at` for revenue, `transactions.date` for expenses/other flows, `deals.booking_date` for the platform-efficiency report's deal count. Never filter by `created_at` — that column exists for audit purposes (Phase 5), not for reports (spec §5: "Отчёты строятся по [event date], аудит — по [created_at]").
- CSV export is a pure client-side transform of data already fetched for the page — no new API route, no new server action, so there is nothing new to secure or rate-limit.
- All five report pages are read-only (no create/update/delete) — this phase adds no new mutating server actions.

---

## File Structure

```
supabase/
  migrations/
    0006_pnl_report_function.sql
    0007_account_turnover_report_function.sql
    0008_object_margin_report_function.sql
    0009_employee_summary_report_function.sql
    0010_platform_efficiency_report_function.sql
  tests/
    database/
      006_report_period_scoping.test.sql   (spec §8 items 7, 8)

src/
  components/
    ExportCsvButton.tsx
  app/
    (app)/
      layout.tsx                            (MODIFY — add "Отчёты" nav link)
      reports/
        page.tsx                            (index — links to the 5 sub-reports)
        pnl/page.tsx
        accounts/page.tsx
        objects/page.tsx
        employees/page.tsx
        platforms/page.tsx
```

---

### Task 1: Database migration — `pnl_report` function

**Files:**
- Create: `supabase/migrations/0006_pnl_report_function.sql`

**Interfaces:**
- Consumes: `payments`, `transactions` (Phase 1).
- Produces: `pnl_report(p_from date, p_to date) returns table (revenue numeric, ads_expense numeric, salary_expense numeric, team_expense numeric, staff_expense numeric, profit numeric)` — always exactly one row.

- [ ] **Step 1: Write the migration file**

`supabase/migrations/0006_pnl_report_function.sql`:

```sql
-- P&L for a period: выручка -> реклама -> ФОТ -> команда -> подотчёт -> прибыль (spec §6).
-- Revenue is scoped by payments.recognized_at (when it counts as earned, spec §5),
-- not paid_at; other_income and every expense type are scoped by transactions.date
-- (when the flow happened), never created_at (spec §8 item 8).
create or replace function pnl_report(p_from date, p_to date)
returns table (
  revenue numeric,
  ads_expense numeric,
  salary_expense numeric,
  team_expense numeric,
  staff_expense numeric,
  profit numeric
)
language sql
stable
as $$
  select
    coalesce(pay.total, 0) + coalesce(oi.total, 0) as revenue,
    coalesce(ads.total, 0) as ads_expense,
    coalesce(salary.total, 0) as salary_expense,
    coalesce(team.total, 0) as team_expense,
    coalesce(staff.total, 0) as staff_expense,
    coalesce(pay.total, 0) + coalesce(oi.total, 0)
      - coalesce(ads.total, 0) - coalesce(salary.total, 0)
      - coalesce(team.total, 0) - coalesce(staff.total, 0) as profit
  from
    (select sum(amount) as total from payments
     where deleted_at is null and recognized_at between p_from and p_to) pay,
    (select sum(amount) as total from transactions
     where deleted_at is null and type = 'other_income' and date between p_from and p_to) oi,
    (select sum(amount) as total from transactions
     where deleted_at is null and type = 'ads' and date between p_from and p_to) ads,
    (select sum(amount) as total from transactions
     where deleted_at is null and type = 'salary' and date between p_from and p_to) salary,
    (select sum(amount) as total from transactions
     where deleted_at is null and type = 'team' and date between p_from and p_to) team,
    (select sum(amount) as total from transactions
     where deleted_at is null and type = 'staff_expense' and date between p_from and p_to) staff;
$$;
```

Each of the six subqueries is an unconditional aggregate (no `group by`), so each always returns exactly one row — the cross join (`from a, b, c, ...`) therefore never fans out, it just assembles one row of six independently-computed totals.

- [ ] **Step 2: Apply and verify**

```bash
source "C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\supabase-credentials.env"
export PROJECT_REF=irjfrlitedlzzbzinewt
"C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\scripts\db-exec" supabase/migrations/0006_pnl_report_function.sql
```

Then insert a tiny fixture (one `other_income` transaction and one `ads` transaction in a known month, one payment with `recognized_at` in that month) via `db-exec`, call `select * from pnl_report('YYYY-MM-01','YYYY-MM-30')`, confirm the numbers match, clean up.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0006_pnl_report_function.sql
git commit -m "feat(db): add pnl_report function (period-scoped revenue/expense/profit)"
```

---

### Task 2: Database migration — `account_turnover_report` function

**Files:**
- Create: `supabase/migrations/0007_account_turnover_report_function.sql`

**Interfaces:**
- Consumes: `accounts`, `payments`, `transactions`.
- Produces: `account_turnover_report(p_from date, p_to date) returns table (account_id uuid, account_name text, opening_balance numeric, period_in numeric, period_out numeric, closing_balance numeric)` — one row per active account.

- [ ] **Step 1: Write the migration file**

`supabase/migrations/0007_account_turnover_report_function.sql`:

```sql
-- Per-account opening balance (everything before p_from), period turnover
-- (in/out within [p_from, p_to]), and closing balance (opening + period net).
-- Same fan-out-avoidance shape as account_balances: every aggregation is
-- pre-grouped by account_id in its own subquery before joining onto accounts.
create or replace function account_turnover_report(p_from date, p_to date)
returns table (
  account_id uuid,
  account_name text,
  opening_balance numeric,
  period_in numeric,
  period_out numeric,
  closing_balance numeric
)
language sql
stable
as $$
  select
    a.id,
    a.name,
    coalesce(op_pay.total, 0) + coalesce(op_in.total, 0) - coalesce(op_out.total, 0)
      - coalesce(op_xfer_out.total, 0) + coalesce(op_xfer_in.total, 0) as opening_balance,
    coalesce(per_pay.total, 0) + coalesce(per_in.total, 0) + coalesce(per_xfer_in.total, 0) as period_in,
    coalesce(per_out.total, 0) + coalesce(per_xfer_out.total, 0) as period_out,
    coalesce(op_pay.total, 0) + coalesce(op_in.total, 0) - coalesce(op_out.total, 0)
      - coalesce(op_xfer_out.total, 0) + coalesce(op_xfer_in.total, 0)
      + coalesce(per_pay.total, 0) + coalesce(per_in.total, 0) + coalesce(per_xfer_in.total, 0)
      - coalesce(per_out.total, 0) - coalesce(per_xfer_out.total, 0) as closing_balance
  from accounts a
  left join (select account_id, sum(amount) total from payments
             where deleted_at is null and paid_at < p_from group by account_id) op_pay
    on op_pay.account_id = a.id
  left join (select account_id, sum(amount) total from transactions
             where deleted_at is null and type in ('invest','other_income') and date < p_from
             group by account_id) op_in
    on op_in.account_id = a.id
  left join (select account_id, sum(amount) total from transactions
             where deleted_at is null and type in ('ads','team','salary','staff_expense','personal') and date < p_from
             group by account_id) op_out
    on op_out.account_id = a.id
  left join (select account_id, sum(amount) total from transactions
             where deleted_at is null and type = 'transfer' and date < p_from group by account_id) op_xfer_out
    on op_xfer_out.account_id = a.id
  left join (select account_to_id as account_id, sum(amount) total from transactions
             where deleted_at is null and type = 'transfer' and date < p_from group by account_to_id) op_xfer_in
    on op_xfer_in.account_id = a.id
  left join (select account_id, sum(amount) total from payments
             where deleted_at is null and paid_at between p_from and p_to group by account_id) per_pay
    on per_pay.account_id = a.id
  left join (select account_id, sum(amount) total from transactions
             where deleted_at is null and type in ('invest','other_income') and date between p_from and p_to
             group by account_id) per_in
    on per_in.account_id = a.id
  left join (select account_id, sum(amount) total from transactions
             where deleted_at is null and type in ('ads','team','salary','staff_expense','personal') and date between p_from and p_to
             group by account_id) per_out
    on per_out.account_id = a.id
  left join (select account_id, sum(amount) total from transactions
             where deleted_at is null and type = 'transfer' and date between p_from and p_to group by account_id) per_xfer_out
    on per_xfer_out.account_id = a.id
  left join (select account_to_id as account_id, sum(amount) total from transactions
             where deleted_at is null and type = 'transfer' and date between p_from and p_to group by account_to_id) per_xfer_in
    on per_xfer_in.account_id = a.id
  where a.deleted_at is null;
$$;
```

- [ ] **Step 2: Apply and verify**

```bash
source "C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\supabase-credentials.env"
export PROJECT_REF=irjfrlitedlzzbzinewt
"C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\scripts\db-exec" supabase/migrations/0007_account_turnover_report_function.sql
```

Verify with a fixture that spans the period boundary: an `invest` transaction dated before `p_from` (should land in `opening_balance` only) and another dated inside `[p_from, p_to]` (should land in `period_in` and be reflected in `closing_balance`, not `opening_balance`). Confirm `closing_balance` matches what `account_balances` (Phase 1) reports for the same account as of "now" when `p_to` is today. Clean up.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0007_account_turnover_report_function.sql
git commit -m "feat(db): add account_turnover_report function (opening/period/closing)"
```

---

### Task 3: Database migration — `object_margin_report` function

**Files:**
- Create: `supabase/migrations/0008_object_margin_report_function.sql`

**Interfaces:**
- Consumes: `objects`, `deals`, `payments`, `transactions`.
- Produces: `object_margin_report(p_from date, p_to date) returns table (object_id uuid, object_title text, recognized_commission numeric, ads_spend numeric, margin numeric)` — one row per active object.

- [ ] **Step 1: Write the migration file**

`supabase/migrations/0008_object_margin_report_function.sql`:

```sql
-- Маржа по объекту = признанные комиссии по объекту - реклама по объекту
-- (spec §5). Ads with is_general = true are deliberately excluded (spec §8
-- item 7: general ad spend, not tied to one object, must never appear in a
-- single object's margin).
create or replace function object_margin_report(p_from date, p_to date)
returns table (
  object_id uuid,
  object_title text,
  recognized_commission numeric,
  ads_spend numeric,
  margin numeric
)
language sql
stable
as $$
  select
    o.id,
    o.title,
    coalesce(comm.total, 0) as recognized_commission,
    coalesce(ads.total, 0) as ads_spend,
    coalesce(comm.total, 0) - coalesce(ads.total, 0) as margin
  from objects o
  left join (
    select d.object_id, sum(p.amount) as total
    from payments p
    join deals d on d.id = p.deal_id
    where p.deleted_at is null and d.deleted_at is null
      and p.recognized_at between p_from and p_to
      and d.object_id is not null
    group by d.object_id
  ) comm on comm.object_id = o.id
  left join (
    select object_id, sum(amount) as total
    from transactions
    where deleted_at is null and type = 'ads'
      and coalesce(is_general, false) = false
      and object_id is not null
      and date between p_from and p_to
    group by object_id
  ) ads on ads.object_id = o.id
  where o.deleted_at is null;
$$;
```

- [ ] **Step 2: Apply and verify**

```bash
source "C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\supabase-credentials.env"
export PROJECT_REF=irjfrlitedlzzbzinewt
"C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\scripts\db-exec" supabase/migrations/0008_object_margin_report_function.sql
```

Verify with a fixture object, one non-general `ads` transaction tied to it (should count), and one `is_general = true` ads transaction also tagged with that `object_id` (should NOT count) — this is the exact spec §8 item 7 scenario, get it working here before writing the pgTAP test in Task 6. Clean up.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0008_object_margin_report_function.sql
git commit -m "feat(db): add object_margin_report function (excludes general ads)"
```

---

### Task 4: Database migration — `employee_summary_report` function

**Files:**
- Create: `supabase/migrations/0009_employee_summary_report_function.sql`

**Interfaces:**
- Consumes: `employees`, `transactions`.
- Produces: `employee_summary_report(p_from date, p_to date) returns table (employee_id uuid, employee_name text, salary_paid numeric, staff_expense numeric, total_paid numeric)` — one row per active employee.

- [ ] **Step 1: Write the migration file**

`supabase/migrations/0009_employee_summary_report_function.sql`:

```sql
create or replace function employee_summary_report(p_from date, p_to date)
returns table (
  employee_id uuid,
  employee_name text,
  salary_paid numeric,
  staff_expense numeric,
  total_paid numeric
)
language sql
stable
as $$
  select
    e.id,
    e.name,
    coalesce(sal.total, 0) as salary_paid,
    coalesce(exp.total, 0) as staff_expense,
    coalesce(sal.total, 0) + coalesce(exp.total, 0) as total_paid
  from employees e
  left join (
    select employee_id, sum(amount) as total
    from transactions
    where deleted_at is null and type = 'salary'
      and employee_id is not null and date between p_from and p_to
    group by employee_id
  ) sal on sal.employee_id = e.id
  left join (
    select employee_id, sum(amount) as total
    from transactions
    where deleted_at is null and type = 'staff_expense'
      and employee_id is not null and date between p_from and p_to
    group by employee_id
  ) exp on exp.employee_id = e.id
  where e.deleted_at is null;
$$;
```

- [ ] **Step 2: Apply and verify**

```bash
source "C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\supabase-credentials.env"
export PROJECT_REF=irjfrlitedlzzbzinewt
"C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\scripts\db-exec" supabase/migrations/0009_employee_summary_report_function.sql
```

Verify with a fixture employee, one `salary` transaction and one `staff_expense` transaction tagged to them within the period, confirm `total_paid` = sum. Clean up.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0009_employee_summary_report_function.sql
git commit -m "feat(db): add employee_summary_report function"
```

---

### Task 5: Database migration — `platform_efficiency_report` function

**Files:**
- Create: `supabase/migrations/0010_platform_efficiency_report_function.sql`

**Interfaces:**
- Consumes: `deals`, `transactions`.
- Produces: `platform_efficiency_report(p_from date, p_to date) returns table (source text, deals_count bigint, commission_total numeric, ads_spend numeric, cost_per_deal numeric)` — one row per `deals.source` value that has at least one deal in the period.

- [ ] **Step 1: Write the migration file**

`supabase/migrations/0010_platform_efficiency_report_function.sql`:

```sql
-- Deals are grouped by their source (avito/cian/recommend/other) and matched
-- against ad spend recorded on transactions.platform for the same period.
-- transactions.platform is free text (spec §4) while deals.source is a fixed
-- enum, so the match is case-insensitive equality between the two — this is
-- an intentional simplification: it only reconciles ad spend whose recorded
-- platform name matches a deal source value verbatim (case-insensitively).
-- Ad spend logged under an unrelated platform name (or is_general = true)
-- simply won't appear here; that's expected, not a bug.
create or replace function platform_efficiency_report(p_from date, p_to date)
returns table (
  source text,
  deals_count bigint,
  commission_total numeric,
  ads_spend numeric,
  cost_per_deal numeric
)
language sql
stable
as $$
  select
    d.source,
    count(*) as deals_count,
    coalesce(sum(d.commission_amount), 0) as commission_total,
    coalesce(max(ads.total), 0) as ads_spend,
    case when count(*) > 0 then coalesce(max(ads.total), 0) / count(*) else 0 end as cost_per_deal
  from deals d
  left join (
    select lower(platform) as platform, sum(amount) as total
    from transactions
    where deleted_at is null and type = 'ads' and platform is not null
      and date between p_from and p_to
    group by lower(platform)
  ) ads on ads.platform = d.source::text
  where d.deleted_at is null
    and d.source is not null
    and d.booking_date between p_from and p_to
  group by d.source, ads.total;
$$;
```

`max(ads.total)` (rather than `sum`) is safe here specifically because `ads.total` is already a single pre-aggregated per-platform value joined onto every matching `deals` row — every row in a `d.source` group carries the identical `ads.total`, so `max`/`min`/`sum` all agree; `max` was chosen only to make that "already a constant within the group" property explicit at the call site.

- [ ] **Step 2: Apply and verify**

```bash
source "C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\supabase-credentials.env"
export PROJECT_REF=irjfrlitedlzzbzinewt
"C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\scripts\db-exec" supabase/migrations/0010_platform_efficiency_report_function.sql
```

Verify with two fixture deals with `source = 'avito'` (`commission_amount` 1000 and 2000) and one `ads` transaction with `platform = 'Avito'` (amount 300) in the period — confirm `deals_count = 2`, `commission_total = 3000`, `ads_spend = 300`, `cost_per_deal = 150`. Clean up.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0010_platform_efficiency_report_function.sql
git commit -m "feat(db): add platform_efficiency_report function"
```

---

### Task 6: pgTAP test — report period scoping (spec §8 items 7, 8)

**Files:**
- Create: `supabase/tests/database/006_report_period_scoping.test.sql`

**Interfaces:**
- Consumes: `object_margin_report` (Task 3), `pnl_report` (Task 1).
- Produces: proof of spec §8 item 7 (general ads excluded from object margin) and item 8 (a transaction's report month is its own date, never "today").

- [ ] **Step 1: Write the test**

`supabase/tests/database/006_report_period_scoping.test.sql`:

```sql
begin;
select plan(4);

insert into auth.users (id, email) values
  ('40000000-0000-0000-0000-000000000001', 'reports-owner@example.com');

insert into accounts (id, user_id, name, kind) values
  ('40000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000001', 'Cash', 'cash');

insert into objects (id, user_id, title) values
  ('40000000-0000-0000-0000-000000000020', '40000000-0000-0000-0000-000000000001', 'Object A');

-- item 7: is_general ads spend tagged to an object must not count toward
-- that object's margin; non-general ads spend for the same object must.
insert into transactions (id, user_id, type, amount, account_id, object_id, is_general, date)
values (
  '40000000-0000-0000-0000-000000000100', '40000000-0000-0000-0000-000000000001',
  'ads', 500, '40000000-0000-0000-0000-000000000010',
  '40000000-0000-0000-0000-000000000020', true, '2026-06-05'
);
insert into transactions (id, user_id, type, amount, account_id, object_id, is_general, date)
values (
  '40000000-0000-0000-0000-000000000101', '40000000-0000-0000-0000-000000000001',
  'ads', 300, '40000000-0000-0000-0000-000000000010',
  '40000000-0000-0000-0000-000000000020', false, '2026-06-10'
);

select is(
  (select ads_spend from object_margin_report('2026-06-01', '2026-06-30')
   where object_id = '40000000-0000-0000-0000-000000000020'),
  300::numeric,
  'item 7: general ads spend excluded, non-general ads spend included in object margin'
);
select ok(
  (select ads_spend from object_margin_report('2026-06-01', '2026-06-30')
   where object_id = '40000000-0000-0000-0000-000000000020') <> 800::numeric,
  'item 7: the excluded general ads amount (500) is not silently summed in anyway'
);

-- item 8: a transaction dated in a past month appears in that month's P&L,
-- never in an unrelated month's, regardless of when the row was inserted.
insert into transactions (id, user_id, type, amount, account_id, date)
values (
  '40000000-0000-0000-0000-000000000102', '40000000-0000-0000-0000-000000000001',
  'team', 1000, '40000000-0000-0000-0000-000000000010', '2026-01-15'
);

select is(
  (select team_expense from pnl_report('2026-01-01', '2026-01-31')),
  1000::numeric,
  'item 8: backdated transaction appears in its own month''s P&L'
);
select is(
  (select team_expense from pnl_report('2026-02-01', '2026-02-28')),
  0::numeric,
  'item 8: backdated transaction does not leak into an unrelated month''s P&L'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run it and verify it passes**

Apply the same HTTPS-Management-API verification approach used throughout Phases 1-2 (scratch copy with `search_path` prepended, run via `db-exec`). Confirm all 4 assertions pass.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/database/006_report_period_scoping.test.sql
git commit -m "test(db): assert report period scoping excludes general ads and backdated leakage (spec items 7,8)"
```

---

### Task 7: `ExportCsvButton` client component

**Files:**
- Create: `src/components/ExportCsvButton.tsx`

**Interfaces:**
- Produces: `<ExportCsvButton filename={string} headers={string[]} rows={(string|number)[][]} />`, consumed by all five report pages (Tasks 9-13).

- [ ] **Step 1: Write the component**

`src/components/ExportCsvButton.tsx`:

```tsx
'use client'

function escapeCsvCell(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function ExportCsvButton({
  filename,
  headers,
  rows,
}: {
  filename: string
  headers: string[]
  rows: (string | number)[][]
}) {
  function handleExport() {
    const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(','))
    // Leading BOM so Excel opens UTF-8 Cyrillic content correctly.
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className="rounded border px-3 py-1 text-sm hover:bg-gray-50"
    >
      Экспорт в CSV
    </button>
  )
}
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

Expected: clean (this component isn't imported anywhere yet, but it must type-check standalone).

- [ ] **Step 3: Commit**

```bash
git add src/components/ExportCsvButton.tsx
git commit -m "feat: add client-side CSV export button"
```

---

### Task 8: Reports index page and nav link

**Files:**
- Create: `src/app/(app)/reports/page.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Produces: `/reports` linking to the five sub-report routes; `NAV_LINKS` gains an "Отчёты" entry.

- [ ] **Step 1: Write the index page**

`src/app/(app)/reports/page.tsx`:

```tsx
import Link from 'next/link'

const REPORTS = [
  { href: '/reports/pnl', label: 'P&L за период' },
  { href: '/reports/accounts', label: 'Остатки и обороты по счетам' },
  { href: '/reports/objects', label: 'Маржа по объектам' },
  { href: '/reports/employees', label: 'Сводка по сотрудникам' },
  { href: '/reports/platforms', label: 'Эффективность площадок' },
]

export default function ReportsIndexPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Отчёты</h1>
      <ul className="space-y-2">
        {REPORTS.map((r) => (
          <li key={r.href}>
            <Link href={r.href} className="text-blue-600 hover:underline">
              {r.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Add the nav link**

In `src/app/(app)/layout.tsx`, change `NAV_LINKS` from:

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

to:

```typescript
const NAV_LINKS = [
  { href: '/deals', label: 'Сделки' },
  { href: '/reports', label: 'Отчёты' },
  { href: '/accounts', label: 'Счета' },
  { href: '/objects', label: 'Объекты' },
  { href: '/employees', label: 'Сотрудники' },
  { href: '/categories', label: 'Категории' },
  { href: '/transactions', label: 'Операции' },
]
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/reports/page.tsx" "src/app/(app)/layout.tsx"
git commit -m "feat: add reports index page and nav link"
```

---

### Task 9: P&L report page

**Files:**
- Create: `src/app/(app)/reports/pnl/page.tsx`

**Interfaces:**
- Consumes: `pnl_report` RPC (Task 1), `ExportCsvButton` (Task 7).

- [ ] **Step 1: Write the page**

`src/app/(app)/reports/pnl/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { ExportCsvButton } from '@/components/ExportCsvButton'

interface PnlRow {
  revenue: number
  ads_expense: number
  salary_expense: number
  team_expense: number
  staff_expense: number
  profit: number
}

function defaultPeriod() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { from, to }
}

export default async function PnlReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const params = await searchParams
  const { from: defaultFrom, to: defaultTo } = defaultPeriod()
  const from = params.from || defaultFrom
  const to = params.to || defaultTo

  const supabase = await createClient()
  const { data } = (await supabase.rpc('pnl_report', { p_from: from, p_to: to })) as unknown as {
    data: PnlRow[] | null
  }
  const row = data?.[0]

  const rows: [string, number][] = row
    ? [
        ['Выручка', row.revenue],
        ['Реклама', row.ads_expense],
        ['ФОТ', row.salary_expense],
        ['Команда', row.team_expense],
        ['Подотчёт', row.staff_expense],
        ['Прибыль', row.profit],
      ]
    : []

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">P&amp;L за период</h1>

      <form className="flex flex-wrap items-end gap-3 rounded border bg-white p-4 text-sm">
        <label className="flex flex-col">
          С даты
          <input type="date" name="from" defaultValue={from} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          По дату
          <input type="date" name="to" defaultValue={to} className="rounded border px-2 py-1" />
        </label>
        <button type="submit" className="rounded border px-3 py-1 hover:bg-gray-50">
          Применить
        </button>
      </form>

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{from} — {to}</span>
        <ExportCsvButton filename={`pnl_${from}_${to}.csv`} headers={['Показатель', 'Сумма']} rows={rows} />
      </div>

      <table className="w-full border-collapse rounded border bg-white text-sm">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-b">
              <td className="p-2 font-medium">{label}</td>
              <td className="p-2">{value.toLocaleString('ru-RU')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

Then, with a live server running, use `authed-curl` on `/reports/pnl` to confirm it renders (200, shows the period form and the six P&L rows), and on `/reports/pnl?from=2026-01-01&to=2026-01-31` to confirm the period param is honored (compare against a direct `pnl_report` call via `db-exec` for the same range with known fixture data).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/reports/pnl/page.tsx"
git commit -m "feat: add P&L report page"
```

---

### Task 10: Account turnover report page

**Files:**
- Create: `src/app/(app)/reports/accounts/page.tsx`

**Interfaces:**
- Consumes: `account_turnover_report` RPC (Task 2), `ExportCsvButton` (Task 7).

- [ ] **Step 1: Write the page**

`src/app/(app)/reports/accounts/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { ExportCsvButton } from '@/components/ExportCsvButton'

interface TurnoverRow {
  account_id: string
  account_name: string
  opening_balance: number
  period_in: number
  period_out: number
  closing_balance: number
}

function defaultPeriod() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { from, to }
}

export default async function AccountTurnoverReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const params = await searchParams
  const { from: defaultFrom, to: defaultTo } = defaultPeriod()
  const from = params.from || defaultFrom
  const to = params.to || defaultTo

  const supabase = await createClient()
  const { data } = (await supabase.rpc('account_turnover_report', { p_from: from, p_to: to })) as unknown as {
    data: TurnoverRow[] | null
  }
  const rows = data ?? []

  const csvRows: (string | number)[][] = rows.map((r) => [
    r.account_name,
    r.opening_balance,
    r.period_in,
    r.period_out,
    r.closing_balance,
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Остатки и обороты по счетам</h1>

      <form className="flex flex-wrap items-end gap-3 rounded border bg-white p-4 text-sm">
        <label className="flex flex-col">
          С даты
          <input type="date" name="from" defaultValue={from} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          По дату
          <input type="date" name="to" defaultValue={to} className="rounded border px-2 py-1" />
        </label>
        <button type="submit" className="rounded border px-3 py-1 hover:bg-gray-50">
          Применить
        </button>
      </form>

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{from} — {to}</span>
        <ExportCsvButton
          filename={`account_turnover_${from}_${to}.csv`}
          headers={['Счёт', 'Начальный остаток', 'Приход', 'Расход', 'Конечный остаток']}
          rows={csvRows}
        />
      </div>

      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Счёт</th>
            <th className="p-2">Начальный остаток</th>
            <th className="p-2">Приход</th>
            <th className="p-2">Расход</th>
            <th className="p-2">Конечный остаток</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.account_id} className="border-b">
              <td className="p-2">{r.account_name}</td>
              <td className="p-2">{r.opening_balance.toLocaleString('ru-RU')}</td>
              <td className="p-2">{r.period_in.toLocaleString('ru-RU')}</td>
              <td className="p-2">{r.period_out.toLocaleString('ru-RU')}</td>
              <td className="p-2">{r.closing_balance.toLocaleString('ru-RU')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

`authed-curl` on `/reports/accounts` — confirm 200 and the table renders with the test user's existing account(s).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/reports/accounts/page.tsx"
git commit -m "feat: add account turnover report page"
```

---

### Task 11: Object margin report page

**Files:**
- Create: `src/app/(app)/reports/objects/page.tsx`

**Interfaces:**
- Consumes: `object_margin_report` RPC (Task 3), `ExportCsvButton` (Task 7).

- [ ] **Step 1: Write the page**

`src/app/(app)/reports/objects/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { ExportCsvButton } from '@/components/ExportCsvButton'

interface MarginRow {
  object_id: string
  object_title: string
  recognized_commission: number
  ads_spend: number
  margin: number
}

function defaultPeriod() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { from, to }
}

export default async function ObjectMarginReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const params = await searchParams
  const { from: defaultFrom, to: defaultTo } = defaultPeriod()
  const from = params.from || defaultFrom
  const to = params.to || defaultTo

  const supabase = await createClient()
  const { data } = (await supabase.rpc('object_margin_report', { p_from: from, p_to: to })) as unknown as {
    data: MarginRow[] | null
  }
  const rows = data ?? []

  const csvRows: (string | number)[][] = rows.map((r) => [
    r.object_title,
    r.recognized_commission,
    r.ads_spend,
    r.margin,
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Маржа по объектам</h1>

      <form className="flex flex-wrap items-end gap-3 rounded border bg-white p-4 text-sm">
        <label className="flex flex-col">
          С даты
          <input type="date" name="from" defaultValue={from} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          По дату
          <input type="date" name="to" defaultValue={to} className="rounded border px-2 py-1" />
        </label>
        <button type="submit" className="rounded border px-3 py-1 hover:bg-gray-50">
          Применить
        </button>
      </form>

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{from} — {to}</span>
        <ExportCsvButton
          filename={`object_margin_${from}_${to}.csv`}
          headers={['Объект', 'Комиссии', 'Реклама', 'Маржа']}
          rows={csvRows}
        />
      </div>

      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Объект</th>
            <th className="p-2">Комиссии</th>
            <th className="p-2">Реклама</th>
            <th className="p-2">Маржа</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.object_id} className="border-b">
              <td className="p-2">{r.object_title}</td>
              <td className="p-2">{r.recognized_commission.toLocaleString('ru-RU')}</td>
              <td className="p-2">{r.ads_spend.toLocaleString('ru-RU')}</td>
              <td className="p-2">{r.margin.toLocaleString('ru-RU')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

`authed-curl` on `/reports/objects` — 200, table renders (may be empty if the test user has no objects; that's fine, confirm headers render).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/reports/objects/page.tsx"
git commit -m "feat: add object margin report page"
```

---

### Task 12: Employee summary report page

**Files:**
- Create: `src/app/(app)/reports/employees/page.tsx`

**Interfaces:**
- Consumes: `employee_summary_report` RPC (Task 4), `ExportCsvButton` (Task 7).

- [ ] **Step 1: Write the page**

`src/app/(app)/reports/employees/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { ExportCsvButton } from '@/components/ExportCsvButton'

interface EmployeeSummaryRow {
  employee_id: string
  employee_name: string
  salary_paid: number
  staff_expense: number
  total_paid: number
}

function defaultPeriod() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { from, to }
}

export default async function EmployeeSummaryReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const params = await searchParams
  const { from: defaultFrom, to: defaultTo } = defaultPeriod()
  const from = params.from || defaultFrom
  const to = params.to || defaultTo

  const supabase = await createClient()
  const { data } = (await supabase.rpc('employee_summary_report', { p_from: from, p_to: to })) as unknown as {
    data: EmployeeSummaryRow[] | null
  }
  const rows = data ?? []

  const csvRows: (string | number)[][] = rows.map((r) => [
    r.employee_name,
    r.salary_paid,
    r.staff_expense,
    r.total_paid,
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Сводка по сотрудникам</h1>

      <form className="flex flex-wrap items-end gap-3 rounded border bg-white p-4 text-sm">
        <label className="flex flex-col">
          С даты
          <input type="date" name="from" defaultValue={from} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          По дату
          <input type="date" name="to" defaultValue={to} className="rounded border px-2 py-1" />
        </label>
        <button type="submit" className="rounded border px-3 py-1 hover:bg-gray-50">
          Применить
        </button>
      </form>

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{from} — {to}</span>
        <ExportCsvButton
          filename={`employee_summary_${from}_${to}.csv`}
          headers={['Сотрудник', 'Выплачено (оклад)', 'Подотчёт', 'Итого']}
          rows={csvRows}
        />
      </div>

      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Сотрудник</th>
            <th className="p-2">Выплачено (оклад)</th>
            <th className="p-2">Подотчёт</th>
            <th className="p-2">Итого</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.employee_id} className="border-b">
              <td className="p-2">{r.employee_name}</td>
              <td className="p-2">{r.salary_paid.toLocaleString('ru-RU')}</td>
              <td className="p-2">{r.staff_expense.toLocaleString('ru-RU')}</td>
              <td className="p-2">{r.total_paid.toLocaleString('ru-RU')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

`authed-curl` on `/reports/employees` — 200, table renders.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/reports/employees/page.tsx"
git commit -m "feat: add employee summary report page"
```

---

### Task 13: Platform efficiency report page

**Files:**
- Create: `src/app/(app)/reports/platforms/page.tsx`

**Interfaces:**
- Consumes: `platform_efficiency_report` RPC (Task 5), `ExportCsvButton` (Task 7).

- [ ] **Step 1: Write the page**

`src/app/(app)/reports/platforms/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { ExportCsvButton } from '@/components/ExportCsvButton'

interface PlatformEfficiencyRow {
  source: string
  deals_count: number
  commission_total: number
  ads_spend: number
  cost_per_deal: number
}

const SOURCE_LABELS: Record<string, string> = {
  avito: 'Avito',
  cian: 'Циан',
  recommend: 'Рекомендация',
  other: 'Другое',
}

function defaultPeriod() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { from, to }
}

export default async function PlatformEfficiencyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const params = await searchParams
  const { from: defaultFrom, to: defaultTo } = defaultPeriod()
  const from = params.from || defaultFrom
  const to = params.to || defaultTo

  const supabase = await createClient()
  const { data } = (await supabase.rpc('platform_efficiency_report', { p_from: from, p_to: to })) as unknown as {
    data: PlatformEfficiencyRow[] | null
  }
  const rows = data ?? []

  const csvRows: (string | number)[][] = rows.map((r) => [
    SOURCE_LABELS[r.source] ?? r.source,
    r.deals_count,
    r.commission_total,
    r.ads_spend,
    r.cost_per_deal,
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Эффективность площадок</h1>

      <form className="flex flex-wrap items-end gap-3 rounded border bg-white p-4 text-sm">
        <label className="flex flex-col">
          С даты
          <input type="date" name="from" defaultValue={from} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          По дату
          <input type="date" name="to" defaultValue={to} className="rounded border px-2 py-1" />
        </label>
        <button type="submit" className="rounded border px-3 py-1 hover:bg-gray-50">
          Применить
        </button>
      </form>

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{from} — {to}</span>
        <ExportCsvButton
          filename={`platform_efficiency_${from}_${to}.csv`}
          headers={['Площадка', 'Сделок', 'Комиссии', 'Реклама', 'Стоимость сделки']}
          rows={csvRows}
        />
      </div>

      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Площадка</th>
            <th className="p-2">Сделок</th>
            <th className="p-2">Комиссии</th>
            <th className="p-2">Реклама</th>
            <th className="p-2">Стоимость сделки</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.source} className="border-b">
              <td className="p-2">{SOURCE_LABELS[r.source] ?? r.source}</td>
              <td className="p-2">{r.deals_count}</td>
              <td className="p-2">{r.commission_total.toLocaleString('ru-RU')}</td>
              <td className="p-2">{r.ads_spend.toLocaleString('ru-RU')}</td>
              <td className="p-2">{r.cost_per_deal.toLocaleString('ru-RU')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

`authed-curl` on `/reports/platforms` — 200, table renders (empty is fine if no deals exist for the test user; confirm headers).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/reports/platforms/page.tsx"
git commit -m "feat: add platform efficiency report page"
```

---

## Self-Review Notes

**Spec coverage:** §6 "Отчёты" screen — all 5 sub-reports (P&L, остатки/обороты, маржа по объектам, сводка по сотрудникам, эффективность площадок) built (Tasks 9-13), each with CSV export (Task 7, reused). §5 formulas — `pnl_report`/`object_margin_report` implement the exact revenue/expense/margin formulas from the spec. §7 "Этап 3" — this plan is exactly that phase. §8 items 7, 8 — Task 6. Items 9 ("отмена сделки после предоплаты" — already covered in Phase 2's test) and the remaining items are out of this phase's scope (dashboard is Phase 4, audit/backup is Phase 5) per the phased rollout.

**Placeholder scan:** none — every step has literal SQL/TSX or exact commands.

**Type consistency:** Each report page defines its own row interface (`PnlRow`, `TurnoverRow`, `MarginRow`, `EmployeeSummaryRow`, `PlatformEfficiencyRow`) matching its RPC function's `returns table (...)` column list exactly — these are intentionally separate, lightweight, page-local types (not added to the shared `src/types/database.ts`) since they describe RPC call shapes, not table rows, consistent with how the rest of the codebase separates persisted-row types from view-derived shapes. `ExportCsvButton`'s prop shape (`filename`, `headers`, `rows: (string|number)[][]`) is defined once (Task 7) and used identically by all five report pages.

**Known simplification, disclosed in the migration itself:** `platform_efficiency_report`'s join between `deals.source` (enum) and `transactions.platform` (free text) via case-insensitive equality is an intentional approximation — noted directly in Task 5's SQL comment, not hidden.
