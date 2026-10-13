import type { DefineValue, ProjectState, ProjectSummary, Vec3 } from '@scad/protocol'
import { create } from 'zustand'
import { sameJson } from '../lib/format.ts'
import { DISPLAY_KEY, loadDisplay, SIDEBAR_KEY, setParam, urlParams } from './persist.ts'
import type { AnalysisSummary, Display, ExportNotice, Measurement, NoteDraft, SectionState, Tool } from './types.ts'

export * from './types.ts'

export type Store = {
  projects: ProjectSummary[]
  projectId: string | null
  project: ProjectState | null
  error: string | null
  rendering: { preview: boolean; tweak: boolean }
  exporting: boolean
  exportNotice: ExportNotice | null
  versionId: string | null
  ghostId: string | null
  hidden: string[]
  solo: string | null
  display: Display
  section: SectionState
  tool: Tool
  measures: Measurement[]
  pending: Vec3 | null
  notes: NoteDraft[]
  editing: number | null
  edits: Record<string, DefineValue>
  fitToken: number
  bounds: [Vec3, Vec3] | null
  help: boolean
  console: boolean
  sidebar: boolean
  embed: boolean
  analysis: AnalysisSummary | null
  setProjects: (p: ProjectSummary[]) => void
  setProject: (p: ProjectState | null, error?: string | null) => void
  selectProject: (id: string | null) => void
  setRendering: (kind: 'preview' | 'tweak', value: boolean) => void
  setExporting: (value: boolean) => void
  showExportNotice: (notice: Omit<ExportNotice, 'id'>) => void
  dismissExportNotice: () => void
  setVersion: (id: string | null) => void
  setGhost: (id: string | null) => void
  togglePart: (id: string) => void
  setSolo: (id: string | null) => void
  toggleDisplay: (key: keyof Display) => void
  setSection: (patch: Partial<SectionState>) => void
  setTool: (tool: Tool) => void
  addPoint: (p: Vec3) => void
  clearMeasures: () => void
  cancelPending: () => void
  addNote: (note: Omit<NoteDraft, 'id' | 'text'>) => void
  updateNote: (id: number, text: string) => void
  removeNote: (id: number) => void
  editNote: (id: number) => void
  closeEditor: () => void
  clearNotes: () => void
  setEdit: (name: string, value: DefineValue | undefined) => void
  resetEdits: () => void
  requestFit: () => void
  setBounds: (b: [Vec3, Vec3] | null) => void
  toggleHelp: () => void
  toggleConsole: () => void
  toggleSidebar: () => void
  toggleEmbed: () => void
  setAnalysis: (a: AnalysisSummary | null) => void
}

let measureId = 0
let noteId = 0
let noticeId = 0

