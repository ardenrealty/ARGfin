'use client'

import { useRef } from 'react'
import type { Employee } from '@/types/database'
import { createEmployee, updateEmployee } from './actions'

export function EmployeeForm({ employee }: { employee?: Employee }) {
  const formRef = useRef<HTMLFormElement>(null)

  async function action(formData: FormData) {
    if (employee) {
      await updateEmployee(employee.id, formData)
    } else {
      await createEmployee(formData)
      formRef.current?.reset()
    }
  }

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3 rounded border bg-white p-4">
      <label className="flex flex-col text-sm">
        Имя
        <input name="name" defaultValue={employee?.name} required className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col text-sm">
        Роль
        <input name="role" defaultValue={employee?.role ?? ''} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col text-sm">
        Схема выплат
        <select name="payout_scheme" defaultValue={employee?.payout_scheme ?? 'fixed'} className="rounded border px-2 py-1">
          <option value="fixed">Фикс</option>
          <option value="percent">Процент</option>
          <option value="mixed">Смешанная</option>
        </select>
      </label>
      <label className="flex flex-col text-sm">
        Оклад
        <input name="base_salary" type="number" step="0.01" defaultValue={employee?.base_salary ?? ''} className="w-28 rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col text-sm">
        Процент, %
        <input name="percent_rate" type="number" step="0.01" defaultValue={employee?.percent_rate ?? ''} className="w-24 rounded border px-2 py-1" />
      </label>
      {employee && (
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={employee.is_active} />
          Активен
        </label>
      )}
      <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700">
        {employee ? 'Сохранить' : 'Добавить сотрудника'}
      </button>
    </form>
  )
}
