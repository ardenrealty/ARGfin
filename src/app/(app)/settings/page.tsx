import { BackupButton } from './BackupButton'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Настройки</h1>

      <section className="space-y-2 rounded border bg-white p-4">
        <h2 className="text-sm font-medium">Бэкап</h2>
        <BackupButton />
      </section>

      <section className="space-y-2 rounded border bg-white p-4">
        <h2 className="text-sm font-medium">Смена пароля</h2>
      </section>
    </div>
  )
}
