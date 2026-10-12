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
// Extra gap for sliding fits
clearance = 0.3; // [0:0.05:1]
part = "assembly"; // [assembly, clip, cover]

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
  if (part == "assembly" || part == "clip") clip();
  if (part == "assembly" || part == "cover") translate([0, 0, board_t + 5]) cover();
}

module clip() { ... }
module cover() { ... }
```

Rules behind it:

- Customizer parameters are top-level assignments with literal values placed before the first `module` or `function` definition. They show up in the viewer's parameter panel and in `pnpm scad params`. Anything after the first module definition, any computed expression and everything under `/* [Hidden] */` is not a parameter.
- Group parameters with `/* [Group] */`. Put a one-line `// caption` directly above each parameter; it becomes the label in the viewer. Add ranges `// [min:step:max]` or option lists `// [a, b, c]` so the user can tweak safely.
- Derived values live in `/* [Hidden] */`, computed from parameters. Never repeat a magic number; if a number appears twice, it is a parameter or a derived value.
- Name with units in mind and be explicit: `wall`, `hole_d`, `screw_head_d`, `lid_h`, `fillet_r`. `_d` diameter, `_r` radius, `_h` height, `_t` thickness, `_w` width, `_l` length.
- Modules take what they need as arguments with sensible defaults. Only the top-level `main()` reads globals; reusable modules never do.
- One module per feature or sub-part, small enough to read in one screen. Name them after what they are (`screw_boss`, `snap_hook`), not after how they are built.
- Never assign a variable twice in the same scope; OpenSCAD keeps the last value for the whole scope and warns.
- Prefer `use <file.scad>` for module libraries (imports modules and functions only). `include <file.scad>` also runs the file's top-level code and copies its variables; use it only for shared dimension files or libraries that require it (BOSL2).

## Geometry habits

- Units are millimetres, Z is up, the part rests on z = 0 in its print orientation unless the brief says otherwise.
- Overshoot cuts by `eps` so differences never leave zero-thickness skins: `translate([0, 0, -eps]) cylinder(d = hole_d, h = t + 2 * eps);`
- Avoid coincident faces in unions as well; overlap by `eps`.
- Center where it makes the math simpler, and say so in a comment at the module.
- `hull()` of primitives is the cheapest way to rounded boxes and slots. `minkowski()` is slow on complex shapes; use it on simple 2D/3D bases or use offset()-based 2D profiles plus `linear_extrude`/`rotate_extrude`.
- Build profiles in 2D (`square`, `circle`, `polygon`, `offset(r=)`) and extrude them; it is faster and easier to fillet.
- `color("name")` per sub-part or feature group makes the viewer and the contact sheet much easier to read and survives into 3MF. Use a calm, consistent palette.

## Printability defaults

Unless the brief says otherwise, assume FDM with a 0.4 mm nozzle. `printer` and `check` in `config.yaml` hold the bed size, nozzle and thresholds that `pnpm scad check` and the viewer overlays use. Set them per project when the user names a printer.


- Walls >= 1.2 mm (3 perimeters), structural >= 2 mm. Floors/roofs >= 0.8 mm.
- Clearance between mating printed parts: 0.2 mm tight press, 0.3 mm sliding, 0.4-0.5 mm loose. Holes print undersized: add 0.2-0.3 mm to hole diameters for screws and pins.
- Overhangs up to 45 degrees print without support; use chamfers instead of fillets on downward-facing edges, teardrop or flat-topped horizontal holes.
- Text: >= 1 mm stroke, >= 0.6 mm relief.
- Metric screw reference (clearance hole / head diameter / head height): M2 2.4/3.8/2, M2.5 2.9/4.5/2.5, M3 3.4/5.5/3, M4 4.5/7/4, M5 5.5/8.5/5. Heat-set inserts M3: about 4.0-4.2 mm hole, 5-6 mm deep. Hex nut M3: 5.5 mm across flats, 2.4 mm thick (model the hole at flats + 0.3 mm, `$fn = 6`, rotated so flats are parallel to the build plate edges where it matters).
- State the assumptions you made in `brief.md`.

## Fixing check findings

What `pnpm scad check` reports and the usual fix. Confirm the location with a section snapshot through the reported centre before changing code.

| Finding | Usual cause | Fix |
| --- | --- | --- |
| manifold: open or non-manifold edges | `polyhedron()` with wrong or missing faces; two solids touching along an edge or a point | Fix the face list and winding; make touching solids overlap by `eps` or separate them |
| manifold: flipped faces / inside out | `polyhedron()` faces wound the wrong way | Reverse the face order (OpenSCAD wants faces clockwise seen from outside) |
| manifold: folded edges (fins, flaps) | A face ends exactly on another face, coincident faces in `difference()`, a sweep ending on the face it joins | Extend the cutter or the sweep past the face by `eps` or about 1 deg; avoid coplanar faces in booleans |
| bed: does not fit | Part larger than `printer.bed` | Rotate the print orientation, split into parts with joints, or ask the user to scale |
| bed: lowest point not at z = 0 | Model offset or a feature below the base | Translate the part onto the bed in its print orientation |
| overhangs | Fillets on downward edges, horizontal holes, ceilings, undercuts | 45 deg chamfers, teardrop or flat-topped holes, reorient the part, split it, or tell the user supports are needed |
| walls: thin (WARN or FAIL) | Wall parameter too small, derived values going negative, a feature tapering to a point | Raise the parameter, add `assert(wall >= ...)` for derived thickness, end tapers in a flat of at least the nozzle width or a round |
| bodies: floating | Feature not unioned with the body, or sitting above it by rounding | Overlap it with the body by `eps`, or move it onto the bed or into its own part |
| bodies: small | Leftover slivers from `difference()` | Extend the cutter by `eps` so it cuts through completely |
| bodies: enclosed void | Hollow inside a solid | Intended for some prints; otherwise remove it or tell the user it will be filled with infill or trap support |

## Multi-part projects

Declare parts in the project `config.yaml`; each part is rendered to its own model and shown together as an assembly in the viewer:

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
- Place parts in their assembled position in the assembly preview so the user can check the fit (sections are great for this), but keep each part's own geometry printable. If print orientation differs from assembly orientation, add a `print_layout` boolean parameter or a separate `-print` part.
- `preview: false` on a part excludes it from renders and the viewer; it is only produced by `pnpm scad export` (used for 2D outlines, see scad-export).
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
