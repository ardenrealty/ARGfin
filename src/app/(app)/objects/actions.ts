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
