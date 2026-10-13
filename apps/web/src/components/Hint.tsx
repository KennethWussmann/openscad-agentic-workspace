import type { ReactNode } from 'react'
import { cx } from './classes.ts'

export const Hint = ({ tone, children }: { tone?: 'ok' | 'warn' | 'error'; children: ReactNode }) => (
  <p className={cx('hint', tone)}>{children}</p>
)
