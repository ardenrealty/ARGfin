import { createClient } from '@/lib/supabase/server'
import { ExportCsvButton } from '@/components/ExportCsvButton'

interface MarginRow {
  object_id: string
  object_title: string
  recognized_commission: number
  ads_spend: number
  margin: number
}

function defaultPeriod() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { from, to }
}

export default async function ObjectMarginReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const params = await searchParams
  const { from: defaultFrom, to: defaultTo } = defaultPeriod()
  const from = params.from || defaultFrom
  const to = params.to || defaultTo

  const supabase = await createClient()
  const { data } = (await supabase.rpc('object_margin_report', { p_from: from, p_to: to })) as unknown as {
    data: MarginRow[] | null
  }
  const rows = data ?? []

  const csvRows: (string | number)[][] = rows.map((r) => [
    r.object_title,
    r.recognized_commission,
    r.ads_spend,
    r.margin,
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Маржа по объектам</h1>

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
          filename={`object_margin_${from}_${to}.csv`}
          headers={['Объект', 'Комиссии', 'Реклама', 'Маржа']}
          rows={csvRows}
        />
      </div>

      <div className="overflow-x-auto">
      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Объект</th>
            <th className="p-2">Комиссии</th>
            <th className="p-2">Реклама</th>
            <th className="p-2">Маржа</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.object_id} className="border-b">
              <td className="p-2">{r.object_title}</td>
              <td className="p-2">{r.recognized_commission.toLocaleString('ru-RU')}</td>
              <td className="p-2">{r.ads_spend.toLocaleString('ru-RU')}</td>
              <td className="p-2">{r.margin.toLocaleString('ru-RU')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
