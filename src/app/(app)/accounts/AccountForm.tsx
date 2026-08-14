'use client'

import { useRef } from 'react'
import type { Account } from '@/types/database'
import { createAccount, updateAccount } from './actions'

export function AccountForm({ account }: { account?: Account }) {
  const formRef = useRef<HTMLFormElement>(null)

  async function action(formData: FormData) {
    if (account) {
      await updateAccount(account.id, formData)
    } else {
      await createAccount(formData)
      formRef.current?.reset()
    }
  }

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3 rounded border bg-white p-4">
      <label className="flex flex-col text-sm">
        Название
        <input name="name" defaultValue={account?.name} required className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col text-sm">
        Тип
        <select name="kind" defaultValue={account?.kind ?? 'cash'} className="rounded border px-2 py-1">
          <option value="cash">Наличные</option>
          <option value="bank">Банк</option>
          <option value="card">Карта</option>
        </select>
      </label>
      {account && (
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={account.is_active} />
          Активен
        </label>
      )}
      <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700">
        {account ? 'Сохранить' : 'Добавить счёт'}
      </button>
    </form>
  )
}
