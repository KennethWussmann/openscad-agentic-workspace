---
name: scad-versions
description: Checkpoints and history for workspace models - create a version after each completed request, list and compare versions, restore an earlier version, and apply proposals the user sent from the browser viewer (parameter values and 3D annotations pinned on the model). Use after finishing any change the user asked for, and whenever the user says go back, undo, previous version, revert, compare with before, what changed, mentions values they tweaked or sent from the viewer, or refers to notes, pins, annotations or things they marked on the model.
---

# Versions and proposals

Each project keeps a linear history in `workspace/<id>/versions/vNNN/`: a copy of `src/`, `config.yaml`, the used `_libs` files, the rendered models, the contact sheet, the parameter values and the commits of third-party libraries. The viewer shows them as a timeline; the user can open any version or overlay one as a ghost.

## When to checkpoint

One checkpoint per completed user request, after a clean render and a printability check:

```bash
pnpm -s scad check <id>                                         # renders first if the sources changed
pnpm -s scad checkpoint <id> -m "Wider base, two M3 mounting holes"
```

When the user also wants files, or the project already has exports in `out/`, use `pnpm -s scad release <id> -m "..."` instead: it runs check, checkpoint and export in that order, stops on FAIL and keeps all three on the same render. `--accept-fail` releases over FAILs the user accepted under `## Decisions`.

- Fix FAILs from `check` first, or explain them to the user if they are intended. Findings the user accepted are recorded under `## Decisions` in `brief.md` (scad skill, step 4b) and do not block the checkpoint. `checkpoint` adds a note when the check is missing, older than the render or failed.

- The message says what changed for the user, not how ("Lid snaps on tighter", "Holes for 6 mm cable"). It shows up in the timeline.
- `checkpoint` refuses when the last render failed, when files changed after the last render (render again) or when nothing changed since the latest version (`--force` overrides, rarely needed).
- Do not checkpoint intermediate steps, experiments or broken states. If you explored alternatives, checkpoint the one the user chose.
- Mention the new version id in your reply.

`pnpm -s scad versions <id>` lists the history and whether the working copy changed since the latest version. `pnpm -s scad status <id>` shows the same plus render state.

## Going back

```bash
pnpm -s scad restore <id> v003
```

Copies `src/` and `config.yaml` of v003 back, renders, and records the result as a new version ("Restore v003: ..."), so nothing is ever lost and the timeline stays linear. If the user only wants to look at an old version, point them to the timeline in the viewer instead.

Shared `_libs` files are not restored by default because other projects use them. If they changed since that version, restore prints a warning; then either accept the difference, or restore them with `--with-libs` after confirming with the user that other projects are not affected.

To combine an old idea with current work, read `workspace/<id>/versions/vNNN/src/` and port the relevant parts by hand instead of restoring.

## Comparing

- Code: diff `workspace/<id>/versions/vNNN/src/` against `workspace/<id>/src/` (or two versions against each other) with your normal tools.
- Numbers: each `version.json` holds part bounding boxes and parameter values.
- Visual: `versions/vNNN/preview/sheet.png` is the contact sheet of that version. Tell the user they can overlay any version as a ghost in the viewer timeline.

## Proposals from the browser

The viewer has two independent ways to send feedback. Both land in `workspace/<id>/proposals/`, and `pnpm -s scad list` and `status` flag them as pending. One command shows both:

```bash
pnpm -s scad proposal <id>          # parameter table and/or the list of 3D notes
pnpm -s scad proposal <id> --json   # the same, machine-readable
```

### Parameter proposals (`proposals/params.json`)

The user tweaks parameters in the viewer, sees the result rendered live (your files stay untouched) and presses "Send to agent". `proposal` prints a table of parameter, current value, proposed value and the user's note.

1. Port the proposed values into the parameter defaults in the `.scad` source. Keep the parameter structure; if a value is outside a declared range, widen the range deliberately or discuss it.
2. Consider the note and side effects (a larger value may need other derived dimensions to change).

### 3D annotations (`proposals/annotations.json` + `annotations.png`)

The user pins numbered notes directly on the model ("make this hole 0.5 mm bigger", "round this edge") and sends them together with a snapshot of their view. Each note carries:

- `point`: the clicked position in model coordinates (mm, the same frame as your OpenSCAD code), and `normal`: the outward normal of the clicked triangle.
- `kind`: what the click snapped to. `face` is a click on a surface, `edge` is near a sharp edge (the edge is extended across collinear segments, with its two end points, its length, the angle between the two faces, and whether it is convex like an outside corner or concave like an inside corner), and `vertex` is a corner.
- `part`: the part id and its source file. `mesh` and `color` identify a colored sub-object within the part when the model uses `color()`; `default` means no color.
- `surface`: the connected smooth region around the click, split at the same 24 degree feature angle the viewer uses for edge lines.
  - `planar`: a flat face with its area, bounding box and normal.
  - `cylindrical`: a fitted cylinder with axis, a center point on the axis, radius, length along the axis and covered arc in degrees. `concave` marks a hole, convex a boss or round. This is the fastest way to identify "this hole".
  - `curved`: anything else. The region's box and the `facet` (the flat patch of triangles directly under the click) narrow it down.
- `source`: which geometry the note was placed on. That is the working copy (with the render time), a tweak preview (with the tweaked, unsent parameter values), or a checkpoint `vNNN`. Notes on a version or tweak refer to that geometry, not necessarily to your current source.

The proposal also records `basedOn` (latest checkpoint when sent), the camera, the active section plane if any, an optional overall note and the snapshot path.

Handle annotations like this:

1. Read the snapshot PNG first. It is the user's exact view with numbered balloons on leader lines, and a legend of all notes in the bottom-left corner.
2. For each note, map the point to source geometry. Use the coordinates, the surface data and the part file to find the responsible module, primitive or loop iteration. Remember the transforms (`translate`, `rotate`, `mirror`, loops) between the primitive and world coordinates. For a hole, look for a `cylinder` whose radius matches `radius` (or diameter `2*radius`) and whose axis matches; for an edge, look for the two faces that meet along `a`..`b`.
3. If anything is ambiguous, confirm it before editing. Run `pnpm -s scad snapshot <id> --section x=<point.x>` (or `y`/`z`, whichever cuts through the feature) and read it, compare `surface.bbox` against the dimensions in your code, or `echo()` a candidate position. If you still cannot tell which feature is meant, ask the user and reference the note number.
4. Interpret the text in context. "0.5 mm bigger" on a hole usually means the diameter; say so if you assume it. Prefer changing the parameter that drives the feature over a one-off hack, and keep symmetric or repeated features consistent (all four holes, not only the clicked one) unless the note says otherwise; mention that choice in your reply.
5. Notes placed on an old version or a tweak preview: check whether the feature still exists at the same place in the current source before applying.

### Finishing either kind

1. `pnpm -s scad render <id>`, inspect (for annotations: the snapshot or a section at the annotated points), then `pnpm -s scad check <id>` and `pnpm -s scad checkpoint <id> -m "..."`, or `pnpm -s scad release <id> -m "..."` when files are wanted.
2. `pnpm -s scad proposal <id> --clear` clears both kinds. In your reply, go through annotations by number ("1: hole now 3.7 mm, 2: front edge rounded r1").
