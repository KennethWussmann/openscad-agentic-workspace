import { expect, test } from '../src/fixtures.ts'

const ASSEMBLY_SCAD = `/* [Size] */
// Body height (mm)
body_h = 10; // [5:30]
lid_h = 4;

/* [Hidden] */
part = "body"; // [body, lid, assembly, plate]
assembly_part = "";

main();

module main() {
  if (part == "body") color("steelblue") body();
  if (part == "lid") color("teal") lid();
  if (part == "assembly") {
    if (assembly_part == "" || assembly_part == "body") color("steelblue") body();
    if (assembly_part == "" || assembly_part == "lid") translate([0, 0, body_h]) color("teal") lid();
  }
  if (part == "plate") {
    if (assembly_part == "" || assembly_part == "body") color("steelblue") body();
    if (assembly_part == "" || assembly_part == "lid") translate([0, 18, 0]) color("teal") lid();
  }
}

module body() { cube([20, 10, body_h]); }
module lid() { cube([20, 10, lid_h]); }
`

const ASSEMBLY_CONFIG = (name: string) => `name: ${name}
parts:
  - id: body
    defines: { part: "body" }
  - id: lid
    defines: { part: "lid" }
assemblies:
  - id: fitted
    label: Assembled
    defines: { part: "assembly" }
    preview: true
  - id: plate
    defines: { part: "plate" }
`

test('switches between print and assembly views with per-part control', async ({ page, viewer, project }) => {
  project.write('src/main.scad', ASSEMBLY_SCAD)
  project.write('config.yaml', ASSEMBLY_CONFIG(project.name))
  await viewer.open(project.id)

  await expect(page.getByRole('tab', { name: 'Assembly' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Print' })).toHaveAttribute('aria-selected', 'false')
  await expect(viewer.cell('Part')).toContainText('fitted')

  const list = page.locator('.parts')
  await page.getByRole('tab', { name: 'Print' }).click()
  await expect(list.locator('li.is-selected', { hasText: 'body' })).toBeVisible()
  await list.getByRole('button', { name: /lid/ }).click()
  await expect(viewer.cell('Part')).toContainText('lid')

  await page.getByRole('tab', { name: 'Assembly' }).click()
  await expect(list.locator('li.is-selected', { hasText: 'Assembled' })).toBeVisible()
  await expect(list.getByRole('button', { name: /plate 2 parts/ })).toBeVisible()
  await list.getByRole('button', { name: /Assembled/ }).click()

  const slider = page.getByRole('slider', { name: 'Explode assembly' })
  await slider.fill('50')
  await expect(page.getByText('Explode')).toContainText('50%')

  await list.getByRole('button', { name: 'Hide in assembly' }).first().click()
  await expect(list.getByRole('button', { name: 'Show in assembly' })).toBeVisible()
  await list.getByRole('button', { name: 'Open in print view' }).first().click()
  await expect(page.getByRole('tab', { name: 'Print' })).toHaveAttribute('aria-selected', 'true')

  await page.keyboard.press('a')
  await expect(page.getByRole('tab', { name: 'Assembly' })).toHaveAttribute('aria-selected', 'true')
})
