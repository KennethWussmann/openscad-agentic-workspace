import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button.tsx'
import { CheckTag } from './CheckTag.tsx'
import { Chip } from './Chip.tsx'
import { Composer } from './Composer.tsx'
import { cx } from './classes.ts'
import { IconButton } from './IconButton.tsx'
import { Panel } from './Panel.tsx'
import { ToolButton } from './ToolButton.tsx'

it('joins only truthy class names', () => {
  expect(cx('a', false, null, undefined, 'b')).toBe('a b')
})

describe('buttons', () => {
  it('clicks and respects disabled', () => {
    const onClick = vi.fn()
    render(
      <>
        <Button variant="primary" onClick={onClick}>
          Send
        </Button>
        <Button variant="ghost" onClick={onClick} disabled>
          Off
        </Button>
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    fireEvent.click(screen.getByRole('button', { name: 'Off' }))
    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Send' })).toHaveClass('btn', 'primary')
  })

  it('names icon buttons by their title and marks them busy', () => {
    render(
      <IconButton title="Export" busy onClick={vi.fn()}>
        <svg />
      </IconButton>,
    )
    expect(screen.getByRole('button', { name: 'Export' })).toHaveClass('icon-btn', 'is-busy')
  })

  it('exposes the pressed state and shortcut of tool buttons', () => {
    render(
      <ToolButton label="X-ray" shortcut="X" active onClick={vi.fn()}>
        <svg />
      </ToolButton>,
    )
    const button = screen.getByRole('button', { name: 'X-ray' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveAttribute('title', 'X-ray (X)')
  })

  it('marks active chips', () => {
    render(
      <Chip active onClick={vi.fn()}>
        X
      </Chip>,
    )
    expect(screen.getByRole('button', { name: 'X' })).toHaveClass('is-active')
  })
})

it('renders panels with title, count and extras', () => {
  render(
    <Panel title="Parts" count={3} extra={<span>extra</span>}>
      body
    </Panel>,
  )
  expect(screen.getByRole('heading', { name: 'Parts' })).toBeInTheDocument()
  expect(screen.getByText('3')).toHaveClass('count')
  expect(screen.getByText('extra')).toBeInTheDocument()
})

it('passes composer text changes up', () => {
  const onChange = vi.fn()
  render(<Composer placeholder="Note" value="" onChange={onChange} actions={<button type="button">Go</button>} />)
  fireEvent.change(screen.getByPlaceholderText('Note'), { target: { value: 'hello' } })
  expect(onChange).toHaveBeenCalledWith('hello')
})

it('labels check statuses', () => {
  render(<CheckTag status="fail" />)
  expect(screen.getByText('FAIL')).toHaveClass('check-tag', 'is-fail')
})
