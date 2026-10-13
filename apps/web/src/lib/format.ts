import type { Diagnostic } from '@scad/protocol'

export const fmt = (n: number) => {
  const a = Math.abs(n)
  return a >= 1000 ? n.toFixed(0) : a >= 100 ? n.toFixed(1) : n.toFixed(2)
}

export const fmtVec = (v: number[]) => v.map((n) => fmt(n)).join(' x ')

export const baseName = (file: string) => file.split('/').at(-1) ?? file

export const location = (d: Diagnostic) => (d.file ? `${d.file}${d.line ? `:${d.line}` : ''}` : '')

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
