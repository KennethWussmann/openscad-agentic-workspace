import { thicknessOfMesh } from '@scad/geometry'

type Request = { id: number; positions: Float32Array }

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<Request>) => void) | null
  postMessage: (message: unknown, transfer: Transferable[]) => void
}

scope.onmessage = (e) => {
  const thickness = thicknessOfMesh(e.data.positions, null)
  scope.postMessage({ id: e.data.id, thickness }, [thickness.buffer])
}
