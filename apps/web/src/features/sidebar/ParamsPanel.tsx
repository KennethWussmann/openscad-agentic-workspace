import type { ParamDef, ProjectState } from '@scad/protocol'
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
import { useStore } from '../../store/store.ts'
import { ParamInput } from './ParamInput.tsx'

const groupParams = (params: ParamDef[]) => {
  const groups = new Map<string, ParamDef[]>()
  for (const p of params) {
    const g = p.group ?? 'Parameters'
    groups.set(g, [...(groups.get(g) ?? []), p])
  }
  return [...groups]
}

const ParamField = ({ def }: { def: ParamDef }) => {
  const edits = useStore((s) => s.edits)
  const setEdit = useStore((s) => s.setEdit)
  const isEdited = def.name in edits
  return (
    <div className={cx('param', isEdited && 'is-edited')} title={def.caption}>
      <div className="param-head">
        <span className="mono">{def.name}</span>
        {isEdited && (
          <IconButton title={`Reset ${def.name}`} onClick={() => setEdit(def.name, undefined)}>
            <RotateCcw size={12} />
          </IconButton>
        )}
      </div>
      {def.caption && <small>{def.caption}</small>}
      <ParamInput
        def={def}
        label={def.name}
        value={edits[def.name] ?? def.initial}
        onChange={(v) => setEdit(def.name, sameJson(v, def.initial) ? undefined : v)}
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
  const tweakRendering = useStore((s) => s.rendering.tweak)
  const [note, setNote] = useState('')
  const params = project.render?.params ?? []
  const changed = Object.keys(edits).length
  return (
    <Panel
      title="Parameters"
      count={params.length}
      className="grow"
      extra={changed > 0 && <Badge tone="amber">{tweakRendering ? 'rendering' : `${changed} tweaked`}</Badge>}
    >
      {versionId && <Hint>Viewing {versionId}. Tweaks apply to the working copy.</Hint>}
      {params.length === 0 && (
        <Hint>No customizer parameters. Top-level assignments with literal values show up here.</Hint>
      )}
      <div className="params">
        {groupParams(params).map(([group, defs]) => (
          <fieldset key={group}>
            <legend>{group}</legend>
            {defs.map((def) => (
              <ParamField key={def.name} def={def} />
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
                  api.clearTweak(project.id).catch(() => undefined)
                }}
              >
                <RotateCcw size={14} /> Reset
              </Button>
              <Button
                variant="primary"
                onClick={() => api.sendProposal(project.id, edits, note).then(() => setNote(''))}
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
