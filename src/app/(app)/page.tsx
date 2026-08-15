import { createClient } from '@/lib/supabase/server'
import { MonthlyPnlChart } from '@/components/dashboard/MonthlyPnlChart'

interface DashboardSummary {
  account_balance_total: number
  revenue_month: number
  expenses_month: number
  profit_month: number
  expected_receivables: number
  unrecognized_received: number
  capital_invested: number
  personal_withdrawn: number
  free_cash: number
}

interface MonthlyPnlRow {
  month: string
  revenue: number
  expenses: number
  profit: number
}

export default async function HomePage() {
  const supabase = await createClient()
  const [{ data: summaryData }, { data: seriesData }] = (await Promise.all([
    supabase.rpc('dashboard_summary'),
    supabase.rpc('monthly_pnl_series', { p_months: 6 }),
  ])) as unknown as [{ data: DashboardSummary[] | null }, { data: MonthlyPnlRow[] | null }]
  const summary = summaryData?.[0]

  const cards: [string, number][] = summary
    ? [
        ['Остаток по счетам', summary.account_balance_total],
        ['Выручка месяца', summary.revenue_month],
        ['Расходы месяца', summary.expenses_month],
        ['Прибыль месяца', summary.profit_month],
        ['Ожидается', summary.expected_receivables],
        ['Получено, не признано', summary.unrecognized_received],
        ['Изъято лично', summary.personal_withdrawn],
      ]
    : []

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Дашборд</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded border bg-white p-4">
            <div className="text-xs text-gray-500">{label}</div>
            <div className="text-lg font-semibold">{value.toLocaleString('ru-RU')}</div>
          </div>
        ))}
      </div>

      <MonthlyPnlChart data={seriesData ?? []} />
    </div>
  )
}
