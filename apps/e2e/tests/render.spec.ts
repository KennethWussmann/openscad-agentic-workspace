import { BOX, expect, test } from '../src/fixtures.ts'

test('renders a project on first open and shows its part', async ({ viewer, project }) => {
  await viewer.open(project.id)
  const part = viewer.sidebar.locator('li.part')
  await expect(part).toHaveCount(1)
  await expect(part).toContainText('src/main.scad')
  await expect(part).toContainText('20.00 x 10.00 x 5.00')
  await expect(viewer.showing).toContainText('DRAFT')
  await expect(viewer.cell('Part')).toContainText('main')
})

test('re-renders live when the source changes on disk', async ({ viewer, project }) => {
  await viewer.open(project.id)
  await expect(viewer.envelope).toContainText('20.00 x 10.00 x 5.00')
  project.write('src/main.scad', BOX.replace('height = 5;', 'height = 12;'))
  await expect(viewer.envelope).toContainText('20.00 x 10.00 x 12.00')
  await expect(viewer.param('height')).toHaveValue('12')
})

test('re-renders when an included file changes', async ({ viewer, project }) => {
  project.write('src/dims.scad', 'side = 6;\n')
  project.write('src/main.scad', 'include <dims.scad>\ncube(side);\n')
  await viewer.open(project.id)
  await expect(viewer.envelope).toContainText('6.00 x 6.00 x 6.00')
  project.write('src/dims.scad', 'side = 9;\n')
  await expect(viewer.envelope).toContainText('9.00 x 9.00 x 9.00')
})

test('shows render errors, keeps the last good model and recovers', async ({ page, viewer, project }) => {
  await viewer.open(project.id)
  project.write('src/main.scad', 'cube([20, 10, 5]\n')
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Render failed')
  await expect(alert).toContainText('showing the last good model')
  await expect(viewer.status).toHaveText(/^failed/)
  await expect(viewer.envelope).toContainText('20.00 x 10.00 x 5.00')

  await page.getByRole('button', { name: 'Console (C)' }).click()
  await expect(page.locator('.console li.error').first()).toBeVisible()

  project.write('src/main.scad', 'cube([4, 4, 4]);\n')
  await expect(alert).toBeHidden()
  await expect(viewer.envelope).toContainText('4.00 x 4.00 x 4.00')
})

test('renders on demand from the top bar', async ({ page, viewer, project }) => {
  await viewer.open(project.id)
  const response = page.waitForResponse((r) => r.url().endsWith(`/api/projects/${project.id}/render`) && r.ok())
  await page.getByRole('button', { name: 'Render now' }).click()
  await response
  await viewer.waitRendered()
})

test('shows every part of an assembly and solos one', async ({ viewer, project }) => {
  project.write(
    'config.yaml',
    [
      `name: ${project.name}`,
      'parts:',
      '  - { id: base, label: Base, file: src/base.scad }',
      '  - { id: lid, label: Lid, file: src/lid.scad }',
      '',
    ].join('\n'),
  )
  project.write('src/base.scad', 'cube([30, 20, 10]);\n')
  project.write('src/lid.scad', 'translate([0, 0, 12]) cube([30, 20, 2]);\n')
  await viewer.open(project.id)
  await expect(viewer.sidebar.locator('li.part')).toHaveCount(2)
  await expect(viewer.envelope).toContainText('30.00 x 20.00 x 14.00')
  await expect(viewer.cell('Part')).toContainText('ASSY')

  await viewer.sidebar.getByRole('button', { name: /Lid/ }).click()
  await expect(viewer.envelope).toContainText('30.00 x 20.00 x 2.00')
  await viewer.sidebar.getByRole('button', { name: 'show all' }).click()
  await viewer.sidebar.getByRole('button', { name: 'Toggle visibility' }).first().click()
  await expect(viewer.envelope).toContainText('30.00 x 20.00 x 2.00')
})
