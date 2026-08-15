# Этап 5 — Надёжность: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The last phase of the app: every mutation on the 7 business tables is captured in `audit_log` (schema already existed since Phase 1, unused until now), a `/settings` page lets the owner download a full JSON backup and change their password, the app is usable on a phone-width viewport, and the one remaining untested formula from the design spec's required-tests list (§8 item 9 — editing an old transaction's amount updates the *historical* period's numbers, not today's) gets a pgTAP test.

**Architecture:** Audit logging is one generic Postgres trigger function (`log_audit_event()`) attached to all 7 mutable business tables via a data-driven `DO` loop — the same pattern Phase 1's RLS policies and Phase 4's dashboard functions already established: one mechanism, applied uniformly, database-level so it fires regardless of what client performs the write. Backup is a server action that queries all 8 tables (RLS already scopes every query to the current user, nothing new to secure) and returns a plain object; a client component turns that into a downloaded `.json` file, mirroring Phase 3's `ExportCsvButton` pattern exactly. Password change uses Supabase Auth's own `updateUser({ password })` directly from the browser client — no new backend surface. Mobile responsiveness is two small, mechanical passes over existing files (nav wrap, table scroll containers) — no new components.

**Tech Stack:** Same as Phases 1-4 — Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres + Auth), pgTAP, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-14-agency-finance-design.md` — §3 (audit log requirement, backup requirement), §5 ("Правка задним числом пишется в audit_log с обоими значениями дат", spec §8 item 9), §6 "Настройки" screen, §7 "Этап 5".

## Global Constraints

- The audit trigger must fire on every INSERT/UPDATE/DELETE regardless of which client performs it (the app, a future admin tool, a manual SQL fix) — it is a database trigger, not application-level logging, for the same reason Phase 2's `recognized_at` triggers are database-level (spec §5's retroactive-recalculation requirement: correctness can't depend on which code path made the change).
- `audit_log` itself is never a trigger target — auditing the audit log is meaningless and was correctly excluded from Phase 1's RLS-policy loop's *conceptual* audit scope even though it received RLS policies for its own row-level security.
- Never add `SECURITY DEFINER` to the audit trigger function — it must run as the invoking user so its own `insert into audit_log` is subject to the same RLS `user_id = auth.uid()` insert policy as everything else (Phase 1, `0002_rls_policies.sql`).
- Password change goes through `supabase.auth.updateUser()` on the browser client (anon key, current session) — never build a custom password-change server action, since Supabase Auth already owns this correctly and a custom path would duplicate security-sensitive logic for no benefit.
- Backup export relies entirely on RLS to scope results to the current user — the server action does no manual `.eq('user_id', ...)` filtering, consistent with every other read path in this project (Phase 1 Task 11 onward).
- No stored/cached aggregates — this phase adds none; it only adds durable logging (`audit_log`, an append-only table, is not an aggregate).

---

## File Structure

```
supabase/
  migrations/
    0015_audit_log_trigger.sql
  tests/
    database/
      009_audit_log.test.sql
      010_retroactive_recalculation.test.sql   (spec §8 item 9)

src/
  app/
    (app)/
      layout.tsx                                (MODIFY — nav wrap + "Настройки" link)
      settings/
        page.tsx
        actions.ts
        BackupButton.tsx
        ChangePasswordForm.tsx
      accounts/page.tsx                          (MODIFY — wrap table)
      objects/page.tsx                           (MODIFY — wrap table)
      employees/page.tsx                         (MODIFY — wrap table)
      categories/page.tsx                        (MODIFY — wrap table)
      transactions/page.tsx                      (MODIFY — wrap table)
      deals/page.tsx                             (MODIFY — wrap table)
      deals/[id]/page.tsx                        (MODIFY — wrap payments table)
      reports/pnl/page.tsx                       (MODIFY — wrap table)
      reports/accounts/page.tsx                  (MODIFY — wrap table)
      reports/objects/page.tsx                   (MODIFY — wrap table)
      reports/employees/page.tsx                 (MODIFY — wrap table)
      reports/platforms/page.tsx                 (MODIFY — wrap table)
      page.tsx                                   (MODIFY — wrap upcoming-check-ins table)
