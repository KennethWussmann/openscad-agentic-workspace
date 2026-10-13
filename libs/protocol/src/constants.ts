export const APP_ID = 'openscad-agentic-workspace'
export const API = '/api'
export const PROJECT_PARAM = 'project'

export const EVENTS = {
  renderStart: 'scad:render-start',
  render: 'scad:render',
  changed: 'scad:changed',
  navigate: 'scad:navigate',
  presence: 'scad:presence',
  leave: 'scad:leave',
  exportStart: 'scad:export-start',
  export: 'scad:export',
} as const

export const EXPORT_FORMATS = [
  '3mf',
  'stl',
  'asciistl',
  'obj',
  'off',
  'wrl',
  'png',
  'svg',
  'dxf',
  'pdf',
  'csg',
] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

export const PRINT_PROCESSES = ['fdm', 'resin'] as const
export type PrintProcess = (typeof PRINT_PROCESSES)[number]

export const isProjectId = (id: string) => /^[a-z0-9][a-z0-9-]*$/.test(id)
