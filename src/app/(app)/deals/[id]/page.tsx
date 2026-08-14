import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Account, Deal, DealPaymentSummary, Employee, ObjectRecord, Payment } from '@/types/database'
import { DealForm } from '../DealForm'
import { cancelDeal, softDeleteDeal } from '../actions'
import { PaymentForm } from './PaymentForm'
import { softDeletePayment } from './actions'

const KIND_LABELS: Record<string, string> = {
  prepay: 'Предоплата',
  balance: 'Доплата',
  full: 'Полная оплата',
}

export default async function DealDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ edit?: string }>
}) {
  const { id } = await params
  const { edit } = await searchParams
  const supabase = await createClient()

  const [{ data: deal }, { data: summary }, { data: payments }, { data: accounts }, { data: objects }, { data: employees }] =
    await Promise.all([
      supabase.from('deals').select('*').eq('id', id).is('deleted_at', null).maybeSingle() as unknown as Promise<{ data: Deal | null }>,
      supabase.from('deal_payment_summary').select('*').eq('deal_id', id).maybeSingle() as unknown as Promise<{ data: DealPaymentSummary | null }>,
      supabase.from('payments').select('*').eq('deal_id', id).is('deleted_at', null).order('paid_at') as unknown as Promise<{ data: Payment[] }>,
      supabase.from('accounts').select('*').is('deleted_at', null).order('name') as unknown as Promise<{ data: Account[] }>,
      supabase.from('objects').select('*').is('deleted_at', null).order('title') as unknown as Promise<{ data: ObjectRecord[] }>,
      supabase.from('employees').select('*').is('deleted_at', null).order('name') as unknown as Promise<{ data: Employee[] }>,
    ])

  if (!deal) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{deal.client_name}</h1>
        <Link href="/deals" className="text-sm text-gray-500 hover:underline">
          ← К списку сделок
        </Link>
      </div>

      {edit === '1' ? (
        <DealForm deal={deal} objects={objects ?? []} employees={employees ?? []} />
      ) : (
        <div className="flex flex-wrap items-center gap-4 rounded border bg-white p-4 text-sm">
          <span>Комиссия: {deal.commission_amount?.toLocaleString('ru-RU')}</span>
          <span>Оплачено: {(summary?.total_paid ?? 0).toLocaleString('ru-RU')}</span>
          <span>Осталось: {(summary?.remaining ?? 0).toLocaleString('ru-RU')}</span>
          <span>Статус: {deal.status}</span>
          <Link href={`/deals/${deal.id}?edit=1`} className="text-xs text-blue-600 hover:underline">
            Редактировать
          </Link>
          {deal.status !== 'cancelled' && (
            <form action={cancelDeal.bind(null, deal.id)}>
              <button type="submit" className="text-xs text-amber-600 hover:underline">
                Отменить сделку
              </button>
            </form>
          )}
          <form action={softDeleteDeal.bind(null, deal.id)}>
            <button type="submit" className="text-xs text-red-600 hover:underline">
              Удалить
            </button>
          </form>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Платежи</h2>
        <PaymentForm dealId={deal.id} accounts={accounts ?? []} />
        <table className="w-full border-collapse rounded border bg-white text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="p-2">Тип</th>
              <th className="p-2">Сумма</th>
              <th className="p-2">Дата оплаты</th>
              <th className="p-2">Признано</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {(payments ?? []).map((p) => (
              <tr key={p.id} className="border-b">
                <td className="p-2">{KIND_LABELS[p.kind]}</td>
                <td className="p-2">{p.amount.toLocaleString('ru-RU')}</td>
                <td className="p-2">{p.paid_at}</td>
                <td className="p-2">{p.recognized_at ?? '—'}</td>
                <td className="p-2">
                  <form action={softDeletePayment.bind(null, p.id)}>
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
