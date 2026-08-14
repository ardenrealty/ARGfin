import { createClient } from '@/lib/supabase/server'
import type { Account, AccountBalance } from '@/types/database'
import { AccountForm } from './AccountForm'
import { softDeleteAccount } from './actions'

export default async function AccountsPage() {
  const supabase = await createClient()

  const [{ data: accounts }, { data: balances }] = await Promise.all([
    supabase.from('accounts').select('*').is('deleted_at', null).order('created_at') as unknown as Promise<{ data: Account[] }>,
    supabase.from('account_balances').select('*') as unknown as Promise<{ data: AccountBalance[] }>,
  ])

  const balanceByAccount = new Map((balances ?? []).map((b) => [b.account_id, b.balance]))

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Счета</h1>
      <AccountForm />
      <table className="w-full border-collapse rounded border bg-white text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="p-2">Название</th>
            <th className="p-2">Тип</th>
            <th className="p-2">Остаток</th>
            <th className="p-2">Активен</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {(accounts ?? []).map((a) => (
            <tr key={a.id} className="border-b">
              <td className="p-2">{a.name}</td>
              <td className="p-2">{a.kind}</td>
              <td className="p-2">{(balanceByAccount.get(a.id) ?? 0).toLocaleString('ru-RU')}</td>
              <td className="p-2">{a.is_active ? 'да' : 'нет'}</td>
              <td className="p-2">
                <form action={softDeleteAccount.bind(null, a.id)}>
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
