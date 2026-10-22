import {
  convertUnit,
  findUnit,
  KIND_NAMES,
  parseLocaleNumber,
  roundFloat,
  UNITS,
  type Unit,
  unitsOfKind,
} from './units.ts'

export type ParsedNumber = { ok: true; value: number } | { ok: false; error: string }

type QuantityOptions = { unit?: Unit; locale?: string }

type Token = { type: 'num' | 'op' | 'word'; text: string }

type Value = { n: number; unit: boolean }

class QuantityError extends Error {}

const NUM = /^(?:\d|[.,]\d)[\d.,'_\u00a0\u202f]*/
const OP = /^[-+\u2212*/\u00d7\u00b7\u00f7()]/
const WORD = /^[^\s\d.,+\-\u2212*/\u00d7\u00b7\u00f7()]+/

const ADD = ['+', '-', '\u2212']
const MUL = ['*', '\u00d7', '\u00b7']
const DIV = ['/', '\u00f7']

const tokenize = (text: string): Token[] => {
  const tokens: Token[] = []
  let rest = text
  while (rest) {
    const space = /^\s+/.exec(rest)
    if (space) {
      rest = rest.slice(space[0].length)
      continue
    }
    const num = NUM.exec(rest)
    const op = num ? null : OP.exec(rest)
    const word = num || op ? null : WORD.exec(rest)
    const [match = ''] = num ?? op ?? word ?? []
    if (!match) throw new QuantityError(`Unexpected "${rest[0]}"`)
    tokens.push({ type: num ? 'num' : op ? 'op' : 'word', text: match })
    rest = rest.slice(match.length)
  }
  return tokens
}

const evaluate = (tokens: Token[], opts: QuantityOptions): Value => {
  let pos = 0
  const peek = () => tokens[pos]
  const isOp = (ops: string[]) => peek()?.type === 'op' && ops.includes(peek()?.text ?? '')

  const withUnit = (value: Value): Value => {
    const token = peek()
    if (token?.type !== 'word') return value
    pos++
    const from = findUnit(token.text)
    if (!from) throw new QuantityError(`Unknown unit "${token.text}"`)
    if (value.unit) throw new QuantityError(`"${token.text}" follows a value that already has a unit`)
    if (!opts.unit) throw new QuantityError('This value has no unit')
    const want = UNITS[opts.unit].kind
    if (UNITS[from].kind !== want)
      throw new QuantityError(`Enter ${KIND_NAMES[want]} (${unitsOfKind(want).join(', ')})`)
    return { n: convertUnit(value.n, from, opts.unit), unit: true }
  }

  const primary = (): Value => {
    const token = tokens[pos++]
    if (!token) throw new QuantityError('Incomplete expression')
    if (token.type === 'num') {
      const n = parseLocaleNumber(token.text, opts.locale)
      if (n === null) throw new QuantityError(`"${token.text}" is not a number`)
      return withUnit({ n, unit: false })
    }
    if (token.text === '(') {
      const inner = expression()
      if (tokens[pos++]?.text !== ')') throw new QuantityError('Missing ")"')
      return withUnit(inner)
    }
    throw new QuantityError(token.type === 'word' ? `"${token.text}" is not a number` : `Unexpected "${token.text}"`)
  }

  const factor = (): Value => {
    if (!isOp(ADD)) return primary()
    const sign = tokens[pos++]?.text
    const value = factor()
    return sign === '+' ? value : { ...value, n: -value.n }
  }

  const term = (): Value => {
    let left = factor()
    while (isOp(MUL) || isOp(DIV)) {
      const divide = DIV.includes(tokens[pos++]?.text ?? '')
      const right = factor()
      if (!divide) {
        if (left.unit && right.unit) throw new QuantityError('Multiply by plain numbers only, e.g. "10 cm * 2"')
        left = { n: left.n * right.n, unit: left.unit || right.unit }
      } else {
        if (right.n === 0) throw new QuantityError('Division by zero')
        if (right.unit && !left.unit) throw new QuantityError('Divide by plain numbers only, e.g. "1 m / 4"')
        left = { n: left.n / right.n, unit: left.unit && !right.unit }
      }
    }
    return left
  }

  const expression = (): Value => {
    let left = term()
    while (isOp(ADD)) {
      const subtract = tokens[pos++]?.text !== '+'
      const right = term()
      left = { n: subtract ? left.n - right.n : left.n + right.n, unit: left.unit || right.unit }
    }
    return left
  }

  const result = expression()
  const extra = peek()
  if (extra) throw new QuantityError(`Unexpected "${extra.text}"`)
  return result
}

export const parseQuantity = (input: string, opts: QuantityOptions = {}): ParsedNumber => {
  const text = input.trim()
  if (!text) return { ok: false, error: 'Enter a number' }
  try {
    const { n } = evaluate(tokenize(text), opts)
    if (!Number.isFinite(n)) return { ok: false, error: 'The result is not a finite number' }
    return { ok: true, value: roundFloat(n) }
  } catch (e) {
    if (e instanceof QuantityError) return { ok: false, error: e.message }
    throw e
  }
}
