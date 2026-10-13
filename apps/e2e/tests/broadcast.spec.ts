import { createProject, expect, scadJson, test, uniqueId } from '../src/fixtures.ts'

test.describe.configure({ mode: 'serial' })

test('follows the CLI when it opens a project in the browser', async ({ page, viewer, project }, testInfo) => {
  const other = createProject(uniqueId('navigate', testInfo.workerIndex), 'Navigate Target')
  await viewer.open(project.id)
  await expect.poll(() => scadJson<{ viewers: number }>('open', project.id).viewers).toBe(1)
  expect(scadJson<{ action: string }>('open', other.id).action).toBe('navigated')
  await expect(page).toHaveURL(new RegExp(`\\?project=${other.id}$`))
  await expect(viewer.picker).toHaveValue(other.id)
  await viewer.waitRendered()
})
