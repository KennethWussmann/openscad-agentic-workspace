import { expect, it } from 'vitest'
import { createBoundedCache } from './boundedCache.ts'

it('evicts the oldest entry once the limit is exceeded', () => {
  const cache = createBoundedCache<number>(2)
  expect(cache.set('a', 1)).toBe(1)
  cache.set('b', 2)
  cache.set('c', 3)
  expect(cache.get('a')).toBeUndefined()
  expect(cache.get('b')).toBe(2)
  expect(cache.get('c')).toBe(3)
})

it('deletes entries', () => {
  const cache = createBoundedCache<string>(4)
  cache.set('a', 'x')
  expect(cache.delete('a')).toBe(true)
  expect(cache.get('a')).toBeUndefined()
})
