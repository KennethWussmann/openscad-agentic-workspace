import { loadSettings, requireProject } from '@scad/core'
import { type Ctx, type Outcome, rel } from '../context.ts'
import { ensureServer, openBrowser, stopServer, viewerApi, viewerUrl } from '../server.ts'

export const serve = async ({ paths }: Ctx): Promise<Outcome> => {
  const settings = loadSettings(paths)
  const server = await ensureServer(paths, settings.server.port)
  const url = viewerUrl(server.port)
  return {
    data: { ...server, url, log: rel(paths, paths.serverLog) },
    text: `${server.started ? 'Started' : 'Running'} ${url}  (log: ${rel(paths, paths.serverLog)})`,
  }
}

export const open = async ({ paths, flags, args }: Ctx): Promise<Outcome> => {
  const project = args[0]
  if (project) requireProject(paths, project)
  const settings = loadSettings(paths)
  const server = await ensureServer(paths, settings.server.port)
  const url = viewerUrl(server.port, project)
  const client = viewerApi(server.port)
  const viewers = await client.viewers()
  let action: 'navigated' | 'opened' | 'none'
  if (viewers.total > 0 && project) {
    await client.navigate(project)
    action = 'navigated'
  } else if (viewers.total > 0) action = 'none'
  else if (flags.open ?? settings.server.open) {
    openBrowser(url)
    action = 'opened'
  } else action = 'none'
  const text =
    action === 'navigated'
      ? `Switched the open viewer tab to ${project}: ${url}`
      : action === 'opened'
        ? `Opened ${url} in the default browser`
        : `Viewer: ${url}`
  return { data: { url, action, viewers: viewers.total, started: server.started }, text }
}

export const stop = async ({ paths }: Ctx): Promise<Outcome> => {
  const stopped = await stopServer(paths, loadSettings(paths).server.port)
  return {
    data: { stopped: Boolean(stopped) },
    text: stopped ? `Stopped dev server on port ${stopped.port}` : 'No dev server running.',
  }
}
