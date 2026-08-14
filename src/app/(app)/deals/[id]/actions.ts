'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { PaymentKind } from '@/types/database'

export async function addPayment(dealId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.from('payments').insert({
    user_id: user.id,
    deal_id: dealId,
    kind: String(formData.get('kind')) as PaymentKind,
    amount: Number(formData.get('amount')),
    paid_at: String(formData.get('paid_at')),
    account_id: String(formData.get('account_id')),
    note: String(formData.get('note') || '') || null,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/deals/${dealId}`)
  revalidatePath('/deals')
}

export async function softDeletePayment(id: string) {
  const supabase = await createClient()
  const { data: payment } = await supabase.from('payments').select('deal_id').eq('id', id).single()
  const { error } = await supabase
    .from('payments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  if (payment) revalidatePath(`/deals/${payment.deal_id}`)
  revalidatePath('/deals')
}
