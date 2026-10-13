import { fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { expect, it, vi } from 'vitest'
import { useDismiss } from './useDismiss.ts'

const Menu = ({ open, close }: { open: boolean; close: () => void }) => {
  const root = useRef<HTMLDivElement>(null)
  useDismiss(open, root, close)
  return (
    <>
      <div ref={root}>inside</div>
      <div>outside</div>
    </>
  )
}

it('closes on outside clicks and Escape while open', () => {
  const close = vi.fn()
  const { getByText } = render(<Menu open close={close} />)
  fireEvent.mouseDown(getByText('inside'))
  expect(close).not.toHaveBeenCalled()
  fireEvent.mouseDown(getByText('outside'))
  fireEvent.keyDown(document, { key: 'Escape' })
  fireEvent.keyDown(document, { key: 'a' })
  expect(close).toHaveBeenCalledTimes(2)
})

it('ignores events while closed', () => {
  const close = vi.fn()
  const { getByText } = render(<Menu open={false} close={close} />)
  fireEvent.mouseDown(getByText('outside'))
  expect(close).not.toHaveBeenCalled()
})
