import type { DefineValue, ParamDef, ProjectState } from '@scad/protocol'
import { RotateCcw, Send } from 'lucide-react'
import { useState } from 'react'
import { api } from '../../api/client.ts'
import { Badge } from '../../components/Badge.tsx'
import { Button } from '../../components/Button.tsx'
import { Composer } from '../../components/Composer.tsx'
import { cx } from '../../components/classes.ts'
import { Hint } from '../../components/Hint.tsx'
import { IconButton } from '../../components/IconButton.tsx'
import { Panel } from '../../components/Panel.tsx'
import { sameJson } from '../../lib/format.ts'
import { fmtValue } from '../../lib/sets.ts'
import { useStore } from '../../store/store.ts'
import { ParamInput } from './ParamInput.tsx'
import { SetBar } from './SetBar.tsx'

const groupParams = (params: ParamDef[]) => {
  const groups = new Map<string, ParamDef[]>()
  for (const p of params) {
    const g = p.group ?? 'Parameters'
    groups.set(g, [...(groups.get(g) ?? []), p])
  }
  return [...groups]
}

const ParamField = ({ def, setValues }: { def: ParamDef; setValues: Record<string, DefineValue> }) => {
  const edits = useStore((s) => s.edits)
  const setEdit = useStore((s) => s.setEdit)
  const isEdited = def.name in edits
  const inSet = def.name in setValues && !sameJson(setValues[def.name], def.initial)
  const baseline = def.name in setValues ? setValues[def.name] : def.initial
  return (
    <div className={cx('param', isEdited && 'is-edited', inSet && 'is-set')} title={def.caption}>
      <div className="param-head">
        <span className="mono">{def.name}</span>
        {inSet && (
          <span className="param-default mono" title="Default from the source">
            default {fmtValue(def.initial, def.unit)}
          </span>
        )}
        {isEdited && (
          <IconButton
            title={`Reset ${def.name}${def.name in setValues ? ' to the set value' : ''}`}
            onClick={() => setEdit(def.name, undefined)}
          >
            <RotateCcw size={12} />
          </IconButton>
        )}
      </div>
      {def.caption && <small>{def.caption}</small>}
      <ParamInput
        def={def}
        label={def.name}
        value={edits[def.name] ?? baseline}
        onChange={(v) => setEdit(def.name, sameJson(v, baseline) ? undefined : v)}
      />
    </div>
  )
}

const tweakFailure = (project: ProjectState) =>
  project.tweak?.parts.flatMap((p) => p.diagnostics.filter((d) => d.level === 'error')).map((d) => d.message)[0] ??
  project.tweak?.error

export const ParamsPanel = ({ project }: { project: ProjectState }) => {
  const edits = useStore((s) => s.edits)
  const resetEdits = useStore((s) => s.resetEdits)
  const versionId = useStore((s) => s.versionId)
  const activeSet = useStore((s) => s.activeSet)
  const tweakRendering = useStore((s) => s.rendering.tweak)
  const [note, setNote] = useState('')
  const params = project.render?.params ?? []
  const changed = Object.keys(edits).length
  const values = activeSet ? (project.sets[activeSet]?.values ?? {}) : {}
  return (
    <Panel
      title="Parameters"
      count={params.length}
      className="grow"
      extra={changed > 0 && <Badge tone="amber">{tweakRendering ? 'rendering' : `${changed} tweaked`}</Badge>}
    >
      {versionId && <Hint>Viewing {versionId}. Tweaks apply to the working copy.</Hint>}
      <SetBar project={project} />
      {params.length === 0 && (
        <Hint>No customizer parameters. Top-level assignments with literal values show up here.</Hint>
      )}
      <div className="params">
        {groupParams(params).map(([group, defs]) => (
          <fieldset key={group}>
            <legend>{group}</legend>
            {defs.map((def) => (
              <ParamField key={`${activeSet}:${def.name}`} def={def} setValues={values} />
            ))}
          </fieldset>
        ))}
      </div>
      {changed > 0 && project.tweak?.status === 'error' && (
        <Hint tone="error">Tweak failed: {tweakFailure(project)}</Hint>
      )}
      {changed > 0 && (
        <Composer
          placeholder="Note for the agent (optional)"
          value={note}
          onChange={setNote}
          actions={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  resetEdits()
                  if (!activeSet) api.clearTweak(project.id).catch(() => undefined)
                }}
              >
                <RotateCcw size={14} /> Reset
              </Button>
              <Button
                variant="primary"
                onClick={() => api.sendProposal(project.id, edits, note, activeSet).then(() => setNote(''))}
              >
                <Send size={14} /> Send to agent
              </Button>
            </>
          }
        />
      )}
      {project.proposals.params && (
        <Hint tone="ok">
          Sent to the agent: {Object.keys(project.proposals.params.params).join(', ')}. Ask it to apply the proposal.
        </Hint>
      )}
    </Panel>
  )
}
