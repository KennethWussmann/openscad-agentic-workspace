import type { CheckStatus, PartCheck } from '@scad/protocol'
import { X } from 'lucide-react'
import { useEffect } from 'react'
import { CHECK_LABEL, CheckTag } from '../../components/CheckTag.tsx'
import { IconButton } from '../../components/IconButton.tsx'
import { baseName } from '../../lib/format.ts'
import { useStore } from '../../store/store.ts'

const HIDE_AFTER = 6000

const findings = (part: PartCheck) => {
  const entries: [string, CheckStatus | undefined][] = [
    ['manifold', part.manifold.status],
    ['bed', part.bed.status],
    ['overhangs', part.overhangs?.status],
    ['islands', part.islands?.status],
    ['walls', part.walls.status],
    ['bodies', part.bodies.status],
  ]
  return entries.flatMap(([name, status]) => (status && status !== 'pass' ? [[name, status] as const] : []))
}

export const ExportToast = () => {
  const notice = useStore((s) => s.exportNotice)
  const dismiss = useStore((s) => s.dismissExportNotice)
  const result = notice?.result ?? null
  const failed = result?.files.filter((f) => !f.ok) ?? []
  const check = result?.meshCheck ?? null
  const ok = notice !== null && !notice.error && failed.length === 0 && (!check || check.status === 'pass')

  useEffect(() => {
    if (!ok) return
    const timer = setTimeout(dismiss, HIDE_AFTER)
    return () => clearTimeout(timer)
  }, [ok, dismiss])

  if (!notice) return null
  const level = notice.error || failed.length || check?.status === 'fail' ? 'fail' : ok ? 'pass' : 'warn'
  return (
    <div className={`export-toast is-${level}`} key={notice.id}>
      <header>
        <strong>{notice.error ? 'Export failed' : `Exported ${result?.version ?? ''}`}</strong>
        {check && <CheckTag status={check.status} />}
        <IconButton onClick={dismiss} title="Dismiss">
          <X size={13} />
        </IconButton>
      </header>
      {notice.error && <p className="export-error">{notice.error}</p>}
      {result && (
        <ul className="export-files mono">
          {result.files.map((f) => (
            <li key={f.file} className={f.ok ? '' : 'is-failed'}>
              <span>{baseName(f.file)}</span>
              {!f.ok && (
                <small>{f.diagnostics.find((d) => d.level === 'error')?.message ?? 'OpenSCAD produced no file'}</small>
              )}
            </li>
          ))}
        </ul>
      )}
      {result && Object.keys(result.overrides).length > 0 && (
        <p className="export-meta mono">
          tweaks:{' '}
          {Object.entries(result.overrides)
            .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
            .join(', ')}
        </p>
      )}
      {check && check.status !== 'pass' && (
        <ul className="export-check mono">
          {check.parts
            .filter((p) => p.status !== 'pass')
            .map((p) => (
              <li key={p.id}>
                <span>{p.label ?? p.id}</span>
                {findings(p).map(([name, status]) => (
                  <em key={name} className={`is-${status}`}>
                    {name} {CHECK_LABEL[status]}
                  </em>
                ))}
              </li>
            ))}
        </ul>
      )}
      {result && <p className="export-meta mono">{result.outDir}</p>}
    </div>
  )
}
