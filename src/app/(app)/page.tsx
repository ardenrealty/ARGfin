import { createClient } from '@/lib/supabase/server'
import { MonthlyPnlChart } from '@/components/dashboard/MonthlyPnlChart'

interface DashboardSummary {
  account_balance_total: number
  revenue_month: number
  expenses_month: number
  profit_month: number
  expected_receivables: number
  unrecognized_received: number
  personal_withdrawn: number
}

interface MonthlyPnlRow {
  month: string
  revenue: number
  expenses: number
  profit: number
}

interface MoneyDistribution {
  ads_expense: number
  salary_expense: number
  team_expense: number
  staff_expense: number
  personal_expense: number
  remaining: number
}

interface UpcomingCheckin {
  deal_id: string
  client_name: string
  checkin_date: string
  remaining: number
}

export default async function HomePage() {
  const supabase = await createClient()
  const [{ data: summaryData }, { data: seriesData }, { data: distributionData }, { data: checkinsData }] =
    (await Promise.all([
      supabase.rpc('dashboard_summary'),
      supabase.rpc('monthly_pnl_series', { p_months: 6 }),
      supabase.rpc('money_distribution'),
      supabase.rpc('upcoming_checkins', { p_limit: 10 }),
    ])) as unknown as [
      { data: DashboardSummary[] | null },
      { data: MonthlyPnlRow[] | null },
      { data: MoneyDistribution[] | null },
      { data: UpcomingCheckin[] | null },
    ]
  const upcomingCheckins = (checkinsData ?? []) as UpcomingCheckin[]
  const summary = summaryData?.[0]
  const distribution = distributionData?.[0] as MoneyDistribution | undefined
  const segments: [string, number, string][] = distribution
    ? [
        ['Реклама', distribution.ads_expense, '#f97316'],
        ['ФОТ', distribution.salary_expense, '#8b5cf6'],
        ['Команда', distribution.team_expense, '#0ea5e9'],
        ['Подотчёт', distribution.staff_expense, '#eab308'],
        ['Личное', distribution.personal_expense, '#ec4899'],
        ['Остаток', Math.max(distribution.remaining, 0), '#22c55e'],
      ]
    : []
  const total = segments.reduce((sum, [, value]) => sum + value, 0)

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

      <div className="space-y-2 rounded border bg-white p-4">
        <div className="text-sm font-medium">Распределение денег за месяц</div>
        <div className="flex h-6 overflow-hidden rounded">
          {segments.map(([label, value, color]) => (
            <div
              key={label}
              style={{ width: total > 0 ? `${(value / total) * 100}%` : '0%', backgroundColor: color }}
              title={`${label}: ${value.toLocaleString('ru-RU')}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {segments.map(([label, value, color]) => (
            <span key={label} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              {label}: {value.toLocaleString('ru-RU')}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-2 rounded border bg-white p-4">
        <div className="text-sm font-medium">Ближайшие заселения</div>
        {upcomingCheckins.length === 0 ? (
          <div className="text-sm text-gray-500">Нет предстоящих заселений</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-1">Клиент</th>
                <th className="py-1">Заселение</th>
                <th className="py-1">Доплата</th>
              </tr>
            </thead>
            <tbody>
              {upcomingCheckins.map((c) => (
                <tr key={c.deal_id} className="border-b">
                  <td className="py-1">{c.client_name}</td>
                  <td className="py-1">{c.checkin_date}</td>
                  <td className="py-1">{c.remaining.toLocaleString('ru-RU')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
