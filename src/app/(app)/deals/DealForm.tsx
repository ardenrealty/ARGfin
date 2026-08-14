'use client'

import { useRef, useState } from 'react'
import type { Deal, DealStatus, Employee, ObjectRecord } from '@/types/database'
import { createDeal, updateDeal } from './actions'

const STATUS_OPTIONS: { value: DealStatus; label: string }[] = [
  { value: 'booked', label: 'Забронирована' },
  { value: 'prepaid', label: 'Предоплата' },
  { value: 'checked_in', label: 'Заселение' },
  { value: 'completed', label: 'Завершена' },
  { value: 'cancelled', label: 'Отменена' },
]

export function DealForm({
  deal,
  objects,
  employees,
}: {
  deal?: Deal
  objects: ObjectRecord[]
  employees: Employee[]
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [dealAmount, setDealAmount] = useState(deal?.deal_amount ?? 0)
  const [commissionPct, setCommissionPct] = useState(deal?.commission_pct ?? 0)
  const [commissionAmount, setCommissionAmount] = useState(deal?.commission_amount ?? 0)

  function onPctChange(pct: number) {
    setCommissionPct(pct)
    setCommissionAmount(Math.round(dealAmount * (pct / 100) * 100) / 100)
  }

  function onAmountChange(amount: number) {
    setCommissionAmount(amount)
    setCommissionPct(dealAmount > 0 ? Math.round((amount / dealAmount) * 100 * 100) / 100 : 0)
  }

  function onDealAmountChange(amount: number) {
    setDealAmount(amount)
    setCommissionAmount(Math.round(amount * (commissionPct / 100) * 100) / 100)
  }

  async function action(formData: FormData) {
    if (deal) {
      await updateDeal(deal.id, formData)
    } else {
      await createDeal(formData)
      formRef.current?.reset()
      setDealAmount(0)
      setCommissionPct(0)
      setCommissionAmount(0)
    }
  }

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3 rounded border bg-white p-4 text-sm">
      <label className="flex flex-col">
        Клиент
        <input name="client_name" defaultValue={deal?.client_name} required className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col">
        Телефон
        <input name="client_phone" defaultValue={deal?.client_phone ?? ''} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col">
        Объект
        <select name="object_id" defaultValue={deal?.object_id ?? ''} className="rounded border px-2 py-1">
          <option value="">—</option>
          {objects.map((o) => (
            <option key={o.id} value={o.id}>{o.title}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col">
        Дата брони
        <input type="date" name="booking_date" defaultValue={deal?.booking_date ?? new Date().toISOString().slice(0, 10)} required className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col">
        Заселение
        <input type="date" name="checkin_date" defaultValue={deal?.checkin_date ?? ''} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col">
        Выселение
        <input type="date" name="checkout_date" defaultValue={deal?.checkout_date ?? ''} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col">
        Сумма сделки
        <input
          name="deal_amount"
          type="number"
          step="0.01"
          value={dealAmount}
          onChange={(e) => onDealAmountChange(Number(e.target.value))}
          required
          className="w-28 rounded border px-2 py-1"
        />
      </label>
      <label className="flex flex-col">
        Комиссия, %
        <input
          name="commission_pct"
          type="number"
          step="0.01"
          value={commissionPct}
          onChange={(e) => onPctChange(Number(e.target.value))}
          className="w-24 rounded border px-2 py-1"
        />
      </label>
      <label className="flex flex-col">
        Комиссия, сумма
        <input
          name="commission_amount"
          type="number"
          step="0.01"
          value={commissionAmount}
          onChange={(e) => onAmountChange(Number(e.target.value))}
          className="w-28 rounded border px-2 py-1"
        />
      </label>
      <label className="flex flex-col">
        Источник
        <select name="source" defaultValue={deal?.source ?? ''} className="rounded border px-2 py-1">
          <option value="">—</option>
          <option value="avito">Avito</option>
          <option value="cian">Циан</option>
          <option value="recommend">Рекомендация</option>
          <option value="other">Другое</option>
        </select>
      </label>
      <label className="flex flex-col">
        Сотрудник
        <select name="closed_by_employee_id" defaultValue={deal?.closed_by_employee_id ?? ''} className="rounded border px-2 py-1">
          <option value="">—</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </label>
      {deal && (
        <label className="flex flex-col">
          Статус
          <select name="status" defaultValue={deal.status} className="rounded border px-2 py-1">
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col">
        Комментарий
        <input name="note" defaultValue={deal?.note ?? ''} className="rounded border px-2 py-1" />
      </label>
      <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-white hover:bg-gray-700">
        {deal ? 'Сохранить' : 'Добавить сделку'}
      </button>
    </form>
  )
}
