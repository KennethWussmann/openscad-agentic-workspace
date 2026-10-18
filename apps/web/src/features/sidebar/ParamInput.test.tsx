import type { DefineValue, ParamDef } from '@scad/protocol'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { param } from '../../test/fixtures.ts'
import { enterValue } from '../../test/input.ts'
import { ParamInput } from './ParamInput.tsx'

const setup = (def: ParamDef, value: DefineValue = def.initial) => {
  const onChange = vi.fn()
  render(<ParamInput def={def} label={def.name} value={value} onChange={onChange} />)
  return onChange
}

it('edits numbers through the field and the slider', () => {
  const onChange = setup(param({ min: 10, max: 50, step: 1 }))
  enterValue(screen.getByRole('spinbutton', { name: 'width' }), '32')
  fireEvent.change(screen.getByRole('slider', { name: 'width slider' }), { target: { value: '40' } })
  expect(onChange.mock.calls).toEqual([[32], [40]])
})

it('omits the slider without a range and ignores an empty field', () => {
  const onChange = setup(param())
  expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  const field = screen.getByRole('spinbutton', { name: 'width' })
  enterValue(field, '')
  expect(field).toHaveAttribute('aria-invalid', 'true')
  expect(onChange).not.toHaveBeenCalled()
})

it('shows the unit and converts other units into it', () => {
  const onChange = setup(param({ unit: 'mm', min: 10, max: 5000 }))
  expect(screen.getByText('mm')).toBeInTheDocument()
  const field = screen.getByRole('spinbutton', { name: 'width' })
  enterValue(field, '1 m')
  expect(onChange).toHaveBeenCalledWith(1000)
})

it('toggles booleans', () => {
  const onChange = setup(param({ name: 'lid', type: 'boolean', initial: true }))
  const toggle = screen.getByRole('switch', { name: 'lid' })
  expect(toggle).toHaveAttribute('aria-checked', 'true')
  fireEvent.click(toggle)
  expect(onChange).toHaveBeenCalledWith(false)
})

it('picks from options and keeps their value types', () => {
  const options = [
    { name: 'Small', value: 10 },
    { name: 'Large', value: 30 },
  ]
  const onChange = setup(param({ name: 'size', initial: 10, options }))
  fireEvent.change(screen.getByRole('combobox', { name: 'size' }), { target: { value: '30' } })
  expect(onChange).toHaveBeenCalledWith(30)
})

it('accepts only arrays as vectors and flags bad input', () => {
  const onChange = setup(param({ name: 'offset', type: 'vector', initial: [1, 2], unit: 'mm' }))
  const field = screen.getByRole('textbox', { name: 'offset' })
  expect(field).toHaveValue('[1,2]')
  expect(screen.getByText('mm')).toBeInTheDocument()
  fireEvent.change(field, { target: { value: '[1, 2' } })
  expect(field).toHaveAttribute('aria-invalid', 'true')
  fireEvent.change(field, { target: { value: '5' } })
  expect(field).toHaveAttribute('aria-invalid', 'true')
  fireEvent.change(field, { target: { value: '[3, 4]' } })
  expect(field).toHaveAttribute('aria-invalid', 'false')
  expect(onChange.mock.calls).toEqual([[[3, 4]]])
})

it('edits strings', () => {
  const onChange = setup(param({ name: 'label', type: 'string', initial: 'BOX' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'label' }), { target: { value: 'LID' } })
  expect(onChange).toHaveBeenCalledWith('LID')
})
