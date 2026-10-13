import type { ReactNode } from 'react'

type ButtonProps = {
  variant: 'primary' | 'ghost'
  onClick: () => void
  disabled?: boolean
  title?: string
  children: ReactNode
}

export const Button = ({ variant, onClick, disabled, title, children }: ButtonProps) => (
  <button type="button" className={`btn ${variant}`} onClick={onClick} disabled={disabled} title={title}>
    {children}
  </button>
)