export const useStore = create<Store>((set, get) => ({
  projects: [],
  projectId: urlParams.get('project'),
  project: null,
  error: null,
  rendering: { preview: false, tweak: false },
  exporting: false,
  exportNotice: null,
  versionId: null,
  ghostId: null,
  hidden: [],
  solo: null,
  display: loadDisplay(),
  section: { enabled: false, axis: 'x', offset: 0, flip: false, caps: true, gizmo: 'translate' },
  tool: 'orbit',
  measures: [],
  pending: null,
  notes: [],
  editing: null,
  edits: {},
  fitToken: 0,
  bounds: null,
  help: false,
  console: false,
  sidebar: localStorage.getItem(SIDEBAR_KEY) !== 'closed',
  embed: urlParams.has('embed') && urlParams.get('embed') !== '0',
  analysis: null,
  setProjects: (projects) => set({ projects }),
  setProject: (project, error = null) => {
    const prev = get().project
    const sameProject = prev?.id === project?.id
    set({
      project,
      error,
      rendering: { preview: Boolean(project?.rendering), tweak: false },
      exporting: Boolean(project?.exporting),
      ...(sameProject
        ? {}
        : {
            exportNotice: null,
            versionId: null,
            ghostId: null,
            hidden: [],
            solo: null,
            measures: [],
            pending: null,
            notes: [],
            editing: null,
            edits: {},
          }),
    })
    if (!sameProject) get().requestFit()
    if (sameProject && project) {
      const versions = new Set(project.versions.map((v) => v.id))
      const { versionId, ghostId } = get()
      if (versionId && !versions.has(versionId)) set({ versionId: null })
      if (ghostId && !versions.has(ghostId)) set({ ghostId: null })
    }
  },
  selectProject: (projectId) => {
    setParam('project', projectId)
    set({ projectId })
  },
  setRendering: (kind, value) => set((s) => ({ rendering: { ...s.rendering, [kind]: value } })),
  setExporting: (exporting) => set({ exporting }),
  showExportNotice: (notice) => set({ exportNotice: { ...notice, id: ++noticeId } }),
  dismissExportNotice: () => set({ exportNotice: null }),
  setVersion: (versionId) => set((s) => ({ versionId, ghostId: s.ghostId === versionId ? null : s.ghostId })),
  setGhost: (ghostId) => set({ ghostId }),
  togglePart: (id) =>
    set((s) => ({ hidden: s.hidden.includes(id) ? s.hidden.filter((h) => h !== id) : [...s.hidden, id] })),
  setSolo: (solo) => set({ solo }),
  toggleDisplay: (key) =>
    set((s) => {
      const display = { ...s.display, [key]: !s.display[key] }
      if (key === 'overhangs' && display.overhangs) display.walls = false
      if (key === 'walls' && display.walls) display.overhangs = false
      localStorage.setItem(DISPLAY_KEY, JSON.stringify(display))
      return { display }
    }),
  setSection: (patch) => set((s) => ({ section: { ...s.section, ...patch } })),
  setTool: (tool) => set({ tool, pending: null }),
  addPoint: (p) =>
    set((s) =>
      s.pending
        ? { pending: null, measures: [...s.measures, { id: ++measureId, a: s.pending, b: p }] }
        : { pending: p },
    ),
  clearMeasures: () => set({ measures: [], pending: null }),
  cancelPending: () => set({ pending: null }),
  addNote: (note) =>
    set((s) => {
      const id = ++noteId
      const notes = s.notes.filter((n) => n.id !== s.editing || n.text.trim())
      return { notes: [...notes, { ...note, id, text: '' }], editing: id }
    }),
  updateNote: (id, text) => set((s) => ({ notes: s.notes.map((n) => (n.id === id ? { ...n, text } : n)) })),
  removeNote: (id) =>
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id), editing: s.editing === id ? null : s.editing })),
  editNote: (editing) =>
    set((s) => ({ notes: s.notes.filter((n) => n.id === editing || n.id !== s.editing || n.text.trim()), editing })),
  closeEditor: () => set((s) => ({ notes: s.notes.filter((n) => n.id !== s.editing || n.text.trim()), editing: null })),
  clearNotes: () => set({ notes: [], editing: null }),
  setEdit: (name, value) =>
    set((s) => {
      const edits = { ...s.edits }
      if (value === undefined) delete edits[name]
      else edits[name] = value
      return { edits }
    }),
  resetEdits: () => set({ edits: {} }),
  requestFit: () => set((s) => ({ fitToken: s.fitToken + 1 })),
  setBounds: (bounds) => {
    const prev = get().bounds
    if (!sameJson(prev, bounds)) set({ bounds })
  },
  toggleHelp: () => set((s) => ({ help: !s.help })),
  toggleConsole: () => set((s) => ({ console: !s.console })),
  toggleSidebar: () =>
    set((s) => {
      localStorage.setItem(SIDEBAR_KEY, s.sidebar ? 'closed' : 'open')
      return { sidebar: !s.sidebar }
    }),
  toggleEmbed: () =>
    set((s) => {
      setParam('embed', s.embed ? null : '1')
      return { embed: !s.embed }
    }),
  setAnalysis: (analysis) => {
    if (!sameJson(get().analysis, analysis)) set({ analysis })
  },
}))
