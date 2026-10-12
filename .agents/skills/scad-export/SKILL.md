---
name: scad-export
description: Export workspace models to files - STL, 3MF, OBJ, OFF, WRL, PNG renders, and 2D SVG/DXF/PDF - with formats configured in config.yaml, plus a pre-delivery checklist for 3D printing. Use when the user wants files, an STL or 3MF for the slicer, a picture of the model, a DXF/SVG for laser cutting, or asks whether a model is ready to print.
---

# Exporting

```bash
pnpm scad export <id>                          # formats from config
pnpm scad export <id> --formats 3mf,stl,png   # override
pnpm scad export <id> --part lid
```

Files go to `workspace/<id>/out/`, named by `export.filename` (default `{project}-{part}`; placeholders `{project}`, `{part}`, `{version}`). `out/export.json` lists every file with its status. `{version}` is the latest checkpoint id when the working copy matches it, otherwise `wip`; checkpoint first so delivered files map to a version.

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

Run `pnpm scad check <id>` first. It covers most of this list against `printer` and `check` in `config.yaml`. Set `printer.bed` and `printer.nozzle` to the user's printer if they differ from the defaults (256 x 256 x 256 mm, 0.4 mm). `export` notes when the check is missing, outdated or failed.

Run through this and fix or flag anything that fails:

- Render is clean: no errors, no warnings you have not explained.
- `check` manifold is PASS: watertight, no flipped faces, no zero-thickness fins.
- Each part sits on z = 0 in its print orientation, nothing floating, one body per part unless intended (`check` bed and bodies).
- Bounding boxes fit the user's printer bed (`check` bed; ask for the bed size if unknown).
- Wall thickness and clearances follow the scad-craft defaults (`check` walls); check a section snapshot through the thinnest reported region. Clearances between parts are not measured by `check`.
- Overhangs and bridges are printable or the user knows supports are needed (`check` overhangs lists every region).
- Checkpointed, so files map to a version.

Then tell the user the file paths in `out/`, the version, the key dimensions and any print hints (orientation, supports, infill or material assumptions).
