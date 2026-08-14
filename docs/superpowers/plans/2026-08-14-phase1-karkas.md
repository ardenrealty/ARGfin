# Этап 1 — Каркас: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Working Next.js + Supabase skeleton: full DB schema with RLS on every table, email/password auth gating every route, CRUD for the four directories (accounts, objects, employees, categories), CRUD for generic transactions (операции), and a live account-balance view — all backed by pgTAP tests that prove RLS is enforced and the balance formula is correct.

**Architecture:** Next.js App Router (TypeScript) talks to Supabase Postgres through `@supabase/ssr` clients — a browser client for client components, a cookie-based server client for server components/actions, both using only the `anon` key. All business tables carry `user_id` + RLS policies scoped to `auth.uid()`. All money aggregation (`account_balances`) lives in a Postgres view with `security_invoker = true` so it inherits the caller's RLS, never in application code. Soft delete (`deleted_at`) everywhere; no hard deletes.

**Tech Stack:** Next.js 14 (App Router) + TypeScript + Tailwind CSS, Supabase (Postgres, Auth, CLI for local dev/migrations), `@supabase/ssr`, `@supabase/supabase-js`, pgTAP (via `supabase test db`), Vitest.

## Global Constraints

- RLS must be enabled on every table; the build/test suite must fail if any table has `relrowsecurity = false` (spec §3).
- Only the `anon` key is ever sent to the browser. `service_role` key stays server-side only, in `.env.local`, never committed (spec §3).
- No physical deletes anywhere — every mutating delete sets `deleted_at`; every read filters `deleted_at is null` (spec §3, §5).
- No stored/cached balances — `account_balances` is a Postgres view computed on read (spec §5).
- All dates are user-editable, default to today, never blocked from being set in the past or future (spec §5) — applies to `transactions.date` in this phase.
- `amount` columns store positive magnitudes; direction/sign comes from `type`, never from the stored number (spec §4 sign column).

---

## File Structure

```
package.json
tsconfig.json
tailwind.config.ts
next.config.mjs
.env.local                      (gitignored — Supabase URL + anon key)
.gitignore
vitest.config.ts

supabase/
  config.toml
  migrations/
    0001_init_schema.sql        (all tables, soft delete columns)
    0002_rls_policies.sql       (RLS enable + policies, all tables)
    0003_account_balances_view.sql
  tests/
    database/
      001_rls_enabled.test.sql
      002_account_balances.test.sql

src/
  types/
    database.ts                 (hand-written row types for phase-1 tables)
  lib/
    supabase/
      client.ts                 (browser client)
      server.ts                 (server client, cookie-based)
    dates.ts                    (date-staleness helper + its Vitest test)
  middleware.ts                 (session gate on every route except /login)
  app/
    login/
      page.tsx
    (app)/
      layout.tsx                (nav shell, protected by middleware)
      page.tsx                  (placeholder home -> links to sections)
      accounts/
        page.tsx
        actions.ts
        AccountForm.tsx
      objects/
        page.tsx
        actions.ts
        ObjectForm.tsx
      employees/
        page.tsx
        actions.ts
        EmployeeForm.tsx
      categories/
        page.tsx
        actions.ts
        CategoryForm.tsx
      transactions/
        page.tsx
        actions.ts
        TransactionForm.tsx
```

---

### Task 1: Scaffold Next.js project with TypeScript + Tailwind

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.mjs`, `postcss.config.js`, `.gitignore`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`

**Interfaces:**
- Produces: a running `npm run dev` Next.js app on `localhost:3000` with Tailwind processing `src/**/*.{ts,tsx}`.

- [ ] **Step 1: Initialize git repo and Next.js app**

```bash
cd "C:\Users\User\VSCODE\ARGfin"
git init
npx create-next-app@latest . --typescript --tailwind --app --src-dir --no-eslint --import-alias "@/*" --use-npm
```

When prompted, accept defaults (App Router: yes, `src/` directory: yes).

- [ ] **Step 2: Write `.gitignore` additions**

