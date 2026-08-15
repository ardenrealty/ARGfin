'use server'

import { createClient } from '@/lib/supabase/server'

const BACKUP_TABLES = [
  'accounts', 'objects', 'employees', 'categories',
  'deals', 'payments', 'transactions', 'audit_log',
] as const

export async function exportAllData(): Promise<Record<string, unknown[]>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const result: Record<string, unknown[]> = {}
  for (const table of BACKUP_TABLES) {
    const { data } = await supabase.from(table).select('*')
    result[table] = data ?? []
  }
  return result
}
