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
