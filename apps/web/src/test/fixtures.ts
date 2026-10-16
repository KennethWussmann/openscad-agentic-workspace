import type {
  FdmProfile,
  ParamDef,
  PartDef,
  PartResult,
  ProjectState,
  ProjectSummary,
  RenderResult,
  ResinProfile,
  VersionMeta,
} from '@scad/protocol'

export const fdmProfile = (overrides: Partial<FdmProfile> = {}): FdmProfile => ({
  process: 'fdm',
  printer: 'default',
  bed: [256, 256, 256],
  layerHeight: 0.2,
  minWall: 0.8,
  minRegionArea: 1,
  tolerances: { press: 0.2, sliding: 0.3, loose: 0.45, hole: 0.2 },
  nozzle: 0.4,
  nozzles: [0.4],
  overhangAngle: 45,
  ...overrides,
})

export const resinProfile = (overrides: Partial<ResinProfile> = {}): ResinProfile => ({
  process: 'resin',
  printer: 'mars',
  bed: [130, 80, 160],
  layerHeight: 0.05,
  minWall: 0.6,
  minRegionArea: 0.5,
  tolerances: { press: 0.1, sliding: 0.15, loose: 0.25, hole: 0.1 },
  pixel: 0.05,
  minFeature: 0.3,
  drainHole: 2,
  ...overrides,
})

export const partDef = (overrides: Partial<PartDef> = {}): PartDef => ({
  id: 'main',
  file: 'src/main.scad',
  defines: {},
  preview: true,
  ...overrides,
})

export const partResult = (overrides: Partial<PartResult> = {}): PartResult => ({
  id: 'main',
  file: 'src/main.scad',
  status: 'ok',
  model: 'preview/main.3mf',
  stale: false,
  bbox: { min: [0, 0, 0], max: [20, 10, 5], size: [20, 10, 5] },
  facets: 12,
  vertices: 8,
  durationMs: 40,
  diagnostics: [],
  ...overrides,
})

export const param = (overrides: Partial<ParamDef> = {}): ParamDef => ({
  name: 'width',
  type: 'number',
  initial: 20,
  ...overrides,
})

export const renderResult = (overrides: Partial<RenderResult> = {}): RenderResult => ({
  project: 'box',
  status: 'ok',
  startedAt: '2026-01-01T10:00:00.000Z',
  finishedAt: '2026-01-01T10:00:01.000Z',
  durationMs: 120,
  overrides: {},
  parts: [partResult()],
  params: [],
  inputs: [{ path: 'box/src/main.scad', sha: 'abc' }],
  ...overrides,
})

export const version = (overrides: Partial<VersionMeta> = {}): VersionMeta => ({
  id: 'v1',
  index: 1,
  message: 'First shape',
  createdAt: '2026-01-01T09:00:00.000Z',
  parts: [
    { id: 'main', model: 'versions/v1/main.3mf', bbox: { min: [0, 0, 0], max: [10, 10, 10], size: [10, 10, 10] } },
  ],
  params: {},
  inputs: [{ path: 'box/src/main.scad', sha: 'old' }],
  libraries: [],
  sheet: null,
  ...overrides,
})

export const project = (overrides: Partial<ProjectState> = {}): ProjectState => ({
  id: 'box',
  name: 'Box',
  description: 'A plain box',
  parts: [partDef()],
  sets: {},
  setIssues: [],
  profile: fdmProfile(),
  render: renderResult(),
  tweak: null,
  rendering: false,
  exporting: false,
  versions: [],
  proposals: { params: null, annotations: null },
  ...overrides,
})

export const summary = (overrides: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: 'box',
  name: 'Box',
  description: 'A plain box',
  updated: 0,
  status: 'ok',
  versions: 0,
  proposal: false,
  cover: null,
  parts: 1,
  size: [20, 10, 5],
  facets: 12,
  check: null,
  ...overrides,
})
