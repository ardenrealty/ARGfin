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
