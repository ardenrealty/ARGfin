'use client'

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

interface MonthlyPnlRow {
  month: string
  revenue: number
  expenses: number
  profit: number
}

export function MonthlyPnlChart({ data }: { data: MonthlyPnlRow[] }) {
  const formatted = data.map((row) => ({
    ...row,
    monthLabel: new Date(row.month).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }),
  }))

  return (
    <div className="h-72 rounded border bg-white p-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="monthLabel" />
          <YAxis />
          <Tooltip formatter={(value) => Number(value).toLocaleString('ru-RU')} />
          <Legend />
          <Bar dataKey="revenue" name="Выручка" fill="#16a34a" />
          <Bar dataKey="expenses" name="Расходы" fill="#dc2626" />
          <Bar dataKey="profit" name="Прибыль" fill="#2563eb" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
