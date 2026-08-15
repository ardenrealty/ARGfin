'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function ChangePasswordForm() {
  const supabase = createClient()
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('saving')
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setStatus('error')
      return
    }
    setStatus('done')
    setPassword('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 text-sm">
      <label className="flex flex-col">
        Новый пароль
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
          className="rounded border px-2 py-1"
        />
      </label>
      <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-white hover:bg-gray-700">
        Сменить пароль
      </button>
      {status === 'done' && <span className="text-green-600">Пароль изменён</span>}
      {error && <span className="text-red-600">{error}</span>}
    </form>
  )
}
