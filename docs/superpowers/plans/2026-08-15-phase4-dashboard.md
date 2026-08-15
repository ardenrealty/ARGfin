# Этап 4 — Дашборд: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The dashboard (`/`, currently a static placeholder from Phase 1) becomes the real home screen: 7 summary cards, a monthly revenue/expenses/profit bar chart (Recharts), a horizontal money-distribution bar, and a list of upcoming check-ins with expected balance due — all computed live from four new Postgres functions, three of which reuse Phase 3's `pnl_report` and Phase 2's `deal_payment_summary` rather than re-deriving their logic.

**Architecture:** Same "compute on read, no stored aggregates" discipline as every prior phase. Four new `SECURITY INVOKER` (default) SQL/plpgsql functions: `dashboard_summary()` (the 7 cards, no params — always "now"), `monthly_pnl_series(p_months)` (chart data, loops `pnl_report` per month), `money_distribution()` (the horizontal bar's 6 segments), `upcoming_checkins(p_limit)` (the check-ins list). The dashboard page (`src/app/(app)/page.tsx`) becomes a server component fetching all four via `Promise.all`/`supabase.rpc`; the bar chart is the one client component in this phase (Recharts needs the browser), receiving `monthly_pnl_series`'s rows as a prop.

**Tech Stack:** Same as Phases 1-3 — Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres + Auth), pgTAP, Vitest — plus `recharts` (new dependency, first UI charting library in this project).

**Spec:** `docs/superpowers/specs/2026-08-14-agency-finance-design.md` — §5 (formulas: "Ожидается", "Получено, но не признано", "Внесено капитала", "Изъято лично", "Свободные деньги"), §6 "Дашборд" (cards, monthly chart, distribution bar, upcoming check-ins), §7 "Этап 4".

## Global Constraints

- No stored/cached aggregates — every dashboard number is computed on read via a Postgres function, exactly like every view/function in Phases 1-3.
- Functions default to `SECURITY INVOKER` — never add `SECURITY DEFINER` to any function in this plan; RLS on the underlying tables must keep applying automatically.
- "Ожидается" (`expected_receivables`) only counts deals with `status in ('booked','prepaid','checked_in')` — completed and cancelled deals never contribute, per spec §5's literal status list (not "any deal with remaining > 0").
- "Получено, но не признано" (`unrecognized_received`) counts a payment when `paid_at <= current_date` and it is not yet recognized — treated as "not yet recognized" when `recognized_at is null` (a `balance` payment whose deal has no `checkin_date` yet) OR `recognized_at > current_date` (a future recognition date already known). Spec §5's literal formula only names the second case; the null case is a considered extension covered explicitly in Task 1's migration comment, not a silent assumption.
- "Внесено капитала"/"Изъято лично"/"Свободные деньги" are all-time totals (no period filter) — spec §5 states these formulas without a "периода" qualifier, unlike revenue/expenses which explicitly say "периода".
- The dashboard's "this month" window (cards, distribution bar) and `monthly_pnl_series`'s per-month windows are always computed from `current_date` inside the database function — never passed in from the client — since the dashboard has no period picker (spec §6 lists no date filter for this screen, unlike Reports).

---

## File Structure

```
supabase/
  migrations/
    0011_dashboard_summary_function.sql
    0012_monthly_pnl_series_function.sql
    0013_money_distribution_function.sql
    0014_upcoming_checkins_function.sql
  tests/
    database/
      008_dashboard_formulas.test.sql

package.json                                (MODIFY — add recharts dependency)

src/
  app/
    (app)/
      page.tsx                              (MODIFY — replace Phase 1 placeholder with the real dashboard)
  components/
    dashboard/
      MonthlyPnlChart.tsx                   (client component, Recharts BarChart)
```

---

### Task 1: Database migration — `dashboard_summary` function

**Files:**
- Create: `supabase/migrations/0011_dashboard_summary_function.sql`

**Interfaces:**
- Consumes: `pnl_report` (Phase 3, `supabase/migrations/0006_pnl_report_function.sql`), `account_balances` (Phase 1), `deal_payment_summary` (Phase 2), `payments`, `transactions`.
- Produces: `dashboard_summary() returns table (account_balance_total numeric, revenue_month numeric, expenses_month numeric, profit_month numeric, expected_receivables numeric, unrecognized_received numeric, capital_invested numeric, personal_withdrawn numeric, free_cash numeric)` — always exactly one row, no parameters (always "now").

