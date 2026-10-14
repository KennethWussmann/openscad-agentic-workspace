import { setNameProblem } from '@scad/protocol'
import { Check, X } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Button } from '../../components/Button.tsx'
import { slugify } from '../../lib/sets.ts'

export type SetDraft = { name: string; label: string; export: boolean }

type SaveSetFormProps = {
  existing: string[]
  busy: boolean
  error: string | null
  onSave: (draft: SetDraft) => void
  onCancel: () => void
}

export const SaveSetForm = ({ existing, busy, error, onSave, onCancel }: SaveSetFormProps) => {
  const [label, setLabel] = useState('')
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const [release, setRelease] = useState(false)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => first.current?.focus(), [])
  const effective = touched ? name : slugify(label)
  const problem = effective ? setNameProblem(effective, existing) : null
  const ready = Boolean(effective) && !problem && !busy
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (ready) onSave({ name: effective, label: label.trim(), export: release })
  }
  return (
    <form
      className="set-form"
      onSubmit={submit}
      aria-label="Save as set"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement && e.target.type === 'text') submit(e)
        if (e.key === 'Escape') onCancel()
      }}
    >
      <label className="set-field">
        <span className="mono">Label</span>
        <input
          ref={first}
          type="text"
          placeholder="Screw tray"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>
      <label className="set-field">
        <span className="mono">Name</span>
        <input
          type="text"
          className="mono"
          placeholder="screw-tray"
          aria-invalid={Boolean(problem)}
          value={effective}
          onChange={(e) => {
            setTouched(true)
            setName(e.target.value)
          }}
        />
      </label>
      <label className="set-check">
        <input type="checkbox" checked={release} onChange={(e) => setRelease(e.target.checked)} />
        <span>Export on release</span>
      </label>
      {(problem || error) && <p className="set-form-error">{problem ? `Name: ${problem}` : error}</p>}
      <div className="proposal-actions">
        <Button variant="ghost" onClick={onCancel}>
          <X size={14} /> Cancel
        </Button>
        <Button variant="primary" onClick={() => submit()} disabled={!ready}>
          <Check size={14} /> Save set
        </Button>
      </div>
    </form>
  )
}
