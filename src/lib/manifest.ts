export interface FrameEntry {
  id: string
  name: string
  file: string
  x: number
  y: number
  w: number
  h: number
}

export interface FrameManifest {
  frames: FrameEntry[]
}

export async function loadManifest(): Promise<FrameManifest> {
  try {
    const res = await fetch('/frames/frames.json?t=' + Date.now())
    if (!res.ok) return { frames: [] }
    return res.json()
  } catch {
    return { frames: [] }
  }
}
