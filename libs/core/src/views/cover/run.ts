import { writeCover } from './cover.ts'

const [out, ...models] = process.argv.slice(2)
process.exit(out && models.length && writeCover(models, out) ? 0 : 1)
