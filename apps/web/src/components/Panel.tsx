import type { ReactNode } from 'react'
import { cx } from './classes.ts'

type PanelProps = {
  title: string
  count: number
  className?: string
  extra?: ReactNode
  children: ReactNode
}

export const Panel = ({ title, count, className, extra, children }: PanelProps) => (
  <section className={cx('panel', className)}>
    <header className="panel-head">
      <h2>{title}</h2>
      <span className="count">{count}</span>
      {extra}
    </header>
    {children}
  </section>
)