- [ ] **Step 1: Write the migration file**

`supabase/migrations/0011_dashboard_summary_function.sql`:

```sql
-- The dashboard's 7 summary cards (spec §6), all computed live, no
-- parameters — this function always answers "as of right now".
--
-- unrecognized_received treats a payment as "not yet recognized" when
-- recognized_at is null (a balance payment whose deal has no checkin_date
-- yet — its recognition date is genuinely unknown, not "never") OR when
-- recognized_at is a real date still in the future. Spec §5's literal
-- formula only names the future-date case; the null case is included
-- deliberately so a received-but-unrecognized balance payment isn't
-- silently dropped from this card before its deal even has a checkin_date.
create or replace function dashboard_summary()
returns table (
  account_balance_total numeric,
  revenue_month numeric,
  expenses_month numeric,
  profit_month numeric,
  expected_receivables numeric,
  unrecognized_received numeric,
  capital_invested numeric,
  personal_withdrawn numeric,
  free_cash numeric
)
language sql
stable
as $$
  select
    coalesce((select sum(balance) from account_balances), 0) as account_balance_total,
    pnl.revenue,
    pnl.ads_expense + pnl.salary_expense + pnl.team_expense + pnl.staff_expense as expenses_month,
    pnl.profit,
    coalesce(
      (select sum(remaining) from deal_payment_summary
       where status in ('booked', 'prepaid', 'checked_in')),
      0
    ) as expected_receivables,
    coalesce(
      (select sum(amount) from payments
       where deleted_at is null
         and paid_at <= current_date
         and (recognized_at is null or recognized_at > current_date)),
      0
    ) as unrecognized_received,
    coalesce((select sum(amount) from transactions where deleted_at is null and type = 'invest'), 0) as capital_invested,
    coalesce((select sum(amount) from transactions where deleted_at is null and type = 'personal'), 0) as personal_withdrawn,
    coalesce((select sum(amount) from transactions where deleted_at is null and type = 'invest'), 0)
      + pnl.revenue
      - (pnl.ads_expense + pnl.salary_expense + pnl.team_expense + pnl.staff_expense)
      - coalesce((select sum(amount) from transactions where deleted_at is null and type = 'personal'), 0) as free_cash
  from pnl_report(
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date
  ) pnl;
$$;
```

- [ ] **Step 2: Apply and verify**

```bash
source "C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\supabase-credentials.env"
export PROJECT_REF=irjfrlitedlzzbzinewt
"C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\scripts\db-exec" supabase/migrations/0011_dashboard_summary_function.sql
```

Verify with live fixtures: one `invest` transaction (proves `capital_invested` and contributes to `free_cash`), one `personal` transaction (proves `personal_withdrawn`), one deal in `status = 'prepaid'` with `commission_amount` greater than what's been paid (proves `expected_receivables` includes it) and a second deal in `status = 'completed'` with an equally large unpaid remainder (proves `expected_receivables` excludes it — the status filter is the point of this test), and one `balance`-kind payment with `paid_at` in the past and `recognized_at` null (proves `unrecognized_received` includes it). Clean up all fixtures afterward.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0011_dashboard_summary_function.sql
git commit -m "feat(db): add dashboard_summary function (7 cards, computed live)"
```

---

### Task 2: Database migration — `monthly_pnl_series` function

**Files:**
- Create: `supabase/migrations/0012_monthly_pnl_series_function.sql`

**Interfaces:**
- Consumes: `pnl_report` (Phase 3).
- Produces: `monthly_pnl_series(p_months int default 6) returns table (month date, revenue numeric, expenses numeric, profit numeric)` — one row per month, oldest first, for the last `p_months` months including the current one.

- [ ] **Step 1: Write the migration file**

`supabase/migrations/0012_monthly_pnl_series_function.sql`:

```sql
-- Chart data for the dashboard's monthly revenue/expenses/profit bar chart
-- (spec §6). Loops pnl_report once per month rather than re-deriving the
-- revenue/expense formulas — same numbers as the P&L report (Phase 3) and
-- the dashboard cards (Task 1), by construction, not by coincidence.
create or replace function monthly_pnl_series(p_months int default 6)
returns table (
  month date,
  revenue numeric,
  expenses numeric,
  profit numeric
)
language plpgsql
stable
as $$
declare
  m date;
