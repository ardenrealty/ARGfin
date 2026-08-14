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
