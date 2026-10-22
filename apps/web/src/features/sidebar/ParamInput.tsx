import { type DefineValue, type ParamDef, UNITS } from '@scad/protocol'
import { useState } from 'react'
import { cx } from '../../components/classes.ts'
import { QuantityInput } from '../../components/QuantityInput.tsx'

type InputProps = { label: string; value: DefineValue; onChange: (v: DefineValue) => void }

const VectorInput = ({ def, label, value, onChange }: InputProps & { def: ParamDef }) => {
  const [text, setText] = useState(JSON.stringify(value))
  const [bad, setBad] = useState(false)
  return (
    <div className={cx('quantity-field', bad && 'is-bad')}>
      <input
        type="text"
        aria-label={label}
        aria-invalid={bad}
        className="mono"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          try {
            const parsed = JSON.parse(e.target.value) as DefineValue
            setBad(!Array.isArray(parsed))
            if (Array.isArray(parsed)) onChange(parsed)
          } catch {
            setBad(true)
          }
        }}
      />
      {def.unit && <span className="quantity-unit mono">{UNITS[def.unit].label}</span>}
    </div>
  )
}

const NumberInput = ({ def, label, value, onChange }: InputProps & { def: ParamDef }) => {
  const n = Number(value)
  const ranged = def.min !== undefined && def.max !== undefined
  return (
    <div className="num">
      {ranged && (
        <input
          type="range"
          aria-label={`${label} slider`}
          min={def.min}
          max={def.max}
          step={def.step ?? 'any'}
          value={n}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )}
      <QuantityInput
        label={label}
        value={n}
        unit={def.unit}
        min={def.min}
        max={def.max}
        step={def.step}
        onCommit={onChange}
      />
    </div>
  )
}
export const ParamInput = ({ def, label, value, onChange }: InputProps & { def: ParamDef }) => {
  if (def.options)
    return (
      <select
        aria-label={label}
        value={JSON.stringify(value)}
        onChange={(e) => onChange(JSON.parse(e.target.value) as DefineValue)}
      >
        {def.options.map((o) => (
          <option key={JSON.stringify(o.value)} value={JSON.stringify(o.value)}>
            {o.name}
          </option>
        ))}
      </select>
    )
  if (def.type === 'boolean')
    return (
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={Boolean(value)}
        className={cx('switch', Boolean(value) && 'is-on')}
        onClick={() => onChange(!value)}
      >
        <span />
      </button>
    )
  if (def.type === 'number') return <NumberInput def={def} label={label} value={value} onChange={onChange} />
  if (def.type === 'vector') return <VectorInput def={def} label={label} value={value} onChange={onChange} />
  return <input type="text" aria-label={label} value={String(value)} onChange={(e) => onChange(e.target.value)} />
}