Append to the generated `.gitignore` (create if `create-next-app` didn't):

```
.env.local
.env*.local
supabase/.branches
supabase/.temp
```

- [ ] **Step 3: Verify dev server boots**

Run: `npm run dev -- --port 3000 &` then `curl -s http://localhost:3000 | head -c 200`
Expected: HTML output starting with `<!DOCTYPE html>`. Stop the dev server after checking.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with TypeScript and Tailwind"
```

---

### Task 2: Install and configure Supabase (CLI + client libraries)

**Files:**
- Create: `supabase/config.toml` (via CLI init), `.env.local`, `.env.local.example`
- Modify: `package.json` (add scripts)

**Interfaces:**
- Produces: local Supabase stack reachable via `supabase start`; `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` available to the app.

- [ ] **Step 1: Install Supabase JS libraries**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D supabase vitest @vitejs/plugin-react
```

- [ ] **Step 2: Initialize Supabase project config**

```bash
npx supabase init
```

This creates `supabase/config.toml` and `supabase/migrations/`.

- [ ] **Step 3: Start local Supabase stack**

```bash
npx supabase start
```

Expected: output lists `API URL`, `anon key`, `service_role key`. Copy the `API URL` and `anon key`.

- [ ] **Step 4: Write `.env.local` and `.env.local.example`**

`.env.local` (fill with values from Step 3 output — never commit this file):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-from-supabase-start>
```

`.env.local.example` (committed, no real values):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 5: Add `db:test` script to `package.json`**

In `package.json`, inside `"scripts"`:

```json
"db:test": "supabase test db"
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: add Supabase CLI and client libraries"
```

---

### Task 3: Database migration — full schema

**Files:**
- Create: `supabase/migrations/0001_init_schema.sql`

**Interfaces:**
- Produces: tables `accounts`, `objects`, `employees`, `categories`, `deals`, `payments`, `transactions`, `audit_log`, all with `user_id uuid references auth.users(id)` and `deleted_at timestamptz` (except `audit_log`, which is append-only and has no `deleted_at`).

- [ ] **Step 1: Write the migration file**

`supabase/migrations/0001_init_schema.sql`:

```sql
-- accounts
create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null,
  kind text not null check (kind in ('bank','cash','card')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- objects
create table objects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  title text not null,
  address text,
  type text,
  owner_name text,
  owner_contact text,
  default_commission_pct numeric,
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- employees
create table employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null,
  role text,
  payout_scheme text not null check (payout_scheme in ('fixed','percent','mixed')),
  base_salary numeric,
  percent_rate numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- categories
create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null,
  "group" text not null check ("group" in ('ads','team','staff','personal')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- deals (schema only in this phase; CRUD UI comes in Phase 2)
create table deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  object_id uuid references objects(id),
  client_name text not null,
  client_phone text,
  booking_date date not null default current_date,
  checkin_date date,
  checkout_date date,
  deal_amount numeric not null,
  commission_pct numeric,
  commission_amount numeric,
  source text check (source in ('avito','cian','recommend','other')),
  closed_by_employee_id uuid references employees(id),
  status text not null default 'booked'
    check (status in ('booked','prepaid','checked_in','completed','cancelled')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- payments (schema only in this phase; CRUD UI comes in Phase 2)
create table payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  deal_id uuid not null references deals(id),
  kind text not null check (kind in ('prepay','balance','full')),
  amount numeric not null check (amount > 0),
  paid_at date not null default current_date,
  recognized_at date,
  account_id uuid not null references accounts(id),
  note text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- transactions (full CRUD in this phase)
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  date date not null default current_date,
  type text not null check (type in
    ('invest','other_income','ads','team','salary','staff_expense','personal','transfer')),
  amount numeric not null check (amount > 0),
  account_id uuid not null references accounts(id),
  account_to_id uuid references accounts(id),
  category_id uuid references categories(id),
  employee_id uuid references employees(id),
  object_id uuid references objects(id),
  platform text,
  period_start date,
  period_end date,
  is_general boolean,
  note text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint transfer_requires_account_to
    check (type <> 'transfer' or account_to_id is not null),
  constraint only_transfer_has_account_to
    check (type = 'transfer' or account_to_id is null)
);

-- audit_log (append-only; trigger wiring happens in Phase 5)
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert','update','delete')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

-- seed default expense categories (group = team) for new users happens at
-- signup time in application code (Task 9), not here — this table has no
-- rows until a user exists.
```

- [ ] **Step 2: Apply migration locally and verify**

```bash
npx supabase db reset
```

Expected: output ends with `Finished supabase db reset` and no errors. This re-runs all migrations against the local DB.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_init_schema.sql
git commit -m "feat(db): add full schema for phase 1-2 tables"
```

---

### Task 4: Database migration — RLS enable + policies

**Files:**
- Create: `supabase/migrations/0002_rls_policies.sql`

**Interfaces:**
- Consumes: tables from Task 3.
- Produces: `select/insert/update/delete` policies scoped to `user_id = auth.uid()` on every table from Task 3.

- [ ] **Step 1: Write the migration file**

`supabase/migrations/0002_rls_policies.sql`:

```sql
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
```

Note: `audit_log` gets the same four policies for now (update/delete policies exist but the application never calls them — Phase 5 can revoke update/delete on `audit_log` explicitly if it wants append-only enforcement at the DB level).

- [ ] **Step 2: Apply and verify**

```bash
npx supabase db reset
```

Expected: `Finished supabase db reset`, no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0002_rls_policies.sql
git commit -m "feat(db): enable RLS and add per-user policies on all tables"
```

---

### Task 5: pgTAP test — RLS is enabled on every table (build gate)

**Files:**
- Create: `supabase/tests/database/001_rls_enabled.test.sql`

**Interfaces:**
- Consumes: `supabase test db` (pgTAP runner bundled with Supabase CLI).
- Produces: a test that fails the suite if any of the 8 tables has RLS disabled.

- [ ] **Step 1: Write the failing test first (before trusting migration 0002)**

`supabase/tests/database/001_rls_enabled.test.sql`:

```sql
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
```

Every assertion is qualified with `relnamespace = 'public'::regnamespace` because Supabase provisions its own `storage.objects` table on every project — an unqualified `relname = 'objects'` match returns two rows (`public.objects` and `storage.objects`) and pgTAP's `ok()` errors on the ambiguous subquery. The other seven table names don't currently collide with a system schema, but qualifying all eight keeps the test robust against future Supabase-managed schemas reusing a name.

- [ ] **Step 2: Run it and verify it passes (proves Task 4's migration worked)**

```bash
npm run db:test
```

Expected: `# Looks like you passed 8 tests` (or equivalent pgTAP summary), 0 failures. If any table shows `not ok`, stop and fix migration 0002 before continuing — do not proceed to Task 6 with a red test.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/database/001_rls_enabled.test.sql
git commit -m "test(db): assert RLS is enabled on every table"
```

---

### Task 6: Database migration — `account_balances` view

**Files:**
- Create: `supabase/migrations/0003_account_balances_view.sql`

**Interfaces:**
- Consumes: `accounts`, `payments`, `transactions` (Task 3).
- Produces: view `account_balances(account_id uuid, user_id uuid, name text, balance numeric)`, RLS-aware via `security_invoker`.

- [ ] **Step 1: Write the migration file**

`supabase/migrations/0003_account_balances_view.sql`:

```sql
create view account_balances
with (security_invoker = true) as
select
  a.id as account_id,
  a.user_id,
  a.name,
  coalesce(pay.total, 0)
    + coalesce(txn_in.total, 0)
    - coalesce(txn_out.total, 0)
    - coalesce(transfer_out.total, 0)
    + coalesce(transfer_in.total, 0)
  as balance
from accounts a
left join (
  select account_id, sum(amount) as total
  from payments
  where deleted_at is null
  group by account_id
) pay on pay.account_id = a.id
left join (
  select account_id, sum(amount) as total
  from transactions
  where deleted_at is null and type in ('invest','other_income')
  group by account_id
) txn_in on txn_in.account_id = a.id
left join (
  select account_id, sum(amount) as total
  from transactions
  where deleted_at is null and type in ('ads','team','salary','staff_expense','personal')
  group by account_id
) txn_out on txn_out.account_id = a.id
left join (
  select account_id, sum(amount) as total
  from transactions
  where deleted_at is null and type = 'transfer'
  group by account_id
) transfer_out on transfer_out.account_id = a.id
left join (
  select account_to_id as account_id, sum(amount) as total
  from transactions
  where deleted_at is null and type = 'transfer'
  group by account_to_id
) transfer_in on transfer_in.account_id = a.id
where a.deleted_at is null;
```

`security_invoker = true` is required (Postgres 15+, which Supabase ships) so the view enforces the *querying* user's RLS policies on `accounts`/`payments`/`transactions`, not the view owner's — without it, RLS on the underlying tables would be silently bypassed through the view.

Each aggregation runs in its own subquery before joining, to avoid a fan-out (a naive single join of `payments` and `transactions` on `account_id` would multiply rows and double-count sums whenever an account has both payment and transaction rows).

- [ ] **Step 2: Apply and verify it builds**

```bash
npx supabase db reset
```

Expected: `Finished supabase db reset`, no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0003_account_balances_view.sql
git commit -m "feat(db): add account_balances view (security_invoker, no stored state)"
```

---

### Task 7: pgTAP test — account balance formula

**Files:**
- Create: `supabase/tests/database/002_account_balances.test.sql`

**Interfaces:**
- Consumes: `account_balances` view (Task 6).
- Produces: fixture-based proof of spec §8 items 1, 2, 6 (invest increases balance without touching profit — profit isn't computed until Phase 2/3, so this test only asserts the balance side; personal decreases balance; transfer nets to zero across accounts and doesn't change the total).

- [ ] **Step 1: Write the test**

`supabase/tests/database/002_account_balances.test.sql`:

```sql
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
```

- [ ] **Step 2: Run it and verify it passes**

```bash
npm run db:test
```

Expected: all tests in both files pass (`001_rls_enabled` + `002_account_balances`), 0 failures.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/database/002_account_balances.test.sql
git commit -m "test(db): assert account_balances formula for invest/personal/transfer"
```

---

### Task 8: Supabase client helpers (browser + server) and hand-written row types

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/types/database.ts`

**Interfaces:**
- Produces: `createClient()` (browser, from `src/lib/supabase/client.ts`) and `createClient()` (server, async, from `src/lib/supabase/server.ts`) — both return a `SupabaseClient`. Row types `Account`, `ObjectRecord`, `Employee`, `Category`, `Transaction` exported from `src/types/database.ts`, consumed by every CRUD task below.

- [ ] **Step 1: Write row types**

`src/types/database.ts`:

```typescript
export interface Account {
  id: string
  user_id: string
  name: string
  kind: 'bank' | 'cash' | 'card'
  is_active: boolean
  created_at: string
  deleted_at: string | null
}

export interface ObjectRecord {
  id: string
  user_id: string
  title: string
  address: string | null
  type: string | null
  owner_name: string | null
  owner_contact: string | null
  default_commission_pct: number | null
  is_active: boolean
  note: string | null
}

export interface Employee {
  id: string
  user_id: string
  name: string
  role: string | null
  payout_scheme: 'fixed' | 'percent' | 'mixed'
  base_salary: number | null
  percent_rate: number | null
  is_active: boolean
}

export interface Category {
  id: string
  user_id: string
  name: string
  group: 'ads' | 'team' | 'staff' | 'personal'
}

export type TransactionType =
  | 'invest' | 'other_income' | 'ads' | 'team'
  | 'salary' | 'staff_expense' | 'personal' | 'transfer'

export interface Transaction {
  id: string
  user_id: string
  date: string
  type: TransactionType
  amount: number
  account_id: string
  account_to_id: string | null
  category_id: string | null
  employee_id: string | null
  object_id: string | null
  platform: string | null
  period_start: string | null
  period_end: string | null
  is_general: boolean | null
  note: string | null
}

export interface AccountBalance {
  account_id: string
  user_id: string
  name: string
  balance: number
}
```

- [ ] **Step 2: Write browser client**

`src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: Write server client**

`src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll called from a Server Component; middleware refreshes
            // the session instead, so this is safe to ignore.
          }
        },
      },
    }
  )
}
```

- [ ] **Step 4: Verify it type-checks**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase src/types/database.ts
git commit -m "feat: add Supabase browser/server clients and row types"
```

