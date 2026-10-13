import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test as base, expect, type Page } from '@playwright/test'
import type { AnnotationProposal, ParamProposal } from '@scad/protocol'
import { CLI, CONFIG, WORKSPACE } from './env.ts'

export const BOX = `/* [Size] */
width = 20; // [10:50]
depth = 10;
height = 5;

/* [Hidden] */
$fn = 24;

cube([width, depth, height]);
`

export const scad = (...args: string[]) => {
  const run = spawnSync(process.execPath, [CLI, ...args], {
    env: { ...process.env, SCAD_WORKSPACE: WORKSPACE, SCAD_CONFIG: CONFIG },
    encoding: 'utf8',
  })
  return { code: run.status, stdout: run.stdout, stderr: run.stderr }
}

export const scadJson = <T>(...args: string[]): T => {
  const run = scad(...args, '--json')
  if (run.code !== 0 && !run.stdout) throw new Error(run.stderr)
  return JSON.parse(run.stdout) as T
}

export type Proposal = { params: ParamProposal | null; annotations: AnnotationProposal | null }

export type Project = {
  id: string
  name: string
  dir: string
  write: (file: string, content: string) => void
  read: (file: string) => string
}

export const createProject = (id: string, name: string, files: Record<string, string> = { 'src/main.scad': BOX }) => {
  const created = scad('new', id, '--name', name)
  if (created.code !== 0) throw new Error(created.stderr || created.stdout)
  const dir = path.join(WORKSPACE, id)
  const write = (file: string, content: string) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), content)
  }
  for (const [file, content] of Object.entries(files)) write(file, content)
  return { id, name, dir, write, read: (file: string) => readFileSync(path.join(dir, file), 'utf8') }
}

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)

let counter = 0

export const uniqueId = (title: string, worker: number) => `${slug(title)}-w${worker}-${(counter++).toString(36)}`

export const viewerPage = (page: Page) => {
  const status = page.locator('.status')
  const cell = (label: string) => page.locator('.tb-cell').filter({ has: page.getByText(label, { exact: true }) })
  const timeline = page.locator('.timeline')
  const version = (id: string) =>
    timeline
      .locator('li.tick:not(.working)')
      .filter({ has: page.locator('.tick-id', { hasText: new RegExp(`^${id}$`) }) })
  return {
    page,
    version,
    showVersion: (id: string) => version(id).locator('.tick-main').click(),
    status,
    canvas: page.locator('.viewport-canvas canvas'),
    sidebar: page.locator('aside.sidebar'),
    timeline,
    toolbar: page.locator('.toolbar'),
    cell,
    showing: cell('Showing'),
    envelope: cell('Envelope'),
    picker: page.getByRole('combobox', { name: 'Project' }),
    tool: (label: string) => page.locator('.toolbar').getByRole('button', { name: new RegExp(`${label}$`) }),
    param: (name: string) => page.getByRole('spinbutton', { name, exact: true }),
    open: async (id: string) => {
      await page.goto(`/?project=${id}`)
      await expect(status).toHaveText(/^rendered/)
    },
    waitRendered: () => expect(status).toHaveText(/^rendered/),
  }
}

export type Viewer = ReturnType<typeof viewerPage>

export const test = base.extend<{ project: Project; viewer: Viewer }>({
  project: async ({}, use, testInfo) => {
    await use(createProject(uniqueId(testInfo.title, testInfo.workerIndex), testInfo.title))
  },
  viewer: async ({ page }, use) => {
    await use(viewerPage(page))
  },
})

export { expect }
