import { describe, expect, it } from 'vitest'
import { isStaleOrFutureDate } from './dates'

describe('isStaleOrFutureDate', () => {
  it('returns null for today', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(isStaleOrFutureDate(today)).toBeNull()
  })

  it('warns for a date more than 60 days in the past', () => {
    const old = new Date()
    old.setDate(old.getDate() - 61)
    expect(isStaleOrFutureDate(old.toISOString().slice(0, 10))).toBe('Дата больше 60 дней назад')
  })

  it('does not warn for a date exactly 30 days in the past', () => {
    const recent = new Date()
    recent.setDate(recent.getDate() - 30)
    expect(isStaleOrFutureDate(recent.toISOString().slice(0, 10))).toBeNull()
  })

  it('warns for a future date', () => {
    const future = new Date()
    future.setDate(future.getDate() + 1)
    expect(isStaleOrFutureDate(future.toISOString().slice(0, 10))).toBe('Дата в будущем')
  })
})