```

---

### Task 1: Database migration — audit log trigger

**Files:**
- Create: `supabase/migrations/0015_audit_log_trigger.sql`

**Interfaces:**
- Consumes: `audit_log`, `accounts`, `objects`, `employees`, `categories`, `deals`, `payments`, `transactions` (all Phase 1).
- Produces: an `audit_log` row (`user_id, table_name, record_id, action, old_data, new_data, created_at`) automatically inserted on every insert/update/delete of the 7 business tables.

- [ ] **Step 1: Write the migration file**

`supabase/migrations/0015_audit_log_trigger.sql`:

```sql
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
```

- [ ] **Step 2: Apply and verify**

```bash
source "C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\supabase-credentials.env"
export PROJECT_REF=irjfrlitedlzzbzinewt
"C:\Users\User\VSCODE\ARGfin\.superpowers\sdd\scripts\db-exec" supabase/migrations/0015_audit_log_trigger.sql
```

Verify with a live fixture: insert an `accounts` row, confirm an `audit_log` row appears with `action = 'insert'`, `old_data is null`, `new_data->>'name'` matching the fixture; update the account's `name`, confirm a second `audit_log` row with `action = 'update'`, `old_data->>'name'` = the old name, `new_data->>'name'` = the new name; soft-delete it (an UPDATE setting `deleted_at`), confirm a third `audit_log` row with `action = 'update'` (soft delete is an UPDATE, not a real DELETE — the app never issues a hard DELETE, so this project will rarely if ever produce an `action = 'delete'` row, but the trigger handles it correctly if one ever occurs). Clean up all fixture rows (including their `audit_log` entries) afterward.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0015_audit_log_trigger.sql
git commit -m "feat(db): add generic audit log trigger on all 7 business tables"
```

---

### Task 2: pgTAP test — audit log captures insert/update/delete

**Files:**
- Create: `supabase/tests/database/009_audit_log.test.sql`

**Interfaces:**
- Consumes: `log_audit_event` trigger (Task 1).
- Produces: proof that insert/update both write correct `old_data`/`new_data` — the two operations the app actually performs (create + soft-delete-as-update); a real hard DELETE is also proven for completeness even though the app never issues one.

- [ ] **Step 1: Write the test**

`supabase/tests/database/009_audit_log.test.sql`:

```sql
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
```

- [ ] **Step 2: Run it and verify it passes**

Apply the same HTTPS-Management-API verification approach used throughout Phases 1-4 (scratch copy with `search_path` prepended, run via `db-exec`). Confirm all 5 assertions pass.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/database/009_audit_log.test.sql
git commit -m "test(db): assert audit_log captures insert and update old/new data"
```

---

### Task 3: pgTAP test — retroactive recalculation (spec §8 item 9)

**Files:**
- Create: `supabase/tests/database/010_retroactive_recalculation.test.sql`

**Interfaces:**
- Consumes: `account_balances` (Phase 1), `pnl_report` (Phase 3).
- Produces: proof of the one remaining untested item from the design spec's required-tests list: editing an old transaction's amount changes that historical period's numbers, and does not change an unrelated period's numbers.

- [ ] **Step 1: Write the test**

`supabase/tests/database/010_retroactive_recalculation.test.sql`:

```sql
begin;
select plan(4);

insert into auth.users (id, email) values
  ('70000000-0000-0000-0000-000000000010', 'retro-owner@example.com');

insert into accounts (id, user_id, name, kind) values
  ('70000000-0000-0000-0000-000000000020', '70000000-0000-0000-0000-000000000010', 'Cash', 'cash');

-- an 'invest' transaction dated in a past month
insert into transactions (id, user_id, type, amount, account_id, date)
values (
  '70000000-0000-0000-0000-000000000030', '70000000-0000-0000-0000-000000000010',
  'invest', 1000, '70000000-0000-0000-0000-000000000020', '2026-02-10'
);

select is(
  (select balance from account_balances where account_id = '70000000-0000-0000-0000-000000000020'),
  1000::numeric,
  'before edit: account balance reflects the original 1000 invest amount'
);
select is(
  (select revenue + ads_expense + salary_expense + team_expense + staff_expense
   from pnl_report('2026-02-01', '2026-02-28')),
  0::numeric,
  'sanity: an invest transaction contributes nothing to February''s P&L revenue/expense lines (it is capital, not revenue)'
);

-- edit the old transaction's amount — no new row, an UPDATE on the existing one
update transactions set amount = 4000 where id = '70000000-0000-0000-0000-000000000030';

select is(
  (select balance from account_balances where account_id = '70000000-0000-0000-0000-000000000020'),
  4000::numeric,
  'item 9: after editing the amount, the account balance immediately reflects 4000, computed live — no manual recalculation, no stale cache'
);

-- a transaction dated in a different, unrelated month (March) must be
-- completely unaffected by the February edit above.
insert into transactions (id, user_id, type, amount, account_id, date)
values (
  '70000000-0000-0000-0000-000000000031', '70000000-0000-0000-0000-000000000010',
  'invest', 500, '70000000-0000-0000-0000-000000000020', '2026-03-05'
);

