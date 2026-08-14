const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000

export function isStaleOrFutureDate(dateStr: string): string | null {
  const date = new Date(`${dateStr}T00:00:00`)
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00')

  const diffMs = today.getTime() - date.getTime()

  if (diffMs < 0) return 'Дата в будущем'
  if (diffMs > SIXTY_DAYS_MS) return 'Дата больше 60 дней назад'
  return null
}
