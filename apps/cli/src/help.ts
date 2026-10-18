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
  render <project> [--part a,b] [--no-sheet] [--set <set>]
                                          Render all parts to preview/*.3mf (through the dev server when running),
                                          then preview/sheet.png (2x2: iso | front / right | top).
                                          --set renders a parameter set into preview/sets/<set>/ and
                                          preview/sheet-<set>.png instead
  snapshot <project> [--view iso|front|back|left|right|top|bottom|iso-back] [--section x=10[:above]]
           [--focus x,y,z[:radius]] [--part a,b] [--set <set>] [-D name=value ...] [--size 900] [--out name.png]
                                          Extra PNG view or cross-section into preview/. --focus clips the model
                                          to a cube around the point (radius 5 mm) so the view zooms in on it.
                                          -D renders the parts with these parameter values into a throwaway model
                                          for this image only (e.g. -D part=assembly); preview/, check and export
                                          are untouched. --set uses a parameter set's values (below part defines)
  params <project>                        Customizer parameters with values, units, ranges and options
  printer [project]                       Active printer profile (process, bed, nozzle, tolerances) and all printers
  check <project> [--part a,b] [--all] [--set <set>]
                                          Printability against the active printer: manifold, bed fit, thin walls,
                                          floating bodies, overhangs (fdm) or islands and trapped resin (resin).
                                          Renders first when sources changed, writes preview/check.json, exit 1 on FAIL.
                                          Repeated findings are grouped; --all lists every group instead of the first 5.
                                          --set checks that set's render and writes preview/check-<set>.json
  export <project> [--formats 3mf,stl,...] [--part a,b] [--set <set> | --sets a,b|all]
                                          Write configured formats to out/. --sets all = default model + every set;
                                          set files use {set} in export.filename, else get a -<set> suffix

Parameter sets (named variants in the project config.yaml under sets:)
  sets <project>                          Every set with label, export flag and how it differs from the defaults
  set save <project> <set> [-D name=value ...] [--label L] [--export|--no-export] [--replace]
                                          Create or update a set; values are validated against the parameters.
                                          Without -D it saves the viewer's current tweak. Existing sets merge the
                                          values unless --replace
  set rm <project> <set>
  set unset <project> <set|all> <param> [param ...]
                                          Remove parameters from one or every set
  set rename-param <project> <old> <new>  Rename a parameter in every set (after renaming it in the .scad)
  set sync <project>                      Write OpenSCAD's native src/<file>.json (Customizer dropdown, -p/-P);
                                          kept in sync by every set change once it exists

Versions
  release <project> -m "message" [--formats 3mf,stl,...] [--accept-fail] [--force]
                                          check (renders first when needed), checkpoint, export in one step,
                                          for the default model and every set with export: true.
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
