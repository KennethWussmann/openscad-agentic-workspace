import type { ReactNode } from 'react'
import { cx } from './classes.ts'

type ToolButtonProps = {
  active?: boolean
  label: string
  shortcut?: string
  onClick: () => void
  children: ReactNode
}

export const ToolButton = ({ active, label, shortcut, onClick, children }: ToolButtonProps) => (
  <button
    type="button"
    className={cx('tool', active && 'is-active')}
    onClick={onClick}
    title={shortcut ? `${label} (${shortcut})` : label}
    aria-pressed={active}
  >
    {children}
    <span className="tool-label">{label}</span>
  </button>
)
