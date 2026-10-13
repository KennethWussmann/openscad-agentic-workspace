import {
  AlwaysStencilFunc,
  BackSide,
  Color,
  DecrementWrapStencilOp,
  DoubleSide,
  FrontSide,
  IncrementWrapStencilOp,
  MeshBasicMaterial,
  NotEqualStencilFunc,
  PlaneGeometry,
  ReplaceStencilOp,
  ShaderMaterial,
} from 'three'
import type { ModelMesh } from './loader.ts'

const PALETTE = ['#b8c4d0', '#8fb3c8', '#c8b38f', '#9fc4ae', '#c49fb4', '#a7a0cc']

export const CAP_COLORS = { fill: '#3a2a12', line: '#f2a541' }

export const capMaterial = new ShaderMaterial({
  uniforms: {
    fill: { value: new Color(CAP_COLORS.fill) },
    line: { value: new Color(CAP_COLORS.line) },
    spacing: { value: 9 },
  },
  vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform vec3 fill;
    uniform vec3 line;
    uniform float spacing;
    void main() {
      float d = mod(gl_FragCoord.x + gl_FragCoord.y, spacing);
      float hatch = 1.0 - smoothstep(1.0, 2.2, d);
      gl_FragColor = vec4(mix(fill, line, hatch * 0.85), 1.0);
    }
  `,
  side: DoubleSide,
  stencilWrite: true,
  stencilRef: 0,
  stencilFunc: NotEqualStencilFunc,
  stencilFail: ReplaceStencilOp,
  stencilZFail: ReplaceStencilOp,
  stencilZPass: ReplaceStencilOp,
})

const stencilMaterial = (side: typeof BackSide | typeof FrontSide) =>
  new MeshBasicMaterial({
    side,
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
    stencilWrite: true,
    stencilFunc: AlwaysStencilFunc,
    stencilFail: side === BackSide ? IncrementWrapStencilOp : DecrementWrapStencilOp,
    stencilZFail: side === BackSide ? IncrementWrapStencilOp : DecrementWrapStencilOp,
    stencilZPass: side === BackSide ? IncrementWrapStencilOp : DecrementWrapStencilOp,
  })

export const backStencil = stencilMaterial(BackSide)
export const frontStencil = stencilMaterial(FrontSide)

export const partColor = (mesh: ModelMesh, index: number, modelColors: boolean) =>
  modelColors && !mesh.isDefaultColor ? mesh.color : new Color(PALETTE[index % PALETTE.length])

export const capGeometry = new PlaneGeometry(1, 1)
