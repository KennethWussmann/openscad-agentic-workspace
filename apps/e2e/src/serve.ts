import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
import { BASE, CONFIG, PORT, REPO_ROOT, WORKSPACE } from './env.ts'

rmSync(BASE, { recursive: true, force: true })
mkdirSync(WORKSPACE, { recursive: true })
writeFileSync(CONFIG, ['server:', `  port: ${PORT}`, '  open: false', 'render:', '  sheet: false', ''].join('\n'))
process.env.SCAD_WORKSPACE = WORKSPACE
process.env.SCAD_CONFIG = CONFIG

const web = path.join(REPO_ROOT, 'apps', 'web')
const server = await createServer({
  root: web,
  configFile: path.join(web, 'vite.config.ts'),
  clearScreen: false,
  server: { port: PORT, strictPort: true },
})
await server.listen()
server.printUrls()

const stop = () => {
  server.close().finally(() => process.exit(0))
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
