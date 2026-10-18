import { existsSync } from 'node:fs'
import path from 'node:path'
import { expect, scad, test } from '../src/fixtures.ts'

test('exports a checked 3MF and downloads it', async ({ page, viewer, project }) => {
  await viewer.open(project.id)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export 3MF' }).click()
  const toast = page.locator('.export-toast')
  await expect(toast).toContainText('Exported wip')
  await expect(toast).toContainText(`${project.id}-main.3mf`)
  await expect(toast.getByText('PASS')).toBeVisible()
  expect((await download).suggestedFilename()).toBe(`${project.id}-main.3mf`)
  expect(existsSync(path.join(project.dir, 'out', `${project.id}-main.3mf`))).toBe(true)
  await toast.getByRole('button', { name: 'Dismiss' }).click()
  await expect(toast).toBeHidden()
})

test('asks whether to export the source or the tweaked model', async ({ page, viewer, project }) => {
  await viewer.open(project.id)
  await viewer.setParam('width', '25')
  await expect(viewer.envelope).toContainText('25.00 x 10.00 x 5.00')
  await page.getByRole('button', { name: 'Export 3MF (source or with tweaks)' }).click()
  await expect(page.getByRole('button', { name: /Export source/ })).toBeVisible()
  await page.getByRole('button', { name: /Export with 1 tweak/ }).click()
  const toast = page.locator('.export-toast')
  await expect(toast).toContainText('tweaks: width=25')
  await expect(toast).toContainText('tweaked')
})

test('downloads the stored preview of a version', async ({ page, viewer, project }) => {
  await viewer.open(project.id)
  expect(scad('checkpoint', project.id, '-m', 'Ship it').code).toBe(0)
  await viewer.showVersion('v001')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download the stored v001 preview 3MF' }).click()
  expect((await download).suggestedFilename()).toBe(`${project.id}-main-v001.3mf`)
})
