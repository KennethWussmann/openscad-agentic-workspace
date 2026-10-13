---
name: scad-craft
description: How to write maintainable, highly parametric OpenSCAD in this workspace - file structure, customizer parameters, modules, derived values, tolerances for 3D printing, multi-part projects, colors, performance and debugging. Load before writing or changing any .scad file in workspace/.
---

# Writing OpenSCAD that stays maintainable

The user will come back in a week and ask for "2 mm wider, and a second hole". The model must survive that: every meaningful number is a named parameter, everything else derives from them, and the structure reads top-down.

## File layout of a project

```
workspace/<id>/
  config.yaml        name, description, parts, setting overrides
  brief.md           requirements, decisions, changelog
  src/main.scad      entry file (or one entry file per part)
  src/*.scad         project-local modules: use <parts.scad>, include <dims.scad>
```

Project-local helper files are resolved relative to the including file. Code that more than one project needs goes into a shared library (scad-libs skill).

## Structure of an entry file

Top to bottom, always in this order:

```openscad
// Cable Clip
// Holds 2-6 mm cables under a desk edge.

/* [Cable] */
// Diameter of the cable to hold
cable_d = 5; // [2:0.5:12]
// How many cables side by side
cable_count = 2; // [1:1:6]

/* [Mount] */
// Desk board thickness the clip slides onto
board_t = 18; // [10:0.5:40]
// Wall thickness of the clip body
wall = 2.4; // [1.2:0.2:5]

/* [Print] */
// Gap per side for sliding fits, default is tolerances.sliding from `pnpm -s scad printer`
clearance = 0.3; // [0:0.05:1]
part = "clip"; // [clip, cover, assembly]

/* [Quality] */
$fa = 4;
$fs = 0.4;

/* [Hidden] */
eps = 0.01;
cable_r = cable_d / 2 + clearance;
body_w = cable_count * (cable_d + wall) + wall;

assert(wall >= 1.2, "walls below 1.2 mm do not print reliably");
echo(body_w = body_w);

main();

module main() {
  if (part == "clip") clip();
  if (part == "cover") translate([body_w + 10, 0, 0]) cover();
  if (part == "assembly") {
    clip();
    translate([0, 0, board_t + 5]) mirror([0, 0, 1]) cover();
  }
}

module clip() { ... }
module cover() { ... }
```

Rules behind it:

- Customizer parameters are top-level assignments with literal values placed before the first `module` or `function` definition. They show up in the viewer's parameter panel and in `pnpm -s scad params`. Anything after the first module definition, any computed expression and everything under `/* [Hidden] */` is not a parameter.
- Group parameters with `/* [Group] */`. Put a one-line `// caption` directly above each parameter; it becomes the label in the viewer. Add ranges `// [min:step:max]` or option lists `// [a, b, c]` so the user can tweak safely.
- Derived values live in `/* [Hidden] */`, computed from parameters. Never repeat a magic number; if a number appears twice, it is a parameter or a derived value.
- Name with units in mind and be explicit: `wall`, `hole_d`, `screw_head_d`, `lid_h`, `fillet_r`. `_d` diameter, `_r` radius, `_h` height, `_t` thickness, `_w` width, `_l` length.
- Modules take what they need as arguments with sensible defaults. Only the top-level `main()` reads globals; reusable modules never do.
- One module per feature or sub-part, small enough to read in one screen. Name them after what they are (`screw_boss`, `snap_hook`), not after how they are built.
- Never assign a variable twice in the same scope; OpenSCAD keeps the last value for the whole scope and warns.
- Prefer `use <file.scad>` for module libraries (imports modules and functions only). `include <file.scad>` also runs the file's top-level code and copies its variables; use it only for shared dimension files or libraries that require it (BOSL2).

## Design the way you print

The model's coordinates are its print orientation. What the viewer shows, what `check` analyses and what lands in `out/` is the part lying on the bed exactly as it will print. There is no separate viewing orientation.

- Pick the orientation before the first line of geometry (scad skill, step 1) and build every module in it. Do not model upright and flip the result at the end with a `print_layout` switch: the overhang and bridge findings of `check` then describe a different object than the one you are thinking about, and the rotations cost more reasoning than they save.
- Name faces after the print orientation in comments and the brief ("bed face", "top"), and describe the use orientation only where it matters ("hangs with the bed face against the wall").
- The only view that is not the print layout is how several parts fit together. Give the entry file a `part = "assembly"` option that places the parts in their use position, and look at it with `pnpm -s scad snapshot <id> --part <any> -D part=assembly`. It never becomes a part in `config.yaml`, so it is never checked or exported.

## Geometry habits

