// node --test scripts/
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

import { cleanName, convert, decode, decodePng, install, kindOf, parseInstaller, readFolderPet } from './pet.mjs'

const script = fileURLToPath(new URL('./pet.mjs', import.meta.url))
const CELL = [16, 17] // the smallest cell the converter takes, in the contract's shape

// CRC-32 as PNG wants it (zlib.crc32 is newer than the Node this supports)
function crc32(bytes) {
  let crc = ~0

  for (const byte of bytes) {
    crc ^= byte

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }

  return ~crc >>> 0
}

function chunk(type, body) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(type, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0)

  return Buffer.concat([head, body, crc])
}

// An RGBA PNG, every scanline filtered `filter` (0 none, 1 sub, 2 up).
function png(width, height, rgba, filter = 0) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 6, 0, 0, 0], 8)
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = filter

    for (let x = 0; x < stride; x += 1) {
      const value = rgba[y * stride + x]
      const left = x >= 4 ? rgba[y * stride + x - 4] : 0
      const up = y > 0 ? rgba[(y - 1) * stride + x] : 0
      raw[y * (stride + 1) + 1 + x] = (value - (filter === 1 ? left : filter === 2 ? up : 0)) & 0xff
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// An atlas of `rows` rows whose row r has `counts[r]` filled cells.
function atlas(rows, counts) {
  const width = CELL[0] * 8
  const height = CELL[1] * rows
  const rgba = new Uint8Array(width * height * 4)

  counts.forEach((count, row) => {
    for (let column = 0; column < count; column += 1) {
      for (let y = 2; y < CELL[1] - 2; y += 1) {
        for (let x = 2; x < CELL[0] - 2; x += 1) {
          const at = ((row * CELL[1] + y) * width + column * CELL[0] + x) * 4
          rgba.set([40 * row, 30 * column, y < 8 ? 200 : 90, 255], at)
        }
      }
    }
  })

  return png(width, height, rgba)
}

function petFolder(root, id, sheet, manifest = {}) {
  const folder = path.join(root, id)
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, 'spritesheet.png'), sheet)
  fs.writeFileSync(
    path.join(folder, 'pet.json'),
    JSON.stringify({ id, displayName: id.toUpperCase(), spritesheetPath: 'spritesheet.png', ...manifest }),
  )

  return folder
}

const COUNTS = [6, 8, 8, 4, 5, 8, 6, 6, 6]

test('decodePng reads back what was written, whichever filter', () => {
  const rgba = Uint8Array.from({ length: 5 * 3 * 4 }, (_, i) => (i * 37) % 256)

  for (const filter of [0, 1, 2]) {
    const image = decodePng(png(5, 3, rgba, filter))
    assert.equal(image.width, 5)
    assert.equal(image.height, 3)
    assert.deepEqual([...image.rgba], [...rgba])
  }
})

test('a 9-row and an 11-row atlas convert to the same nine states', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  for (const rows of [9, 11]) {
    const folder = petFolder(root, `rows${rows}`, atlas(rows, [...COUNTS, 8, 8].slice(0, rows)))
    const out = path.join(root, `out${rows}`)
    convert(readFolderPet(folder, 'installed'), out)
    const meta = JSON.parse(fs.readFileSync(path.join(out, 'meta.json'), 'utf8'))

    assert.equal(meta.id, `rows${rows}`)
    assert.equal(meta.name, `ROWS${rows}`)
    assert.deepEqual(Object.values(meta.svg.frames), COUNTS)
    assert.deepEqual([meta.svg.width, meta.svg.height], CELL)
    assert.deepEqual(
      Object.fromEntries(['lo', 'tiny', 'loTall', 'tinyTall'].map(size => [size, [meta.terminal[size].columns, meta.terminal[size].rows]])),
      { lo: [24, 13], tiny: [12, 7], loTall: [29, 13], tinyTall: [14, 7] },
    )
    assert.equal(meta.terminal.lo.states.waving.length, 4)
    // two pixels a cell each way
    assert.equal(meta.terminal.lo.states.idle[0].length, 48 * 26)
    assert.equal(meta.terminal.tinyTall.states.idle[0].length, 28 * 14)

    // each frame is also a PNG of its own, at the cell's size
    assert.deepEqual(meta.png, { width: CELL[0], height: CELL[1] })
    const frame = decodePng(fs.readFileSync(path.join(out, 'png-waving-3.png')))
    assert.deepEqual([frame.width, frame.height], CELL)
    assert.equal(frame.rgba[(8 * CELL[0] + 8) * 4 + 3], 255)
    assert.equal(frame.rgba[3], 0)
    assert.ok(!fs.existsSync(path.join(out, 'png-waving-4.png')))

    const idle = JSON.parse(fs.readFileSync(path.join(out, 'svg-idle.json'), 'utf8'))
    assert.equal(idle.length, 6)
    assert.match(idle[0], /^<path stroke="#[0-9a-f]{6}" d="M\d+ \d+h\d+/)
  }
})

