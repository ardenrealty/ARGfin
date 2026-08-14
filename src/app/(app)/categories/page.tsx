import { createClient } from '@/lib/supabase/server'
import type { Category } from '@/types/database'
import { CategoryForm } from './CategoryForm'
import { ensureDefaultTeamCategories, softDeleteCategory } from './actions'

const GROUP_LABELS: Record<Category['group'], string> = {
  ads: 'Реклама',
  team: 'Команда',
  staff: 'Подотчёт',
  personal: 'Личное',
}

export default async function CategoriesPage() {
  await ensureDefaultTeamCategories()

  const supabase = await createClient()
  const { data: categories } = (await supabase
    .from('categories')
    .select('*')
    .is('deleted_at', null)
    .order('group')
    .order('name')) as unknown as { data: Category[] }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Категории расходов</h1>
      <CategoryForm />
      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Название</th>
            <th className="p-2">Группа</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {(categories ?? []).map((c) => (
            <tr key={c.id} className="border-b">
              <td className="p-2">{c.name}</td>
              <td className="p-2">{GROUP_LABELS[c.group]}</td>
              <td className="p-2">
                <form action={softDeleteCategory.bind(null, c.id)}>
                  <button type="submit" className="text-xs text-red-600 hover:underline">
                    Удалить
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