- Units are millimetres, Z is up, the part rests on z = 0 in its print orientation (see "Design the way you print").
- Overshoot cuts by `eps` so differences never leave zero-thickness skins: `translate([0, 0, -eps]) cylinder(d = hole_d, h = t + 2 * eps);`
- Avoid coincident faces in unions as well; overlap by `eps`.
- Center where it makes the math simpler, and say so in a comment at the module.
- `hull()` of primitives is the cheapest way to rounded boxes and slots. `minkowski()` is slow on complex shapes; use it on simple 2D/3D bases or use offset()-based 2D profiles plus `linear_extrude`/`rotate_extrude`.
- Build profiles in 2D (`square`, `circle`, `polygon`, `offset(r=)`) and extrude them; it is faster and easier to fillet.
- `color("name")` per sub-part or feature group makes the viewer and the contact sheet much easier to read and survives into 3MF. Use a calm, consistent palette.

## Printability defaults

Design for the active printer profile, never for assumed numbers. Run `pnpm -s scad printer <id>` before writing geometry that depends on the process and again when the project's `print` settings change. It prints the process (`fdm` or `resin`), bed, nozzle or pixel size, layer height, wall limits and tolerances that `pnpm -s scad check` and the viewer use.

The profile comes from `config.yaml`:
- `printers.<name>` describes each machine.
- `print` selects what to design for: `printer`, `nozzle` (fdm only, one of the printer's `nozzles`) and `layerHeight`.
- A project overrides either in its own `config.yaml`, e.g. `print: { nozzle: 0.6 }`.
- When the user changes the nozzle or printer, change `print` in the project config, not the printer definition, then re-check the parameters below.

Carry the profile into the model so it stays tweakable:
- Put tolerances into the `/* [Print] */` group as parameters whose defaults are the profile values: `clearance` (`sliding`), `press_fit` (`press`), `loose_fit` (`loose`), `hole_extra` (`hole`). Copy the numbers `pnpm -s scad printer <id>` prints for this project; never take them from examples in this skill, they differ per printer and process. The profile's `tolerances` are per side for mating parts (`press`, `sliding`, `loose`); `hole` is added to the diameter of holes for screws and pins.
- Derive minimum thicknesses from profile values captured as parameters (`nozzle = 0.4;`, `wall = 3 * nozzle;`) instead of literals, and guard them with `assert`.
- Note the profile you designed for (printer, process, nozzle or pixel, layer height) under Decisions in `brief.md`. If the profile changes later, update these parameters and say so.

FDM (`process: fdm`):
- Walls in multiples of the nozzle line width: >= 3 x nozzle for normal walls, >= 5 x nozzle structural. FAIL under one nozzle width, WARN under `minWall` (default 2 x nozzle).
- Floors and roofs >= 4 layers (4 x `layerHeight`). Heights of steps and text relief in multiples of the layer height.
- Overhangs up to `overhangAngle` (default 45 deg) print without support; use chamfers instead of fillets on downward-facing edges, teardrop or flat-topped horizontal holes.
- Text: >= 2.5 x nozzle stroke, >= 3 layers relief.

Resin (`process: resin`, SLA, MSLA, DLP):
- Walls >= `minWall` (WARN under it). Details, pins, embossed text strokes and gaps >= `minFeature` (FAIL under it). Nothing below 2 x `pixel` resolves.
- There is no overhang angle; resin needs supports wherever a layer starts unsupported. `check` reports these as islands. Reduce them with chamfers or cones that grow from below, or accept that the slicer adds supports and say so.
- Hollow parts: an enclosed void traps uncured resin and can crack the print. Add at least one drain hole of `drainHole` mm near the build plate side and a vent hole at the far end, or keep the part solid. Avoid open cavities facing the plate (suction cups); give them a vent.
- Large flat faces parallel to the plate cause peel forces; mention that the part is usually printed tilted with supports in the slicer.
- Tolerances are much tighter than FDM; take them from the profile.

Both:
- Metric screw reference, nominal sizes (shank diameter / head diameter / head height): M2 2/3.8/2, M2.5 2.5/4.5/2.5, M3 3/5.5/3, M4 4/7/4, M5 5/8.5/5. Hex nuts (across flats / thickness): M2 4/1.6, M2.5 5/2, M3 5.5/2.4, M4 7/3.2, M5 8/4. These are the real part sizes; add the profile's tolerances when modelling the holes:
  - Screw clearance holes: shank diameter + `hole_extra`.
  - Head counterbores: head diameter + 2 x `loose_fit`, depth head height + one layer.
  - Nut traps: flats + 2 x `clearance`, thickness + one layer, `$fn = 6`, rotated so flats are parallel to the build plate edges where it matters.
  - Heat-set inserts are an interference fit sized by the insert, not by the profile: M3 about 4.0-4.2 mm hole, 5-6 mm deep. Use the manufacturer's recommended hole when the user names the insert.
- State the assumptions you made in `brief.md`.

## Fixing check findings

What `pnpm -s scad check` reports and the usual fix. Confirm the location with a section snapshot through the reported centre before changing code, focused on it: `pnpm -s scad snapshot <id> --section y=<cy> --view front --focus <cx>,<cy>,<cz>`. Grouped findings (`8 x 0.59 mm`) usually share one cause, such as one module or one text size, so fix that once.

| Finding | Usual cause | Fix |
| --- | --- | --- |
| manifold: open or non-manifold edges | `polyhedron()` with wrong or missing faces; two solids touching along an edge or a point | Fix the face list and winding; make touching solids overlap by `eps` or separate them |
| manifold: flipped faces / inside out | `polyhedron()` faces wound the wrong way | Reverse the face order (OpenSCAD wants faces clockwise seen from outside) |
| manifold: folded edges (fins, flaps) | A face ends exactly on another face, coincident faces in `difference()`, a sweep ending on the face it joins | Extend the cutter or the sweep past the face by `eps` or about 1 deg; avoid coplanar faces in booleans |
| bed: does not fit | Part larger than the active printer's `bed` | Rotate the print orientation, split into parts with joints, or ask the user to scale |
| bed: lowest point not at z = 0 | Model offset or a feature below the base | Translate the part onto the bed in its print orientation |
| overhangs | Fillets on downward edges, horizontal holes, ceilings, undercuts | 45 deg chamfers, teardrop or flat-topped holes, reorient the part, split it, or tell the user supports are needed |
| walls: thin (WARN or FAIL) | Wall parameter too small, derived values going negative, a feature tapering to a point | Raise the parameter, add `assert(wall >= ...)` for derived thickness, end tapers in a flat of at least the nozzle width or a round |
| bodies: floating | Feature not unioned with the body, or sitting above it by rounding | Overlap it with the body by `eps`, or move it onto the bed or into its own part |
| bodies: small | Leftover slivers from `difference()` | Extend the cutter by `eps` so it cuts through completely |
| bodies: enclosed void | Hollow inside a solid | FDM: intended for some prints; otherwise remove it or tell the user it will be filled with infill or trap support. Resin: add drain and vent holes of at least `drainHole` mm, or make it solid |
| islands (resin) | Downward tips, floating features, flat undersides starting mid-air, horizontal holes with flat tops | Add a chamfer or cone that grows from below, move the feature onto the body, or tell the user the slicer will add supports there |

## Multi-part projects

Declare parts in the project `config.yaml`; each part is rendered to its own model and all of them show together in the viewer, laid out on the bed as they print:

```yaml
name: Sensor Box
parts:
  - id: base
    label: Base
    file: src/main.scad
    defines: { part: "base" }
  - id: lid
    file: src/main.scad
    defines: { part: "lid" }
```

- A single entry file with a `part` selector parameter is the usual pattern (see the example above). Parameters set through a part's `defines` are hidden from the parameter panel.
- Each part is modelled in its own print orientation. Translate parts next to each other in `main()` so they do not overlap on the bed, and keep the assembled position for the `assembly` option only ("Design the way you print"). Check the fit with `pnpm -s scad snapshot <id> --part <any> -D part=assembly --section ...`.
- `preview: false` on a part excludes it from renders and the viewer; it is only produced by `pnpm -s scad export` (used for 2D outlines and merged 3MFs, see scad-export).
- Parts that belong together in an exact position (second-color inlays and text, multi-material inserts) also need a merged 3MF, because slicers lose the alignment when the user imports separate files. Plan for it from the start: keep body and inlay as separate modules with their own `color()`, and follow "Merged multi-object 3MF" in scad-export.
- Separate files per part (`src/base.scad`, `src/lid.scad`) sharing `src/dims.scad` via `include` also works; pick one style per project.

## Quality and performance

- Control smoothness with `$fa`/`$fs` in the Quality group (e.g. `$fa = 4; $fs = 0.4;`) rather than a global `$fn`. Use explicit `$fn` only where the count matters (hexagons, low-poly look).
- The Manifold backend is fast; still, a render above ~10 s slows the live loop. Reduce `$fs` while iterating if needed and say so, and avoid `minkowski()` on high-poly input.
- Workspace-wide defaults for every part can go into `render.defines` in config (e.g. `$fs: 0.4`).

## Debugging

- `echo(name = value)` prints in the render output (and the viewer console). Use it to verify derived dimensions.
- `assert(condition, "message")` fails the render with a clear error; guard parameter combinations that cannot work.
- `%` shows an object only in previews (not in the rendered model), `#` highlights it in the OpenSCAD GUI only. Neither appears in the viewer, which shows the real rendered geometry; for reference geometry the user should see, create a separate part (e.g. `id: reference`) instead.
- Errors come back as `file:line: message`. Fix the first error first.
- "Current top level object is empty" means nothing was produced (wrong part selector, everything differenced away). "not a 3D object" means the result is 2D; see scad-export for 2D outputs.
