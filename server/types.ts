export interface FrameEntry {
  id: string
  name: string
  file: string
}

export interface Manifest {
  frames: FrameEntry[]
}

export interface LayoutEntry {
  x: number
  y: number
  w: number
  h: number
}

export type Layout = Record<string, LayoutEntry>
