import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Account, Category, Employee, ObjectRecord, Transaction, TransactionType } from '@/types/database'
import { TransactionForm } from './TransactionForm'
import { softDeleteTransaction } from './actions'

const TYPE_LABELS: Record<TransactionType, string> = {
  invest: 'Стартовое вложение',
  other_income: 'Прочий доход',
  ads: 'Реклама и размещение',
  team: 'Общие траты команды',
  salary: 'Выплата сотруднику',
  staff_expense: 'Подотчётная трата',
  personal: 'Личная трата / изъятие',
  transfer: 'Перевод между счетами',
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; type?: string; category?: string; from?: string; to?: string }>
}) {
  const { edit, type, category, from, to } = await searchParams
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
  const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name]))

  const filteredTransactions = (transactions ?? []).filter((t) => {
    if (type && t.type !== type) return false
    if (category && t.category_id !== category) return false
    if (from && t.date < from) return false
    if (to && t.date > to) return false
    return true
  })

  const editingTransaction = edit ? (transactions ?? []).find((t) => t.id === edit) : undefined

  const filterParams = new URLSearchParams()
  if (type) filterParams.set('type', type)
  if (category) filterParams.set('category', category)
  if (from) filterParams.set('from', from)
  if (to) filterParams.set('to', to)
  const filterQuery = filterParams.toString()
  const cancelHref = filterQuery ? `/transactions?${filterQuery}` : '/transactions'

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Операции</h1>
      <TransactionForm
        accounts={accounts ?? []}
        categories={categories ?? []}
        employees={employees ?? []}
        objects={objects ?? []}
        transaction={editingTransaction}
        cancelHref={cancelHref}
      />

      <form className="flex flex-wrap items-end gap-3 rounded border bg-gray-50 p-4 text-sm">
        <label className="flex flex-col">
          Тип
          <select name="type" defaultValue={type ?? ''} className="rounded border px-2 py-1">
            <option value="">Все</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          Категория
          <select name="category" defaultValue={category ?? ''} className="rounded border px-2 py-1">
            <option value="">Все</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          Дата с
          <input name="from" type="date" defaultValue={from ?? ''} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          Дата по
          <input name="to" type="date" defaultValue={to ?? ''} className="rounded border px-2 py-1" />
        </label>
        <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-white hover:bg-gray-700">
          Фильтровать
        </button>
        {(type || category || from || to) && (
          <Link href="/transactions" className="text-xs text-gray-600 hover:underline">
            Сбросить фильтр
          </Link>
        )}
      </form>

      <div className="overflow-x-auto">
      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Дата</th>
            <th className="p-2">Тип</th>
            <th className="p-2">Категория</th>
            <th className="p-2">Сумма</th>
            <th className="p-2">Счёт</th>
            <th className="p-2">Комментарий</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {filteredTransactions.map((t) => (
            <tr key={t.id} className="border-b">
              <td className="p-2">{t.date}</td>
              <td className="p-2">{TYPE_LABELS[t.type]}</td>
              <td className="p-2">{t.category_id ? categoryName.get(t.category_id) : ''}</td>
              <td className="p-2">{t.amount.toLocaleString('ru-RU')}</td>
              <td className="p-2">{accountName.get(t.account_id)}</td>
              <td className="p-2">{t.note}</td>
              <td className="p-2 flex items-center gap-2">
                <Link
                  href={`/transactions?${new URLSearchParams({ ...Object.fromEntries(filterParams), edit: t.id }).toString()}`}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Редактировать
                </Link>
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
    </div>
  )
}
