import { BOX, expect, scad, test } from '../src/fixtures.ts'

const checkpoint = (id: string, message: string) => {
  const run = scad('checkpoint', id, '-m', message)
  expect(run.code, run.stderr).toBe(0)
}

test('shows checkpoints from the CLI on the timeline', async ({ viewer, project }) => {
  await viewer.open(project.id)
  checkpoint(project.id, 'First box')
  const first = viewer.version('v001')
  await expect(first).toContainText('First box')
  await expect(viewer.timeline.getByText('Working copy, unchanged')).toBeVisible()
  await expect(viewer.showing).toContainText('WIP')

  project.write('src/main.scad', BOX.replace('width = 20;', 'width = 40;'))
  await expect(viewer.envelope).toContainText('40.00 x 10.00 x 5.00')
  await expect(viewer.timeline.getByText('Working copy', { exact: true })).toBeVisible()
})

test('views an earlier version and overlays it as ghost', async ({ page, viewer, project }) => {
  await viewer.open(project.id)
  checkpoint(project.id, 'Narrow')
  project.write('src/main.scad', BOX.replace('width = 20;', 'width = 40;'))
  await expect(viewer.envelope).toContainText('40.00 x 10.00 x 5.00')
  checkpoint(project.id, 'Wide')
  await expect(viewer.version('v002')).toBeVisible()

  await viewer.showVersion('v001')
  await expect(viewer.showing).toContainText('v001')
  await expect(viewer.envelope).toContainText('20.00 x 10.00 x 5.00')
  await expect(page.getByText('Viewing v001. Tweaks apply to the working copy.')).toBeVisible()

  await viewer.timeline.getByRole('button', { name: 'Overlay v002 as ghost' }).click()
  await expect(viewer.cell('Overlay')).toContainText('v002')

  await viewer.timeline.getByRole('button', { name: /Working copy/ }).click()
  await expect(viewer.envelope).toContainText('40.00 x 10.00 x 5.00')
})

test('steps through versions with the bracket keys', async ({ page, viewer, project }) => {
  await viewer.open(project.id)
  checkpoint(project.id, 'One')
  project.write('src/main.scad', 'cube([7, 7, 7]);\n')
  await expect(viewer.envelope).toContainText('7.00 x 7.00 x 7.00')
  checkpoint(project.id, 'Two')
  await expect(viewer.version('v002')).toBeVisible()

  await page.keyboard.press('[')
  await expect(viewer.showing).toContainText('v002')
  await page.keyboard.press('[')
  await expect(viewer.showing).toContainText('v001')
  await expect(viewer.envelope).toContainText('20.00 x 10.00 x 5.00')
  await page.keyboard.press(']')
  await page.keyboard.press(']')
  await expect(viewer.showing).toContainText('WIP')
})

test('restores a version from the CLI', async ({ viewer, project }) => {
  await viewer.open(project.id)
  checkpoint(project.id, 'Original')
  project.write('src/main.scad', 'cube([3, 3, 3]);\n')
  await expect(viewer.envelope).toContainText('3.00 x 3.00 x 3.00')
  checkpoint(project.id, 'Tiny')
  const run = scad('restore', project.id, 'v001')
  expect(run.code, run.stderr).toBe(0)
  await expect(viewer.version('v003')).toHaveClass(/is-restore/)
  await expect(viewer.envelope).toContainText('20.00 x 10.00 x 5.00')
})
