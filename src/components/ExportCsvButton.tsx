'use client'

function escapeCsvCell(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function ExportCsvButton({
  filename,
  headers,
  rows,
}: {
  filename: string
  headers: string[]
  rows: (string | number)[][]
}) {
  function handleExport() {
    const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(','))
    // Leading BOM so Excel opens UTF-8 Cyrillic content correctly.
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className="rounded border px-3 py-1 text-sm hover:bg-gray-50"
    >
      Экспорт в CSV
    </button>
  )
}
