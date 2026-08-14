import { createClient } from '@/lib/supabase/server'
import { ExportCsvButton } from '@/components/ExportCsvButton'

interface PlatformEfficiencyRow {
  source: string
  deals_count: number
  commission_total: number
  ads_spend: number
  cost_per_deal: number
}

const SOURCE_LABELS: Record<string, string> = {
  avito: 'Avito',
  cian: 'Циан',
  recommend: 'Рекомендация',
  other: 'Другое',
}

function defaultPeriod() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { from, to }
}

export default async function PlatformEfficiencyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const params = await searchParams
  const { from: defaultFrom, to: defaultTo } = defaultPeriod()
  const from = params.from || defaultFrom
  const to = params.to || defaultTo

  const supabase = await createClient()
  const { data } = (await supabase.rpc('platform_efficiency_report', { p_from: from, p_to: to })) as unknown as {
    data: PlatformEfficiencyRow[] | null
  }
  const rows = data ?? []

  const csvRows: (string | number)[][] = rows.map((r) => [
    SOURCE_LABELS[r.source] ?? r.source,
    r.deals_count,
    r.commission_total,
    r.ads_spend,
    r.cost_per_deal,
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Эффективность площадок</h1>

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
          filename={`platform_efficiency_${from}_${to}.csv`}
          headers={['Площадка', 'Сделок', 'Комиссии', 'Реклама', 'Стоимость сделки']}
          rows={csvRows}
        />
      </div>

      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Площадка</th>
            <th className="p-2">Сделок</th>
            <th className="p-2">Комиссии</th>
            <th className="p-2">Реклама</th>
            <th className="p-2">Стоимость сделки</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.source} className="border-b">
              <td className="p-2">{SOURCE_LABELS[r.source] ?? r.source}</td>
              <td className="p-2">{r.deals_count}</td>
              <td className="p-2">{r.commission_total.toLocaleString('ru-RU')}</td>
              <td className="p-2">{r.ads_spend.toLocaleString('ru-RU')}</td>
              <td className="p-2">{r.cost_per_deal.toLocaleString('ru-RU')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
