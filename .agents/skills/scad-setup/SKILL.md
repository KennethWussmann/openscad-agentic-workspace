---
name: scad-setup
description: Set up this OpenSCAD workspace repository on a new machine or fresh clone - Node.js 24+, pnpm via corepack, pnpm install, OpenSCAD installation and discovery, config.yaml - and diagnose a broken setup with `pnpm -s scad doctor`. Use when the user just cloned the repo, asks to set it up or install it, when `pnpm -s scad` fails because dependencies or pnpm are missing, when doctor reports FAIL, or when OpenSCAD cannot be found.
---

# Setting up the workspace

Goal: `pnpm -s scad doctor` prints `Ready.` Work through the steps in order and stop at the first one that needs the user. All commands run from the repository root.

## 1. Node.js 24+

Check with `node --version`. The CLI runs TypeScript directly through Node's built-in type stripping, so Node 24 or newer is required (`.node-version` pins the major).

If Node is missing or too old, do not install it yourself. Tell the user and suggest their usual version manager (`nvm install 24`, `fnm install 24`, `volta install node@24`) or https://nodejs.org.

## 2. pnpm

Check with `pnpm --version`. The exact version is pinned in `package.json` (`packageManager`). If pnpm is missing, run `corepack enable` (ships with Node), then retry. If corepack is not allowed to write its shims (permission error), tell the user to run `corepack enable` with sufficient rights or install pnpm from https://pnpm.io/installation.

## 3. Dependencies

```bash
pnpm install
```

Run it again whenever `pnpm -s scad` fails with a module-not-found error or doctor reports `dependencies missing`, for example after pulling changes.

## 4. Doctor

```bash
pnpm -s scad doctor
```

It checks Node, dependencies, git, creates `config.yaml` from `config.example.yaml` on first run, finds OpenSCAD and reports the dev server and libraries. Every FAIL line comes with a fix.

## 5. OpenSCAD

Doctor finds OpenSCAD without searching the disk. Order:

1. `OPENSCAD_PATH` environment variable (used exclusively when set)
2. `openscad.path` in `config.yaml`
3. `openscad` / `openscad-nightly` (Windows: `openscad.com`, `openscad.exe`) on `PATH`
4. A fixed list of standard install locations per OS: `/Applications` and `~/Applications/OpenSCAD.app` (also `-nightly`), Homebrew, `C:\Program Files\OpenSCAD` (also Nightly, x86, `%LOCALAPPDATA%\Programs`, scoop), `/usr/bin`, `/usr/local/bin`, snap, flatpak exports

The first hit found in 3 or 4 is written to `config.yaml` so later runs are instant. Only `-v` is executed to verify a candidate.

If OpenSCAD is not found:

- Do not search the user's file system and do not install it without asking. Ask the user whether it is installed somewhere else (then set `openscad.path` in `config.yaml`) or whether they want to install it.
- A recent development snapshot (2024 or newer) is required for the Manifold backend and colored 3MF. Old stable 2021.01 builds are rejected by doctor. Downloads: https://openscad.org/downloads.html#snapshots
- Typical installs: macOS `brew install --cask openscad@snapshot` or the DMG; Windows the snapshot installer or `winget install OpenSCAD.OpenSCAD`; Linux the AppImage, the flatpak `org.openscad.OpenSCAD` or the snap.
- A command with arguments is configured as a list, e.g. `path: [flatpak, run, org.openscad.OpenSCAD]`. An AppImage path works as a plain string.
- `FAIL config` or `FAIL projects` with a message such as `print.printer: "x" is not defined in printers`: the root or a project `config.yaml` does not match the schema. Fix the named key using `config.example.yaml` as the reference. Ask the user for printer data you do not know (process, build volume, nozzles or pixel size) instead of guessing.
- Headless Linux (CI, SSH): model renders work, but PNG sheets need an X server. Wrap commands in `xvfb-run` or set `render.sheet: false`.

## 6. Optional checks

- `git --version`: needed only for third-party libraries (see the scad-libs skill).
- `pnpm -s scad serve` then `pnpm -s scad open`: starts the viewer and opens the browser.

When doctor prints `Ready.`, continue with the `scad` skill.
