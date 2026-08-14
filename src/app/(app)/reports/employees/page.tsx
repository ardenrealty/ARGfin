import { createClient } from '@/lib/supabase/server'
import { ExportCsvButton } from '@/components/ExportCsvButton'

interface EmployeeSummaryRow {
  employee_id: string
  employee_name: string
  salary_paid: number
  staff_expense: number
  total_paid: number
}

function defaultPeriod() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { from, to }
}

export default async function EmployeeSummaryReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const params = await searchParams
  const { from: defaultFrom, to: defaultTo } = defaultPeriod()
  const from = params.from || defaultFrom
  const to = params.to || defaultTo

  const supabase = await createClient()
  const { data } = (await supabase.rpc('employee_summary_report', { p_from: from, p_to: to })) as unknown as {
    data: EmployeeSummaryRow[] | null
  }
  const rows = data ?? []

  const csvRows: (string | number)[][] = rows.map((r) => [
    r.employee_name,
    r.salary_paid,
    r.staff_expense,
    r.total_paid,
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Сводка по сотрудникам</h1>

      <form className="flex flex-wrap items-end gap-3 rounded border bg-white p-4 text-sm">
        <label className="flex flex-col">
          С даты
          <input type="date" name="from" defaultValue={from} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          По дату
          <input type="date" name="to" defaultValue={to} className="rounded border px-2 py-1" />
        </label>
        <button type="submit" className="rounded border px-3 py-1 hover:bg-gray-50">
          Применить
        </button>
      </form>

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{from} — {to}</span>
        <ExportCsvButton
          filename={`employee_summary_${from}_${to}.csv`}
          headers={['Сотрудник', 'Выплачено (оклад)', 'Подотчёт', 'Итого']}
          rows={csvRows}
        />
      </div>

      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Сотрудник</th>
            <th className="p-2">Выплачено (оклад)</th>
            <th className="p-2">Подотчёт</th>
            <th className="p-2">Итого</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.employee_id} className="border-b">
              <td className="p-2">{r.employee_name}</td>
              <td className="p-2">{r.salary_paid.toLocaleString('ru-RU')}</td>
              <td className="p-2">{r.staff_expense.toLocaleString('ru-RU')}</td>
              <td className="p-2">{r.total_paid.toLocaleString('ru-RU')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
