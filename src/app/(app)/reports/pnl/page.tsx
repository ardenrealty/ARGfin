import { createClient } from '@/lib/supabase/server'
import { ExportCsvButton } from '@/components/ExportCsvButton'

interface PnlRow {
  revenue: number
  ads_expense: number
  salary_expense: number
  team_expense: number
  staff_expense: number
  profit: number
}

function defaultPeriod() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { from, to }
}

export default async function PnlReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const params = await searchParams
  const { from: defaultFrom, to: defaultTo } = defaultPeriod()
  const from = params.from || defaultFrom
  const to = params.to || defaultTo

  const supabase = await createClient()
  const { data } = (await supabase.rpc('pnl_report', { p_from: from, p_to: to })) as unknown as {
    data: PnlRow[] | null
  }
  const row = data?.[0]

  const rows: [string, number][] = row
    ? [
        ['Выручка', row.revenue],
        ['Реклама', row.ads_expense],
        ['ФОТ', row.salary_expense],
        ['Команда', row.team_expense],
        ['Подотчёт', row.staff_expense],
        ['Прибыль', row.profit],
      ]
    : []

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">P&amp;L за период</h1>

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
        <ExportCsvButton filename={`pnl_${from}_${to}.csv`} headers={['Показатель', 'Сумма']} rows={rows} />
      </div>

      <div className="overflow-x-auto">
      <table className="w-full border-collapse rounded border bg-white text-sm">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-b">
              <td className="p-2 font-medium">{label}</td>
              <td className="p-2">{value.toLocaleString('ru-RU')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
