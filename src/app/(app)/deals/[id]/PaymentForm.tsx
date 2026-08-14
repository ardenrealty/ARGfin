'use client'

import { useRef, useState } from 'react'
import type { Account } from '@/types/database'
import { isStaleOrFutureDate } from '@/lib/dates'
import { addPayment } from './actions'

export function PaymentForm({ dealId, accounts }: { dealId: string; accounts: Account[] }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10))
  const dateWarning = isStaleOrFutureDate(paidAt)

  async function action(formData: FormData) {
    await addPayment(dealId, formData)
    formRef.current?.reset()
    setPaidAt(new Date().toISOString().slice(0, 10))
  }

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3 rounded border bg-white p-4 text-sm">
      <label className="flex flex-col">
        Тип
        <select name="kind" defaultValue="prepay" className="rounded border px-2 py-1">
          <option value="prepay">Предоплата</option>
          <option value="balance">Доплата</option>
          <option value="full">Полная оплата</option>
        </select>
      </label>
      <label className="flex flex-col">
        Сумма
        <input name="amount" type="number" step="0.01" min="0.01" required className="w-28 rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col">
        Дата оплаты
        <input
          name="paid_at"
          type="date"
          value={paidAt}
          onChange={(e) => setPaidAt(e.target.value)}
          className="rounded border px-2 py-1"
        />
        {dateWarning && <span className="text-xs text-amber-600">{dateWarning}</span>}
      </label>
      <label className="flex flex-col">
        Счёт
        <select name="account_id" required className="rounded border px-2 py-1">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col">
        Комментарий
        <input name="note" className="rounded border px-2 py-1" />
      </label>
      <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-white hover:bg-gray-700">
        Добавить платёж
      </button>
    </form>
  )
}
