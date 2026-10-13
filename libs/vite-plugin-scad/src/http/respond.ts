import type { Connect } from 'vite'

export type Req = Connect.IncomingMessage
export type Res = Parameters<Connect.NextHandleFunction>[1]

export const MAX_BODY = 1024 * 1024

export const json = (res: Res, status: number, body: unknown) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

export const readBody = (req: Req, limit = MAX_BODY) =>
  new Promise<unknown>((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) reject(new Error('Body too large'))
      else chunks.push(c)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      try {
        resolve(text ? JSON.parse(text) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