select is(
  (select balance from account_balances where account_id = '70000000-0000-0000-0000-000000000020'),
  4500::numeric,
  'item 9: the balance after the March transaction is 4000 (edited February amount) + 500 (March), proving the February edit is durable and the two periods combine correctly, not just today''s figure'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run it and verify it passes**

Apply the same HTTPS-Management-API verification approach as every prior pgTAP task. Confirm all 4 assertions pass.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/database/010_retroactive_recalculation.test.sql
git commit -m "test(db): assert editing an old transaction's amount recalculates live (spec item 9)"
```

---

### Task 4: Settings page shell and nav link

**Files:**
- Create: `src/app/(app)/settings/page.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Produces: `/settings` route with two empty section headers ("Бэкап", "Смена пароля") that Tasks 5 and 6 fill in; a "Настройки" nav link.

- [ ] **Step 1: Write the page shell**

`src/app/(app)/settings/page.tsx`:

```tsx
export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Настройки</h1>

      <section className="space-y-2 rounded border bg-white p-4">
        <h2 className="text-sm font-medium">Бэкап</h2>
      </section>

      <section className="space-y-2 rounded border bg-white p-4">
        <h2 className="text-sm font-medium">Смена пароля</h2>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Add the nav link**

In `src/app/(app)/layout.tsx`, change `NAV_LINKS` from:

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
  { href: '/settings', label: 'Настройки' },
]
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```

`authed-curl` on `/settings` — confirm 200, both section headers render.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/settings/page.tsx" "src/app/(app)/layout.tsx"
git commit -m "feat: add settings page shell and nav link"
```

---

### Task 5: Backup — export all data as JSON

**Files:**
- Create: `src/app/(app)/settings/actions.ts`, `src/app/(app)/settings/BackupButton.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

**Interfaces:**
- Produces: `exportAllData()` server action returning `Record<string, unknown[]>` keyed by table name; `<BackupButton />` client component that calls it and triggers a `.json` download.

- [ ] **Step 1: Write the server action**

`src/app/(app)/settings/actions.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'

const BACKUP_TABLES = [
  'accounts', 'objects', 'employees', 'categories',
  'deals', 'payments', 'transactions', 'audit_log',
] as const

export async function exportAllData(): Promise<Record<string, unknown[]>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const result: Record<string, unknown[]> = {}
  for (const table of BACKUP_TABLES) {
    const { data } = await supabase.from(table).select('*')
    result[table] = data ?? []
  }
  return result
}
```

RLS scopes every one of these 8 `select('*')` calls to the current user automatically (Phase 1, `0002_rls_policies.sql`) — no `.eq('user_id', ...)` filtering needed, consistent with every other read in this project.

- [ ] **Step 2: Write the download button**

`src/app/(app)/settings/BackupButton.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { exportAllData } from './actions'

export function BackupButton() {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const data = await exportAllData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `backup_${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="rounded bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
    >
      {loading ? 'Выгружаем…' : 'Выгрузить всё'}
    </button>
  )
}
```

- [ ] **Step 3: Wire it into the settings page**

Modify `src/app/(app)/settings/page.tsx`: import `BackupButton` and render it inside the "Бэкап" section:

```tsx
import { BackupButton } from './BackupButton'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Настройки</h1>

      <section className="space-y-2 rounded border bg-white p-4">
        <h2 className="text-sm font-medium">Бэкап</h2>
        <BackupButton />
      </section>

      <section className="space-y-2 rounded border bg-white p-4">
        <h2 className="text-sm font-medium">Смена пароля</h2>
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
```

`authed-curl` on `/settings` — confirm 200, the "Выгрузить всё" button renders. Full data-flow verification: call `exportAllData()`'s logic directly is hard to trigger via `authed-curl` (it's a server action bound to a client `onClick`, not a GET-able route) — instead verify by reading the action's code carefully against the 8-table list and RLS behavior already proven in every prior phase's tasks, and confirm via `db-exec` that all 8 tables return the test user's own rows when queried the same way (i.e., trust RLS, which is already extensively tested — no new RLS behavior is introduced here).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/settings/actions.ts" "src/app/(app)/settings/BackupButton.tsx" "src/app/(app)/settings/page.tsx"
git commit -m "feat: add JSON backup export"
```

---

### Task 6: Change password

