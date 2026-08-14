'use client'

import { useRef } from 'react'
import { createCategory } from './actions'

export function CategoryForm() {
  const formRef = useRef<HTMLFormElement>(null)

  async function action(formData: FormData) {
    await createCategory(formData)
    formRef.current?.reset()
  }

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3 rounded border bg-white p-4">
      <label className="flex flex-col text-sm">
        Название
        <input name="name" required className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col text-sm">
        Группа
        <select name="group" defaultValue="team" className="rounded border px-2 py-1">
          <option value="ads">Реклама</option>
          <option value="team">Команда</option>
          <option value="staff">Подотчёт</option>
          <option value="personal">Личное</option>
        </select>
      </label>
      <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700">
        Добавить категорию
      </button>
    </form>
  )
}
