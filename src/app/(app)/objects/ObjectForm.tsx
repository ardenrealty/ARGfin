'use client'

import { useRef } from 'react'
import type { ObjectRecord } from '@/types/database'
import { createObject, updateObject } from './actions'

export function ObjectForm({ object }: { object?: ObjectRecord }) {
  const formRef = useRef<HTMLFormElement>(null)

  async function action(formData: FormData) {
    if (object) {
      await updateObject(object.id, formData)
    } else {
      await createObject(formData)
      formRef.current?.reset()
    }
  }

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3 rounded border bg-white p-4">
      <label className="flex flex-col text-sm">
        Название
        <input name="title" defaultValue={object?.title} required className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col text-sm">
        Адрес
        <input name="address" defaultValue={object?.address ?? ''} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col text-sm">
        Владелец
        <input name="owner_name" defaultValue={object?.owner_name ?? ''} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col text-sm">
        Контакт владельца
        <input name="owner_contact" defaultValue={object?.owner_contact ?? ''} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col text-sm">
        Комиссия по умолчанию, %
        <input
          name="default_commission_pct"
          type="number"
          step="0.01"
          defaultValue={object?.default_commission_pct ?? ''}
          className="w-24 rounded border px-2 py-1"
        />
      </label>
      {object && (
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={object.is_active} />
          Активен
        </label>
      )}
      <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700">
        {object ? 'Сохранить' : 'Добавить объект'}
      </button>
    </form>
  )
}
