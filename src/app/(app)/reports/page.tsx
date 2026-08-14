import Link from 'next/link'

const REPORTS = [
  { href: '/reports/pnl', label: 'P&L за период' },
  { href: '/reports/accounts', label: 'Остатки и обороты по счетам' },
  { href: '/reports/objects', label: 'Маржа по объектам' },
  { href: '/reports/employees', label: 'Сводка по сотрудникам' },
  { href: '/reports/platforms', label: 'Эффективность площадок' },
]

export default function ReportsIndexPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Отчёты</h1>
      <ul className="space-y-2">
        {REPORTS.map((r) => (
          <li key={r.href}>
            <Link href={r.href} className="text-blue-600 hover:underline">
              {r.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
