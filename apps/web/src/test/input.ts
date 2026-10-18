import { fireEvent } from '@testing-library/react'

export const enterValue = (field: HTMLElement, text: string) => {
  fireEvent.focus(field)
  fireEvent.change(field, { target: { value: text } })
  fireEvent.keyDown(field, { key: 'Enter' })
}
