import type { ReactNode } from 'react'

type ComposerProps = {
  placeholder: string
  value: string
  onChange: (value: string) => void
  actions: ReactNode
  children?: ReactNode
}

export const Composer = ({ placeholder, value, onChange, actions, children }: ComposerProps) => (
  <div className="proposal">
    <textarea placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} rows={2} />
    {children}
    <div className="proposal-actions">{actions}</div>
  </div>
)
