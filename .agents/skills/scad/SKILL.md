---
name: scad
description: Design, build, change and show parametric 3D models with OpenSCAD in this workspace, while the user watches them live in the browser viewer. Use whenever the user asks to model, design, make, build, CAD or 3D print something, wants a part, enclosure, bracket, holder, box, adapter, mount or any physical object, asks to change, resize or tweak an existing model in workspace/, asks to see or open a model, or mentions OpenSCAD or .scad files. Entry point of the scad-* skill suite.
---

# Parametric modelling with OpenSCAD

You are a careful mechanical designer. Turn the user's idea into a clean, highly parametric OpenSCAD model that prints and fits, while the user watches it take shape in the viewer.

All commands run from the repository root. `pnpm scad` without arguments prints the command reference. Every command takes `--json`.

## Sub-skills

| Skill | Load when |
| --- | --- |
| `.agents/skills/scad-craft/SKILL.md` | Always before writing or changing `.scad` code |
| `.agents/skills/scad-libs/SKILL.md` | Shared modules across projects, BOSL2 or other third-party libraries |
| `.agents/skills/scad-versions/SKILL.md` | After every completed user request (checkpoint), going back, comparing, browser proposals (parameters and 3D annotations) |
| `.agents/skills/scad-export/SKILL.md` | Delivering files or preparing for printing |
| `.agents/skills/scad-setup/SKILL.md` | `pnpm scad doctor` fails |

## Workflow

### 0. Check the setup

`pnpm scad doctor`. Fix FAIL items with the scad-setup skill first.

### 1. Understand and propose

Ask only what you truly need: key dimensions, what it mates with, printer or process, material, must-have features. If the part is to be printed, run `pnpm scad printer <id>` to see what you design for: process (fdm or resin), bed, nozzle or pixel size, layer height and tolerances. If the user names a printer or nozzle that is not the active one, pick it in the project's `config.yaml` (`print: { printer: <name> }`, `print: { nozzle: 0.6 }`). A printer that is not defined yet goes into the root `config.yaml` under `printers` (ask for process, build volume, nozzles or pixel size). Note the profile in `brief.md`. Measurements of the real counterpart beat guesses; ask for them. If the design uses several colors or materials in one print (inlays, text, labels, soft grips), plan a merged 3MF next to the separate parts (scad-export, "Merged multi-object 3MF"). Infer the rest and state your assumptions.

New project: `pnpm scad new <id> [--name "Name"] [--description "..."]` (id is lowercase-dashed). `--from <other-project>` starts from a copy. Fill `workspace/<id>/brief.md` (requirements, key dimensions, parts, decisions) and give the user a short summary of the plan.

Existing project: `pnpm scad list`, then `pnpm scad status <id>` and read its `brief.md` and sources before changing anything. If status shows a pending proposal or annotations from the browser, handle them first (scad-versions skill). When the user says "what I marked", "my notes" or "the pins", run `pnpm scad proposal <id>`.

### 2. Show it live

```bash
pnpm scad open <id>
```

Starts the dev server in the background if needed (log: `workspace/.server.log`), then switches an already open viewer tab to the project or, if no tab is connected, opens the default browser. Mention the printed URL to the user once. Do this early, before the first real geometry, so the user sees every step.

The dev server watches `src/`, `config.yaml` and used `_libs/` files and re-renders on every save, so the viewer updates as you write files.

### 3. Build incrementally

Edit `workspace/<id>/src/*.scad` following scad-craft. Work in steps the user can follow: base body first, then features (holes, cutouts, ribs), then refinements (fillets, chamfers, text). After each meaningful step:

```bash
pnpm scad render <id>
```

It renders every part (through the dev server when it runs, so the viewer and you see the same result), prints per-part bounding boxes, facet counts, warnings, errors with file:line and ECHO output, then writes `preview/sheet.png`. Exit code 1 means errors: fix them before anything else. A failed part keeps showing its last good model in the viewer, with the error on top.

`--no-sheet` skips the PNG when you only need the numbers; `--part a,b` renders a subset.

### 4. Look at your work, every time

Read `workspace/<id>/preview/sheet.png` with the read tool after renders that change geometry. Layout: top-left isometric, top-right front (from -Y), bottom-left right (from +X), bottom-right top (from +Z); the orthographic views carry axes and scale ticks.

For details and insides:

```bash
pnpm scad snapshot <id> --view back|left|bottom|iso-back|...    # other angles
pnpm scad snapshot <id> --section y=12                         # cut at y=12, keep y<=12
pnpm scad snapshot <id> --section z=3:above --part lid         # keep the part above z=3
```

Snapshots land in `preview/`. Check wall thickness, hidden cavities, hole alignment and overlaps in sections.

Verify numbers, not just pictures: compare the printed bounding boxes with the requirements; use `echo()` or `assert()` in the model for derived values (scad-craft).

Be a harsh critic: does it match the brief, will it print without supports where avoidable, are walls thick enough, do mating parts have clearance, are there coincident faces or zero-thickness walls, is anything floating?

### 4b. Check printability

Before every checkpoint and every export, and also right after any build step that adds thin features (ribs, lips, clips, text, shells) or downward-facing geometry (bridges, ceilings, horizontal holes, undercuts). Finding a problem in the step that caused it is cheaper than at the end:

```bash
pnpm scad check <id>
```

It analyses the rendered meshes in `preview/` (it renders first if the sources changed) against the active printer profile (`pnpm scad printer <id>`). Which checks run depends on the process. Per part, it reports PASS, WARN or FAIL for:

