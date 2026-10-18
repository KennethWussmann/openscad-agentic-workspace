import { formatNumber, formatQuantity, parseQuantity, roundFloat, UNITS, type Unit } from '@scad/protocol'
import { type KeyboardEvent, useId, useState } from 'react'
import { BROWSER_LOCALE } from '../lib/locale.ts'
import { cx } from './classes.ts'

type Props = {
  label: string
  value: number
  onCommit: (value: number) => void
  unit?: Unit
  min?: number
  max?: number
  step?: number
  locale?: string
}

type Draft = { text: string; error: string | null; base: number }

const decimals = (n: number) => (String(n).split('.')[1] ?? '').length

export const QuantityInput = ({ label, value, onCommit, unit, min, max, step, locale = BROWSER_LOCALE }: Props) => {
  const errorId = useId()
  const [draft, setDraft] = useState<Draft | null>(null)
  const active = draft?.base === value ? draft : null

  const evaluate = (text: string) => {
    const parsed = parseQuantity(text, { unit, locale })
    if (!parsed.ok) return parsed
    if (min !== undefined && parsed.value < min)
      return { ok: false as const, error: `Minimum is ${formatQuantity(min, unit, locale)}` }
    if (max !== undefined && parsed.value > max)
      return { ok: false as const, error: `Maximum is ${formatQuantity(max, unit, locale)}` }
    return parsed
  }

  const commit = (next: number) => {
    setDraft({ text: formatNumber(next, locale), error: null, base: next })
    if (next !== value) onCommit(next)
  }

  const submit = () => {
    if (!active) return
    const result = evaluate(active.text)
    if (result.ok) commit(result.value)
    else setDraft({ ...active, error: result.error })
  }

  const nudge = (direction: number, big: boolean) => {
    const current = active ? evaluate(active.text) : null
    const base = current?.ok ? current.value : value
    const size = (step ?? 1) * (big ? 10 : 1)
    let next = roundFloat(Number((base + direction * size).toFixed(Math.max(decimals(size), decimals(base)))))
    if (min !== undefined) next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    commit(next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setDraft({ text: formatNumber(value, locale), error: null, base: value })
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      nudge(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey)
    }
  }

  const error = active?.error ?? null
  return (
    <div className="quantity">
      <div className={cx('quantity-field', error && 'is-bad')}>
        <input
          type="text"
          role="spinbutton"
          autoComplete="off"
          spellCheck={false}
          aria-label={label}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuetext={formatQuantity(value, unit, locale)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className="mono"
          value={active?.text ?? formatNumber(value, locale)}
          onFocus={(e) => {
            setDraft({ text: formatNumber(value, locale), error: null, base: value })
            e.currentTarget.select()
          }}
          onChange={(e) => setDraft({ text: e.target.value, error: null, base: value })}
          onKeyDown={onKeyDown}
          onBlur={() => {
            const result = active ? evaluate(active.text) : null
            if (result?.ok && result.value !== value) onCommit(result.value)
            setDraft(null)
          }}
        />
        {unit && (
          <span
            className="quantity-unit mono"
            title={`Value in ${unit}. Other units and arithmetic such as "1 m - 3 cm" or "100 cm * 2" convert on Enter`}
          >
            {UNITS[unit].label}
          </span>
        )}
      </div>
      {error && (
        <small id={errorId} className="quantity-error" role="alert">
          {error}
        </small>
      )}
    </div>
  )
}