---

### Task 9: Auth — login page and session middleware

**Files:**
- Create: `src/app/login/page.tsx`, `src/middleware.ts`

**Interfaces:**
- Consumes: `createClient()` from `src/lib/supabase/client.ts` and `src/lib/supabase/server.ts`.
- Produces: any request to a path other than `/login` (or Next internals) without a session redirects to `/login`; a valid login redirects to `/`.

- [ ] **Step 1: Write the login page**

`src/app/login/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-6 shadow-sm"
      >
        <h1 className="text-lg font-semibold">Вход</h1>
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border px-3 py-2"
        />
        <input
          type="password"
          required
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          className="w-full rounded bg-gray-900 px-3 py-2 text-white hover:bg-gray-700"
        >
          Войти
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Write the middleware**

`src/middleware.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isLoginPage = request.nextUrl.pathname === '/login'

  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
```

- [ ] **Step 3: Create the test user and verify the gate manually**

```bash
npx supabase auth admin create-user --email owner@example.com --password "test-password-123" --local
```

If that CLI subcommand isn't available in your installed Supabase CLI version, create the user via the local Studio UI at `http://127.0.0.1:54323` → Authentication → Add user instead.

```bash
npm run dev &
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/accounts
```

Expected: `307` with a redirect to `/login` (no session yet — `accounts` route doesn't exist as a page until Task 11, but the middleware still redirects before Next.js 404s). Stop the dev server after checking.

- [ ] **Step 4: Commit**

```bash
git add src/app/login src/middleware.ts
git commit -m "feat(auth): add login page and session-gating middleware"
```

---

### Task 10: Protected app shell (nav layout)

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`
- Modify: `src/app/page.tsx` (delete — replaced by the `(app)` route group's `page.tsx`), `src/app/layout.tsx` (keep as root HTML shell)

**Interfaces:**
- Produces: a nav bar with links to `/accounts`, `/objects`, `/employees`, `/categories`, `/transactions`, plus a "Выйти" (sign out) button, wrapping every page created in Tasks 11–15.

- [ ] **Step 1: Remove the default home page (moving it into the route group)**

```bash
rm "src/app/page.tsx"
```

- [ ] **Step 2: Write the protected layout**

`src/app/(app)/layout.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const NAV_LINKS = [
  { href: '/accounts', label: 'Счета' },
  { href: '/objects', label: 'Объекты' },
  { href: '/employees', label: 'Сотрудники' },
  { href: '/categories', label: 'Категории' },
  { href: '/transactions', label: 'Операции' },
]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  async function signOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex gap-4">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm text-gray-700 hover:text-gray-900">
              {link.label}
            </Link>
          ))}
        </div>
        <form action={signOut}>
          <button type="submit" className="text-sm text-gray-500 hover:text-gray-900">
            Выйти
          </button>
        </form>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Write the home placeholder**

