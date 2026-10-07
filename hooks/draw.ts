import type { Mood } from '../types'

// A converted pet, as scripts/pet.mjs writes it and the hooks module reads it.
export type PetMeta = {
  version: number
  id: string
  name: string
  source: string
  // terminal: frames a character a pixel, '.' transparent, else the palette
  // index as the character 48 + index
  lo: Frames & { palette: string[] }
  // the same on lo's palette at half the size, for a short terminal
  tiny: Frames
  // a terminal that shows images: each frame a PNG file beside the manifest
  png: { width: number; height: number }
  // desktop: how many frames each state has; their markup is a file a state
  svg: { width: number; height: number; colors: number; frames: Partial<Record<Mood, number>> }
}

type Frames = { width: number; height: number; states: Partial<Record<Mood, string[]>> }

export type TerminalSize = 'lo' | 'tiny'

export type Pet = PetMeta & {
  dir: string
  rgb: number[]
  /** A state's frames as SVG path markup, read when the desktop first needs them. */
  paths: Map<Mood, string[]>
}

export const META_VERSION = 6

export const MOODS: readonly Mood[] = [
  'idle',
  'running-right',
  'running-left',
  'waving',
  'jumping',
  'failed',
  'waiting',
  'running',
  'review',
]

export const LABEL: Record<Mood, string> = {
  idle: 'idle',
  'running-right': 'on the move',
  'running-left': 'on the move',
  waving: 'hi!',
  jumping: 'done!',
  failed: 'that failed',
  waiting: 'needs you',
  running: 'working…',
  review: 'ready for review',
}

const TRANSPARENT = 46 // '.'
const FIRST = 48 // '0': palette index n is the char FIRST + n
const DEFAULT_COLOR = 0x01000000

export function isMood(text: string): text is Mood {
  return MOODS.some(one => one === text)
}

// What the converter wrote, or undefined when it is not that.
export function petOf(text: string, dir: string): Pet | undefined {
  let meta: Partial<PetMeta>

  try {
    meta = JSON.parse(text)
  } catch {
    return undefined
  }

  const isWhole =
    meta.version === META_VERSION &&
    typeof meta.id === 'string' &&
    typeof meta.name === 'string' &&
    Array.isArray(meta.lo?.palette) &&
    (meta.lo?.states?.idle?.length ?? 0) > 0 &&
    (meta.tiny?.states?.idle?.length ?? 0) > 0 &&
    (meta.png?.width ?? 0) > 0 &&
    (meta.png?.height ?? 0) > 0 &&
    (meta.svg?.frames?.idle ?? 0) > 0

  if (!isWhole) {
    return undefined
  }

  const whole = meta as PetMeta

  return {
    ...whole,
    dir,
    rgb: whole.lo.palette.map(hex => parseInt(hex.slice(1), 16)),
    paths: new Map(),
  }
}

// A state with no frames of its own is drawn as idle.
export function stateOf(pet: Pet, mood: Mood): Mood {
  return (pet.lo.states[mood]?.length ?? 0) > 0 ? mood : 'idle'
}

export function frameCount(pet: Pet, mood: Mood): number {
  return pet.lo.states[stateOf(pet, mood)]?.length ?? 1
}

function colorAt(pet: Pet, frame: string, index: number): number {
  const code = index < frame.length ? frame.charCodeAt(index) : TRANSPARENT

  return code === TRANSPARENT ? -1 : (pet.rgb[code - FIRST] ?? -1)
}

// A terminal frame as a Raster's cells, two pixels a cell: the upper half
// block's foreground over its background.
export function cellsOf(pet: Pet, size: TerminalSize, mood: Mood, at: number): string {
  const { width, height, states } = pet[size]
  const frames = states[stateOf(pet, mood)] ?? []
  const frame = frames[at % Math.max(1, frames.length)] ?? ''
  const rows = Math.ceil(height / 2)
  const words = new Uint32Array(width * rows * 3)

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const top = colorAt(pet, frame, row * 2 * width + column)
      const bottom = row * 2 + 1 < height ? colorAt(pet, frame, (row * 2 + 1) * width + column) : -1
      const index = (row * width + column) * 3

      if (top < 0 && bottom < 0) {
        words.set([0x20, DEFAULT_COLOR, DEFAULT_COLOR], index)
      } else if (top < 0) {
        words.set([0x2584, bottom, DEFAULT_COLOR], index)
      } else {
        words.set([0x2580, top, bottom < 0 ? DEFAULT_COLOR : bottom], index)
      }
    }
  }

  return new Uint8Array(words.buffer).toBase64()
}

// One frame as the PNG file the converter left in the cache, for a terminal
// that shows images: it reads the file itself, so no pixel crosses the plugin.
export function imageOf(pet: Pet, mood: Mood, at: number): { file: string; format: 'png' } {
  const state = stateOf(pet, mood)

  return { file: `${pet.dir}/png-${state}-${at % frameCount(pet, mood)}.png`, format: 'png' }
}

// One desktop frame as an SVG of its own, or undefined until the state's
// markup is read. An image, so the band shows through it; and one frame an
// element, since a whole animation at the atlas's size fits none.
export function svgOf(pet: Pet, mood: Mood, at: number): string | undefined {
  const frames = pet.paths.get(stateOf(pet, mood))
  const paths = frames?.[at % Math.max(1, frames.length)]

  if (paths === undefined) {
    return undefined
  }

  const { width, height } = pet.svg

  // paths are written on whole rows; the half pixel centers each stroke on its row
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges" fill="none" stroke-width="1"><g transform="translate(0 .5)">${paths}</g></svg>`
}
