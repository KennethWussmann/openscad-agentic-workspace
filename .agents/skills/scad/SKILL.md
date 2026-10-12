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
| `.agents/skills/scad-versions/SKILL.md` | After every completed user request (checkpoint), going back, comparing, browser proposals |
| `.agents/skills/scad-export/SKILL.md` | Delivering files or preparing for printing |
| `.agents/skills/scad-setup/SKILL.md` | `pnpm scad doctor` fails |

## Workflow

### 0. Check the setup

`pnpm scad doctor`. Fix FAIL items with the scad-setup skill first.

### 1. Understand and propose

Ask only what you truly need: key dimensions, what it mates with, printer or process, material, must-have features. Measurements of the real counterpart beat guesses; ask for them. Infer the rest and state your assumptions.

New project: `pnpm scad new <id> [--name "Name"] [--description "..."]` (id is lowercase-dashed). `--from <other-project>` starts from a copy. Fill `workspace/<id>/brief.md` (requirements, key dimensions, parts, decisions) and give the user a short summary of the plan.

Existing project: `pnpm scad list`, then `pnpm scad status <id>` and read its `brief.md` and sources before changing anything. If status shows a pending proposal from the browser, handle it first (scad-versions skill).

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

### 5. Finish the request

When the user's request is done and the render is clean, checkpoint it (scad-versions):

```bash
pnpm scad checkpoint <id> -m "Short description of what changed"
```

Add one line per request to `## Changelog` in `brief.md`. Report briefly: what changed, key dimensions, the version id, anything the user should check in the viewer (suggest using the section tool or measuring a specific distance).

### 6. Deliver

When asked for files, follow scad-export (`pnpm scad export <id>`).

## The viewer, for reference when talking to the user

- View cube (top right) snaps to faces, edges and corners; keys 0 iso, 1 front, 2 top, 3 right, 4 back, 5 bottom, 6 left, F fit, O ortho/perspective.
- Section (S) with X/Y/Z or free plane and hatched caps; X-ray (X); edges (E); wireframe (W); bounding box dimensions (D); measuring (M, click two points, snaps to vertices).
- Parameter panel lists customizer parameters; the user can tweak values (rendered separately, your files stay untouched) and click "Send to agent", which writes a proposal for you.
- Version timeline at the bottom shows checkpoints; the ghost button overlays another version for comparison.

## Rules

- `src/*.scad` and `config.yaml` are the source of truth. Never edit `preview/`, `versions/`, `out/` or `temp/`.
- Units are millimetres, Z is up, models sit on the XY plane (z >= 0) unless the brief says otherwise.
- One request, one checkpoint. Do not checkpoint broken or half-done states.
- Do not change the viewer or tooling to make a model work; tell the user if the tooling lacks something.
