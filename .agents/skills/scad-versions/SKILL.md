---
name: scad-versions
description: Checkpoints and history for workspace models - create a version after each completed request, list and compare versions, restore an earlier version, and apply parameter proposals the user sent from the browser viewer. Use after finishing any change the user asked for, and whenever the user says go back, undo, previous version, revert, compare with before, what changed, or mentions values they tweaked or sent from the viewer.
---

# Versions and proposals

Each project keeps a linear history in `workspace/<id>/versions/vNNN/`: a copy of `src/`, `config.yaml`, the used `_libs` files, the rendered models, the contact sheet, the parameter values and the commits of third-party libraries. The viewer shows them as a timeline; the user can open any version or overlay one as a ghost.

## When to checkpoint

One checkpoint per completed user request, after a clean render:

```bash
pnpm scad render <id>
pnpm scad checkpoint <id> -m "Wider base, two M3 mounting holes"
```

- The message says what changed for the user, not how ("Lid snaps on tighter", "Holes for 6 mm cable"). It shows up in the timeline.
- `checkpoint` refuses when the last render failed, when files changed after the last render (render again) or when nothing changed since the latest version (`--force` overrides, rarely needed).
- Do not checkpoint intermediate steps, experiments or broken states. If you explored alternatives, checkpoint the one the user chose.
- Mention the new version id in your reply.

`pnpm scad versions <id>` lists the history and whether the working copy changed since the latest version. `pnpm scad status <id>` shows the same plus render state.

## Going back

```bash
pnpm scad restore <id> v003
```

Copies `src/` and `config.yaml` of v003 back, renders, and records the result as a new version ("Restore v003: ..."), so nothing is ever lost and the timeline stays linear. If the user only wants to look at an old version, point them to the timeline in the viewer instead.

Shared `_libs` files are not restored by default because other projects use them. If they changed since that version, restore prints a warning; then either accept the difference, or restore them with `--with-libs` after confirming with the user that other projects are not affected.

To combine an old idea with current work, read `workspace/<id>/versions/vNNN/src/` and port the relevant parts by hand instead of restoring.

## Comparing

- Code: diff `workspace/<id>/versions/vNNN/src/` against `workspace/<id>/src/` (or two versions against each other) with your normal tools.
- Numbers: each `version.json` holds part bounding boxes and parameter values.
- Visual: `versions/vNNN/preview/sheet.png` is the contact sheet of that version. Tell the user they can overlay any version as a ghost in the viewer timeline.

## Proposals from the browser

The user can tweak parameters in the viewer, see the result rendered live (without touching your files) and press "Send to agent". That writes `workspace/<id>/proposals/params.json`. `pnpm scad list` and `status` flag pending proposals.

```bash
pnpm scad proposal <id>          # table: parameter, current value, proposed value, the user's note
```

Then:

1. Port the proposed values into the parameter defaults in the `.scad` source. Keep the parameter structure; if a value is outside a declared range, widen the range deliberately or discuss it.
2. Consider the note and side effects (a larger value may need other derived dimensions to change).
3. `pnpm scad render <id>`, inspect, `pnpm scad checkpoint <id> -m "..."`.
4. `pnpm scad proposal <id> --clear`.
