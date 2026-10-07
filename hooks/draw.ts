import type { Mood } from '../types'

// A converted pet, as scripts/pet.mjs writes it and the hooks module reads it.
export type PetMeta = {
  version: number
  id: string
  name: string
  source: string
  // terminal: the pet at each size and cell shape, on one palette. A frame is
  // 2 * columns by 2 * rows pixels, a character a pixel: '.' transparent,
  // else the palette index as the character 48 + index
  terminal: { palette: string[] } & Record<TerminalSize, Frames>
  // a terminal that shows images: each frame a PNG file beside the manifest
  png: { width: number; height: number }
  // desktop: how many frames each state has; their markup is a file a state
  svg: { width: number; height: number; colors: number; frames: Partial<Record<Mood, number>> }
}

type Frames = { columns: number; rows: number; states: Partial<Record<Mood, string[]>> }

export type TerminalSize = 'lo' | 'tiny' | 'loTall' | 'tinyTall'

export type Pet = PetMeta & {
  dir: string
  rgb: number[]
  /** The pet's main color, for the face a plain terminal draws. */
  tint: string
  /** A state's frames as SVG path markup, read when the desktop first needs them. */
  paths: Map<Mood, string[]>
}

export const META_VERSION = 7

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

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

// The pet as a face of plain characters, a few frames a mood: what a terminal
// that shows no images draws, sharp at any size where blocks of color are not.
// A mood's frames are all one width, so nothing beside the face shifts.
export const FACES: Record<Mood, readonly string[]> = {
  idle: ['(•‿•)', '(•‿•)', '(•‿•)', '(-‿-)'],
  'running-right': ['(•_•)>', '(•_•)»'],
  'running-left': ['<(•_•)', '«(•_•)'],
  waving: ['(^‿^)/', '(^‿^)-'],
  jumping: ['\\(^o^)/', ' (^o^) '],
  failed: ['(x_x)', '(>_<)'],
  waiting: ['(•_•)?', '(•_•) '],
  running: SPINNER.map(mark => `${mark} (•_•)`),
  review: ['(^‿^)*', '(^‿^) '],
}

export function faceOf(mood: Mood, at: number): string {
  const frames = FACES[mood]

  return frames[at % frames.length] ?? ''
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
    Array.isArray(meta.terminal?.palette) &&
    (['lo', 'tiny', 'loTall', 'tinyTall'] as const).every(size => (meta.terminal?.[size]?.states?.idle?.length ?? 0) > 0) &&
    (meta.png?.width ?? 0) > 0 &&
    (meta.png?.height ?? 0) > 0 &&
    (meta.svg?.frames?.idle ?? 0) > 0

  if (!isWhole) {
    return undefined
  }

  const whole = meta as PetMeta
  // the color most of its first idle frame is
  const counts = new Map<number, number>()

  for (const char of whole.terminal.lo.states.idle?.[0] ?? '') {
    const code = char.charCodeAt(0)

    if (code !== TRANSPARENT) {
      counts.set(code, (counts.get(code) ?? 0) + 1)
    }
  }

  const [most] = [...counts].sort((a, b) => b[1] - a[1])

  return {
    ...whole,
    dir,
    tint: whole.terminal.palette[(most?.[0] ?? FIRST) - FIRST] ?? '#888888',
    rgb: whole.terminal.palette.map(hex => parseInt(hex.slice(1), 16)),
    paths: new Map(),
  }
}

// A state with no frames of its own is drawn as idle.
export function stateOf(pet: Pet, mood: Mood): Mood {
  return (pet.terminal.lo.states[mood]?.length ?? 0) > 0 ? mood : 'idle'
}

export function frameCount(pet: Pet, mood: Mood): number {
  return pet.terminal.lo.states[stateOf(pet, mood)]?.length ?? 1
}

function colorAt(pet: Pet, frame: string, index: number): number {
  const code = index < frame.length ? frame.charCodeAt(index) : TRANSPARENT

  return code === TRANSPARENT ? -1 : (pet.rgb[code - FIRST] ?? -1)
}

// The block that fills the quadrants a mask names (1 top left, 2 top right,
// 4 bottom left, 8 bottom right), by mask.
const QUADRANTS = [
  0x20, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b, 0x2597, 0x259a, 0x2590, 0x259c, 0x2584, 0x2599, 0x259f,
  0x2588,
]
// every way to split a cell's four pixels in two groups, as the mask of one
const SPLITS = [0b0011, 0b0101, 0b0110, 0b0001, 0b0010, 0b0100, 0b1000]

function mean(colors: number[], mask: number): number {
  let r = 0
  let g = 0
  let b = 0
  let n = 0

  colors.forEach((color, at) => {
    if (mask & (1 << at)) {
      r += color >> 16
      g += (color >> 8) & 0xff
      b += color & 0xff
      n += 1
    }
  })

  return n === 0 ? 0 : (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n)
}

function spread(colors: number[], mask: number, to: number): number {
  let sum = 0

  colors.forEach((color, at) => {
    if (mask & (1 << at)) {
      sum += ((color >> 16) - (to >> 16)) ** 2 + (((color >> 8) & 0xff) - ((to >> 8) & 0xff)) ** 2 + ((color & 0xff) - (to & 0xff)) ** 2
    }
  })

  return sum
}

// One cell's four pixels (top left, top right, bottom left, bottom right; -1
// transparent) as the block and two colors that come closest to them.
function cellOf(pixels: number[]): [number, number, number] {
  const opaque = pixels.reduce((mask, color, at) => (color < 0 ? mask : mask | (1 << at)), 0)

  // part of the cell shows the terminal through: the rest is one color
  if (opaque !== 0b1111) {
    return [QUADRANTS[opaque] ?? 0x20, opaque === 0 ? DEFAULT_COLOR : mean(pixels, opaque), DEFAULT_COLOR]
  }

  let best: [number, number, number] = [0x2588, mean(pixels, 0b1111), DEFAULT_COLOR]
  let least = spread(pixels, 0b1111, best[1])

  for (const mask of SPLITS) {
    const fore = mean(pixels, mask)
    const back = mean(pixels, ~mask & 0b1111)
    const error = spread(pixels, mask, fore) + spread(pixels, ~mask & 0b1111, back)

    if (error < least) {
      least = error
      best = [QUADRANTS[mask] ?? 0x2588, fore, back]
    }
  }

  return best
}

// A terminal frame as a Raster's cells, four pixels a cell: the quadrant
// block and the two colors that draw them best.
export function cellsOf(pet: Pet, size: TerminalSize, mood: Mood, at: number): string {
  const { columns, rows, states } = pet.terminal[size]
  const frames = states[stateOf(pet, mood)] ?? []
  const frame = frames[at % Math.max(1, frames.length)] ?? ''
  const width = columns * 2
  const words = new Uint32Array(columns * rows * 3)

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const top = row * 2 * width + column * 2
      const pixels = [top, top + 1, top + width, top + width + 1].map(index => colorAt(pet, frame, index))
      words.set(cellOf(pixels), (row * columns + column) * 3)
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
