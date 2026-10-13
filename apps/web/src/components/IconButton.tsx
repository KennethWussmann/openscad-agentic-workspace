import type { ReactNode } from 'react'
import { cx } from './classes.ts'

type IconButtonProps = {
  title?: string
  onClick: () => void
  disabled?: boolean
  busy?: boolean
  children: ReactNode
}

export const IconButton = ({ title, onClick, disabled, busy, children }: IconButtonProps) => (
  <button
    type="button"
    className={cx('icon-btn', busy && 'is-busy')}
    title={title}
    disabled={disabled}
    onClick={onClick}
  >
    {children}
  </button>
)
