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
