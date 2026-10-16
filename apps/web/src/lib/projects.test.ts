import { describe, expect, it } from 'vitest'
import { summary } from '../test/fixtures.ts'
import { ago, filterProjects, totals } from './projects.ts'

const projects = [
  summary({ id: 'bin', name: 'Tool Bin', description: 'Holds screws', updated: 100, parts: 2, versions: 3 }),
  summary({ id: 'clip', name: 'Bag Clip', description: 'Keeps bags shut', updated: 300, parts: 1, versions: 1 }),
  summary({ id: 'arm', name: 'Arm', description: 'Monitor arm', updated: 200, parts: 4, versions: 0 }),
]

describe('filterProjects', () => {
  it('sorts by recency or name', () => {
    expect(filterProjects(projects, '', 'recent').map((p) => p.id)).toEqual(['clip', 'arm', 'bin'])
    expect(filterProjects(projects, '', 'name').map((p) => p.id)).toEqual(['arm', 'clip', 'bin'])
  })

  it('matches every term against name, id and description', () => {
    expect(filterProjects(projects, 'screws bin', 'recent').map((p) => p.id)).toEqual(['bin'])
    expect(filterProjects(projects, 'ARM', 'recent').map((p) => p.id)).toEqual(['arm'])
    expect(filterProjects(projects, 'nothing', 'recent')).toEqual([])
  })
})

it('sums projects, parts and versions', () => {
  expect(totals(projects)).toEqual({ projects: 3, parts: 7, versions: 4 })
})

it('words relative times', () => {
  const now = 10 * 86_400_000
  expect(ago(now - 5_000, now)).toBe('just now')
  expect(ago(now - 5 * 60_000, now)).toBe('5 minutes ago')
  expect(ago(now - 3 * 3_600_000, now)).toBe('3 hours ago')
  expect(ago(now - 2 * 86_400_000, now)).toBe('2 days ago')
})
