import type { Page, TestInfo } from '@playwright/test'
import { BOX, createProject, expect, scad, test, uniqueId } from '../src/fixtures.ts'

const VIEWPORTS = [
  { name: 'phone', width: 375, height: 667, compact: true },
  { name: 'phone-landscape', width: 667, height: 375, compact: true },
  { name: 'tablet', width: 768, height: 1024, compact: false },
  { name: 'tablet-landscape', width: 1024, height: 768, compact: false },
  { name: 'desktop', width: 1440, height: 900, compact: false },
]

const DESCRIPTION =
  'A long project description that keeps going and going so that it would push every button in the top bar far beyond the right edge of a small screen'

const snap = async (page: Page, testInfo: TestInfo, name: string) => {
  await page.waitForTimeout(600)
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`) })
}

const fitsHorizontally = (page: Page) =>
  expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

for (const viewport of VIEWPORTS) {
  test(`keeps the viewer reachable on ${viewport.name}`, async ({ page, viewer }, testInfo) => {
    const project = createProject(uniqueId(`responsive ${viewport.name}`, testInfo.workerIndex), 'Responsive Box')
    project.write('config.yaml', project.read('config.yaml').replace('description: ""', `description: ${DESCRIPTION}`))
    for (let i = 1; i <= 10; i++) {
      project.write('src/main.scad', BOX.replace('width = 20;', `width = ${20 + i};`))
      expect(scad('render', project.id).code).toBe(0)
      expect(scad('checkpoint', project.id, '-m', `Change number ${i}`).code).toBe(0)
    }
    await page.setViewportSize(viewport)
    await viewer.open(project.id)
    await fitsHorizontally(page)

    for (const name of ['Render now', 'Console (C)', 'Viewport only (V)', /^Export 3MF/])
      await expect(page.locator('.topbar').getByRole('button', { name })).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('button', { name: 'Keys (?)' })).toBeVisible({ visible: !viewport.compact })
    await expect(viewer.timeline.getByRole('button', { name: /Working copy/ })).toBeInViewport({ ratio: 1 })
    await expect(viewer.tool('Fit')).toBeInViewport({ ratio: 1 })
    await expect(viewer.showing).toBeInViewport({ ratio: 1 })
    await snap(page, testInfo, viewport.name)

    await viewer.showVersion('v002')
    await expect(viewer.version('v002').locator('.tick-main')).toBeInViewport({ ratio: 1 })

    if (viewport.compact) {
      await expect(viewer.param('width')).not.toBeInViewport()
      await page.getByTitle('Show panel (B)').click()
    }
    await viewer.param('width').scrollIntoViewIfNeeded()
    await expect(viewer.param('width')).toBeInViewport()
    await snap(page, testInfo, `${viewport.name}-panel`)

    await page.goto('/')
    await expect(page.getByRole('button', { name: /Responsive Box/ }).first()).toBeVisible()
    await fitsHorizontally(page)
    await snap(page, testInfo, `${viewport.name}-start`)
  })
}
