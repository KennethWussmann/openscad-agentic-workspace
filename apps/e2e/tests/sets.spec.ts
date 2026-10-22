import { existsSync } from 'node:fs'
import path from 'node:path'
import { expect, scad, test } from '../src/fixtures.ts'

test('loads a set as the tweak and updates it from the viewer', async ({ page, viewer, project }) => {
  expect(scad('set', 'save', project.id, 'wide', '-D', 'width=40', '--label', 'Wide').code).toBe(0)
  await viewer.open(project.id)
  const picker = page.getByRole('combobox', { name: 'Parameter set' })
  await picker.selectOption('wide')
  await expect(viewer.showing).toContainText('SET wide')
  await expect(viewer.param('width')).toHaveValue('40')
  await expect(viewer.envelope).toContainText('40.00 x 10.00 x 5.00')
  await expect(page.getByText('default 20')).toBeVisible()

  await viewer.setParam('depth', '12')
  await expect(viewer.showing).toContainText('TWEAK')
  await expect(viewer.envelope).toContainText('40.00 x 12.00 x 5.00')
  await page.getByRole('button', { name: 'Update set' }).click()
  await expect(viewer.showing).toContainText('SET wide')
  await expect.poll(() => project.read('config.yaml')).toContain('values: { width: 40, depth: 12 }')

  await picker.selectOption('')
  await expect(viewer.envelope).toContainText('20.00 x 10.00 x 5.00')
  expect(project.read('src/main.scad')).toContain('width = 20;')
})

test('saves a tweak as a new set and deletes it again', async ({ page, viewer, project }) => {
  await viewer.open(project.id)
  await viewer.setParam('height', '9')
  await page.getByRole('button', { name: 'Save as set' }).click()
  const form = page.getByRole('form', { name: 'Save as set' })
  await form.getByPlaceholder('Screw tray').fill('Tall box')
  await expect(form.getByPlaceholder('screw-tray')).toHaveValue('tall-box')
  await form.getByRole('checkbox', { name: 'Export on release' }).check()
  await form.getByRole('button', { name: 'Save set' }).click()
  await expect(viewer.showing).toContainText('SET tall-box')
  await expect.poll(() => project.read('config.yaml')).toContain('tall-box:')
  expect(project.read('config.yaml')).toContain('export: true')
  await expect(page.getByText('release', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Delete set tall-box' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(viewer.showing).not.toContainText('SET')
  await expect.poll(() => project.read('config.yaml')).not.toContain('tall-box')
})

test('exports the selected set under its name', async ({ page, viewer, project }) => {
  expect(scad('set', 'save', project.id, 'wide', '-D', 'width=40').code).toBe(0)
  await viewer.open(project.id)
  await page.getByRole('combobox', { name: 'Parameter set' }).selectOption('wide')
  await expect(viewer.envelope).toContainText('40.00 x 10.00 x 5.00')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export 3MF (set wide)' }).click()
  const toast = page.locator('.export-toast')
  await expect(toast).toContainText('set: wide')
  await expect(toast).toContainText(`${project.id}-main-wide.3mf`)
  expect((await download).suggestedFilename()).toBe(`${project.id}-main-wide.3mf`)
  expect(existsSync(path.join(project.dir, 'out', `${project.id}-main-wide.3mf`))).toBe(true)
})