test('a PNG that names one color transparent has that color cut out', () => {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(2, 0)
  header.writeUInt32BE(1, 4)
  header.set([8, 2, 0, 0, 0], 8) // 8-bit truecolor, no alpha channel
  const keyed = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('tRNS', Buffer.from([0, 255, 0, 0, 0, 255])), // magenta
    chunk('IDAT', zlib.deflateSync(Buffer.from([0, 255, 0, 255, 10, 20, 30]))),
    chunk('IEND', Buffer.alloc(0)),
  ])

  assert.deepEqual([...decodePng(keyed).rgba], [255, 0, 255, 0, 10, 20, 30, 255])
})

test('an image claiming to be enormous is refused before it is unpacked', () => {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(60000, 0)
  header.writeUInt32BE(60000, 4)
  header.set([8, 6, 0, 0, 0], 8)
  const huge = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.alloc(64))),
    chunk('IEND', Buffer.alloc(0)),
  ])

  assert.throws(() => decode(huge), /larger than a spritesheet may be/)
})

test('a spritesheet is what its bytes say, never what its name says', () => {
  assert.equal(kindOf(png(1, 1, new Uint8Array(4))), 'png')
  assert.equal(kindOf(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1')), 'webp')
  // an ImageMagick script, an SVG, a playlist: none reaches a converter
  for (const text of ['<?xml version="1.0"?><image>', '<svg xmlns="http://www.w3.org/2000/svg"/>', '#EXTM3U\n']) {
    assert.equal(kindOf(Buffer.from(text)), undefined)
    assert.throws(() => decode(Buffer.from(text)), /neither a PNG nor a WebP/)
  }
})

test('a pet\'s name is shown as one plain, bounded line', () => {
  assert.equal(cleanName('  Mr.\n```Evil```\t Pet  '), 'Mr. Evil Pet')
  assert.equal(cleanName('x'.repeat(200)).length, 24)
  assert.equal(cleanName('\n'), 'Pet')
})

test('a manifest may not name a spritesheet outside its folder', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.writeFileSync(path.join(root, 'secret.png'), atlas(9, COUNTS))
  const folder = petFolder(root, 'sneaky', atlas(9, COUNTS), { spritesheetPath: '../secret.png' })

  assert.equal(readFolderPet(folder, 'installed'), undefined)

  // nor reach one through a link inside it
  const linked = petFolder(root, 'linked', atlas(9, COUNTS), { spritesheetPath: 'link.png' })
  fs.symlinkSync(path.join(root, 'secret.png'), path.join(linked, 'link.png'))
  assert.equal(readFolderPet(linked, 'installed'), undefined)
})

test('the command line: list, build, the cache, and a pet that is not there', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  petFolder(path.join(root, 'codex', 'pets'), 'mine', atlas(9, COUNTS))
  const env = {
    ...process.env,
    CODEX_HOME: path.join(root, 'codex'),
    XDG_CACHE_HOME: path.join(root, 'cache'),
    CODEX_APP_ASAR: path.join(root, 'no-such.asar'),
  }
  const run = (...args) => {
    try {
      return JSON.parse(execFileSync(process.execPath, [script, ...args], { env, encoding: 'utf8' }))
    } catch (error) {
      return JSON.parse(error.stdout)
    }
  }

  const listed = run('list')
  assert.deepEqual(
    listed.pets.map(pet => `${pet.id}:${pet.source}`),
    ['mine:installed', 'blob:bundled'],
  )
  assert.equal(listed.auto, 'mine')

  const built = run('build', 'auto')
  assert.equal(built.id, 'mine')
  assert.equal(built.isCached, false)
  assert.ok(fs.existsSync(path.join(built.dir, 'meta.json')))
  assert.equal(run('build', 'mine').isCached, true)

  assert.match(run('build', 'nope').error, /no pet named "nope"/)
  assert.equal(run('build', 'blob').id, 'blob')

  // converting again on request replaces the cache in place
  const forced = run('build', 'mine', '--force')
  assert.equal(forced.isCached, false)
  assert.equal(forced.dir, built.dir)
  assert.deepEqual(fs.readdirSync(path.join(root, 'cache', 'codex-pet-claude')).filter(name => name.startsWith('mine-')).length, 1)

  // a damaged pet that sorts first does not hide the others from auto
  const broken = petFolder(path.join(root, 'codex', 'pets'), 'aaa', Buffer.from('not an image'))
  const skipping = run('build', 'auto')
  assert.equal(skipping.id, 'mine')
  assert.match(skipping.skipped, /AAA: the spritesheet is neither a PNG nor a WebP/)
  fs.rmSync(broken, { recursive: true })

  // a pet named as the bundled one is: each keeps an id of its own
  petFolder(path.join(root, 'codex', 'pets'), 'blob', atlas(9, COUNTS))
  assert.deepEqual(
    run('list').pets.map(pet => `${pet.id}:${pet.source}`),
    ['blob:installed', 'mine:installed', 'blob@bundled:bundled'],
  )
  assert.equal(run('build', 'blob@bundled').source, 'bundled')
  assert.equal(run('build', 'blob').source, 'installed')
})

