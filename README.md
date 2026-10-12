# OpenSCAD Agentic Workspace

A workspace for building parametric 3D models together with a coding agent. The agent writes OpenSCAD, renders through the OpenSCAD CLI and checkpoints every change. A live viewer in your browser shows the model taking shape while the agent works.

![The viewer with parameters, view tools, bounding box dimensions and the version timeline](docs/assets/viewer.jpg)

## Setup

Requirements: Node.js 24+, pnpm (via `corepack enable`), git, and a recent OpenSCAD development snapshot (2024 or newer, for the Manifold backend and colored 3MF).

```bash
corepack enable
pnpm install
pnpm scad doctor
```

`doctor` creates `config.yaml` from `config.example.yaml`, finds OpenSCAD and tells you what is missing. OpenSCAD lookup order:
1. `OPENSCAD_PATH`
2. `openscad.path` in `config.yaml`
3. `PATH`
4. Standard install locations for macOS, Windows and Linux

The first path it finds is saved in `config.yaml`.

Agents pick up `AGENTS.md` and the skills in `.agents/skills/`. If you clone the repo and ask your agent to set it up, it follows `.agents/skills/scad-setup/SKILL.md`.

## How it works

```mermaid
flowchart LR
    you([You]) -->|request| agent[Agent]
    you -.->|edits in editor| src
    agent -->|writes| src["workspace/#lt;project#gt;/src/*.scad"]
    agent -->|pnpm scad render| cli[OpenSCAD CLI]
    src --> cli
    cli --> preview["preview/<br/>*.3mf, sheet.png, snapshots"]
    preview -->|contact sheet, sections| agent
    agent -->|pnpm scad checkpoint| versions["versions/vNNN"]

    subgraph dev [Dev server]
        watcher[File watcher] -->|re-render on save| cli
        preview --> push[Live push]
    end

    src -.->|watched| watcher
    push --> viewer[Browser viewer]
    viewer -->|Send to agent| proposals["proposals/"]
    proposals -->|pnpm scad proposal| agent
    viewer -.->|shows model live| you
```

- `pnpm scad open <project>` starts the Vite dev server in the background. If a viewer tab is already open, it switches that tab to the project; otherwise it opens your default browser.
- The dev server watches `src/`, `config.yaml` and shared libraries, and re-renders whenever a file is saved. That includes your own edits in an editor.
- With `?embed=1` the viewer drops its panels and shows only the viewport, which fits next to the source in an editor tab:

  ![main.scad next to the embedded viewer in VS Code](docs/assets/editor-split-view.jpg)

- The agent inspects its own work from a 2x2 contact sheet (iso, front, right, top) and from section snapshots rendered by OpenSCAD.
- After every finished request the agent creates a checkpoint (`versions/vNNN`). It contains the sources, the models and the parameter values, so you can go back to any version or compare against it.

## Viewer

- **View cube:** snaps to faces, edges and corners. Keys: 0 iso, 1 front, 2 top, 3 right, 4 back, 5 bottom, 6 left. F fits the model, O toggles ortho/perspective.
- **Section view:** X, Y or Z plane, or a free plane moved with a gizmo. The cut faces are drawn as hatched caps. A separate X-ray mode shows the inside.
- **Display:** edges, wireframe, build plate grid, and bounding box dimensions in mm.
- **Measuring:** click two points to get distance and dx/dy/dz. Points snap to vertices.
- **Parts panel:** shows each part on its own or the whole assembly.
- **Parameter panel:** lists the OpenSCAD customizer parameters. Changing a value renders a temporary preview. "Send to agent" turns your values into a proposal the agent applies to the source.
- **Version timeline:** open any checkpoint, or overlay one as a ghost to compare.
- **Errors and console:** OpenSCAD errors appear on top of the last good model, and the console shows ECHO output and warnings.

Press `?` in the viewer for all keys.

## CLI

`pnpm scad` without arguments prints the reference. The main commands:

| Command | Purpose |
| --- | --- |
| `doctor` | Check the setup, find OpenSCAD |
| `new <project>` | Create `workspace/<project>` with a parametric template |
| `open [project]` / `serve` / `stop` | Viewer and background dev server |
| `render <project>` | Render all parts, then the contact sheet |
| `snapshot <project> --section x=10` | Extra views and cross-sections as PNG |
| `params <project>` | Customizer parameters |
| `checkpoint <project> -m "..."` / `versions` / `restore <project> v003` | History |
| `proposal <project>` | Parameter values sent from the viewer |
| `export <project>` | Write the configured formats to `out/` |
| `lib new` / `lib add` / `lib sync` | Shared and third-party OpenSCAD libraries |

Every command accepts `--json`.

## Configuration

`config.yaml` (gitignored) holds the workspace defaults:
- OpenSCAD path, backend and timeout
- Render defines
- Contact sheet settings
- Export formats and file names
- Server port
- Third-party libraries pinned to a git ref

Each project's `workspace/<project>/config.yaml` can override any of these and also declares the project's name, description and parts. Objects are merged key by key; lists and plain values replace the inherited value. See `config.example.yaml` for every key.

## Workspace layout

```
workspace/                    gitignored
  _libs/<name>/               shared libraries you build, available as use <name/name.scad>
  _vendor/<Name>@<ref>/       third-party checkouts from config.yaml `libraries`
  <project>/
    config.yaml  brief.md
    src/                      OpenSCAD sources (source of truth)
    preview/                  current render: models, render.json, sheet.png, snapshots
    versions/vNNN/            checkpoints
    proposals/                parameter proposals from the viewer
    out/                      exports
    temp/                     scratch
```

## Development

The repo is a pnpm workspace orchestrated by Turborepo and linted with Biome:
- `apps/cli`: the `pnpm scad` CLI
- `apps/web`: the React + three.js viewer
- `libs/core`: config, discovery, rendering, versions, libraries, exports
- `libs/vite-plugin-scad`: dev server API, file watcher, live events

```bash
pnpm dev         # viewer only
pnpm typecheck
pnpm test        # OpenSCAD-dependent tests skip when OpenSCAD is not installed
pnpm lint
pnpm build
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and build.

## Honorable Mentions

Inspired by [iKasch/freecad-py-agent](https://github.com/iKasch/freecad-py-agent/)