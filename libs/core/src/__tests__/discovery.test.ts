import { describe, expect, it } from 'vitest'
import { type DiscoveryHost, discoverOpenscad } from '../discovery.ts'

const host = (over: Partial<DiscoveryHost> & { files?: string[]; working?: string[] }): DiscoveryHost => ({
  platform: over.platform ?? 'linux',
  env: over.env ?? {},
  home: over.home ?? '/home/u',
  isFile: (p) => (over.files ?? []).includes(p),
  version: async (cmd) => ((over.working ?? []).includes(cmd.join(' ')) ? '2026.01.01' : null),
})

describe('discoverOpenscad', () => {
  it('uses OPENSCAD_PATH exclusively when set', async () => {
    const r = await discoverOpenscad({
      configured: '/cfg/openscad',
      host: host({ env: { OPENSCAD_PATH: '/env/openscad' }, working: ['/env/openscad', '/cfg/openscad'] }),
    })
    expect(r.openscad?.source).toBe('env')
    expect(r.openscad?.command).toEqual(['/env/openscad'])
  })

  it('prefers the configured command, including list commands', async () => {
    const r = await discoverOpenscad({
      configured: ['flatpak', 'run', 'org.openscad.OpenSCAD'],
      host: host({ working: ['flatpak run org.openscad.OpenSCAD'] }),
    })
    expect(r.openscad).toMatchObject({ source: 'config', command: ['flatpak', 'run', 'org.openscad.OpenSCAD'] })
  })

  it('falls back to PATH and reports a broken configured path', async () => {
    const r = await discoverOpenscad({
      configured: '/gone/openscad',
      host: host({ env: { PATH: '/a:/b' }, files: ['/b/openscad'], working: ['/b/openscad'] }),
    })
    expect(r.configuredBroken).toBe(true)
    expect(r.openscad).toMatchObject({ source: 'path', command: ['/b/openscad'] })
  })

  it('checks common macOS locations without executing anything that does not exist', async () => {
    const app = '/Users/u/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD'
    const r = await discoverOpenscad({
      configured: null,
      host: host({ platform: 'darwin', home: '/Users/u', files: [app], working: [app] }),
    })
    expect(r.openscad).toMatchObject({ source: 'common', command: [app] })
    expect(r.tried).toEqual([app])
  })

  it('prefers the console wrapper on Windows', async () => {
    const com = 'C:\\Program Files\\OpenSCAD\\openscad.com'
    const exe = 'C:\\Program Files\\OpenSCAD\\openscad.exe'
    const r = await discoverOpenscad({
      configured: null,
      host: host({
        platform: 'win32',
        env: { ProgramFiles: 'C:\\Program Files' },
        files: [com, exe],
        working: [com, exe],
      }),
    })
    expect(r.openscad?.command).toEqual([com])
  })

  it('returns null with the attempted candidates when nothing works', async () => {
    const r = await discoverOpenscad({ configured: null, host: host({ files: ['/usr/bin/openscad'] }) })
    expect(r.openscad).toBeNull()
    expect(r.tried).toEqual(['/usr/bin/openscad'])
  })
})
