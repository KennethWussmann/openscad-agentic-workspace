import type { DefineValue, ParamDef } from '@scad/protocol'
import { useState } from 'react'
import { cx } from '../../components/classes.ts'

type InputProps = { value: DefineValue; onChange: (v: DefineValue) => void }

const VectorInput = ({ value, onChange }: InputProps) => {
  const [text, setText] = useState(JSON.stringify(value))
  const [bad, setBad] = useState(false)
  return (
    <input
      type="text"
      className={cx('mono', bad && 'is-bad')}
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
  )
}

const NumberInput = ({ def, value, onChange }: InputProps & { def: ParamDef }) => {
  const n = Number(value)
  const ranged = def.min !== undefined && def.max !== undefined
  return (
    <div className="num">
      {ranged && (
        <input
          type="range"
          min={def.min}
          max={def.max}
          step={def.step ?? 'any'}
          value={n}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )}
      <input
        type="number"
        className="mono"
        step={def.step ?? 'any'}
        value={n}
        onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))}
      />
    </div>
  )
}

export const ParamInput = ({ def, value, onChange }: InputProps & { def: ParamDef }) => {
  if (def.options)
    return (
      <select value={JSON.stringify(value)} onChange={(e) => onChange(JSON.parse(e.target.value) as DefineValue)}>
        {def.options.map((o) => (
          <option key={JSON.stringify(o.value)} value={JSON.stringify(o.value)}>
            {o.name}
          </option>
        ))}
      </select>
    )
  if (def.type === 'boolean')
    return (
      <button type="button" className={cx('switch', Boolean(value) && 'is-on')} onClick={() => onChange(!value)}>
        <span />
      </button>
    )
  if (def.type === 'number') return <NumberInput def={def} value={value} onChange={onChange} />
  if (def.type === 'vector') return <VectorInput value={value} onChange={onChange} />
  return <input type="text" value={String(value)} onChange={(e) => onChange(e.target.value)} />
}
