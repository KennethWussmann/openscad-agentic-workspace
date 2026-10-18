export type Unit = 'mm' | 'cm' | 'm' | 'in' | 'ft' | 'deg' | 'rad' | '%'

export type UnitKind = 'length' | 'angle' | 'ratio'

type UnitDef = { kind: UnitKind; factor: number; label: string; aliases: string[] }

export const UNITS: Record<Unit, UnitDef> = {
  mm: { kind: 'length', factor: 1, label: 'mm', aliases: ['millimeter', 'millimetre', 'millimeters', 'millimetres'] },
  cm: { kind: 'length', factor: 10, label: 'cm', aliases: ['centimeter', 'centimetre', 'centimeters', 'centimetres'] },
  m: { kind: 'length', factor: 1000, label: 'm', aliases: ['meter', 'metre', 'meters', 'metres'] },
  in: { kind: 'length', factor: 25.4, label: 'in', aliases: ['inch', 'inches', '"'] },
  ft: { kind: 'length', factor: 304.8, label: 'ft', aliases: ['foot', 'feet'] },
  deg: { kind: 'angle', factor: 1, label: '°', aliases: ['°', 'degree', 'degrees'] },
  rad: { kind: 'angle', factor: 180 / Math.PI, label: 'rad', aliases: ['radian', 'radians'] },
  '%': { kind: 'ratio', factor: 1, label: '%', aliases: ['percent'] },
}

export const KIND_NAMES: Record<UnitKind, string> = { length: 'a length', angle: 'an angle', ratio: 'a percentage' }

const UNIT_LIST = Object.keys(UNITS) as Unit[]

export const findUnit = (text: string): Unit | null => {
  const key = text.trim().toLowerCase()
  return UNIT_LIST.find((u) => u === key || UNITS[u].aliases.includes(key)) ?? null
}

export const unitsOfKind = (kind: UnitKind) => UNIT_LIST.filter((u) => UNITS[u].kind === kind)

const CAPTION_UNIT = /\s*\(([^()]+)\)\s*$/

export const splitCaptionUnit = (caption: string): { caption?: string; unit?: Unit } => {
  const match = CAPTION_UNIT.exec(caption)
  const unit = match ? findUnit(match[1] ?? '') : null
  if (!match || !unit) return { caption }
  const rest = caption.slice(0, match.index).trim()
  return rest ? { caption: rest, unit } : { unit }
}

export const convertUnit = (value: number, from: Unit, to: Unit) =>
  from === to ? value : roundFloat((value * UNITS[from].factor) / UNITS[to].factor)

export const roundFloat = (n: number) => Number(n.toPrecision(12))

export type Separators = { decimal: string; group: string }

export const localeSeparators = (locale?: string): Separators => {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567.5)
  return {
    decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
    group: parts.find((p) => p.type === 'group')?.value ?? ',',
  }
}

const GROUPED = (sep: string) => new RegExp(`^[1-9]\\d{0,2}(\\${sep}\\d{3})+$`)

const normalizeDigits = (raw: string, locale?: string): string | null => {
  const text = raw.replace(/[\s\u00a0\u202f'_]/g, '')
  const dots = text.split('.').length - 1
  const commas = text.split(',').length - 1
  if (dots && commas) {
    const decimal = text.lastIndexOf('.') > text.lastIndexOf(',') ? '.' : ','
    const group = decimal === '.' ? ',' : '.'
    const [int = '', frac, ...extra] = text.split(decimal)
    if (extra.length || frac === undefined || frac.includes(group)) return null
    if (!GROUPED(group).test(int)) return null
    return `${int.split(group).join('')}.${frac}`
  }
  const sep = dots ? '.' : commas ? ',' : null
  if (!sep) return text
  if (dots + commas > 1) return GROUPED(sep).test(text) ? text.split(sep).join('') : null
  const [int = '', frac = ''] = text.split(sep)
  const isGroup = sep !== localeSeparators(locale).decimal && /^[1-9]\d{0,2}$/.test(int) && /^\d{3}$/.test(frac)
  return isGroup ? `${int}${frac}` : `${int}.${frac}`
}

export const parseLocaleNumber = (raw: string, locale?: string): number | null => {
  const normalized = normalizeDigits(raw, locale)
  if (normalized === null) return null
  const n = Number(normalized.startsWith('.') ? `0${normalized}` : normalized)
  return Number.isFinite(n) ? n : null
}

export const formatNumber = (value: number, locale?: string) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(value)

export const formatQuantity = (value: number, unit?: Unit, locale?: string) => {
  const n = formatNumber(value, locale)
  if (!unit) return n
  return unit === 'deg' || unit === '%' ? `${n}${UNITS[unit].label}` : `${n} ${UNITS[unit].label}`
}
