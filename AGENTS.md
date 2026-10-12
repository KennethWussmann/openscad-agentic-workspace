# OpenSCAD Agentic Workspace

You build 3D models with OpenSCAD while the user watches them come to life in a browser viewer. All geometry comes from the OpenSCAD CLI; this repository provides the CLI wrapper (`pnpm scad`), the live viewer and the conventions.

## First thing in every session

Run `pnpm scad doctor` from the repository root. If it fails or `pnpm` is not available, the repository is not set up yet: follow `.agents/skills/scad-setup/SKILL.md` before doing anything else.

## Skills

| Skill | Load when |
| --- | --- |
| `.agents/skills/scad-setup/SKILL.md` | Fresh clone, `doctor` fails, Node/pnpm/OpenSCAD missing, dependencies not installed |
| `.agents/skills/scad/SKILL.md` | Any modelling request: new model, change a model, show a model. Entry point of the workflow |
| `.agents/skills/scad-craft/SKILL.md` | Always when writing or changing `.scad` files |
| `.agents/skills/scad-libs/SKILL.md` | Reusable modules across projects, third-party libraries (BOSL2 and others), threads, rounding, attachments |
| `.agents/skills/scad-versions/SKILL.md` | Checkpoints, "go back to", comparing versions, proposals the user sent from the browser: parameter values and 3D annotations (notes pinned on faces, edges and corners, with a snapshot) |
| `.agents/skills/scad-export/SKILL.md` | Delivering files: STL, 3MF, OBJ, PNG, SVG/DXF, print preparation |

## Repository layout

- `apps/cli` (`pnpm scad`): deterministic commands for the agent. Run `pnpm scad` without arguments for the command reference; add `--json` for machine-readable output.
- `apps/web`: React + three.js viewer, served by Vite.
- `libs/core`: config, OpenSCAD discovery, rendering, versions, libraries, exports.
- `libs/vite-plugin-scad`: dev-server API, file watcher that re-renders on save, live push to the viewer.
- `workspace/` (gitignored): all models. `workspace/<project>/`, shared libraries in `workspace/_libs/`, third-party checkouts in `workspace/_vendor/`.
- `config.yaml` (gitignored, created from `config.example.yaml`): workspace settings; each project's `config.yaml` overrides them.

## Rules

- Model files live only in `workspace/<project>/`. Never put models anywhere else and never edit `preview/`, `versions/` or `out/` by hand.
- Use `pnpm scad` for renders, exports, versions and libraries instead of calling OpenSCAD directly; it applies the config, library paths and keeps the viewer in sync.
- Do not change the viewer, CLI or libraries to make a model work. If the tooling lacks something, tell the user.
- Development on the tooling itself: `pnpm typecheck`, `pnpm test`, `pnpm lint` (Biome) from the root. OpenSCAD-dependent tests skip themselves when OpenSCAD is not installed.
