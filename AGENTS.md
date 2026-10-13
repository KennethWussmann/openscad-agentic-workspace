# OpenSCAD Agentic Workspace

You build 3D models with OpenSCAD while the user watches them come to life in a browser viewer. All geometry comes from the OpenSCAD CLI; this repository provides the CLI wrapper (`pnpm -s scad`), the live viewer and the conventions.

## First thing in every session

Run `pnpm -s scad doctor` from the repository root. If it fails or `pnpm` is not available, the repository is not set up yet: follow `.agents/skills/scad-setup/SKILL.md` before doing anything else.

## Designing models

For every modelling request, load `.agents/skills/scad/SKILL.md` first. It is the single source for the design workflow and rules (where models live, print orientation, printer profile, checks, releases) and links the sub-skills below. Always call the CLI as `pnpm -s scad`; `-s` keeps pnpm's script header out of the output.

| Skill | Load when |
| --- | --- |
| `.agents/skills/scad-setup/SKILL.md` | Fresh clone, `doctor` fails, Node/pnpm/OpenSCAD missing, dependencies not installed |
| `.agents/skills/scad/SKILL.md` | Any modelling request: new model, change a model, show a model, printability check. Entry point of the workflow |
| `.agents/skills/scad-craft/SKILL.md` | Always when writing or changing `.scad` files |
| `.agents/skills/scad-libs/SKILL.md` | Reusable modules across projects, third-party libraries (BOSL2 and others), threads, rounding, attachments |
| `.agents/skills/scad-versions/SKILL.md` | Checkpoints, "go back to", comparing versions, proposals the user sent from the browser: parameter values and 3D annotations (notes pinned on faces, edges and corners, with a snapshot) |
| `.agents/skills/scad-export/SKILL.md` | Delivering files: STL, 3MF, OBJ, PNG, SVG/DXF, print preparation, merged multi-color/multi-material 3MF |

## Tooling development

Only relevant when the user asks you to work on the CLI, the viewer or the libraries themselves. Skip this section while designing models.

Repository layout:

- `apps/cli` (`pnpm scad`): deterministic commands for the agent. Run `pnpm scad` without arguments for the command reference; add `--json` for machine-readable output. One file per command group in `src/commands/`, text output in `src/format/`.
- `apps/web`: React + three.js viewer, served by Vite. `src/components/` reusable UI pieces, `src/features/` the panels and overlays, `src/viewer/` the three.js scene, `src/store/` the zustand store.
- `libs/protocol` (`@scad/protocol`): types, constants, events and the typed HTTP client shared by every package. Runs in Node and the browser.
- `libs/geometry` (`@scad/geometry`): mesh topology, surface analysis and the printability analysis (manifold, overhangs, islands, walls, bodies). Runs in Node and in the viewer.
- `libs/core` (`@scad/core`): Node only. Config, OpenSCAD discovery and runs, rendering, views, versions, proposals, libraries, exports, `check` on rendered files.
- `libs/vite-plugin-scad`: dev-server API routes, file watcher that re-renders on save, live push to the viewer.
- `workspace/` (gitignored): all models. `workspace/<project>/`, shared libraries in `workspace/_libs/`, third-party checkouts in `workspace/_vendor/`.
- `config.yaml` (gitignored, created from `config.example.yaml`): workspace settings; each project's `config.yaml` overrides them.

Rules:

- `pnpm typecheck`, `pnpm test`, `pnpm e2e`, `pnpm lint` (Biome) from the root. The tests require OpenSCAD to be installed, `pnpm e2e` also Chromium (`pnpm --filter @scad/e2e exec playwright install chromium`).
- Viewer changes come with unit or component tests next to the code in `apps/web/src`, user-facing flows with a Playwright spec in `apps/e2e/tests`.
- Keep `.ts`/`.tsx` files under 500 lines; Biome fails the lint above that. Split by responsibility instead of growing a file.
- Code the browser needs goes into `@scad/protocol` or `@scad/geometry`, never into `@scad/core`, so the viewer never depends on Node modules.
- CLI changes update the command reference in `apps/cli/src/help.ts` and the skills that use the command.
