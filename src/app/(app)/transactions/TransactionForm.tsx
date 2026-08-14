'use client'

import { useRef, useState } from 'react'
import type { Account, Category, Employee, ObjectRecord, TransactionType } from '@/types/database'
import { createTransaction } from './actions'
import { isStaleOrFutureDate } from '@/lib/dates'

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

export function TransactionForm({
  accounts,
  categories,
  employees,
  objects,
}: {
  accounts: Account[]
  categories: Category[]
  employees: Employee[]
  objects: ObjectRecord[]
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [type, setType] = useState<TransactionType>('team')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  const dateWarning = isStaleOrFutureDate(date)

  async function action(formData: FormData) {
    await createTransaction(formData)
    formRef.current?.reset()
    setType('team')
  }

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3 rounded border bg-white p-4">
      <label className="flex flex-col text-sm">
        Тип
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as TransactionType)}
          className="rounded border px-2 py-1"
        >
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col text-sm">
        Дата
        <input
          name="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border px-2 py-1"
        />
        {dateWarning && <span className="text-xs text-amber-600">{dateWarning}</span>}
      </label>

      <label className="flex flex-col text-sm">
        Сумма
        <input name="amount" type="number" step="0.01" min="0.01" required className="w-28 rounded border px-2 py-1" />
      </label>

      <label className="flex flex-col text-sm">
        Счёт {type === 'transfer' ? '(откуда)' : ''}
        <select name="account_id" required className="rounded border px-2 py-1">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </label>

      {type === 'transfer' && (
        <label className="flex flex-col text-sm">
          Счёт (куда)
          <select name="account_to_id" required className="rounded border px-2 py-1">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
      )}

      {(type === 'team' || type === 'staff_expense' || type === 'personal') && (
        <label className="flex flex-col text-sm">
          Категория
          <select name="category_id" className="rounded border px-2 py-1">
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      )}

      {(type === 'salary' || type === 'staff_expense') && (
        <label className="flex flex-col text-sm">
          Сотрудник
          <select name="employee_id" className="rounded border px-2 py-1">
            <option value="">—</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
      )}

      {type === 'ads' && (
        <>
          <label className="flex flex-col text-sm">
            Площадка
            <input name="platform" className="rounded border px-2 py-1" />
          </label>
          <label className="flex flex-col text-sm">
            Период с
            <input name="period_start" type="date" className="rounded border px-2 py-1" />
          </label>
          <label className="flex flex-col text-sm">
            Период по
            <input name="period_end" type="date" className="rounded border px-2 py-1" />
          </label>
          <label className="flex flex-col text-sm">
            Объект
            <select name="object_id" className="rounded border px-2 py-1">
              <option value="">—</option>
              {objects.map((o) => (
                <option key={o.id} value={o.id}>{o.title}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="is_general" />
            Общая реклама (не привязана к объекту)
          </label>
        </>
      )}

      <label className="flex flex-col text-sm">
        Комментарий
        <input name="note" className="rounded border px-2 py-1" />
      </label>

      <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700">
        Добавить операцию
      </button>
    </form>
  )
}
