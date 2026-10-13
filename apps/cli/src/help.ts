export const HELP = `pnpm scad <command> [args] [--json]

Setup
  doctor                                  Find OpenSCAD, create config.yaml, show server and libraries
  serve                                   Start the viewer dev server in the background (or report it)
  open [project]                          Show a project in the browser (switches an open tab, else opens one)
  stop                                    Stop the background dev server

Projects
  list                                    All projects with render status, versions, pending proposals
  new <project> [--name N] [--description D] [--from <project>]
  status <project>                        Last render, diagnostics, version state, proposal
  render <project> [--part a,b] [--no-sheet]
                                          Render all parts to preview/*.3mf (through the dev server when running),
                                          then preview/sheet.png (2x2: iso | front / right | top)
  snapshot <project> [--view iso|front|back|left|right|top|bottom|iso-back] [--section x=10[:above]]
           [--focus x,y,z[:radius]] [--part a,b] [--size 900] [--out name.png]
                                          Extra PNG view or cross-section into preview/. --focus clips the model
                                          to a cube around the point (radius 5 mm) so the view zooms in on it
  params <project>                        Customizer parameters with values, ranges and options
  printer [project]                       Active printer profile (process, bed, nozzle, tolerances) and all printers
  check <project> [--part a,b] [--all]    Printability against the active printer: manifold, bed fit, thin walls,
                                          floating bodies, overhangs (fdm) or islands and trapped resin (resin).
                                          Renders first when sources changed, writes preview/check.json, exit 1 on FAIL.
                                          Repeated findings are grouped; --all lists every group instead of the first 5
  export <project> [--formats 3mf,stl,...] [--part a,b]
                                          Write configured formats to out/

Versions
  release <project> -m "message" [--formats 3mf,stl,...] [--accept-fail] [--force]
                                          check (renders first when needed), checkpoint, export in one step.
                                          Stops before the checkpoint on FAIL unless --accept-fail
  checkpoint <project> -m "message" [--force]
  versions <project>
  restore <project> <vN> [--with-libs]   Copy vN back into src/, render, record as a new version
  proposal <project> [--clear]           Parameter values and 3D annotations the user sent from the browser

Libraries
  lib list [--project p]
  lib new <name> [--description D]        Local library in workspace/_libs/<name>
  lib add <Name> --git <url> [--ref tag|commit] [--project p]
                                          Pinned git library (root config.yaml, or the project's with --project)
  lib remove <Name> [--project p]
  lib sync [--project p]                  Install missing libraries
  lib prune                               Delete library checkouts no config refers to
`
