import { fireEvent, render, screen } from '@testing-library/react'
import { type ComponentProps, useState } from 'react'
import { expect, it, vi } from 'vitest'
import { QuantityInput } from './QuantityInput.tsx'

type Props = ComponentProps<typeof QuantityInput>

const Harness = ({ value: initial, onCommit, ...rest }: Props) => {
  const [value, setValue] = useState(initial)
  return (
    <QuantityInput
      {...rest}
      value={value}
      onCommit={(v) => {
        setValue(v)
        onCommit(v)
      }}
    />
  )
}

const setup = (props: Partial<Props> = {}) => {
  const onCommit = vi.fn()
  render(<Harness label="length" value={1054.4} unit="mm" locale="de-DE" onCommit={onCommit} {...props} />)
  return { onCommit, field: screen.getByRole('spinbutton', { name: 'length' }) }
}

const type = (field: HTMLElement, text: string, key = 'Enter') => {
  fireEvent.focus(field)
  fireEvent.change(field, { target: { value: text } })
  fireEvent.keyDown(field, { key })
}

it('shows the value with locale grouping and the unit', () => {
  const { field } = setup()
  expect(field).toHaveValue('1.054,4')
  expect(field).toHaveAttribute('aria-valuetext', '1.054,4 mm')
  expect(screen.getByText('mm')).toBeInTheDocument()
})

it('commits on Enter and accepts both decimal separators', () => {
  const { onCommit, field } = setup()
  type(field, '2,5')
  type(field, '3.5')
  type(field, '1.200,5')
  expect(onCommit.mock.calls).toEqual([[2.5], [3.5], [1200.5]])
})

it('does not commit while typing', () => {
  const { onCommit, field } = setup()
  fireEvent.focus(field)
  fireEvent.change(field, { target: { value: '12' } })
  expect(onCommit).not.toHaveBeenCalled()
})

it('converts other units into the field unit on Enter', () => {
  const { onCommit, field } = setup()
  type(field, '1m')
  expect(onCommit).toHaveBeenLastCalledWith(1000)
  expect(field).toHaveValue('1.000')
  type(field, '1 cm')
  expect(onCommit).toHaveBeenLastCalledWith(10)
  expect(field).toHaveValue('10')
})

it('flags invalid input and out-of-range values without committing', () => {
  const { onCommit, field } = setup({ min: 100, max: 5000 })
  type(field, '12 kg')
  expect(field).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByRole('alert')).toHaveTextContent('Unknown unit "kg"')
  type(field, '10 m')
  expect(screen.getByRole('alert')).toHaveTextContent('Maximum is 5.000 mm')
  type(field, '5 cm')
  expect(screen.getByRole('alert')).toHaveTextContent('Minimum is 100 mm')
  expect(onCommit).not.toHaveBeenCalled()
})

it('reverts on Escape and on blur with invalid input', () => {
  const { onCommit, field } = setup()
  type(field, 'abc', 'Escape')
  expect(field).toHaveValue('1.054,4')
  type(field, 'abc', 'Tab')
  fireEvent.blur(field)
  expect(field).toHaveValue('1.054,4')
  expect(onCommit).not.toHaveBeenCalled()
})

it('commits a valid value on blur', () => {
  const { onCommit, field } = setup()
  fireEvent.focus(field)
  fireEvent.change(field, { target: { value: '2 m' } })
  fireEvent.blur(field)
  expect(onCommit).toHaveBeenCalledWith(2000)
})

it('steps with the arrow keys, ten times with Shift, clamped to the range', () => {
  const { onCommit, field } = setup({ value: 2.8, step: 0.05, min: 1.5, max: 3, unit: 'mm' })
  fireEvent.focus(field)
  fireEvent.keyDown(field, { key: 'ArrowUp' })
  expect(onCommit).toHaveBeenLastCalledWith(2.85)
  fireEvent.keyDown(field, { key: 'ArrowUp', shiftKey: true })
  expect(onCommit).toHaveBeenLastCalledWith(3)
  fireEvent.keyDown(field, { key: 'ArrowDown' })
  expect(onCommit).toHaveBeenLastCalledWith(2.95)
})

it('rejects units on unitless values', () => {
  const { field } = setup({ unit: undefined, value: 3 })
  expect(screen.queryByText('mm')).not.toBeInTheDocument()
  type(field, '3 mm')
  expect(screen.getByRole('alert')).toHaveTextContent('This value has no unit')
})

it('evaluates arithmetic with units on Enter', () => {
  const { onCommit, field } = setup({ locale: 'en-US' })
  type(field, '1000 * 2')
  expect(onCommit).toHaveBeenLastCalledWith(2000)
  type(field, '1000 - 3 cm')
  expect(onCommit).toHaveBeenLastCalledWith(970)
  type(field, '100cm * 2')
  expect(onCommit).toHaveBeenLastCalledWith(2000)
  expect(field).toHaveValue('2,000')
  type(field, '10 cm * 2 cm')
  expect(screen.getByRole('alert')).toHaveTextContent('Multiply by plain numbers only')
})
