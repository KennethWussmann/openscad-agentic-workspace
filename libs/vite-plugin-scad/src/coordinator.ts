import type { DefineValue, RenderKind, RenderResult } from '@scad/protocol'

export type RenderRunner = (
  project: string,
  kind: RenderKind,
  overrides: Record<string, DefineValue>,
) => Promise<RenderResult>

type Deferred = {
  promise: Promise<RenderResult>
  resolve: (r: RenderResult) => void
  reject: (e: unknown) => void
  overrides: Record<string, DefineValue>
}

type Slot = {
  running: Promise<RenderResult> | null
  pending: Deferred | null
}

const deferred = (overrides: Record<string, DefineValue>): Deferred => {
  let resolve!: (r: RenderResult) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<RenderResult>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject, overrides }
}

export const createCoordinator = (runner: RenderRunner) => {
  const slots = new Map<string, Slot>()
  const slot = (project: string, kind: RenderKind) => {
    const key = `${kind}:${project}`
    let s = slots.get(key)
    if (!s) {
      s = { running: null, pending: null }
      slots.set(key, s)
    }
    return s
  }

  const start = (project: string, kind: RenderKind, job: Deferred, s: Slot) => {
    const run = runner(project, kind, job.overrides)
    s.running = run
    run.then(job.resolve, job.reject).finally(() => {
      s.running = null
      const next = s.pending
      s.pending = null
      if (next) start(project, kind, next, s)
    })
  }

  const request = (project: string, kind: RenderKind, overrides: Record<string, DefineValue> = {}) => {
    const s = slot(project, kind)
    if (s.pending) {
      s.pending.overrides = overrides
      return s.pending.promise
    }
    const job = deferred(overrides)
    if (s.running) s.pending = job
    else start(project, kind, job, s)
    return job.promise
  }

  const isRendering = (project: string) =>
    (['preview', 'tweak'] as const).some((kind) => {
      const s = slots.get(`${kind}:${project}`)
      return Boolean(s?.running || s?.pending)
    })

  return { request, isRendering }
}

export type Coordinator = ReturnType<typeof createCoordinator>
