import type { CheckStatus } from '@scad/protocol'

const CHECK_LABEL: Record<CheckStatus, string> = { pass: 'Pass', warn: 'Warn', fail: 'Fail' }

export const CheckTag = ({ status }: { status: CheckStatus }) => (
  <span className={`check-tag is-${status}`}>{CHECK_LABEL[status]}</span>
)