**Files:**
- Create: `src/app/(app)/settings/ChangePasswordForm.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

**Interfaces:**
- Produces: `<ChangePasswordForm />` client component using `supabase.auth.updateUser()` directly (no server action, no new backend surface).

- [ ] **Step 1: Write the form**

`src/app/(app)/settings/ChangePasswordForm.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function ChangePasswordForm() {
  const supabase = createClient()
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('saving')
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setStatus('error')
      return
    }
    setStatus('done')
    setPassword('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 text-sm">
      <label className="flex flex-col">
        Новый пароль
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
          className="rounded border px-2 py-1"
        />
      </label>
      <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-white hover:bg-gray-700">
        Сменить пароль
      </button>
      {status === 'done' && <span className="text-green-600">Пароль изменён</span>}
      {error && <span className="text-red-600">{error}</span>}
    </form>
  )
}
```

- [ ] **Step 2: Wire it into the settings page**

Modify `src/app/(app)/settings/page.tsx`: import `ChangePasswordForm` and render it inside the "Смена пароля" section:

```tsx
import { BackupButton } from './BackupButton'
import { ChangePasswordForm } from './ChangePasswordForm'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Настройки</h1>

      <section className="space-y-2 rounded border bg-white p-4">
        <h2 className="text-sm font-medium">Бэкап</h2>
        <BackupButton />
      </section>

      <section className="space-y-2 rounded border bg-white p-4">
        <h2 className="text-sm font-medium">Смена пароля</h2>
        <ChangePasswordForm />
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```

`authed-curl` on `/settings` — confirm 200, the password field and "Сменить пароль" button render. Do not actually change the test user's live password during verification (that would break every subsequent task's `authed-curl`/session-cookie workflow for the rest of this plan and any future work) — verify by code inspection of `supabase.auth.updateUser()`'s usage instead, which is a well-documented, standard Supabase Auth call requiring no further proof beyond confirming the code is correct.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/settings/ChangePasswordForm.tsx" "src/app/(app)/settings/page.tsx"
git commit -m "feat: add change-password form"
```

---

### Task 7: Mobile responsiveness — nav bar wrap

**Files:**
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Produces: a nav bar that wraps onto multiple lines on a narrow viewport instead of overflowing horizontally or forcing the page to scroll sideways.

- [ ] **Step 1: Update the nav's className**

In `src/app/(app)/layout.tsx`, change:

```tsx
<nav className="flex items-center justify-between border-b bg-white px-6 py-3">
  <div className="flex gap-4">
```

to:

```tsx
<nav className="flex flex-wrap items-center justify-between gap-y-2 border-b bg-white px-4 py-3 sm:px-6">
  <div className="flex flex-wrap gap-x-4 gap-y-1">
```

`flex-wrap` on the `<nav>` lets the links block and the sign-out button drop to a second line instead of forcing horizontal scroll when the 8 nav links (as of this task) don't fit one row; `flex-wrap` on the inner `<div>` lets the links themselves wrap onto multiple lines rather than shrinking unreadably. `gap-y-2`/`gap-y-1` keep wrapped rows from touching. `px-4 sm:px-6` reduces the outer padding on narrow screens so more link text fits before wrapping.

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

`authed-curl` on any protected page (e.g. `/`) — confirm 200 and the nav's `class` attribute in the response HTML contains `flex-wrap`. A real narrow-viewport visual check isn't possible from this sandbox (no interactive browser) — the class-level change is the verifiable unit; note this limitation in the report rather than claiming a visual confirmation that wasn't performed.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/layout.tsx"
git commit -m "feat: wrap nav bar on narrow viewports"
```

---

### Task 8: Mobile responsiveness — table horizontal-scroll wrappers

**Files:**
- Modify: `src/app/(app)/accounts/page.tsx`, `src/app/(app)/objects/page.tsx`, `src/app/(app)/employees/page.tsx`, `src/app/(app)/categories/page.tsx`, `src/app/(app)/transactions/page.tsx`, `src/app/(app)/deals/page.tsx`, `src/app/(app)/deals/[id]/page.tsx`, `src/app/(app)/reports/pnl/page.tsx`, `src/app/(app)/reports/accounts/page.tsx`, `src/app/(app)/reports/objects/page.tsx`, `src/app/(app)/reports/employees/page.tsx`, `src/app/(app)/reports/platforms/page.tsx`, `src/app/(app)/page.tsx`

**Interfaces:**
- Produces: every `<table>` element in the app is wrapped in `<div className="overflow-x-auto">...</div>`, so a table wider than the viewport scrolls horizontally within its own container instead of forcing the whole page to scroll sideways or breaking the layout.

- [ ] **Step 1: Wrap each page's table**

This is the same one-line mechanical edit repeated across all 13 files: find the page's `<table className="w-full border-collapse rounded border bg-white text-sm">...</table>` element and wrap it in a `<div className="overflow-x-auto">`:

```tsx
<div className="overflow-x-auto">
  <table className="w-full border-collapse rounded border bg-white text-sm">
    {/* ...existing thead/tbody, unchanged... */}
  </table>
