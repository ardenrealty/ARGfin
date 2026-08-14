import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Deal, DealPaymentSummary, DealStatus, Employee, ObjectRecord } from '@/types/database'
import { DealForm } from './DealForm'

const STATUS_LABELS: Record<DealStatus, string> = {
  booked: 'Забронирована',
  prepaid: 'Предоплата',
  checked_in: 'Заселение',
  completed: 'Завершена',
  cancelled: 'Отменена',
}

const SOURCE_LABELS: Record<string, string> = {
  avito: 'Avito',
  cian: 'Циан',
  recommend: 'Рекомендация',
  other: 'Другое',
}

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string
    to?: string
    object_id?: string
    status?: string
    source?: string
    employee_id?: string
    new?: string
  }>
}) {
  const filters = await searchParams
  const showCreateForm = filters.new === '1'
  const supabase = await createClient()

  let query = supabase
    .from('deals')
    .select('*')
    .is('deleted_at', null)
    .order('booking_date', { ascending: false })

  if (filters.from) query = query.gte('booking_date', filters.from)
  if (filters.to) query = query.lte('booking_date', filters.to)
  if (filters.object_id) query = query.eq('object_id', filters.object_id)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.source) query = query.eq('source', filters.source)
  if (filters.employee_id) query = query.eq('closed_by_employee_id', filters.employee_id)

  const [{ data: deals }, { data: summaries }, { data: objects }, { data: employees }] = await Promise.all([
    query as unknown as Promise<{ data: Deal[] }>,
    supabase.from('deal_payment_summary').select('*') as unknown as Promise<{ data: DealPaymentSummary[] }>,
    supabase.from('objects').select('*').is('deleted_at', null).order('title') as unknown as Promise<{ data: ObjectRecord[] }>,
    supabase.from('employees').select('*').is('deleted_at', null).order('name') as unknown as Promise<{ data: Employee[] }>,
  ])

  const summaryByDeal = new Map((summaries ?? []).map((s) => [s.deal_id, s]))
  const objectTitle = new Map((objects ?? []).map((o) => [o.id, o.title]))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Сделки</h1>
        {!showCreateForm && (
          <Link href="/deals?new=1" className="rounded bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700">
            Добавить сделку
          </Link>
        )}
      </div>

      {showCreateForm && (
        <div className="space-y-2">
          <DealForm objects={objects ?? []} employees={employees ?? []} />
          <Link href="/deals" className="text-sm text-blue-600 hover:underline">
            Отмена
          </Link>
        </div>
      )}

      <form className="flex flex-wrap items-end gap-3 rounded border bg-white p-4 text-sm">
        <label className="flex flex-col">
          С даты
          <input type="date" name="from" defaultValue={filters.from} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          По дату
          <input type="date" name="to" defaultValue={filters.to} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          Объект
          <select name="object_id" defaultValue={filters.object_id ?? ''} className="rounded border px-2 py-1">
            <option value="">Все</option>
            {(objects ?? []).map((o) => (
              <option key={o.id} value={o.id}>{o.title}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          Статус
          <select name="status" defaultValue={filters.status ?? ''} className="rounded border px-2 py-1">
            <option value="">Все</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          Источник
          <select name="source" defaultValue={filters.source ?? ''} className="rounded border px-2 py-1">
            <option value="">Все</option>
            {Object.entries(SOURCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          Сотрудник
          <select name="employee_id" defaultValue={filters.employee_id ?? ''} className="rounded border px-2 py-1">
            <option value="">Все</option>
            {(employees ?? []).map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded border px-3 py-1 hover:bg-gray-50">
          Применить
        </button>
      </form>

      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Клиент</th>
            <th className="p-2">Объект</th>
            <th className="p-2">Бронь</th>
            <th className="p-2">Заселение</th>
            <th className="p-2">Комиссия</th>
            <th className="p-2">Оплачено / осталось</th>
            <th className="p-2">Статус</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {(deals ?? []).map((d) => {
            const summary = summaryByDeal.get(d.id)
            return (
              <tr key={d.id} className="border-b">
                <td className="p-2">{d.client_name}</td>
                <td className="p-2">{d.object_id ? objectTitle.get(d.object_id) : '—'}</td>
                <td className="p-2">{d.booking_date}</td>
                <td className="p-2">{d.checkin_date ?? '—'}</td>
                <td className="p-2">{d.commission_amount?.toLocaleString('ru-RU') ?? '—'}</td>
                <td className="p-2">
                  {(summary?.total_paid ?? 0).toLocaleString('ru-RU')} / {(summary?.remaining ?? 0).toLocaleString('ru-RU')}
                </td>
                <td className="p-2">{STATUS_LABELS[d.status]}</td>
                <td className="p-2">
                  <Link href={`/deals/${d.id}`} className="text-xs text-blue-600 hover:underline">
                    Открыть
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
