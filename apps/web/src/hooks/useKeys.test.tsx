import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useStore } from '../store/store.ts'
import { project, version } from '../test/fixtures.ts'
import { useKeys } from './useKeys.ts'

const Keys = () => {
  useKeys()
  return <input aria-label="field" />
}

const press = (key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(document.body, { key, ...init })
const s = () => useStore.getState()

describe('useKeys', () => {
  it('toggles display flags', () => {
    render(<Keys />)
    press('x')
    press('E')
    press('g')
    expect(s().display).toMatchObject({ xray: true, edges: false, grid: false })
  })

  it('switches tools and leaves them with Escape', () => {
    render(<Keys />)
    press('m')
    expect(s().tool).toBe('measure')
    press('n')
    expect(s().tool).toBe('annotate')
    press('Escape')
    expect(s().tool).toBe('orbit')
  })

  it('does not enter note mode in embed mode', () => {
    useStore.setState({ embed: true })
    render(<Keys />)
    press('n')
    expect(s().tool).toBe('orbit')
  })

  it('closes help before anything else on Escape', () => {
    render(<Keys />)
    press('m')
    press('?')
    expect(s().help).toBe(true)
    press('Escape')
    expect(s()).toMatchObject({ help: false, tool: 'measure' })
  })

  it('cancels a pending measurement before leaving the tool', () => {
    render(<Keys />)
    press('m')
    s().addPoint([0, 0, 0])
    press('Escape')
    expect(s()).toMatchObject({ pending: null, tool: 'measure' })
  })

  it('steps through versions with brackets, ending at the working copy', () => {
    s().setProject(project({ versions: [version(), version({ id: 'v2', index: 2 })] }))
    render(<Keys />)
    press('[')
    expect(s().versionId).toBe('v2')
    press('[')
    press('[')
    expect(s().versionId).toBe('v1')
    press(']')
    press(']')
    press(']')
    expect(s().versionId).toBeNull()
  })

  it('toggles section, console, sidebar and embed', () => {
    render(<Keys />)
    press('s')
    press('c')
    press('b')
    press('v')
    expect(s()).toMatchObject({ console: true, sidebar: false, embed: true })
    expect(s().section.enabled).toBe(true)
  })

  it('ignores keys typed into fields and with modifiers', () => {
    const { getByLabelText } = render(<Keys />)
    fireEvent.keyDown(getByLabelText('field'), { key: 'x' })
    press('x', { metaKey: true })
    press('x', { ctrlKey: true })
    expect(s().display.xray).toBe(false)
  })
})
