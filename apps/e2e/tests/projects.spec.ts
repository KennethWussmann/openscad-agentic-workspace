import { createProject, expect, test, uniqueId } from '../src/fixtures.ts'

test('lists projects on the empty table and opens one', async ({ page, viewer, project }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Nothing on the table/ })).toBeVisible()
  await page.getByRole('button', { name: new RegExp(`${project.id} /`) }).click()
  await expect(page).toHaveURL(new RegExp(`\\?project=${project.id}$`))
  await viewer.waitRendered()
  await expect(viewer.canvas).toBeVisible()
  await expect(viewer.cell('Project')).toContainText(project.name)
  await expect(viewer.envelope).toContainText('20.00 x 10.00 x 5.00')
})

test('switches projects with the picker', async ({ viewer, project }, testInfo) => {
  const other = createProject(uniqueId('other', testInfo.workerIndex), 'Other Box', {
    'src/main.scad': 'cube([8, 8, 8]);\n',
  })
  await viewer.open(project.id)
  await viewer.picker.selectOption(other.id)
  await expect(viewer.page).toHaveURL(new RegExp(`\\?project=${other.id}$`))
  await viewer.waitRendered()
  await expect(viewer.envelope).toContainText('8.00 x 8.00 x 8.00')
  await viewer.picker.selectOption(project.id)
  await expect(viewer.envelope).toContainText('20.00 x 10.00 x 5.00')
})

test('explains unknown projects', async ({ page }) => {
  await page.goto('/?project=does-not-exist')
  await expect(page.getByText('project "does-not-exist" does not exist')).toBeVisible()
})
