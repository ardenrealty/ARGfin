'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
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
  redirect(`/deals/${id}`)
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
