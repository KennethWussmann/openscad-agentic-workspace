import { formatPartParamIssue, formatSetIssue } from '@scad/core'
import type { DefineValue, PartParamIssue, SetIssue } from '@scad/protocol'

export const formatSetIssues = (issues: SetIssue[], indent = '  ') =>
  issues.map((i) => `${indent}WARNING ${formatSetIssue(i)}`)

export const formatPartParamIssues = (issues: PartParamIssue[], indent = '  ') =>
  issues.map((i) => `${indent}WARNING ${formatPartParamIssue(i)}`)

export const formatValues = (values: Record<string, DefineValue>) =>
  Object.entries(values)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(', ')
