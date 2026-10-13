import { expect, test } from '../src/fixtures.ts'

test('toggles display options from the toolbar and the keyboard', async ({ page, viewer, project }) => {
  await viewer.open(project.id)
  await expect(viewer.tool('Edges')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('e')
  await expect(viewer.tool('Edges')).toHaveAttribute('aria-pressed', 'false')
  await viewer.tool('X-ray').click()
  await expect(viewer.tool('X-ray')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('o')
  await expect(viewer.tool('Ortho')).toHaveAttribute('aria-pressed', 'true')

  await page.reload()
  await viewer.waitRendered()
  await expect(viewer.tool('X-ray')).toHaveAttribute('aria-pressed', 'true')
  await expect(viewer.tool('Edges')).toHaveAttribute('aria-pressed', 'false')
})

test('opens the shortcut help and closes it with Escape', async ({ page, viewer, project }) => {
  await viewer.open(project.id)
  await page.keyboard.press('?')
  await expect(page.getByRole('heading', { name: 'Keys' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Keys' })).toBeHidden()
})

test('collapses the side panel and remembers it', async ({ page, viewer, project }) => {
  await viewer.open(project.id)
  await page.getByRole('button', { name: 'Hide panel (B)' }).click()
  await expect(viewer.sidebar).toHaveClass(/is-collapsed/)
  await page.reload()
  await viewer.waitRendered()
  await expect(viewer.sidebar).toHaveClass(/is-collapsed/)
  await page.keyboard.press('b')
  await expect(viewer.sidebar).not.toHaveClass(/is-collapsed/)
})

test('shows only the viewport in embed mode', async ({ page, viewer, project }) => {
  await page.goto(`/?project=${project.id}&embed=1`)
  await expect(viewer.canvas).toBeVisible()
  await expect(viewer.picker).toBeHidden()
  await expect(viewer.sidebar).toBeHidden()
  await page.getByTitle('Leave viewport mode (V)').click()
  await expect(viewer.picker).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`\\?project=${project.id}$`))
})

test('cuts a section along the model', async ({ page, viewer, project }) => {
  await viewer.open(project.id)
  await viewer.tool('Section').click()
  const slider = page.getByRole('slider', { name: /X = / })
  await expect(slider).toHaveAttribute('max', '20.4')
  await page.getByRole('button', { name: 'Z', exact: true }).click()
  await expect(page.getByRole('slider', { name: /Z = / })).toHaveAttribute('max', '5.1')
  await page.keyboard.press('s')
  await expect(page.getByRole('slider', { name: /Z = / })).toBeHidden()
})

test('guides through measuring', async ({ page, viewer, project }) => {
  await viewer.open(project.id)
  await viewer.tool('Measure').click()
  await expect(page.getByText('pick the first point, vertices snap')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('pick the first point, vertices snap')).toBeHidden()
  await expect(viewer.tool('Measure')).toHaveAttribute('aria-pressed', 'false')
})

test('highlights walls thinner than the printer allows', async ({ page, viewer, project }) => {
  project.write('src/main.scad', 'cube([20, 20, 2]);\ntranslate([0, 0, 2]) cube([20, 0.6, 10]);\n')
  await viewer.open(project.id)
  await viewer.tool('Walls').click()
  const legend = page.locator('.legend')
  await expect(legend).toContainText('Wall thickness')
  await expect(legend.locator('.legend-stat')).toContainText(/under 0\.80, min 0\.6/)
  await expect(legend).toContainText(`pnpm scad check ${project.id}`)
})

test('reports when a model has no overhangs', async ({ page, viewer, project }) => {
  await viewer.open(project.id)
  await page.keyboard.press('h')
  await expect(page.locator('.legend-stat')).toHaveText('nothing past 45°')
})

test('finds the overhang under a bridge', async ({ page, viewer, project }) => {
  project.write(
    'src/main.scad',
    'cube([5, 10, 10]);\ntranslate([15, 0, 0]) cube([5, 10, 10]);\ntranslate([0, 0, 10]) cube([20, 10, 3]);\n',
  )
  await viewer.open(project.id)
  await viewer.tool('Overhang').click()
  await expect(page.locator('.legend-stat')).toContainText(/mm², up to 90/)
})
