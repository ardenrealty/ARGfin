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
