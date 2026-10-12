---
name: scad-libs
description: Reusable OpenSCAD code across workspace projects - local shared libraries in workspace/_libs and pinned third-party git libraries such as BOSL2 declared in config.yaml. Use when a module is needed by more than one project, when the user asks for a library, or when a model needs threads, gears, rounded/chamfered edges, attachments, hinges, snap fits or other features a well-known library already solves.
---

# Libraries

OpenSCAD has no package manager. It resolves `use <x/y.scad>` and `include <x/y.scad>` relative to the current file and then along `OPENSCADPATH`. The CLI builds `OPENSCADPATH` per project from two sources:

1. `workspace/_libs/` - local libraries you write and share between projects.
2. Third-party git libraries declared under `libraries:` in `config.yaml` (root) or a project's `config.yaml`, checked out per pinned ref into `workspace/_vendor/<Name>@<ref>/<Name>/`.

`pnpm scad lib list [--project p]` shows both, with install status.

## Local libraries (`workspace/_libs`)

Create one when a module is needed by a second project, or when the user asks for reusable parts (fasteners, enclosure helpers, a house style):

```bash
pnpm scad lib new fasteners --description "Metric screw holes, nut traps, heat-set insert bosses"
```

This creates `workspace/_libs/fasteners/{fasteners.scad, README.md, examples/demo.scad}`. Projects use it with `use <fasteners/fasteners.scad>`.

Conventions:

- Every module and function takes explicit arguments with sensible defaults; no reliance on globals, no top-level geometry in the library file (so `use` stays side-effect free).
- Prefix names with the library to avoid clashes (`fasteners_screw_hole`, `fasteners_m3`).
- Keep `README.md` current: one table row per public module or function with its purpose and key arguments. Read it before using a library instead of re-reading all code.
- Split large libraries into several files (`fasteners/screws.scad`, `fasteners/inserts.scad`) and an index file that `include`s them.
- Changing a library changes every project that uses it: the dev server re-renders dependent projects automatically. Keep signatures backwards compatible or update all users (`grep -r "use <fasteners" workspace/*/src`). Checkpoints store a copy of the used library files; `pnpm scad restore ... --with-libs` puts them back.
- To try a library in isolation, create a scratch project that uses it, rather than putting test geometry into the library.

## Third-party libraries

Declared, pinned and installed on demand. Nothing is hardcoded in the tooling; you decide per project what is worth it and the user's config records it.

```bash
pnpm scad lib add BOSL2 --git https://github.com/BelfrySCAD/BOSL2.git              # root config, pinned to current commit
pnpm scad lib add BOSL2 --git https://github.com/BelfrySCAD/BOSL2.git --project gearbox --ref <tag-or-commit>
pnpm scad lib remove BOSL2 [--project p]
pnpm scad lib sync           # install anything missing (render does this automatically)
pnpm scad lib prune          # delete checkouts no config refers to anymore
```

- The name is the folder used in includes (`BOSL2` for `include <BOSL2/std.scad>`), so it must match the library's expected folder name.
- Without `--ref` the current commit of the default branch is resolved and written, so builds stay reproducible. Prefer tags or commits over branches.
- Root entries are inherited by every project; a project can add its own or re-pin a different ref of the same library without affecting others.
- Checkpoints record the exact commit of every configured library.
- Ask the user before adding a third-party library to the root config; adding one to a single project for a clear reason (threads, gears) is fine, mention it in the brief.

Useful libraries (verify the URL and license before adding):

| Library | Folder | Good for |
| --- | --- | --- |
| BOSL2 (`https://github.com/BelfrySCAD/BOSL2.git`, BSD-2) | `BOSL2` | Attachments and anchors, rounding/chamfering (`cuboid(..., rounding=)`), threads (`threading.scad`), gears, hinges, joiners, screws, paths and sweeps |
| NopSCADlib (`https://github.com/nophead/NopSCADlib.git`, GPL-3) | `NopSCADlib` | Real-world vitamins: screws, nuts, bearings, PCBs, fans, connectors for enclosures |

BOSL2 usage notes:

- `include <BOSL2/std.scad>` (BOSL2 requires `include`, not `use`). Extra modules: `include <BOSL2/threading.scad>`, `include <BOSL2/gears.scad>`, `include <BOSL2/screws.scad>`.
- BOSL2 shapes are centered by default; use `anchor=BOTTOM` to sit on the plate.
- Mixing BOSL2 with plain OpenSCAD is fine; keep the project's parameter block plain so the customizer still works.
- BOSL2 is large; first renders take longer. Read the relevant file's header in `workspace/_vendor/BOSL2@<ref>/BOSL2/` or the wiki (https://github.com/BelfrySCAD/BOSL2/wiki) instead of guessing signatures.