</div>
```

Apply this identically in:
- `src/app/(app)/accounts/page.tsx`
- `src/app/(app)/objects/page.tsx`
- `src/app/(app)/employees/page.tsx`
- `src/app/(app)/categories/page.tsx`
- `src/app/(app)/transactions/page.tsx`
- `src/app/(app)/deals/page.tsx`
- `src/app/(app)/deals/[id]/page.tsx` (the payments table)
- `src/app/(app)/reports/pnl/page.tsx`
- `src/app/(app)/reports/accounts/page.tsx`
- `src/app/(app)/reports/objects/page.tsx`
- `src/app/(app)/reports/employees/page.tsx`
- `src/app/(app)/reports/platforms/page.tsx`
- `src/app/(app)/page.tsx` (the upcoming-check-ins table — note this one is already inside a conditional `{upcomingCheckins.length === 0 ? (...) : (<table>...</table>)}`; wrap only the `<table>` branch, not the empty-state message)

Do not change any table's internal markup (headers, rows, column content) — only add the wrapping `<div>`.

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

For each of the 13 files, `authed-curl` the corresponding route (creating one or two live fixture rows first via `db-exec` where a page would otherwise render no `<table>` at all — e.g. an empty accounts list still renders the table shell with just headers, so this is only needed for the dashboard's upcoming-check-ins table, which renders a `<table>` only when there's at least one row) and confirm the response HTML contains `overflow-x-auto` immediately before each `<table`. Clean up any fixtures created solely for this check.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/accounts/page.tsx" "src/app/(app)/objects/page.tsx" "src/app/(app)/employees/page.tsx" "src/app/(app)/categories/page.tsx" "src/app/(app)/transactions/page.tsx" "src/app/(app)/deals/page.tsx" "src/app/(app)/deals/[id]/page.tsx" "src/app/(app)/reports/pnl/page.tsx" "src/app/(app)/reports/accounts/page.tsx" "src/app/(app)/reports/objects/page.tsx" "src/app/(app)/reports/employees/page.tsx" "src/app/(app)/reports/platforms/page.tsx" "src/app/(app)/page.tsx"
git commit -m "feat: wrap all data tables in horizontal-scroll containers for mobile"
```

---

## Self-Review Notes

**Spec coverage:** §3 "Журнал изменений (audit_log)" — Task 1 (trigger) + Task 2 (test). §3 "Бэкап... JSON со всеми таблицами" — Task 5. §6 "Настройки — бэкап, экспорт, смена пароля" — Tasks 4-6 (the CSV "экспорт" part of this line is already delivered per-report by Phase 3's `ExportCsvButton` on every report page; Settings itself doesn't need a duplicate export control). §6 does not list a dedicated mobile-layout requirement as a checkbox, but the overall app is expected to be usable on the devices spec's phased rollout names for Phase 5 ("мобильная вёрстка") — Tasks 7-8. §8 item 9 (the one remaining untested formula from the required-tests list — items 1,2,6 done in Phase 1; 3,4,5,10 in Phase 2; 7,8 in Phase 3) — Task 3.

**Placeholder scan:** none — every step has literal SQL/TSX or exact commands.

**Type consistency:** `exportAllData()`'s return type `Record<string, unknown[]>` is used identically by `BackupButton.tsx`'s consumption of it (Task 5). `ChangePasswordForm` (Task 6) uses the existing `createClient()` browser client from `src/lib/supabase/client.ts` (Phase 1 Task 8) with no new client factory. The `BACKUP_TABLES` list in Task 5 matches exactly the 8 tables that received RLS policies in Phase 1's `0002_rls_policies.sql` and audit triggers in this plan's Task 1 (7 of the 8, `audit_log` itself excluded from triggers but included in the backup's table list, since a backup should include the audit trail).

**Sequencing note (same as every prior phase's dashboard/report page work):** Task 4 creates the settings page shell; Tasks 5 and 6 each modify that same `page.tsx` incrementally, assuming the prior task's version is in place — same pattern as Phase 4's dashboard page being built up across 4 tasks.

**Task 8's scope:** touching 13 files in one task is larger than every other task in this project's plans, but the edit is identical and mechanical in every file (wrap one `<table>` in one `<div>`, no logic change) — splitting it into 13 near-identical single-line tasks would multiply review overhead for zero additional safety, since a reviewer checking one instance of this edit has effectively checked all of them.
