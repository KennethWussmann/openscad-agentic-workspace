export const createBoundedCache = <V>(max: number) => {
  const entries = new Map<string, V>()
  return {
    get: (key: string) => entries.get(key),
    delete: (key: string) => entries.delete(key),
    set: (key: string, value: V) => {
      entries.set(key, value)
      if (entries.size > max) {
        const oldest = entries.keys().next().value
        if (oldest !== undefined) entries.delete(oldest)
      }
      return value
    },
  }
}
