import { expect, type Proposal, scadJson, test } from '../src/fixtures.ts'

test('lists customizer parameters by group', async ({ page, viewer, project }) => {
  await viewer.open(project.id)
  const size = page.getByRole('group', { name: 'Size' })
  await expect(size.getByRole('spinbutton', { name: 'width', exact: true })).toHaveValue('20')
  await expect(size.getByRole('slider', { name: 'width slider' })).toBeVisible()
  await expect(size.getByRole('spinbutton', { name: 'depth', exact: true })).toHaveValue('10')
  await expect(page.getByRole('spinbutton', { name: '$fn' })).toHaveCount(0)
})

test('previews tweaks without touching the source', async ({ page, viewer, project }) => {
  await viewer.open(project.id)
  await viewer.param('width').fill('35')
  await expect(page.getByText('1 tweaked')).toBeVisible()
  await expect(viewer.showing).toContainText('TWEAK')
  await expect(viewer.envelope).toContainText('35.00 x 10.00 x 5.00')
  expect(project.read('src/main.scad')).toContain('width = 20;')

  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(page.getByText('1 tweaked')).toBeHidden()
  await expect(viewer.envelope).toContainText('20.00 x 10.00 x 5.00')
  await expect(viewer.showing).toContainText('DRAFT')
})

test('sends tweaked values with a note to the agent', async ({ page, viewer, project }) => {
  await viewer.open(project.id)
  await viewer.param('depth').fill('14')
  await page.getByPlaceholder('Note for the agent (optional)').fill('a bit deeper')
  await page.getByRole('button', { name: 'Send to agent' }).click()
  await expect(page.getByText('Sent to the agent: depth')).toBeVisible()

  const proposal = scadJson<Proposal>('proposal', project.id)
  expect(proposal.params).toMatchObject({ params: { depth: 14 }, note: 'a bit deeper' })

  await expect(viewer.picker.locator('option', { hasText: `(${project.id}) *` })).toHaveCount(1)
  scadJson('proposal', project.id, '--clear')
  await expect(page.getByText('Sent to the agent: depth')).toBeHidden()
})

test('keeps tweaks on screen when the source changes', async ({ page, viewer, project }) => {
  await viewer.open(project.id)
  await viewer.param('width').fill('30')
  await expect(viewer.envelope).toContainText('30.00 x 10.00 x 5.00')
  project.write('src/main.scad', project.read('src/main.scad').replace('height = 5;', 'height = 8;'))
  await expect(viewer.envelope).toContainText('30.00 x 10.00 x 8.00')
  await expect(page.getByText('1 tweaked')).toBeVisible()
})
