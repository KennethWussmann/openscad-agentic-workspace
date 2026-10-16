import type { ProjectSummary } from '@scad/protocol'

export type ProjectSort = 'recent' | 'name'

export const filterProjects = (projects: ProjectSummary[], query: string, sort: ProjectSort) => {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  return projects
    .filter((p) => {
      const haystack = `${p.name} ${p.id} ${p.description}`.toLowerCase()
      return terms.every((t) => haystack.includes(t))
    })
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.updated - a.updated))
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

export const ago = (time: number, now = Date.now()) => {
  const diff = time - now
  if (Math.abs(diff) < 60_000) return 'just now'
  const [unit, size] = UNITS.find(([, ms]) => Math.abs(diff) >= ms) ?? UNITS[2]
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round(diff / size), unit)
}

export const totals = (projects: ProjectSummary[]) => ({
  projects: projects.length,
  parts: projects.reduce((n, p) => n + p.parts, 0),
  versions: projects.reduce((n, p) => n + p.versions, 0),
})
