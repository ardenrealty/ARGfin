import { createClient } from '@/lib/supabase/server'
import type { ObjectRecord } from '@/types/database'
import { ObjectForm } from './ObjectForm'
import { softDeleteObject } from './actions'

export default async function ObjectsPage() {
  const supabase = await createClient()
  const { data: objects } = (await supabase
    .from('objects')
    .select('*')
    .is('deleted_at', null)
    .order('title')) as unknown as { data: ObjectRecord[] }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Объекты</h1>
      <ObjectForm />
      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Название</th>
            <th className="p-2">Адрес</th>
            <th className="p-2">Владелец</th>
            <th className="p-2">Комиссия, %</th>
            <th className="p-2">Активен</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {(objects ?? []).map((o) => (
            <tr key={o.id} className="border-b">
              <td className="p-2">{o.title}</td>
              <td className="p-2">{o.address}</td>
              <td className="p-2">{o.owner_name}</td>
              <td className="p-2">{o.default_commission_pct ?? '—'}</td>
              <td className="p-2">{o.is_active ? 'да' : 'нет'}</td>
              <td className="p-2">
                <form action={softDeleteObject.bind(null, o.id)}>
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