`src/app/(app)/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <div>
      <h1 className="text-xl font-semibold">Дашборд</h1>
      <p className="mt-2 text-sm text-gray-500">
        Появится в Этапе 4. Пока используйте навигацию сверху.
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Verify the app boots and redirects correctly**

```bash
npm run dev &
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
```

Expected: `307` (redirect to `/login`, no session in this raw `curl` check since it carries no cookies). Stop the dev server after checking.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add protected app shell with nav and sign-out"
```

---

### Task 11: Accounts — CRUD

**Files:**
- Create: `src/app/(app)/accounts/page.tsx`, `src/app/(app)/accounts/actions.ts`, `src/app/(app)/accounts/AccountForm.tsx`

**Interfaces:**
- Consumes: `Account`, `AccountBalance` types (Task 8), `createClient()` server (Task 8).
- Produces: `createAccount`, `updateAccount`, `softDeleteAccount` server actions, reused pattern for Tasks 12–14.

- [ ] **Step 1: Write server actions**

`src/app/(app)/accounts/actions.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createAccount(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.from('accounts').insert({
    user_id: user.id,
    name: String(formData.get('name')),
    kind: String(formData.get('kind')),
  })
  if (error) throw new Error(error.message)
  revalidatePath('/accounts')
}

export async function updateAccount(id: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('accounts')
    .update({
      name: String(formData.get('name')),
      kind: String(formData.get('kind')),
      is_active: formData.get('is_active') === 'on',
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/accounts')
}

export async function softDeleteAccount(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('accounts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/accounts')
}
```

- [ ] **Step 2: Write the form component**

`src/app/(app)/accounts/AccountForm.tsx`:

```tsx
'use client'

import { useRef } from 'react'
import type { Account } from '@/types/database'
import { createAccount, updateAccount } from './actions'

export function AccountForm({ account }: { account?: Account }) {
  const formRef = useRef<HTMLFormElement>(null)

  async function action(formData: FormData) {
    if (account) {
      await updateAccount(account.id, formData)
    } else {
      await createAccount(formData)
      formRef.current?.reset()
    }
  }

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3 rounded border bg-white p-4">
      <label className="flex flex-col text-sm">
        Название
        <input name="name" defaultValue={account?.name} required className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col text-sm">
        Тип
        <select name="kind" defaultValue={account?.kind ?? 'cash'} className="rounded border px-2 py-1">
          <option value="cash">Наличные</option>
          <option value="bank">Банк</option>
          <option value="card">Карта</option>
        </select>
      </label>
      {account && (
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={account.is_active} />
          Активен
        </label>
      )}
      <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700">
        {account ? 'Сохранить' : 'Добавить счёт'}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Write the list page**

`src/app/(app)/accounts/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import type { Account, AccountBalance } from '@/types/database'
import { AccountForm } from './AccountForm'
import { softDeleteAccount } from './actions'

