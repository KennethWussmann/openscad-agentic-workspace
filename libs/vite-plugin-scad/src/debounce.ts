export const createDebouncer = (defaultMs: number) => {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  return (key: string, fn: () => void, ms = defaultMs) => {
    clearTimeout(timers.get(key))
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key)
        fn()
      }, ms),
    )
  }
}
