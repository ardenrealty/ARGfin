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

export async function updateTransaction(id: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const type = String(formData.get('type')) as TransactionType

  const { error } = await supabase
    .from('transactions')
    .update({
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
    .eq('id', id)
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
