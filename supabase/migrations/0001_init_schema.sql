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