export default async function AccountsPage() {
  const supabase = await createClient()

  const [{ data: accounts }, { data: balances }] = await Promise.all([
    supabase.from('accounts').select('*').is('deleted_at', null).order('created_at') as unknown as Promise<{ data: Account[] }>,
    supabase.from('account_balances').select('*') as unknown as Promise<{ data: AccountBalance[] }>,
  ])

  const balanceByAccount = new Map((balances ?? []).map((b) => [b.account_id, b.balance]))

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Счета</h1>
      <AccountForm />
      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Название</th>
            <th className="p-2">Тип</th>
            <th className="p-2">Остаток</th>
            <th className="p-2">Активен</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {(accounts ?? []).map((a) => (
            <tr key={a.id} className="border-b">
              <td className="p-2">{a.name}</td>
              <td className="p-2">{a.kind}</td>
              <td className="p-2">{(balanceByAccount.get(a.id) ?? 0).toLocaleString('ru-RU')}</td>
              <td className="p-2">{a.is_active ? 'да' : 'нет'}</td>
              <td className="p-2">
                <form action={softDeleteAccount.bind(null, a.id)}>
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
  )
}
```

- [ ] **Step 4: Manual verification**

```bash
npm run dev &
```

Log in at `http://localhost:3000/login` with the user created in Task 9, go to `/accounts`, add an account named "Касса" of type "Наличные", confirm it appears in the table with balance `0`, then delete it and confirm it disappears from the list. Stop the dev server after checking.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/accounts
git commit -m "feat: add accounts CRUD with live balance column"
```

---

### Task 12: Objects — CRUD

**Files:**
- Create: `src/app/(app)/objects/page.tsx`, `src/app/(app)/objects/actions.ts`, `src/app/(app)/objects/ObjectForm.tsx`

**Interfaces:**
- Consumes: `ObjectRecord` type (Task 8), same server-action/form/list pattern as Task 11.
- Produces: `createObject`, `updateObject`, `softDeleteObject` server actions.

- [ ] **Step 1: Write server actions**

`src/app/(app)/objects/actions.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createObject(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.from('objects').insert({
    user_id: user.id,
    title: String(formData.get('title')),
    address: String(formData.get('address') || '') || null,
    owner_name: String(formData.get('owner_name') || '') || null,
    owner_contact: String(formData.get('owner_contact') || '') || null,
    default_commission_pct: formData.get('default_commission_pct')
      ? Number(formData.get('default_commission_pct'))
      : null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/objects')
}

export async function updateObject(id: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('objects')
    .update({
      title: String(formData.get('title')),
      address: String(formData.get('address') || '') || null,
      owner_name: String(formData.get('owner_name') || '') || null,
      owner_contact: String(formData.get('owner_contact') || '') || null,
      default_commission_pct: formData.get('default_commission_pct')
        ? Number(formData.get('default_commission_pct'))
        : null,
      is_active: formData.get('is_active') === 'on',
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/objects')
}

export async function softDeleteObject(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('objects')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/objects')
}
```

- [ ] **Step 2: Write the form component**

`src/app/(app)/objects/ObjectForm.tsx`:

```tsx
'use client'

import { useRef } from 'react'
import type { ObjectRecord } from '@/types/database'
import { createObject, updateObject } from './actions'

export function ObjectForm({ object }: { object?: ObjectRecord }) {
  const formRef = useRef<HTMLFormElement>(null)

  async function action(formData: FormData) {
    if (object) {
      await updateObject(object.id, formData)
    } else {
      await createObject(formData)
      formRef.current?.reset()
    }
  }

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3 rounded border bg-white p-4">
      <label className="flex flex-col text-sm">
        Название
        <input name="title" defaultValue={object?.title} required className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col text-sm">
        Адрес
        <input name="address" defaultValue={object?.address ?? ''} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col text-sm">
        Владелец
        <input name="owner_name" defaultValue={object?.owner_name ?? ''} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col text-sm">
        Контакт владельца
        <input name="owner_contact" defaultValue={object?.owner_contact ?? ''} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col text-sm">
        Комиссия по умолчанию, %
        <input
          name="default_commission_pct"
          type="number"
          step="0.01"
          defaultValue={object?.default_commission_pct ?? ''}
          className="w-24 rounded border px-2 py-1"
        />
      </label>
      {object && (
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={object.is_active} />
          Активен
        </label>
      )}
      <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700">
        {object ? 'Сохранить' : 'Добавить объект'}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Write the list page**

`src/app/(app)/objects/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import type { ObjectRecord } from '@/types/database'
import { ObjectForm } from './ObjectForm'
import { softDeleteObject } from './actions'

export default async function ObjectsPage() {
  const supabase = await createClient()
  const { data: objects } = (await supabase
    .from('objects')
    .select('*')
    .is('deleted_at', null)
    .order('title')) as unknown as { data: ObjectRecord[] }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Объекты</h1>
      <ObjectForm />
      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Название</th>
            <th className="p-2">Адрес</th>
            <th className="p-2">Владелец</th>
            <th className="p-2">Комиссия, %</th>
            <th className="p-2">Активен</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {(objects ?? []).map((o) => (
            <tr key={o.id} className="border-b">
              <td className="p-2">{o.title}</td>
              <td className="p-2">{o.address}</td>
              <td className="p-2">{o.owner_name}</td>
              <td className="p-2">{o.default_commission_pct ?? '—'}</td>
              <td className="p-2">{o.is_active ? 'да' : 'нет'}</td>
              <td className="p-2">
                <form action={softDeleteObject.bind(null, o.id)}>
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
  )
}
```

- [ ] **Step 4: Manual verification**

```bash
npm run dev &
```

Log in, go to `/objects`, add an object with title "Квартира 12", confirm it appears, delete it, confirm removal. Stop dev server.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/objects
git commit -m "feat: add objects CRUD"
```

---

### Task 13: Employees — CRUD

**Files:**
- Create: `src/app/(app)/employees/page.tsx`, `src/app/(app)/employees/actions.ts`, `src/app/(app)/employees/EmployeeForm.tsx`

**Interfaces:**
- Consumes: `Employee` type (Task 8), same pattern as Task 11/12.
- Produces: `createEmployee`, `updateEmployee`, `softDeleteEmployee` server actions.

- [ ] **Step 1: Write server actions**

`src/app/(app)/employees/actions.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createEmployee(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.from('employees').insert({
    user_id: user.id,
    name: String(formData.get('name')),
    role: String(formData.get('role') || '') || null,
    payout_scheme: String(formData.get('payout_scheme')),
    base_salary: formData.get('base_salary') ? Number(formData.get('base_salary')) : null,
    percent_rate: formData.get('percent_rate') ? Number(formData.get('percent_rate')) : null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/employees')
}

export async function updateEmployee(id: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('employees')
    .update({
      name: String(formData.get('name')),
      role: String(formData.get('role') || '') || null,
      payout_scheme: String(formData.get('payout_scheme')),
      base_salary: formData.get('base_salary') ? Number(formData.get('base_salary')) : null,
      percent_rate: formData.get('percent_rate') ? Number(formData.get('percent_rate')) : null,
      is_active: formData.get('is_active') === 'on',
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/employees')
}

export async function softDeleteEmployee(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('employees')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/employees')
}
```

- [ ] **Step 2: Write the form component**

`src/app/(app)/employees/EmployeeForm.tsx`:

```tsx
'use client'

import { useRef } from 'react'
import type { Employee } from '@/types/database'
import { createEmployee, updateEmployee } from './actions'

export function EmployeeForm({ employee }: { employee?: Employee }) {
  const formRef = useRef<HTMLFormElement>(null)

  async function action(formData: FormData) {
    if (employee) {
      await updateEmployee(employee.id, formData)
    } else {
      await createEmployee(formData)
      formRef.current?.reset()
    }
  }

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3 rounded border bg-white p-4">
      <label className="flex flex-col text-sm">
        Имя
        <input name="name" defaultValue={employee?.name} required className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col text-sm">
        Роль
        <input name="role" defaultValue={employee?.role ?? ''} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col text-sm">
        Схема выплат
        <select name="payout_scheme" defaultValue={employee?.payout_scheme ?? 'fixed'} className="rounded border px-2 py-1">
          <option value="fixed">Фикс</option>
          <option value="percent">Процент</option>
          <option value="mixed">Смешанная</option>
        </select>
      </label>
      <label className="flex flex-col text-sm">
        Оклад
        <input name="base_salary" type="number" step="0.01" defaultValue={employee?.base_salary ?? ''} className="w-28 rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col text-sm">
        Процент, %
        <input name="percent_rate" type="number" step="0.01" defaultValue={employee?.percent_rate ?? ''} className="w-24 rounded border px-2 py-1" />
      </label>
      {employee && (
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={employee.is_active} />
          Активен
        </label>
      )}
      <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700">
        {employee ? 'Сохранить' : 'Добавить сотрудника'}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Write the list page**

`src/app/(app)/employees/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import type { Employee } from '@/types/database'
import { EmployeeForm } from './EmployeeForm'
import { softDeleteEmployee } from './actions'

export default async function EmployeesPage() {
  const supabase = await createClient()
  const { data: employees } = (await supabase
    .from('employees')
    .select('*')
    .is('deleted_at', null)
    .order('name')) as unknown as { data: Employee[] }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Сотрудники</h1>
      <EmployeeForm />
      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Имя</th>
            <th className="p-2">Роль</th>
            <th className="p-2">Схема</th>
            <th className="p-2">Активен</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {(employees ?? []).map((e) => (
            <tr key={e.id} className="border-b">
              <td className="p-2">{e.name}</td>
              <td className="p-2">{e.role}</td>
              <td className="p-2">{e.payout_scheme}</td>
              <td className="p-2">{e.is_active ? 'да' : 'нет'}</td>
              <td className="p-2">
                <form action={softDeleteEmployee.bind(null, e.id)}>
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
  )
}
```

- [ ] **Step 4: Manual verification**

```bash
npm run dev &
```

Log in, go to `/employees`, add "Иван Петров" with schema "Фикс", confirm it appears, delete, confirm removal. Stop dev server.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/employees
git commit -m "feat: add employees CRUD"
```

---

### Task 14: Categories — CRUD (with default seed on first visit)

**Files:**
- Create: `src/app/(app)/categories/page.tsx`, `src/app/(app)/categories/actions.ts`, `src/app/(app)/categories/CategoryForm.tsx`

**Interfaces:**
- Consumes: `Category` type (Task 8).
- Produces: `createCategory`, `deleteCategorySoft` server actions, plus `ensureDefaultTeamCategories` which seeds the spec's default `team`-group categories the first time a user has none.

- [ ] **Step 1: Write server actions**

`src/app/(app)/categories/actions.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const DEFAULT_TEAM_CATEGORIES = ['Еда', 'Развлечения', 'Транспорт', 'Коворкинг', 'Связь', 'Софт']

export async function ensureDefaultTeamCategories() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { count } = await supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)

  if (count && count > 0) return

  await supabase.from('categories').insert(
    DEFAULT_TEAM_CATEGORIES.map((name) => ({
      user_id: user.id,
      name,
      group: 'team' as const,
    }))
  )
}

export async function createCategory(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.from('categories').insert({
    user_id: user.id,
    name: String(formData.get('name')),
    group: String(formData.get('group')),
  })
  if (error) throw new Error(error.message)
  revalidatePath('/categories')
}

export async function softDeleteCategory(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('categories')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/categories')
}
```

- [ ] **Step 2: Write the form component**

`src/app/(app)/categories/CategoryForm.tsx`:

```tsx
'use client'

import { useRef } from 'react'
import { createCategory } from './actions'

export function CategoryForm() {
  const formRef = useRef<HTMLFormElement>(null)

  async function action(formData: FormData) {
    await createCategory(formData)
    formRef.current?.reset()
  }

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3 rounded border bg-white p-4">
      <label className="flex flex-col text-sm">
        Название
        <input name="name" required className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col text-sm">
        Группа
        <select name="group" defaultValue="team" className="rounded border px-2 py-1">
          <option value="ads">Реклама</option>
          <option value="team">Команда</option>
          <option value="staff">Подотчёт</option>
          <option value="personal">Личное</option>
        </select>
      </label>
      <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700">
        Добавить категорию
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Write the list page**

`src/app/(app)/categories/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import type { Category } from '@/types/database'
import { CategoryForm } from './CategoryForm'
import { ensureDefaultTeamCategories, softDeleteCategory } from './actions'

const GROUP_LABELS: Record<Category['group'], string> = {
  ads: 'Реклама',
  team: 'Команда',
  staff: 'Подотчёт',
  personal: 'Личное',
}

export default async function CategoriesPage() {
  await ensureDefaultTeamCategories()

  const supabase = await createClient()
  const { data: categories } = (await supabase
    .from('categories')
    .select('*')
    .is('deleted_at', null)
    .order('group')
    .order('name')) as unknown as { data: Category[] }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Категории расходов</h1>
      <CategoryForm />
      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Название</th>
            <th className="p-2">Группа</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {(categories ?? []).map((c) => (
            <tr key={c.id} className="border-b">
              <td className="p-2">{c.name}</td>
              <td className="p-2">{GROUP_LABELS[c.group]}</td>
              <td className="p-2">
                <form action={softDeleteCategory.bind(null, c.id)}>
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
  )
}
```

- [ ] **Step 4: Manual verification**

```bash
npm run dev &
```

Log in, go to `/categories` for the first time — confirm the six default `team` categories appear automatically. Add a custom `ads` category "Avito продвижение", confirm it appears, delete it. Stop dev server.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/categories
git commit -m "feat: add categories CRUD with default team-group seed"
```

---

### Task 15: Transactions (операции) — CRUD with type-based form

**Files:**
- Create: `src/app/(app)/transactions/page.tsx`, `src/app/(app)/transactions/actions.ts`, `src/app/(app)/transactions/TransactionForm.tsx`

**Interfaces:**
- Consumes: `Transaction`, `TransactionType`, `Account`, `Category`, `Employee`, `ObjectRecord` types (Task 8).
- Produces: `createTransaction`, `softDeleteTransaction` server actions; a form whose visible fields change based on the selected `type`, matching spec §4 (`account_to_id` only for `transfer`; `platform`/`period_start`/`period_end`/`is_general`/`object_id` only for `ads`).

- [ ] **Step 1: Write server actions**

`src/app/(app)/transactions/actions.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { TransactionType } from '@/types/database'

export async function createTransaction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const type = String(formData.get('type')) as TransactionType

  const { error } = await supabase.from('transactions').insert({
    user_id: user.id,
    date: String(formData.get('date')),
    type,
    amount: Number(formData.get('amount')),
    account_id: String(formData.get('account_id')),
    account_to_id: type === 'transfer' ? String(formData.get('account_to_id')) : null,
    category_id: formData.get('category_id') ? String(formData.get('category_id')) : null,
    employee_id: formData.get('employee_id') ? String(formData.get('employee_id')) : null,
    object_id: type === 'ads' && formData.get('object_id') ? String(formData.get('object_id')) : null,
    platform: type === 'ads' ? String(formData.get('platform') || '') || null : null,
    period_start: type === 'ads' ? String(formData.get('period_start') || '') || null : null,
    period_end: type === 'ads' ? String(formData.get('period_end') || '') || null : null,
    is_general: type === 'ads' ? formData.get('is_general') === 'on' : null,
    note: String(formData.get('note') || '') || null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/transactions')
}

export async function softDeleteTransaction(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/transactions')
}
```

- [ ] **Step 2: Write the type-based form component**

`src/app/(app)/transactions/TransactionForm.tsx`:

```tsx
'use client'

import { useRef, useState } from 'react'
import type { Account, Category, Employee, ObjectRecord, TransactionType } from '@/types/database'
import { createTransaction } from './actions'
import { isStaleOrFutureDate } from '@/lib/dates'

const TYPE_LABELS: Record<TransactionType, string> = {
  invest: 'Стартовое вложение',
  other_income: 'Прочий доход',
  ads: 'Реклама и размещение',
  team: 'Общие траты команды',
  salary: 'Выплата сотруднику',
  staff_expense: 'Подотчётная трата',
  personal: 'Личная трата / изъятие',
  transfer: 'Перевод между счетами',
}

export function TransactionForm({
  accounts,
  categories,
  employees,
  objects,
}: {
  accounts: Account[]
  categories: Category[]
  employees: Employee[]
  objects: ObjectRecord[]
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [type, setType] = useState<TransactionType>('team')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  const dateWarning = isStaleOrFutureDate(date)

  async function action(formData: FormData) {
    await createTransaction(formData)
    formRef.current?.reset()
    setType('team')
  }

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3 rounded border bg-white p-4">
      <label className="flex flex-col text-sm">
        Тип
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as TransactionType)}
          className="rounded border px-2 py-1"
        >
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col text-sm">
        Дата
        <input
          name="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border px-2 py-1"
        />
        {dateWarning && <span className="text-xs text-amber-600">{dateWarning}</span>}
      </label>

      <label className="flex flex-col text-sm">
        Сумма
        <input name="amount" type="number" step="0.01" min="0.01" required className="w-28 rounded border px-2 py-1" />
      </label>

      <label className="flex flex-col text-sm">
        Счёт {type === 'transfer' ? '(откуда)' : ''}
        <select name="account_id" required className="rounded border px-2 py-1">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </label>

      {type === 'transfer' && (
        <label className="flex flex-col text-sm">
          Счёт (куда)
          <select name="account_to_id" required className="rounded border px-2 py-1">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
      )}

      {(type === 'team' || type === 'staff_expense' || type === 'personal') && (
        <label className="flex flex-col text-sm">
          Категория
          <select name="category_id" className="rounded border px-2 py-1">
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      )}

      {(type === 'salary' || type === 'staff_expense') && (
        <label className="flex flex-col text-sm">
          Сотрудник
          <select name="employee_id" className="rounded border px-2 py-1">
            <option value="">—</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
      )}

      {type === 'ads' && (
        <>
          <label className="flex flex-col text-sm">
            Площадка
            <input name="platform" className="rounded border px-2 py-1" />
          </label>
          <label className="flex flex-col text-sm">
            Период с
            <input name="period_start" type="date" className="rounded border px-2 py-1" />
          </label>
          <label className="flex flex-col text-sm">
            Период по
            <input name="period_end" type="date" className="rounded border px-2 py-1" />
          </label>
          <label className="flex flex-col text-sm">
            Объект
            <select name="object_id" className="rounded border px-2 py-1">
              <option value="">—</option>
              {objects.map((o) => (
                <option key={o.id} value={o.id}>{o.title}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="is_general" />
            Общая реклама (не привязана к объекту)
          </label>
        </>
      )}

      <label className="flex flex-col text-sm">
        Комментарий
        <input name="note" className="rounded border px-2 py-1" />
      </label>

      <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700">
        Добавить операцию
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Write the list page**

`src/app/(app)/transactions/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import type { Account, Category, Employee, ObjectRecord, Transaction } from '@/types/database'
import { TransactionForm } from './TransactionForm'
import { softDeleteTransaction } from './actions'

export default async function TransactionsPage() {
  const supabase = await createClient()

  const [
    { data: transactions },
    { data: accounts },
    { data: categories },
    { data: employees },
    { data: objects },
  ] = await Promise.all([
    supabase.from('transactions').select('*').is('deleted_at', null).order('date', { ascending: false }) as unknown as Promise<{ data: Transaction[] }>,
    supabase.from('accounts').select('*').is('deleted_at', null).order('name') as unknown as Promise<{ data: Account[] }>,
    supabase.from('categories').select('*').is('deleted_at', null).order('name') as unknown as Promise<{ data: Category[] }>,
    supabase.from('employees').select('*').is('deleted_at', null).order('name') as unknown as Promise<{ data: Employee[] }>,
    supabase.from('objects').select('*').is('deleted_at', null).order('title') as unknown as Promise<{ data: ObjectRecord[] }>,
  ])

  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]))

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Операции</h1>
      <TransactionForm
        accounts={accounts ?? []}
        categories={categories ?? []}
        employees={employees ?? []}
        objects={objects ?? []}
      />
      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Дата</th>
            <th className="p-2">Тип</th>
            <th className="p-2">Сумма</th>
            <th className="p-2">Счёт</th>
            <th className="p-2">Комментарий</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {(transactions ?? []).map((t) => (
            <tr key={t.id} className="border-b">
              <td className="p-2">{t.date}</td>
              <td className="p-2">{t.type}</td>
              <td className="p-2">{t.amount.toLocaleString('ru-RU')}</td>
              <td className="p-2">{accountName.get(t.account_id)}</td>
              <td className="p-2">{t.note}</td>
              <td className="p-2">
                <form action={softDeleteTransaction.bind(null, t.id)}>
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
  )
}
```

- [ ] **Step 4: Manual verification**

```bash
npm run dev &
```

Log in, go to `/transactions`. Add an `invest` transaction of 1000 to an account created earlier — confirm it appears in the journal, then go to `/accounts` and confirm the balance column reflects it. Switch type to `ads` in the form and confirm platform/period/object fields appear; switch to `transfer` and confirm the second account selector appears. Stop dev server.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/transactions
git commit -m "feat: add transactions CRUD with type-conditional form"
```

---

### Task 16: Date-staleness helper (Vitest)

**Files:**
- Create: `src/lib/dates.ts`, `src/lib/dates.test.ts`, `vitest.config.ts`
- Modify: `package.json` (add `test` script)

**Interfaces:**
- Produces: `isStaleOrFutureDate(dateStr: string): string | null` — returns a Russian warning string ("Дата в прошлом месяце" style per spec §5, or a future-date warning) or `null` if the date needs no warning. Consumed by `TransactionForm` (Task 15).

- [ ] **Step 1: Write the failing test**

`src/lib/dates.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { isStaleOrFutureDate } from './dates'

describe('isStaleOrFutureDate', () => {
  it('returns null for today', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(isStaleOrFutureDate(today)).toBeNull()
  })

  it('warns for a date more than 60 days in the past', () => {
    const old = new Date()
    old.setDate(old.getDate() - 61)
    expect(isStaleOrFutureDate(old.toISOString().slice(0, 10))).toBe('Дата больше 60 дней назад')
  })

  it('does not warn for a date exactly 30 days in the past', () => {
    const recent = new Date()
    recent.setDate(recent.getDate() - 30)
    expect(isStaleOrFutureDate(recent.toISOString().slice(0, 10))).toBeNull()
  })

  it('warns for a future date', () => {
    const future = new Date()
    future.setDate(future.getDate() + 1)
    expect(isStaleOrFutureDate(future.toISOString().slice(0, 10))).toBe('Дата в будущем')
  })
})
```

- [ ] **Step 2: Write `vitest.config.ts` and run to verify the test fails**

`vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
  },
})
```

Add to `package.json` `"scripts"`:

```json
"test": "vitest run"
```

Run: `npm test`
Expected: FAIL — `Cannot find module './dates'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

`src/lib/dates.ts`:

```typescript
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000

export function isStaleOrFutureDate(dateStr: string): string | null {
  const date = new Date(`${dateStr}T00:00:00`)
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00')

  const diffMs = today.getTime() - date.getTime()

  if (diffMs < 0) return 'Дата в будущем'
  if (diffMs > SIXTY_DAYS_MS) return 'Дата больше 60 дней назад'
  return null
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `npm test`
Expected: 4 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dates.ts src/lib/dates.test.ts vitest.config.ts package.json
git commit -m "feat: add date-staleness warning helper with tests"
```

---

## Self-Review Notes

**Spec coverage:** §2 stack — Task 1/2. §3 security — RLS (Task 4/5), soft delete (all CRUD tasks), anon-key-only (Task 8, no service_role used anywhere in this phase), session gating (Task 9/10). Note: `audit_log` writing and the JSON backup button are explicitly Phase 5 per spec §7 and are **not** built in this plan — only the table schema exists. §4 model — full schema Task 3, directories CRUD Tasks 11–14. §5 formulas — `account_balances` Task 6, verified Task 7; recognition/cancellation rules apply to `payments`/`deals`, which are Phase 2 scope. §6 screens — Счета/Объекты/Сотрудники/Категории/Операции screens built (Tasks 11–15); Сделки/Отчёты/Дашборд/Настройки are later phases. §7 — this plan is exactly "Этап 1". §8 tests — items 1, 2, 6 covered by Task 7 (the only ones testable without `deals`/`payments`, which don't exist yet); items 3–5, 7–10 depend on Phase 2 (deals/payments) and Phase 3 (P&L reports) and belong in those plans.

**Placeholder scan:** none found — every step has literal code or an exact command with expected output.

**Type consistency:** `Account`, `ObjectRecord`, `Employee`, `Category`, `Transaction`, `TransactionType`, `AccountBalance` defined once in Task 8 and imported (not redefined) in every later task. Server action names (`createAccount`/`updateAccount`/`softDeleteAccount`, and the parallel triad for each other entity) are consistent between their `actions.ts` definition and their `page.tsx`/`*Form.tsx` usage in the same task.
