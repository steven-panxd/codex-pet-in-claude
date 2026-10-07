#!/usr/bin/env node
// Finds Codex pets on this machine and converts one into the frames the hooks
// module draws. A hooks module has no image decoder, so this runs on the host:
//
//   node pet.mjs list                 the pets found, as JSON
//   node pet.mjs build <id|auto>      convert (or reuse the cache), print where
//   node pet.mjs build <id> --force   convert again whatever is cached
//
// No dependencies. A PNG atlas is decoded here; a WebP one is first turned
// into a PNG by whichever of sips, dwebp, magick, ffmpeg or Pillow is present.
// Nothing is uploaded or redistributed: a pet is read where it is installed
// and its converted frames are kept in the user's own cache directory.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const VERSION = 7 // of the cache's format: a change rebuilds every cache
const COLUMNS = 8
// the atlas's rows in order (the Codex pet contract); a row's frames are its
// leading cells, the rest left transparent. Rows past these (v2's two rows of
// look directions) are not used.
const STATES = [
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
const CELL = [192, 208] // the contract's cell, and the most the desktop draws
// terminal: a cell is drawn as 2x2 pixels (quadrant blocks), so a pet of C
// columns by R rows is 2C by 2R pixels. Two heights (13 rows, and 7 for a
// short terminal) at two cell shapes: `standard` cells are twice as tall as
// they are wide, `tall` ones 2.4 times (a terminal with roomy line spacing),
// which takes more columns to keep the pet's own shape.
const TERMINAL = {
  lo: [24, 13],
  tiny: [12, 7],
  loTall: [29, 13],
  tinyTall: [14, 7],
}
const LO_COLORS = 32
const SVG_LIMIT = 131072 - 400 // characters an Svg element takes, less its wrapper
const SVG_COLORS = [32, 24, 16, 12]
const OPAQUE = 128
const MAX_SIDE = 8192 // pixels a side: an atlas is 1536 wide, this is room to spare
const NAME_LIMIT = 24
const DRAFT_AGE_MS = 10 * 60 * 1000 // a draft older than this was abandoned

const here = path.dirname(fileURLToPath(import.meta.url))
const bundledRoot = path.join(here, '..', 'pets')

function codexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
}

function cacheRoot() {
  const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache')

  return path.join(base, 'codex-pet-claude')
}

// ---------------------------------------------------------------- sources

