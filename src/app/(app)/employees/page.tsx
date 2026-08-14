import { createClient } from '@/lib/supabase/server'
import type { Employee } from '@/types/database'
import { EmployeeForm } from './EmployeeForm'
import { softDeleteEmployee } from './actions'

export default async function EmployeesPage() {
  const supabase = await createClient()
  const { data: employees } = (await supabase
    .from('employees')
    .select('*')
    .is('deleted_at', null)
    .order('name')) as unknown as { data: Employee[] }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Сотрудники</h1>
      <EmployeeForm />
      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Имя</th>
            <th className="p-2">Роль</th>
            <th className="p-2">Схема</th>
            <th className="p-2">Активен</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {(employees ?? []).map((e) => (
            <tr key={e.id} className="border-b">
              <td className="p-2">{e.name}</td>
              <td className="p-2">{e.role}</td>
              <td className="p-2">{e.payout_scheme}</td>
              <td className="p-2">{e.is_active ? 'да' : 'нет'}</td>
              <td className="p-2">
                <form action={softDeleteEmployee.bind(null, e.id)}>
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
