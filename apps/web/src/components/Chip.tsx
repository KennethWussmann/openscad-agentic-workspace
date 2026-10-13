import type { ReactNode } from 'react'
import { cx } from './classes.ts'

type ChipProps = {
  active: boolean
  onClick: () => void
  icon?: boolean
  title?: string
  children: ReactNode
}

export const Chip = ({ active, onClick, icon, title, children }: ChipProps) => (
  <button type="button" className={cx('chip', icon && 'icon', active && 'is-active')} title={title} onClick={onClick}>
    {children}
  </button>
)
