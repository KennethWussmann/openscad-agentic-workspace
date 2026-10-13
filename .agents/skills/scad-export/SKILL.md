---
name: scad-export
description: Export workspace models to files - STL, 3MF, OBJ, OFF, WRL, PNG renders, and 2D SVG/DXF/PDF - with formats configured in config.yaml, merged multi-object 3MFs that keep multi-color or multi-material parts aligned in the slicer, plus a pre-delivery checklist for 3D printing. Use when the user wants files, an STL or 3MF for the slicer, a picture of the model, a DXF/SVG for laser cutting, or asks whether a model is ready to print, or has parts (text inlays, second-color details, soft inserts) that must stay aligned when imported into Bambu Studio, Orca or PrusaSlicer.
---

# Exporting

```bash
pnpm scad export <id>                          # formats from config
pnpm scad export <id> --formats 3mf,stl,png   # override
pnpm scad export <id> --part lid
```

Files go to `workspace/<id>/out/`, named by `export.filename` (default `{project}-{part}`; placeholders `{project}`, `{part}`, `{version}`). `out/export.json` lists every file with its status. `{version}` is the latest checkpoint id when the working copy matches it, otherwise `wip`; checkpoint first so delivered files map to a version.

## Exports from the viewer

The user can export 3MF from the browser viewer (download button in the top bar). It runs the same export with `formats: [3mf]` for all parts with `preview: true`, writes to `out/` and overwrites `out/export.json`. Read `export.json` to see what the user last exported:

- `overrides` holds the tweaked parameter values when the user exported with tweaks. Those files are named `*-tweaked.3mf`, `version` is `tweaked`, and the geometry does not exist in the source. If the user wants to keep them, apply the values to the source (like a parameter proposal) and checkpoint.
- `meshCheck` is the printability check run on the exported 3MF files themselves (same structure as `check.json`). It does not update `preview/check.json`, so still run `pnpm scad check` before your own checkpoint or export.

## Formats

Configured in `config.yaml` under `export.formats` (root default `[3mf, stl]`), overridable per project:

| Format | Use |
| --- | --- |
| `3mf` | Preferred for slicers (Bambu Studio, PrusaSlicer, Orca, Cura): keeps units and colors |
| `stl` | Binary STL, universally accepted, no units or colors |
| `asciistl` | Text STL, only when a tool demands it |
| `obj`, `off`, `wrl` | Other mesh tools, renderers |
| `png` | Isometric image of the part at `render.sheetSize` |
| `svg`, `dxf`, `pdf` | 2D outlines for laser/CNC cutting; the part must produce 2D geometry |
| `csg` | OpenSCAD's flattened CSG tree, for debugging or other CSG tools |

## Merged multi-object 3MF (multi-color and multi-material)

Every part exports to its own file, and a 3MF from OpenSCAD normally holds one merged mesh. When the user imports several part files into a slicer, Bambu Studio, Orca and PrusaSlicer re-centre each one and lose the alignment between them. Offer a merged 3MF whenever parts only make sense together in their exact relative position:

- inlays and engraved or embossed text in a second color,
- multi-color logos, labels or decorations,
- multi-material parts (a TPU grip or foot on a PLA body),
- modifier volumes the user wants to place in the slicer.

Do not merge parts that are printed or assembled independently (lid and box, separate brackets). Keep the separate part files as well; the user sometimes needs them.

A project sets this up on its own, with no tooling change:

1. Enable OpenSCAD's experimental `lazy-union` in the project's `config.yaml` only, never in the root config:
   ```yaml
   openscad:
     enable: [lazy-union]
   ```
   With it, every object at the top level of the file becomes its own object in the 3MF, keeping its `color()`, in shared coordinates.
2. Add a part selector value that emits each object at file level, not inside `main()` or any module, and not under a shared `translate`, `rotate` or `color`. Any common parent node merges them into one object again. Repeat the transform on each object:
   ```openscad
   main();

   if (part == "label_combined") {
     translate([layout_x, 0, 0]) color("dimgray") label_body();
     translate([layout_x, 0, 0]) color("white") label_inlay();
   }
   ```
   An `if` block is fine; it does not create a parent node.
3. Declare the combined part with `preview: false` next to the separate parts:
   ```yaml
   - id: white
     label: WHITE label clip, body and text inlay
     file: src/main.scad
     defines: { part: "label_combined", label_text: "WHITE" }
     preview: false
   ```
   `preview: false` is required. `check` and the viewer merge all objects of a 3MF into one mesh, so the touching faces between body and inlay show up as hundreds of non-manifold edges and the render reports no size. The separate parts carry the same geometry; they stay in the preview and are what `check` tests.
4. `lazy-union` changes semantics for the whole project: any other part that relied on several top-level objects being fused needs an explicit `union()`. Check that the separate parts still render and check the same as before.
5. Verify the export: `unzip -p out/<file>.3mf 3D/3dmodel.model | grep -c '<object'` must be at least 2.
6. Record the setup under Decisions in `brief.md`: lazy-union is on, the combined branch must stay at file level, and why the combined parts are `preview: false`.

The viewer's 3MF download exports only previewed parts, so it gives the separate files. Tell the user to get merged files with `pnpm scad export <id> --part <combined-ids> --formats 3mf`, and that in Bambu Studio they answer yes to "Load as a single object with multiple parts?" and then assign a filament per part.

Reference: `workspace/laundry-bag-clip` (parts `white` and `black`).

## 2D parts

The viewer and the preview render need 3D geometry. For laser-cut or plotted outlines, keep the 2D profile in a module and declare two parts: a 3D part that extrudes it for the viewer, and an outline part that is excluded from previews and only exported:

```yaml
parts:
  - id: panel
    defines: { mode: "3d" }
  - id: panel-outline
    defines: { mode: "2d" }
    preview: false
```

```openscad
mode = "3d"; // [3d, 2d]
if (mode == "2d") panel_profile(); else linear_extrude(sheet_t) panel_profile();
```

Export it with `pnpm scad export <id> --part panel-outline --formats svg,dxf`. Exporting a 2D part as a mesh format (or a 3D part as svg/dxf) fails for that file only.

## Before delivering for printing

Run `pnpm scad check <id>` first. It covers most of this list against the active printer profile (`pnpm scad printer <id>`). If the user prints on a different printer or nozzle, select it in the project's `config.yaml` under `print` first. `export` notes when the check is missing, outdated or failed.

Run through this and fix or flag anything that fails:

- Render is clean: no errors, no warnings you have not explained.
- `check` manifold is PASS: watertight, no flipped faces, no zero-thickness fins.
- Each part sits on z = 0 in its print orientation, nothing floating, one body per part unless intended (`check` bed and bodies).
- Bounding boxes fit the user's printer bed (`check` bed; ask for the bed size if unknown).
- Wall thickness follows the scad-craft defaults (`check` walls); check a section snapshot through the thinnest reported region.
- Clearances, fits and screw holes use the `/* [Print] */` tolerance parameters, and their defaults match the tolerances of `pnpm scad printer <id>`. `check` does not measure clearances between parts, so verify this yourself.
- FDM: overhangs and bridges are printable or the user knows supports are needed (`check` overhangs lists every region).
- Resin: the user knows where islands need supports, and hollow parts have drain and vent holes of at least `drainHole` mm (`check` islands and bodies).
- Checkpointed, so files map to a version.

Then tell the user the file paths in `out/`, the version, the key dimensions and any print hints (orientation, supports, infill or material assumptions).
