import type { TLBaseShape } from '@tldraw/tlschema'

export const HTML_FRAME_TYPE = 'html-frame' as const

export type HtmlFrameShapeProps = {
  w: number
  h: number
  name: string
  url: string
}

export type HtmlFrameShape = TLBaseShape<typeof HTML_FRAME_TYPE, HtmlFrameShapeProps>