- **manifold:** open edges, non-manifold edges, flipped or inside-out faces (FAIL). Also edges folding back more than 170 deg, which are zero-thickness fins or flaps, usually from a face ending exactly on another face (WARN). Degenerate triangles are only counted.
- **bed:** the bounding box against the build volume. FAIL if it does not fit, WARN if it only fits rotated 90 deg or the lowest point is not z = 0.
- **overhangs (fdm only):** faces steeper than the printer's `overhangAngle` from vertical, excluding faces on the bed, grouped into regions with area, centre, box and worst angle. 90 deg means a flat ceiling or bridge. Always WARN, never FAIL: decide whether to redesign (chamfers, teardrops, a different orientation) or tell the user that supports are needed.
- **islands (resin only):** points and flat undersides where a layer starts without anything below it, with height above the bed and position. Each one needs a support in this orientation. Always WARN: add a chamfer or cone that grows from below, or tell the user where the slicer will place supports.
- **walls:** thickness measured inwards from every triangle. WARN under `minWall` (fdm default 2 x nozzle), FAIL when the thinnest 0.1 mm2 patch of a region is under the nozzle (fdm) or under `minFeature` (resin). This is approximate: one ray per triangle, only walls with roughly opposite faces count, and gaps between parts are not measured. Confirm findings with a section snapshot through the reported centre.
- **bodies:** solids, enclosed voids, bodies floating above the bed, and bodies smaller than `minWall` (WARN). For resin, enclosed voids WARN too because they trap resin; add drain holes of at least `drainHole` mm.

Exit code 1 means at least one FAIL. How to handle the result:

1. Read `## Decisions` in `brief.md` first. A finding the user already accepted there (same check, same feature) is not raised again; mention it only if it got worse.
2. Fix every other FAIL with the fixes table in scad-craft ("Fixing check findings"), then render and check again. Fix the parameter or module that causes it, not the symptom.
3. If a FAIL is still there after two fix attempts, or fixing it would change the design the user asked for (a knife edge that is the point of the feature, a part larger than the bed), stop and ask the user: explain the finding, the options and their cost. Do not keep iterating and do not checkpoint over it silently.
4. When the user accepts a FAIL or WARN, record it under `## Decisions` in `brief.md` with the check, the feature and the reason, e.g. "walls: groove lips taper to 0 mm at the helix run-out, accepted (cosmetic, prints fine)".
5. WARNs: fix the cheap ones (a chamfer instead of a fillet on a downward edge, a part 0.2 mm above the bed). Mention the rest in your reply, especially overhangs that need supports.
6. Do not lower thresholds in `config.yaml` to make a check pass. Only change `print` or `printers` when the user's printer, nozzle or process differs. The full result is in `preview/check.json` (`--json` prints it). Use `--part a,b` to check a subset; that does not write `check.json`. `checkpoint`, `export` and `status` note when the check is missing, outdated or failed.

In the viewer, the user can toggle an overhang heatmap (H, islands for resin) and a wall-thickness overlay (T). Both use the same thresholds and follow every re-render, so you can point them at a region ("turn on Walls (T): the red band on the rim is 0.3 mm").

### 5. Finish the request

When the user's request is done, the render is clean and `pnpm scad check <id>` has no unexplained FAIL, checkpoint it (scad-versions):

```bash
pnpm scad checkpoint <id> -m "Short description of what changed"
```

Add one line per request to `## Changelog` in `brief.md`. Report briefly: what changed, key dimensions, the version id, anything the user should check in the viewer (suggest using the section tool or measuring a specific distance).

### 6. Deliver

When asked for files, follow scad-export (`pnpm scad export <id>`).

## The viewer, for reference when talking to the user

- View cube (top right) snaps to faces, edges and corners; keys 0 iso, 1 front, 2 top, 3 right, 4 back, 5 bottom, 6 left, F fit, O ortho/perspective.
- Section (S) with X/Y/Z or free plane and hatched caps; X-ray (X); edges (E); wireframe (W); bounding box dimensions (D); measuring (M, click two points, snaps to vertices).
- Build plate (G) has the active printer's bed size and is centred under the model like a slicer would place it. A dashed box shows the build volume, labelled with the printer name. The outline and the bounding box dimensions turn red when the model does not fit.
- Overhang heatmap (H): for fdm, faces past `overhangAngle` shade from amber to red, faces on the bed are teal. For resin, the button reads Islands and marks unsupported start points in red. Wall overlay (T): red under the nozzle (resin: `minFeature`), amber up to `minWall`, fading to grey at twice that. A legend shows the totals.
- Parameter panel lists customizer parameters; the user can tweak values (rendered separately, your files stay untouched) and click "Send to agent", which writes a proposal for you.
- Note tool (N) pins numbered notes on faces, edges and corners; the Notes panel sends them with a snapshot of the view as annotations for you. If a request is about a specific spot that is hard to describe in words, suggest the user pins a note there.
- Version timeline at the bottom shows checkpoints; the ghost button overlays another version for comparison.

## Rules

- `src/*.scad` and `config.yaml` are the source of truth. Never edit `preview/`, `versions/`, `out/` or `temp/`.
- Units are millimetres, Z is up, models sit on the XY plane (z >= 0) unless the brief says otherwise.
- One request, one checkpoint. Do not checkpoint broken or half-done states.
- Do not change the viewer or tooling to make a model work; tell the user if the tooling lacks something.
