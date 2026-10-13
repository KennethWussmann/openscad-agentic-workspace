import type { ReactNode } from 'react'

export const Badge = ({ tone, children }: { tone: 'amber' | 'cyan'; children: ReactNode }) => (
  <span className={`badge ${tone}`}>{children}</span>
)
