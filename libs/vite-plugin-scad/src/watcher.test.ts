import { EventEmitter } from 'node:events'
import { resolvePaths } from '@scad/core'
import type { ViteDevServer } from 'vite'
import { expect, it, vi } from 'vitest'
import { watchWorkspace } from './watcher.ts'

const fsWatcher = vi.hoisted(() => ({ current: null as EventEmitter | null }))

vi.mock('node:fs', async (original) => {
  const events = await import('node:events')
  return {
    ...(await original<typeof import('node:fs')>()),
    watch: () => {
      fsWatcher.current = Object.assign(new events.EventEmitter(), { close: () => undefined })
      return fsWatcher.current
    },
  }
})

it('keeps running when the file watcher reports an error', () => {
  const warn = vi.fn()
  const server = { config: { logger: { warn } }, httpServer: null } as unknown as ViteDevServer
  watchWorkspace(server, resolvePaths({ workspace: '/nowhere' }), { sourcesChanged: vi.fn(), changed: vi.fn() })
  const error = Object.assign(new Error('EACCES: permission denied, watch'), { code: 'EACCES' })
  expect(() => fsWatcher.current?.emit('error', error)).not.toThrow()
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('EACCES'))
  expect(EventEmitter.listenerCount(fsWatcher.current as EventEmitter, 'error')).toBe(1)
})