begin
  for m in
    select date_trunc('month', current_date - (n || ' months')::interval)::date
    from generate_series(0, p_months - 1) as n
    order by 1
  loop
    return query
    select
      m,
      pnl.revenue,
      pnl.ads_expense + pnl.salary_expense + pnl.team_expense + pnl.staff_expense,
      pnl.profit
    from pnl_report(m, (m + interval '1 month - 1 day')::date) pnl;
  end loop;
end;
$$;
```

- [ ] **Step 2: Apply and verify**

```bash
source "C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\supabase-credentials.env"
export PROJECT_REF=irjfrlitedlzzbzinewt
"C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\scripts\db-exec" supabase/migrations/0012_monthly_pnl_series_function.sql
```

Call `select * from monthly_pnl_series(3)` and confirm it returns exactly 3 rows, oldest month first, `month` values are the first day of each of the last 3 calendar months (including the current one). Insert one fixture transaction two months ago and confirm it shows up in the correct row's `expenses`, not in the current month's row. Clean up.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0012_monthly_pnl_series_function.sql
git commit -m "feat(db): add monthly_pnl_series function (chart data, reuses pnl_report)"
```

---

### Task 3: Database migration — `money_distribution` function

**Files:**
- Create: `supabase/migrations/0013_money_distribution_function.sql`

**Interfaces:**
- Consumes: `pnl_report` (Phase 3), `transactions`.
- Produces: `money_distribution() returns table (ads_expense numeric, salary_expense numeric, team_expense numeric, staff_expense numeric, personal_expense numeric, remaining numeric)` — one row, current month.

- [ ] **Step 1: Write the migration file**

`supabase/migrations/0013_money_distribution_function.sql`:

```sql
-- The dashboard's horizontal money-distribution bar (spec §6): реклама,
-- ФОТ, команда, подотчёт, личное, остаток. The first four segments are
-- this month's expense breakdown (same numbers as pnl_report); "личное"
-- is this month's personal withdrawals (excluded from profit, but shown
-- here because it did leave the accounts); "остаток" is what's left of
-- this month's revenue after every other segment is subtracted — it can
-- go negative if the month spent more than it earned, which the UI must
-- render as a zero-width (not negative-width) segment.
create or replace function money_distribution()
returns table (
  ads_expense numeric,
  salary_expense numeric,
  team_expense numeric,
  staff_expense numeric,
  personal_expense numeric,
  remaining numeric
)
language sql
stable
as $$
  select
    pnl.ads_expense,
    pnl.salary_expense,
    pnl.team_expense,
    pnl.staff_expense,
    coalesce(personal.total, 0) as personal_expense,
    pnl.revenue - pnl.ads_expense - pnl.salary_expense - pnl.team_expense
      - pnl.staff_expense - coalesce(personal.total, 0) as remaining
  from pnl_report(
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date
  ) pnl,
  (
    select sum(amount) as total
    from transactions
    where deleted_at is null and type = 'personal'
      and date between date_trunc('month', current_date)::date
                    and (date_trunc('month', current_date) + interval '1 month - 1 day')::date
  ) personal;
$$;
```

- [ ] **Step 2: Apply and verify**

```bash
source "C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\supabase-credentials.env"
export PROJECT_REF=irjfrlitedlzzbzinewt
"C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\scripts\db-exec" supabase/migrations/0013_money_distribution_function.sql
```

Verify with a fixture: one `other_income` transaction (revenue), one `ads` transaction, one `personal` transaction, all in the current month — confirm `remaining = revenue - ads - personal` and every other segment matches its fixture amount or 0. Clean up.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0013_money_distribution_function.sql
git commit -m "feat(db): add money_distribution function (dashboard bar segments)"
```

---

### Task 4: Database migration — `upcoming_checkins` function

**Files:**
- Create: `supabase/migrations/0014_upcoming_checkins_function.sql`

**Interfaces:**
- Consumes: `deals`, `deal_payment_summary` (Phase 2).
- Produces: `upcoming_checkins(p_limit int default 10) returns table (deal_id uuid, client_name text, checkin_date date, remaining numeric)` — deals with a future check-in date, nearest first.

- [ ] **Step 1: Write the migration file**

`supabase/migrations/0014_upcoming_checkins_function.sql`:

```sql
-- Dashboard's "ближайшие заселения" list (spec §6): upcoming check-ins
-- with the expected balance payment still due. Excludes cancelled and
-- completed deals (nothing left to collect or nothing left to happen).
create or replace function upcoming_checkins(p_limit int default 10)
returns table (
  deal_id uuid,
  client_name text,
  checkin_date date,
  remaining numeric
)
language sql
stable
as $$
  select d.id, d.client_name, d.checkin_date, s.remaining
  from deals d
  join deal_payment_summary s on s.deal_id = d.id
  where d.deleted_at is null
    and d.checkin_date is not null
    and d.checkin_date >= current_date
    and d.status not in ('cancelled', 'completed')
  order by d.checkin_date asc
  limit p_limit;
