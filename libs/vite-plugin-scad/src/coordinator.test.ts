import type { DefineValue, RenderResult } from '@scad/protocol'
import { describe, expect, it } from 'vitest'
import { createCoordinator } from './coordinator.ts'

const result = (n: number, overrides: Record<string, DefineValue>): RenderResult => ({
  project: 'p',
  status: 'ok',
  startedAt: String(n),
  finishedAt: String(n),
  durationMs: 0,
  overrides,
  parts: [],
  params: [],
  inputs: [],
})

describe('createCoordinator', () => {
  it('runs one render at a time and coalesces requests that arrive meanwhile', async () => {
    const calls: Record<string, DefineValue>[] = []
    const gates: (() => void)[] = []
    const coordinator = createCoordinator(async (_p, _k, overrides) => {
      calls.push(overrides)
      await new Promise<void>((r) => gates.push(r))
      return result(calls.length, overrides)
    })
    const first = coordinator.request('p', 'preview')
    const second = coordinator.request('p', 'preview', { a: 1 })
    const third = coordinator.request('p', 'preview', { a: 2 })
    expect(coordinator.isRendering('p')).toBe(true)
    expect(calls).toHaveLength(1)
    gates[0]()
    expect((await first).startedAt).toBe('1')
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toEqual([{}, { a: 2 }])
    gates[1]()
    expect(await second).toBe(await third)
    expect((await third).overrides).toEqual({ a: 2 })
    expect(coordinator.isRendering('p')).toBe(false)
  })

  it('keeps preview and tweak renders independent', async () => {
    const kinds: string[] = []
    const coordinator = createCoordinator(async (_p, kind) => {
      kinds.push(kind)
      return result(kinds.length, {})
    })
    await Promise.all([coordinator.request('p', 'preview'), coordinator.request('p', 'tweak')])
    expect(kinds.sort()).toEqual(['preview', 'tweak'])
  })
})
