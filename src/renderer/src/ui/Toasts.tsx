import { app } from '@/state/app'

export function Toasts(): React.JSX.Element {
  const toasts = app.use((s) => s.toasts)
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  )
}