$$;
```

- [ ] **Step 2: Apply and verify**

```bash
source "C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\supabase-credentials.env"
export PROJECT_REF=irjfrlitedlzzbzinewt
"C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\scripts\db-exec" supabase/migrations/0014_upcoming_checkins_function.sql
```

Verify with 3 fixture deals: one with `checkin_date` next week and `status = 'prepaid'` (should appear), one with `checkin_date` yesterday (should NOT appear — already passed), one with `checkin_date` next week but `status = 'cancelled'` (should NOT appear). Confirm ordering and `remaining` values. Clean up.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0014_upcoming_checkins_function.sql
git commit -m "feat(db): add upcoming_checkins function"
```

---

### Task 5: pgTAP test — dashboard formula edge cases

**Files:**
- Create: `supabase/tests/database/008_dashboard_formulas.test.sql`

**Interfaces:**
- Consumes: `dashboard_summary` (Task 1), `upcoming_checkins` (Task 4).
- Produces: proof of the two status-filtering rules this plan's Global Constraints call out explicitly (neither is covered by any earlier phase's tests, since `deal_payment_summary` itself has no status opinion — the filtering happens in `dashboard_summary`/`upcoming_checkins`).

- [ ] **Step 1: Write the test**

`supabase/tests/database/008_dashboard_formulas.test.sql`:

```sql
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
```

- [ ] **Step 2: Run it and verify it passes**

Apply the same HTTPS-Management-API verification approach used throughout Phases 1-3 (scratch copy with `search_path` prepended, run via `db-exec`). Confirm all 3 assertions pass.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/database/008_dashboard_formulas.test.sql
git commit -m "test(db): assert dashboard status filtering for expected_receivables and upcoming_checkins"
```

---

### Task 6: Install `recharts`

**Files:**
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Produces: `recharts` available as an import for Task 8's chart component.

- [ ] **Step 1: Install the package**

```bash
npm install recharts
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

Expected: clean (nothing imports it yet).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add recharts dependency"
```

---

### Task 7: Dashboard page — summary cards

**Files:**
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `dashboard_summary` RPC (Task 1).
- Produces: the dashboard's 7 cards, replacing Phase 1's static placeholder. Task 8 will further modify this same file to add the chart; Task 9 to add the distribution bar; Task 10 to add the upcoming-check-ins list.

- [ ] **Step 1: Replace the placeholder with the cards section**

`src/app/(app)/page.tsx` (full replacement of the Phase 1 placeholder):

```tsx
import { createClient } from '@/lib/supabase/server'

interface DashboardSummary {
  account_balance_total: number
  revenue_month: number
  expenses_month: number
  profit_month: number
  expected_receivables: number
  unrecognized_received: number
  capital_invested: number
  personal_withdrawn: number
  free_cash: number
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data } = (await supabase.rpc('dashboard_summary')) as unknown as { data: DashboardSummary[] | null }
  const summary = data?.[0]

  const cards: [string, number][] = summary
    ? [
        ['Остаток по счетам', summary.account_balance_total],
        ['Выручка месяца', summary.revenue_month],
        ['Расходы месяца', summary.expenses_month],
        ['Прибыль месяца', summary.profit_month],
        ['Ожидается', summary.expected_receivables],
        ['Получено, не признано', summary.unrecognized_received],
        ['Изъято лично', summary.personal_withdrawn],
      ]
    : []

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Дашборд</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded border bg-white p-4">
            <div className="text-xs text-gray-500">{label}</div>
            <div className="text-lg font-semibold">{value.toLocaleString('ru-RU')}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

