import { createClient } from '@/lib/supabase/server'
import type { Account, Category, Employee, ObjectRecord, Transaction } from '@/types/database'
import { TransactionForm } from './TransactionForm'
import { softDeleteTransaction } from './actions'

export default async function TransactionsPage() {
  const supabase = await createClient()

  const [
    { data: transactions },
    { data: accounts },
    { data: categories },
    { data: employees },
    { data: objects },
  ] = await Promise.all([
    supabase.from('transactions').select('*').is('deleted_at', null).order('date', { ascending: false }) as unknown as Promise<{ data: Transaction[] }>,
    supabase.from('accounts').select('*').is('deleted_at', null).order('name') as unknown as Promise<{ data: Account[] }>,
    supabase.from('categories').select('*').is('deleted_at', null).order('name') as unknown as Promise<{ data: Category[] }>,
    supabase.from('employees').select('*').is('deleted_at', null).order('name') as unknown as Promise<{ data: Employee[] }>,
    supabase.from('objects').select('*').is('deleted_at', null).order('title') as unknown as Promise<{ data: ObjectRecord[] }>,
  ])

  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]))

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Операции</h1>
      <TransactionForm
        accounts={accounts ?? []}
        categories={categories ?? []}
        employees={employees ?? []}
        objects={objects ?? []}
      />
      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Дата</th>
            <th className="p-2">Тип</th>
            <th className="p-2">Сумма</th>
            <th className="p-2">Счёт</th>
            <th className="p-2">Комментарий</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {(transactions ?? []).map((t) => (
            <tr key={t.id} className="border-b">
              <td className="p-2">{t.date}</td>
              <td className="p-2">{t.type}</td>
              <td className="p-2">{t.amount.toLocaleString('ru-RU')}</td>
              <td className="p-2">{accountName.get(t.account_id)}</td>
              <td className="p-2">{t.note}</td>
              <td className="p-2">
                <form action={softDeleteTransaction.bind(null, t.id)}>
                  <button type="submit" className="text-xs text-red-600 hover:underline">
                    Удалить
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