// A pet's name as it is shown: one line, no markup, of a bounded length.
function cleanName(text) {
  const plain = String(text)
    .replace(/[\u0000-\u001f\u007f`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return plain.slice(0, NAME_LIMIT) || 'Pet'
}

function readFolderPet(folder, source) {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(folder, 'pet.json'), 'utf8'))
    // where the manifest's path really leads, links followed: a manifest may
    // not point outside its own folder, by spelling or by a link
    const home = fs.realpathSync(folder)
    const sheet = fs.realpathSync(path.resolve(folder, String(meta.spritesheetPath ?? 'spritesheet.webp')))

    if (!sheet.startsWith(home + path.sep) || !fs.statSync(sheet).isFile()) {
      return undefined
    }

    return {
      id: path.basename(folder),
      name: cleanName(meta.displayName ?? meta.id ?? path.basename(folder)),
      source,
      sheet,
    }
  } catch {
    return undefined
  }
}

function folderPets(root, source) {
  let names = []

  try {
    names = fs.readdirSync(root).sort()
  } catch {
    return []
  }

  return names.map(name => readFolderPet(path.join(root, name), source)).filter(Boolean)
}

function asarPaths() {
  if (process.env.CODEX_APP_ASAR) {
    return [process.env.CODEX_APP_ASAR]
  }

  const apps = ['ChatGPT.app', 'Codex.app']
  const roots = ['/Applications', path.join(os.homedir(), 'Applications')]

  return roots.flatMap(root => apps.map(app => path.join(root, app, 'Contents', 'Resources', 'app.asar')))
}

// The pets the Codex desktop app ships, read out of its archive's index.
function builtinPets() {
  for (const asar of asarPaths()) {
    let fd

    try {
      fd = fs.openSync(asar, 'r')
      const head = Buffer.alloc(16)
      fs.readSync(fd, head, 0, 16, 0)
      const headerSize = head.readUInt32LE(4)
      const jsonLength = head.readUInt32LE(12)
      const json = Buffer.alloc(jsonLength)
      fs.readSync(fd, json, 0, jsonLength, 16)
      const assets = JSON.parse(json.toString('utf8')).files?.webview?.files?.assets?.files ?? {}
      const pets = []

      for (const [name, entry] of Object.entries(assets)) {
        const match = /^([a-z0-9-]+)-spritesheet-v\d+-[0-9a-f]+\.(webp|png)$/.exec(name)

        if (match && entry.offset !== undefined && !entry.unpacked) {
          pets.push({
            id: match[1],
            name: cleanName(match[1].replace(/(^|-)([a-z])/g, (_, dash, letter) => (dash ? ' ' : '') + letter.toUpperCase())),
            source: 'codex-app',
            asar,
            offset: 8 + headerSize + Number(entry.offset),
            size: entry.size,
          })
        }
      }

      if (pets.length > 0) {
        return pets.sort((a, b) => a.id.localeCompare(b.id))
      }
    } catch {
      // not there, or not an archive this reads: try the next
    } finally {
      if (fd !== undefined) {
        fs.closeSync(fd)
      }
    }
  }

  return []
}

// Every pet found, each under an id of its own: a pet whose id an earlier
// source already has is named with its source (`codex@codex-app`).
function allPets() {
  const seen = new Set()

  return [
    ...folderPets(path.join(codexHome(), 'pets'), 'installed'),
    ...builtinPets(),
    ...folderPets(bundledRoot, 'bundled'),
  ].map(pet => {
    const id = seen.has(pet.id) ? `${pet.id}@${pet.source}` : pet.id
    seen.add(id)

    return { ...pet, id }
  })
}

// The pets `wanted` may mean, in the order to try them. `auto` prefers a pet
// the person installed, then the Codex app's own default, then the bundled.
function candidates(wanted) {
  const pets = allPets()

  if (wanted !== 'auto') {
    const named = pets.find(pet => pet.id === wanted) ?? pets.find(pet => pet.id.toLowerCase() === wanted.toLowerCase())

    return named ? [named] : []
  }

  const app = pets.filter(pet => pet.source === 'codex-app')

  return [
    ...pets.filter(pet => pet.source === 'installed'),
    ...app.filter(pet => pet.id === 'codex'),
    ...app.filter(pet => pet.id !== 'codex').slice(0, 1),
    ...pets.filter(pet => pet.source === 'bundled'),
  ]
}

function sheetBytes(pet) {
  if (pet.sheet) {
    return fs.readFileSync(pet.sheet)
  }

  const fd = fs.openSync(pet.asar, 'r')

  try {
    const bytes = Buffer.alloc(pet.size)
    fs.readSync(fd, bytes, 0, pet.size, pet.offset)

    return bytes
  } finally {
    fs.closeSync(fd)
  }
}

// ---------------------------------------------------------------- decoding

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function isPng(bytes) {
  return bytes.subarray(0, 8).equals(PNG_SIGNATURE)
}

// A non-interlaced PNG of 8 or 16 bits a channel, to RGBA bytes.
function decodePng(bytes) {
  let at = 8
  let header
  let palette
  let transparency
  const data = []

  while (at + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(at)
    const type = bytes.toString('latin1', at + 4, at + 8)
    const body = bytes.subarray(at + 8, at + 8 + length)

    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        color: body[9],
        interlace: body[12],
      }
    } else if (type === 'PLTE') {
      palette = body
    } else if (type === 'tRNS') {
      transparency = body
    } else if (type === 'IDAT') {
      data.push(body)
    } else if (type === 'IEND') {
      break
    }

    at += 12 + length
  }

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[header?.color]

  if (!header || !channels || header.interlace !== 0 || (header.depth !== 8 && header.depth !== 16)) {
    throw new Error('a PNG this does not read (interlaced, or under 8 bits a channel)')
  }

  if (header.color === 3 && header.depth !== 8) {
    throw new Error('a PNG this does not read (a 16-bit palette)')
  }

  const { width, height } = header

  if (width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE) {
    throw new Error(`a ${width}x${height} PNG is larger than a spritesheet may be`)
  }

  const sample = header.depth / 8
  const bpp = channels * sample
  const stride = width * bpp
  // no more than the image's own bytes: a small file may not unpack to gigabytes
  const raw = zlib.inflateSync(Buffer.concat(data), { maxOutputLength: (stride + 1) * height })

  if (raw.length < (stride + 1) * height) {
    throw new Error('a PNG cut short')
  }

  const lines = Buffer.alloc(stride * height)

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const from = y * (stride + 1) + 1
    const to = y * stride

    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? lines[to + x - bpp] : 0
      const up = y > 0 ? lines[to - stride + x] : 0
      const corner = x >= bpp && y > 0 ? lines[to - stride + x - bpp] : 0
      let predicted = 0

      if (filter === 1) {
        predicted = left
      } else if (filter === 2) {
        predicted = up
      } else if (filter === 3) {
        predicted = (left + up) >> 1
      } else if (filter === 4) {
        const p = left + up - corner
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - corner)
        predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner
      }

      lines[to + x] = (raw[from + x] + predicted) & 0xff
    }
  }

  const rgba = new Uint8Array(width * height * 4)

  for (let i = 0; i < width * height; i += 1) {
    const s = i * bpp
    const v = n => lines[s + n * sample] // the high byte of a 16-bit sample
    // a truecolor or gray PNG may name one color as transparent (tRNS), each
    // of its channels two bytes there whatever the depth
    const isKeyed = count =>
      transparency !== undefined &&
      transparency.length >= count * 2 &&
      Array.from({ length: count }, (_, n) =>
        sample === 2
          ? lines[s + n * 2] === transparency[n * 2] && lines[s + n * 2 + 1] === transparency[n * 2 + 1]
          : lines[s + n] === transparency[n * 2 + 1],
      ).every(Boolean)

    if (header.color === 6) {
      rgba.set([v(0), v(1), v(2), v(3)], i * 4)
    } else if (header.color === 2) {
      rgba.set([v(0), v(1), v(2), isKeyed(3) ? 0 : 255], i * 4)
    } else if (header.color === 0) {
      rgba.set([v(0), v(0), v(0), isKeyed(1) ? 0 : 255], i * 4)
    } else if (header.color === 4) {
      rgba.set([v(0), v(0), v(0), v(1)], i * 4)
    } else {
      const index = lines[s]
      rgba.set(
        [palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2], transparency?.[index] ?? 255],
        i * 4,
      )
    }
  }

  return { width, height, rgba }
}

// What the bytes are by their own first bytes, never by a file's name: the
// two formats a spritesheet may be, or undefined.
function kindOf(bytes) {
  if (isPng(bytes)) {
    return 'png'
  }

  const isWebp = bytes.length > 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP'

  return isWebp ? 'webp' : undefined
}

// Whichever converter this machine has, each turning `from` (a file of
// `kind`, said outright so none guesses a format from the content) into a
// PNG at `to`.
function converters(kind, from, to) {
  const list = [
    ['sips', ['-s', 'format', 'png', from, '--out', to]],
    ...(kind === 'webp' ? [['dwebp', [from, '-o', to]]] : []),
    ['magick', [`${kind}:${from}`, `png:${to}`]],
    ['ffmpeg', ['-y', '-loglevel', 'error', '-f', `${kind}_pipe`, '-i', from, '-frames:v', '1', to]],
    [
      'python3',
      [
        '-c',
        'import sys\nfrom PIL import Image\nImage.open(sys.argv[1], formats=[sys.argv[3]]).save(sys.argv[2], "PNG")',
        from,
        to,
        kind.toUpperCase(),
      ],
    ],
  ]

  // ImageMagick 6 is `convert`, which on Windows is a system tool of that name
  return process.platform === 'win32' ? list : [...list, ['convert', [`${kind}:${from}`, `png:${to}`]]]
}

function decode(bytes) {
  const kind = kindOf(bytes)

  if (kind === undefined) {
    throw new Error('the spritesheet is neither a PNG nor a WebP')
  }

  if (kind === 'png') {
    try {
      return decodePng(bytes)
    } catch (error) {
      // one too large is refused outright; an unusual one (interlaced, say)
      // a converter may rewrite as a plain one
      if (/larger than/.test(String(error))) {
        throw error
      }
    }
  }

  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-pet-'))
  const from = path.join(folder, `sheet.${kind}`)
  const to = path.join(folder, 'sheet.png')
  let hasConverter = false

  try {
    fs.writeFileSync(from, bytes)

    for (const [command, args] of converters(kind, from, to)) {
      try {
        execFileSync(command, args, { stdio: 'ignore', timeout: 60000 })

        return decodePng(fs.readFileSync(to))
      } catch (error) {
        // not installed (ENOENT), or it could not read the sheet: try the next
        hasConverter ||= error?.code !== 'ENOENT'
      }
    }
  } finally {
    fs.rmSync(folder, { recursive: true, force: true })
  }

  throw new Error(
    hasConverter
      ? 'the spritesheet could not be read: it may be damaged'
      : `no image converter found for a ${kind.toUpperCase()} spritesheet: install one of dwebp (libwebp), ImageMagick, ffmpeg or Pillow`,
  )
}

// ---------------------------------------------------------------- drawing

const CRC = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n

  for (let bit = 0; bit < 8; bit += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }

  return c >>> 0
})

function crc32(bytes) {
  let crc = 0xffffffff

  for (const byte of bytes) {
    crc = CRC[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

// RGBA bytes as a PNG file: what a terminal that shows images reads itself.
function encodePng(rgba, width, height) {
  const chunk = (type, body) => {
    const out = Buffer.alloc(12 + body.length)
    out.writeUInt32BE(body.length, 0)
    out.write(type, 4, 'latin1')
    body.copy(out, 8)
    out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length)

    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 6, 0, 0, 0], 8)
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)

  for (let y = 0; y < height; y += 1) {
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }

  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}


// One cell of the atlas shrunk to `width` x `height` by area, on
// premultiplied color so a transparent pixel's color does not bleed in.
function shrink(image, x0, y0, cw, ch, width, height) {
  const out = new Uint8Array(width * height * 4)
  const spans = (cells, size) =>
    Array.from({ length: size }, (_, i) => {
      const from = (i * cells) / size
      const to = ((i + 1) * cells) / size
      const span = []

      for (let c = Math.floor(from); c < Math.ceil(to); c += 1) {
        span.push([c, Math.min(to, c + 1) - Math.max(from, c)])
      }

      return span
    })
  const xs = spans(cw, width)
  const ys = spans(ch, height)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let total = 0

      for (const [sy, wy] of ys[y]) {
        for (const [sx, wx] of xs[x]) {
          const at = ((y0 + sy) * image.width + x0 + sx) * 4
          const weight = wx * wy
          const alpha = image.rgba[at + 3] * weight
          r += image.rgba[at] * alpha
          g += image.rgba[at + 1] * alpha
          b += image.rgba[at + 2] * alpha
          a += alpha
          total += weight
        }
      }

      const at = (y * width + x) * 4

      if (a > 0) {
        out[at] = Math.round(r / a)
        out[at + 1] = Math.round(g / a)
        out[at + 2] = Math.round(b / a)
        out[at + 3] = Math.round(a / total)
      }
    }
  }

  return out
}

function isEmpty(image, x0, y0, cw, ch) {
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      if (image.rgba[((y0 + y) * image.width + x0 + x) * 4 + 3] >= OPAQUE) {
        return false
      }
    }
  }

  return true
}

// A median-cut palette of at most `count` colors over the frames' opaque
// pixels, and a function from a color to its index in it.
function paletteOf(frames, count) {
  const buckets = new Map()

  for (const frame of frames) {
    for (let at = 0; at < frame.length; at += 4) {
      if (frame[at + 3] >= OPAQUE) {
        const key = ((frame[at] >> 2) << 12) | ((frame[at + 1] >> 2) << 6) | (frame[at + 2] >> 2)
        const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
        bucket.n += 1
        bucket.r += frame[at]
        bucket.g += frame[at + 1]
        bucket.b += frame[at + 2]
        buckets.set(key, bucket)
      }
    }
  }

  const colors = [...buckets.values()].map(b => ({ n: b.n, c: [b.r / b.n, b.g / b.n, b.b / b.n] }))
  let boxes = colors.length > 0 ? [colors] : []
  const widest = box => {
    let best = { axis: 0, range: -1 }

    for (let axis = 0; axis < 3; axis += 1) {
      let low = 255
      let high = 0

      for (const color of box) {
        low = Math.min(low, color.c[axis])
        high = Math.max(high, color.c[axis])
      }

      if (high - low > best.range) {
        best = { axis, range: high - low }
      }
    }

    return best
  }

  while (boxes.length < count) {
    // split the box whose widest channel, weighed by its pixels, is largest
    let pick = -1
    let score = 0

    boxes.forEach((box, index) => {
      if (box.length > 1) {
        const weight = box.reduce((sum, color) => sum + color.n, 0)
        const value = widest(box).range * Math.sqrt(weight)

        if (value > score) {
          score = value
          pick = index
        }
      }
    })

    if (pick < 0) {
      break
    }

    const box = boxes[pick]
    const { axis } = widest(box)
    box.sort((a, b) => a.c[axis] - b.c[axis])
    const half = box.reduce((sum, color) => sum + color.n, 0) / 2
    let seen = 0
    let cut = 1

    for (let i = 0; i < box.length - 1; i += 1) {
      seen += box[i].n
      cut = i + 1

      if (seen >= half) {
        break
      }
    }

    boxes = [...boxes.slice(0, pick), box.slice(0, cut), box.slice(cut), ...boxes.slice(pick + 1)]
  }

  const palette = boxes.map(box => {
    const weight = box.reduce((sum, color) => sum + color.n, 0)

    return [0, 1, 2].map(axis => Math.round(box.reduce((sum, color) => sum + color.c[axis] * color.n, 0) / weight))
  })
  const nearest = new Map()
  const indexOf = (r, g, b) => {
    const key = (r << 16) | (g << 8) | b
    let index = nearest.get(key)

    if (index === undefined) {
      let best = Infinity
      index = 0

      palette.forEach((color, at) => {
        const distance = (color[0] - r) ** 2 + (color[1] - g) ** 2 + (color[2] - b) ** 2

        if (distance < best) {
          best = distance
          index = at
        }
      })
      nearest.set(key, index)
    }

    return index
  }

  return {
    hexes: palette.map(color => '#' + color.map(v => v.toString(16).padStart(2, '0')).join('')),
    indexOf,
  }
}

// The frame as SVG markup: one stroked path per color, each run of pixels a
// horizontal segment, later runs of a row written relative to the last.
function pathsOf(frame, width, height, palette) {
  const runs = new Map()

  for (let y = 0; y < height; y += 1) {
    const pen = new Map() // color -> where its path stands on this row
    let x = 0

    while (x < width) {
      const colorAt = column => {
        const at = (y * width + column) * 4

        return frame[at + 3] >= OPAQUE ? palette.indexOf(frame[at], frame[at + 1], frame[at + 2]) : -1
      }
      const color = colorAt(x)
      let end = x + 1

      while (end < width && colorAt(end) === color) {
        end += 1
      }

      if (color >= 0) {
        const move = pen.has(color) ? `m${x - pen.get(color)} 0` : `M${x} ${y}`
        runs.set(color, `${runs.get(color) ?? ''}${move}h${end - x}`)
        pen.set(color, end)
      }

      x = end
    }
  }

  return [...runs].map(([color, d]) => `<path stroke="${palette.hexes[color]}" d="${d}"/>`).join('')
}

// The frame as a string, a character a pixel: '.' transparent, else the
// palette index as the character 48 + index.
function indexedOf(frame, width, height, palette) {
  let text = ''

  for (let at = 0; at < width * height * 4; at += 4) {
    text +=
      frame[at + 3] >= OPAQUE
        ? String.fromCharCode(48 + palette.indexOf(frame[at], frame[at + 1], frame[at + 2]))
        : '.'
  }

  return text
}

// ---------------------------------------------------------------- building

function convert(pet, folder) {
  const image = decode(sheetBytes(pet))
  const cw = Math.floor(image.width / COLUMNS)
  const ch = Math.round((cw * CELL[1]) / CELL[0])

  if (cw < 16 || image.height < ch * STATES.length) {
    throw new Error(`a ${image.width}x${image.height} sheet is not an 8-column atlas of ${STATES.length} or more rows`)
  }

  const cut = {}

  STATES.forEach((state, row) => {
    cut[state] = []

    for (let column = 0; column < COLUMNS; column += 1) {
      if (!isEmpty(image, column * cw, row * ch, cw, ch)) {
        cut[state].push([column * cw, row * ch])
      }
    }
  })

  if (cut.idle.length === 0) {
    throw new Error('the atlas has no idle frame')
  }

  // terminal: every state on one palette, at each size and cell shape
  const shrunk = (width, height) =>
    Object.fromEntries(STATES.map(state => [state, cut[state].map(([x, y]) => shrink(image, x, y, cw, ch, width, height))]))
  const sized = Object.fromEntries(Object.entries(TERMINAL).map(([name, [columns, rows]]) => [name, shrunk(columns * 2, rows * 2)]))
  const loPalette = paletteOf(Object.values(sized.lo).flat(), LO_COLORS)
  const terminal = { palette: loPalette.hexes }

  for (const [name, [columns, rows]] of Object.entries(TERMINAL)) {
    terminal[name] = {
      columns,
      rows,
      states: Object.fromEntries(
        STATES.map(state => [state, sized[name][state].map(frame => indexedOf(frame, columns * 2, rows * 2, loPalette))]),
      ),
    }
  }

  // desktop: a state a file, at the sharpest size and palette at which every
  // frame of the pet fits an Svg element of its own
  const scale = Math.min(1, CELL[0] / cw)
  let drawn

  for (const divisor of [1, 2, 4]) {
    const width = Math.max(1, Math.round((cw * scale) / divisor))
    const height = Math.max(1, Math.round((ch * scale) / divisor))
    const frames = {}

    for (const state of STATES) {
      frames[state] = cut[state].map(([x, y]) => shrink(image, x, y, cw, ch, width, height))
    }

    for (const colors of SVG_COLORS) {
      const states = {}
      let longest = 0

      for (const state of STATES) {
        const palette = paletteOf(frames[state], colors)
        states[state] = frames[state].map(frame => pathsOf(frame, width, height, palette))
        longest = Math.max(longest, ...states[state].map(markup => markup.length))
      }

      if (longest <= SVG_LIMIT) {
        drawn = { width, height, colors, states }
        break
      }
    }

    if (drawn) {
      break
    }
  }

  if (!drawn) {
    throw new Error('the atlas is too detailed to draw')
  }

  fs.mkdirSync(folder, { recursive: true })

  for (const state of STATES) {
    fs.writeFileSync(path.join(folder, `svg-${state}.json`), JSON.stringify(drawn.states[state]))
  }

  // terminals that show images: each frame a PNG of its own, at the atlas's
  // size and in its own colors, which the terminal reads from here itself
  const png = { width: Math.round(cw * scale), height: Math.round(ch * scale) }

  for (const state of STATES) {
    cut[state].forEach(([x, y], at) => {
      const frame = shrink(image, x, y, cw, ch, png.width, png.height)
      fs.writeFileSync(path.join(folder, `png-${state}-${at}.png`), encodePng(frame, png.width, png.height))
    })
  }

  // the manifest last: its presence says the folder is whole
  fs.writeFileSync(
    path.join(folder, 'meta.json'),
    JSON.stringify({
      version: VERSION,
      id: pet.id,
      name: pet.name,
      source: pet.source,
      terminal,
      png,
      svg: {
        width: drawn.width,
        height: drawn.height,
        colors: drawn.colors,
        frames: Object.fromEntries(STATES.map(state => [state, drawn.states[state].length])),
      },
    }),
  )
}

// Where a pet's conversion is kept: named for the pet and for exactly what
// was converted, so another version of it is another folder.
function cacheOf(pet) {
  const origin = pet.sheet ?? pet.asar
  const stat = fs.statSync(origin)
  const digest = text => createHash('sha1').update(text).digest('hex')
  const stamp = [VERSION, origin, pet.offset ?? 0, pet.size ?? stat.size, stat.mtimeMs].join('|')
  // the id's own hash too: two ids may spell the same once made a file name
  const prefix = `${pet.id.replace(/[^A-Za-z0-9_-]/g, '_')}-${digest(pet.id).slice(0, 6)}-`

  return { prefix, dir: path.join(cacheRoot(), prefix + digest(stamp).slice(0, 10)) }
}

const isWhole = dir => fs.existsSync(path.join(dir, 'meta.json'))

function buildOne(pet, isForced) {
  const { prefix, dir } = cacheOf(pet)

  if (isWhole(dir) && !isForced) {
    return { dir, isCached: true }
  }

  // built beside its place, then moved in whole
  const draft = `${dir}.${process.pid}.tmp`
  fs.rmSync(draft, { recursive: true, force: true })
  convert(pet, draft)

  try {
    if (isForced) {
      fs.rmSync(dir, { recursive: true, force: true })
    }

    fs.renameSync(draft, dir)
  } catch (error) {
    // another session converted the same pet meanwhile: theirs is as good
    fs.rmSync(draft, { recursive: true, force: true })

    if (!isWhole(dir)) {
      throw error
    }
  }

  // older conversions of this pet, and drafts a killed run left behind
  for (const name of fs.readdirSync(cacheRoot())) {
    const full = path.join(cacheRoot(), name)
    const isOlder = name.startsWith(prefix) && /^[0-9a-f]{10}$/.test(name.slice(prefix.length)) && full !== dir
    const isAbandoned = name.endsWith('.tmp') && Date.now() - fs.statSync(full).mtimeMs > DRAFT_AGE_MS

    if (isOlder || isAbandoned) {
      fs.rmSync(full, { recursive: true, force: true })
    }
  }

  return { dir, isCached: false }
}

// Converts the first of the pets `wanted` may mean that converts at all, so
// one damaged pet does not hide the others `auto` could show.
function build(wanted, options) {
  const pets = candidates(wanted)

  if (pets.length === 0) {
    throw new Error(`no pet named "${wanted}": /pet list names the ones found`)
  }

  let first

  for (const pet of pets) {
    try {
      const built = options.out
        ? (convert(pet, options.out), { dir: options.out, isCached: false })
        : buildOne(pet, options.isForced)

      return { ...built, id: pet.id, name: pet.name, source: pet.source, skipped: first }
    } catch (error) {
      first ??= `${pet.name}: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  throw new Error(first)
}

function main() {
  const [command, ...rest] = process.argv.slice(2)

  try {
    if (command === 'list') {
      const pets = allPets().map(({ id, name, source }) => ({ id, name, source }))
      process.stdout.write(JSON.stringify({ pets, auto: candidates('auto')[0]?.id }) + '\n')
    } else if (command === 'build') {
      const out = rest.indexOf('--out')
      const words = rest.filter((arg, index) => !arg.startsWith('-') && (out < 0 || index !== out + 1))
      const options = { out: out >= 0 ? rest[out + 1] : undefined, isForced: rest.includes('--force') }
      process.stdout.write(JSON.stringify(build(words[0] ?? 'auto', options)) + '\n')
    } else {
      process.stderr.write('usage: pet.mjs list | build <id|auto> [--force] [--out <folder>]\n')
      process.exitCode = 2
    }
  } catch (error) {
    process.stdout.write(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) + '\n')
    process.exitCode = 1
  }
}

// run as a script, not when a test imports it
const invoked = process.argv[1] ? fs.realpathSync(process.argv[1]) : ''

if (invoked === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main()
}

export { cleanName, convert, decode, decodePng, kindOf, readFolderPet }
