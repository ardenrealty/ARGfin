import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const NAV_LINKS = [
  { href: '/deals', label: 'Сделки' },
  { href: '/accounts', label: 'Счета' },
  { href: '/objects', label: 'Объекты' },
  { href: '/employees', label: 'Сотрудники' },
  { href: '/categories', label: 'Категории' },
  { href: '/transactions', label: 'Операции' },
]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  async function signOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex gap-4">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm text-gray-700 hover:text-gray-900">
              {link.label}
            </Link>
          ))}
        </div>
        <form action={signOut}>
          <button type="submit" className="text-sm text-gray-500 hover:text-gray-900">
            Выйти
          </button>
        </form>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  )
}
