import { Vector3 } from 'three'
import { extentOf } from '../../lib/vec.ts'
import { type NoteDraft, useStore } from '../../store/store.ts'
import { noteNumber, tipOf } from '../notes/placement.ts'
import { stage } from './CaptureBridge.tsx'

const MAX_WIDTH = 2048
const COLORS = { bg: '#0a0f14', amber: '#f2a541', ink: '#1b1206', text: '#d8e2ea', dim: '#6b7d8d', rule: '#2a3b4b' }
const FONT = '"Martian Mono Variable", ui-monospace, monospace'

const wrap = (ctx: CanvasRenderingContext2D, text: string, width: number) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (ctx.measureText(flat).width <= width) return flat
  let cut = flat
  while (cut.length > 1 && ctx.measureText(`${cut}...`).width > width) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}...`
}

const balloon = (ctx: CanvasRenderingContext2D, x: number, y: number, label: string, scale: number) => {
  const r = 11 * scale
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = COLORS.amber
  ctx.fill()
  ctx.lineWidth = 2 * scale
  ctx.strokeStyle = COLORS.ink
  ctx.stroke()
  ctx.fillStyle = COLORS.ink
  ctx.font = `700 ${11 * scale}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x, y + 0.5 * scale)
}

export const captureView = (notes: NoteDraft[], caption: string) => {
  const { gl, scene, camera } = stage
  if (!gl || !scene || !camera) throw new Error('The viewport is not ready')
  const extent = extentOf(useStore.getState().bounds)
  gl.render(scene, camera)
  const src = gl.domElement
  const factor = Math.min(1, MAX_WIDTH / src.width)
  const width = Math.round(src.width * factor)
  const height = Math.round(src.height * factor)
  const scale = (src.width / src.clientWidth) * factor
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not available')
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(src, 0, 0, width, height)

  const toPx = (p: [number, number, number]) => {
    const ndc = new Vector3(...p).project(camera)
    return { x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height }
  }
  notes.forEach((n, i) => {
    const a = toPx(n.point)
    const b = toPx(tipOf(n.point, n.normal, extent))
    ctx.strokeStyle = COLORS.amber
    ctx.lineWidth = 1.6 * scale
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(a.x, a.y, 3.5 * scale, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.amber
    ctx.fill()
    balloon(ctx, b.x, b.y, String(i + 1), scale)
  })

  const pad = 10 * scale
  const line = 18 * scale
  const shown = notes.slice(0, 14)
  const boxWidth = Math.min(width - 2 * pad, 520 * scale)
  const boxHeight = pad * 2 + line * (shown.length + 1) + (notes.length > shown.length ? line : 0)
  const top = height - boxHeight - pad
  ctx.fillStyle = 'rgba(10, 15, 20, 0.88)'
  ctx.fillRect(pad, top, boxWidth, boxHeight)
  ctx.strokeStyle = COLORS.rule
  ctx.lineWidth = scale
  ctx.strokeRect(pad, top, boxWidth, boxHeight)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = `600 ${10 * scale}px ${FONT}`
  ctx.fillStyle = COLORS.dim
  ctx.fillText(wrap(ctx, caption.toUpperCase(), boxWidth - 2 * pad), pad * 2, top + pad + line / 2)
  shown.forEach((n, i) => {
    const y = top + pad + line * (i + 1.5)
    ctx.fillStyle = COLORS.amber
    ctx.font = `700 ${11 * scale}px ${FONT}`
    ctx.fillText(noteNumber(i + 1), pad * 2, y)
    ctx.fillStyle = COLORS.text
    ctx.font = `400 ${11 * scale}px ${FONT}`
    ctx.fillText(wrap(ctx, n.text, boxWidth - 6 * pad), pad * 2 + 28 * scale, y)
  })
  if (notes.length > shown.length) {
    ctx.fillStyle = COLORS.dim
    ctx.fillText(`+ ${notes.length - shown.length} more`, pad * 2, top + pad + line * (shown.length + 1.5))
  }
  return canvas.toDataURL('image/png')
}
