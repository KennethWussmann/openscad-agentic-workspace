import { existsSync } from 'node:fs'
import path from 'node:path'
import { expect, type Proposal, scadJson, test } from '../src/fixtures.ts'

test('pins a note on the model and sends it with a snapshot', async ({ page, viewer, project }) => {
  await viewer.open(project.id)
  await page.keyboard.press('n')
  await expect(page.getByText('click a face, edge or corner to pin a note')).toBeVisible()
  await expect(viewer.envelope).toContainText('20.00 x 10.00 x 5.00')
  await viewer.canvas.click()

  const editor = page.getByPlaceholder('What should change here?')
  await expect(editor).toBeVisible()
  await editor.fill('round this corner')
  await editor.press('Enter')
  await expect(editor).toBeHidden()

  const notes = viewer.sidebar.locator('li.note')
  await expect(notes).toHaveCount(1)
  await expect(notes).toContainText('round this corner')
  await expect(notes).toContainText(/ main @ /)

  await page.getByPlaceholder('Overall note for the agent (optional)').fill('keep the size')
  await viewer.sidebar.getByRole('button', { name: 'Send to agent' }).click()
  await expect(page.getByText('1 note sent. Ask the agent to apply them.')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Snapshot sent to the agent' })).toBeVisible()

  const { annotations } = scadJson<Proposal>('proposal', project.id)
  expect(annotations).toMatchObject({
    note: 'keep the size',
    annotations: [{ n: 1, text: 'round this corner', part: { id: 'main' } }],
    source: { kind: 'working' },
  })
  expect(existsSync(path.join(project.dir, 'proposals', 'annotations.png'))).toBe(true)

  await page.getByRole('button', { name: 'Withdraw' }).click()
  await expect(page.getByText('1 note sent.')).toBeHidden()
  expect(scadJson<Proposal>('proposal', project.id).annotations).toBeNull()
})

test('does not send notes without text', async ({ page, viewer, project }) => {
  await viewer.open(project.id)
  await viewer.tool('Note').click()
  await expect(viewer.envelope).toContainText('20.00 x 10.00 x 5.00')
  await viewer.canvas.click()
  await expect(page.getByPlaceholder('What should change here?')).toBeVisible()
  await expect(viewer.sidebar.getByRole('button', { name: 'Send to agent' })).toBeDisabled()
  await viewer.sidebar.getByRole('button', { name: 'Clear' }).click()
  await expect(viewer.sidebar.locator('li.note')).toHaveCount(0)
})
