import type { CheckStatus } from '@scad/protocol'

export const CHECK_LABEL: Record<CheckStatus, string> = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' }

export const CheckTag = ({ status }: { status: CheckStatus }) => (
  <span className={`check-tag is-${status}`}>{CHECK_LABEL[status]}</span>
)
