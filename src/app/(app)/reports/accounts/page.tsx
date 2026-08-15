import { createClient } from '@/lib/supabase/server'
import { ExportCsvButton } from '@/components/ExportCsvButton'

interface TurnoverRow {
  account_id: string
  account_name: string
  opening_balance: number
  period_in: number
  period_out: number
  closing_balance: number
}

function defaultPeriod() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { from, to }
}

export default async function AccountTurnoverReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const params = await searchParams
  const { from: defaultFrom, to: defaultTo } = defaultPeriod()
  const from = params.from || defaultFrom
  const to = params.to || defaultTo

  const supabase = await createClient()
  const { data } = (await supabase.rpc('account_turnover_report', { p_from: from, p_to: to })) as unknown as {
    data: TurnoverRow[] | null
  }
  const rows = data ?? []

  const csvRows: (string | number)[][] = rows.map((r) => [
    r.account_name,
    r.opening_balance,
    r.period_in,
    r.period_out,
    r.closing_balance,
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Остатки и обороты по счетам</h1>

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
          filename={`account_turnover_${from}_${to}.csv`}
          headers={['Счёт', 'Начальный остаток', 'Приход', 'Расход', 'Конечный остаток']}
          rows={csvRows}
        />
      </div>

      <div className="overflow-x-auto">
      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Счёт</th>
            <th className="p-2">Начальный остаток</th>
            <th className="p-2">Приход</th>
            <th className="p-2">Расход</th>
            <th className="p-2">Конечный остаток</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.account_id} className="border-b">
              <td className="p-2">{r.account_name}</td>
              <td className="p-2">{r.opening_balance.toLocaleString('ru-RU')}</td>
              <td className="p-2">{r.period_in.toLocaleString('ru-RU')}</td>
              <td className="p-2">{r.period_out.toLocaleString('ru-RU')}</td>
              <td className="p-2">{r.closing_balance.toLocaleString('ru-RU')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