const INSTALLER = `#!/bin/sh
PET_DIR="$HOME/.codex/pets/boba"
curl -fsSL -e "$PETDEX_REFERER" -o "$PET_DIR/pet.json" 'https://assets.petdex.dev/curated/boba/petjson-v2.json'
curl -fsSL -e "$PETDEX_REFERER" -o "$PET_DIR/spritesheet.webp" 'https://assets.petdex.dev/curated/boba/sprite-v2.webp'
`

test('Petdex\'s installer is read for its two files, never run, and only petdex.dev is trusted', () => {
  assert.deepEqual(parseInstaller(INSTALLER), {
    manifest: 'https://assets.petdex.dev/curated/boba/petjson-v2.json',
    sheet: 'https://assets.petdex.dev/curated/boba/sprite-v2.webp',
  })
  // a file from anywhere else is not taken, so there is no plan at all
  assert.equal(parseInstaller(INSTALLER.replace('assets.petdex.dev/curated/boba/sprite', 'evil.example/sprite')), undefined)
  assert.equal(parseInstaller(INSTALLER.replace('assets.petdex.dev/curated/boba/sprite', 'petdex.dev.evil.example/sprite')), undefined)
  assert.equal(parseInstaller('rm -rf ~'), undefined)
})

test('install downloads a pet into the pets folder and checks what arrives', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sheet = atlas(9, COUNTS)
  const served = {
    'https://petdex.dev/install/boba': Buffer.from(INSTALLER.replaceAll('.webp', '.png')),
    'https://assets.petdex.dev/curated/boba/petjson-v2.json': Buffer.from(
      JSON.stringify({ id: 'boba', displayName: 'Boba', spritesheetPath: '../../elsewhere.webp' }),
    ),
    'https://assets.petdex.dev/curated/boba/sprite-v2.png': sheet,
  }
  const asked = []
  const get = async (url, init) => {
    asked.push([url, init.headers.referer])
    const body = served[url]

    return { ok: body !== undefined, status: body ? 200 : 404, arrayBuffer: async () => body }
  }

  const pet = await install('boba', get, root)
  assert.deepEqual([pet.id, pet.name], ['boba', 'Boba'])
  assert.deepEqual(asked[0], ['https://petdex.dev/install/boba', 'https://petdex.dev/'])
  // saved under the name it was written as, whatever the manifest claimed
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'boba', 'pet.json'), 'utf8')).spritesheetPath, 'spritesheet.png')
  assert.ok(fs.readFileSync(path.join(root, 'boba', 'spritesheet.png')).equals(sheet))
  assert.deepEqual(fs.readdirSync(root), ['boba'])

  await assert.rejects(install('nope', get, root), /petdex.dev has no pet named "nope"/)
  await assert.rejects(install('../boba', get, root), /lowercase letters, digits and dashes/)
  await assert.rejects(install('', get, root), /lowercase letters/)

  // a spritesheet that is not an image is not installed, and the old copy stays
  served['https://assets.petdex.dev/curated/boba/sprite-v2.png'] = Buffer.from('<svg/>')
  await assert.rejects(install('boba', get, root), /is not a pet/)
  assert.ok(fs.readFileSync(path.join(root, 'boba', 'spritesheet.png')).equals(sheet))
})

test('the bundled pet ships converted by this version of the script', () => {
  const folder = fileURLToPath(new URL('../pets/blob', import.meta.url))
  const shipped = JSON.parse(fs.readFileSync(path.join(folder, 'cache', 'meta.json'), 'utf8'))
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-test-'))

  try {
    convert(readFolderPet(folder, 'bundled'), out)
    assert.deepEqual(shipped, JSON.parse(fs.readFileSync(path.join(out, 'meta.json'), 'utf8')))
  } finally {
    fs.rmSync(out, { recursive: true, force: true })
  }
})