Then `authed-curl` on `/` — confirm 200 and all 7 card labels render.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/page.tsx"
git commit -m "feat: replace dashboard placeholder with live summary cards"
```

---

### Task 8: Dashboard page — monthly bar chart

**Files:**
- Create: `src/components/dashboard/MonthlyPnlChart.tsx`
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `recharts` (Task 6), `monthly_pnl_series` RPC (Task 2).
- Produces: `<MonthlyPnlChart data={{month, revenue, expenses, profit}[]} />`, rendered on the dashboard.

- [ ] **Step 1: Write the chart component**

`src/components/dashboard/MonthlyPnlChart.tsx`:

```tsx
'use client'

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

interface MonthlyPnlRow {
  month: string
  revenue: number
  expenses: number
  profit: number
}

export function MonthlyPnlChart({ data }: { data: MonthlyPnlRow[] }) {
  const formatted = data.map((row) => ({
    ...row,
    monthLabel: new Date(row.month).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }),
  }))

  return (
    <div className="h-72 rounded border bg-white p-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="monthLabel" />
          <YAxis />
          <Tooltip formatter={(value: number) => value.toLocaleString('ru-RU')} />
          <Legend />
          <Bar dataKey="revenue" name="Выручка" fill="#16a34a" />
          <Bar dataKey="expenses" name="Расходы" fill="#dc2626" />
          <Bar dataKey="profit" name="Прибыль" fill="#2563eb" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: Wire it into the dashboard page**

Modify `src/app/(app)/page.tsx`: add the import `import { MonthlyPnlChart } from '@/components/dashboard/MonthlyPnlChart'`, fetch the series alongside the summary via `Promise.all`:

```tsx
const [{ data: summaryData }, { data: seriesData }] = await Promise.all([
  supabase.rpc('dashboard_summary'),
  supabase.rpc('monthly_pnl_series', { p_months: 6 }),
])
```

(replacing the single `dashboard_summary` call from Task 7 with this `Promise.all`, and renaming the destructured variable accordingly — `const summary = summaryData?.[0]` as before). Render `<MonthlyPnlChart data={seriesData ?? []} />` below the cards grid.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```

`authed-curl` on `/` — confirm 200 (the chart itself renders client-side via React hydration, which `authed-curl` can't observe, but confirm the server-rendered HTML includes the chart's container `<div>` and no server error).

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/MonthlyPnlChart.tsx "src/app/(app)/page.tsx"
git commit -m "feat: add monthly P&L bar chart to dashboard"
```

---

### Task 9: Dashboard page — money distribution bar

**Files:**
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `money_distribution` RPC (Task 3).

- [ ] **Step 1: Fetch and render the distribution bar**

Modify `src/app/(app)/page.tsx`: extend the `Promise.all` from Task 8 to a third call, `supabase.rpc('money_distribution')`, and add this rendering block below the chart:

```tsx
interface MoneyDistribution {
  ads_expense: number
  salary_expense: number
  team_expense: number
  staff_expense: number
  personal_expense: number
  remaining: number
}

// (inside the component, after fetching `distributionData`)
const distribution = distributionData?.[0] as MoneyDistribution | undefined
const segments: [string, number, string][] = distribution
  ? [
      ['Реклама', distribution.ads_expense, '#f97316'],
      ['ФОТ', distribution.salary_expense, '#8b5cf6'],
      ['Команда', distribution.team_expense, '#0ea5e9'],
      ['Подотчёт', distribution.staff_expense, '#eab308'],
      ['Личное', distribution.personal_expense, '#ec4899'],
      ['Остаток', Math.max(distribution.remaining, 0), '#22c55e'],
    ]
  : []
const total = segments.reduce((sum, [, value]) => sum + value, 0)
```

```tsx
<div className="space-y-2 rounded border bg-white p-4">
  <div className="text-sm font-medium">Распределение денег за месяц</div>
  <div className="flex h-6 overflow-hidden rounded">
    {segments.map(([label, value, color]) => (
      <div
        key={label}
        style={{ width: total > 0 ? `${(value / total) * 100}%` : '0%', backgroundColor: color }}
        title={`${label}: ${value.toLocaleString('ru-RU')}`}
      />
    ))}
  </div>
  <div className="flex flex-wrap gap-3 text-xs">
    {segments.map(([label, value, color]) => (
      <span key={label} className="flex items-center gap-1">
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {label}: {value.toLocaleString('ru-RU')}
      </span>
    ))}
  </div>
</div>
```

`Math.max(distribution.remaining, 0)` guards the one case `money_distribution`'s own migration comment calls out: a month that spent more than it earned would otherwise produce a negative-width segment, which is not renderable — it's floored to zero in the bar itself while the legend still shows the true (possibly negative) number via `distribution.remaining` directly if you choose to surface it separately; this step only floors the bar's width calculation, not the underlying data.

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

`authed-curl` on `/` — confirm 200, the distribution bar and its legend render.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/page.tsx"
git commit -m "feat: add money distribution bar to dashboard"
```

---

### Task 10: Dashboard page — upcoming check-ins list

**Files:**
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `upcoming_checkins` RPC (Task 4).

- [ ] **Step 1: Fetch and render the list**

Modify `src/app/(app)/page.tsx`: extend the `Promise.all` from Task 9 to a fourth call, `supabase.rpc('upcoming_checkins', { p_limit: 10 })`, and add this block at the bottom of the page:

```tsx
interface UpcomingCheckin {
  deal_id: string
  client_name: string
  checkin_date: string
  remaining: number
}

// (inside the component, after fetching `checkinsData`)
const upcomingCheckins = (checkinsData ?? []) as UpcomingCheckin[]
```

```tsx
<div className="space-y-2 rounded border bg-white p-4">
  <div className="text-sm font-medium">Ближайшие заселения</div>
  {upcomingCheckins.length === 0 ? (
    <div className="text-sm text-gray-500">Нет предстоящих заселений</div>
  ) : (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-gray-500">
          <th className="py-1">Клиент</th>
          <th className="py-1">Заселение</th>
          <th className="py-1">Доплата</th>
        </tr>
      </thead>
      <tbody>
        {upcomingCheckins.map((c) => (
          <tr key={c.deal_id} className="border-b">
            <td className="py-1">{c.client_name}</td>
            <td className="py-1">{c.checkin_date}</td>
            <td className="py-1">{c.remaining.toLocaleString('ru-RU')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )}
</div>
```

- [ ] **Step 2: Verify — full page, all four data sources together**

```bash
npx tsc --noEmit
```

Then a full live check via `authed-curl` on `/`: confirm 200, all 7 cards, the chart container, the distribution bar, and the upcoming-check-ins section (either the empty-state message or a real row) all render in one page load. If the test user has no upcoming check-ins, insert one fixture deal via `db-exec` with a near-future `checkin_date` and a non-cancelled/non-completed status, re-check the page shows it, then clean up (or leave it if you'd rather have a non-empty dashboard for future manual testing — your call, note which in your report).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/page.tsx"
git commit -m "feat: add upcoming check-ins list to dashboard"
```

---

## Self-Review Notes

**Spec coverage:** §6 "Дашборд" — all four listed elements present: карточки (Task 7, all 7 named in spec), столбчатый график (Task 8), полоса распределения (Task 9), ближайшие заселения (Task 10). §5 formulas — `expected_receivables`, `unrecognized_received`, `capital_invested`/`personal_withdrawn`/`free_cash` all implemented per their literal formulas in Task 1, with the one considered extension (null `recognized_at` counted as unrecognized) explicitly disclosed in the migration comment and the plan's Global Constraints, not silently assumed. §7 "Этап 4" — this plan is exactly that phase.

**Placeholder scan:** none — every step has literal SQL/TSX or exact commands.

**Type consistency:** `DashboardSummary` (Task 7), `MonthlyPnlRow` (Task 8, matches `monthly_pnl_series`'s column list), `MoneyDistribution` (Task 9), `UpcomingCheckin` (Task 10) are each page-local interfaces matching their RPC function's `returns table (...)` column list exactly — same pattern Phase 3's report pages used, intentionally not added to `src/types/database.ts` since they describe RPC shapes, not persisted rows.

**Sequencing note:** Tasks 7-10 all modify the same file (`src/app/(app)/page.tsx`) incrementally — each task's brief shows only the delta relevant to that task (a `Promise.all` call added, a rendering block appended), assuming the prior task's edit is already in place. This mirrors how Phase 2's `DealForm`/`page.tsx` wiring and Phase 1's CRUD pages were built incrementally; an implementer working Task 8 needs to have Task 7's version of the file in front of them, which the dependency ordering guarantees.
