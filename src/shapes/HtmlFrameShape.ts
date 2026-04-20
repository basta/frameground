import type { Node } from '@xyflow/react'

export const HTML_FRAME_TYPE = 'html-frame' as const

export type HtmlFrameData = {
  name: string
  url: string
  editMode: boolean
  projectId?: string
}

export type HtmlFrameNode = Node<HtmlFrameData, typeof HTML_FRAME_TYPE>
