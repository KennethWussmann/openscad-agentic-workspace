import type { ReactNode } from 'react'
import { cx } from './classes.ts'

type IconButtonProps = {
  title?: string
  className?: string
  onClick: () => void
  disabled?: boolean
  busy?: boolean
  children: ReactNode
}

export const IconButton = ({ title, className, onClick, disabled, busy, children }: IconButtonProps) => (
  <button
    type="button"
    className={cx('icon-btn', busy && 'is-busy', className)}
    title={title}
    disabled={disabled}
    onClick={onClick}
  >
    {children}
  </button>
)
