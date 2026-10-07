import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const BAND = {
  plugin: 'codex-pet',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const STATES = ['idle', 'running-right', 'running-left', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review']

// A converted pet as scripts/pet.mjs writes one: two idle frames, and in a
// terminal 2 columns by 2 rows at full size, 1 by 1 at half.
function converted(id: string, name: string): Record<string, string> {
  const count = (state: string) => (state === 'idle' ? 2 : 1)
  const sized = (columns: number, rows: number) => ({
    columns,
    rows,
    states: Object.fromEntries(
      STATES.map(state => [state, Array.from({ length: count(state) }, (_, at) => (at === 0 ? '0.' : '.0').repeat(columns * rows * 2)),
      ]),
    ),
  })
  const files: Record<string, string> = {
    'meta.json': JSON.stringify({
      version: 7,
      id,
      name,
      source: id === 'blob' ? 'bundled' : 'installed',
      terminal: {
        palette: ['#ff0000'],
        lo: sized(2, 2),
        tiny: sized(1, 1),
        loTall: sized(3, 2),
        tinyTall: sized(2, 1),
      },
      png: { width: 192, height: 208 },
      svg: {
        width: 2,
        height: 2,
        colors: 1,
        frames: Object.fromEntries(STATES.map(state => [state, count(state)])),
      },
    }),
  }
  const frames = (state: string) => Array.from({ length: count(state) })

  for (const state of STATES) {
    files[`svg-${state}.json`] = JSON.stringify(
      frames(state).map((_, at) => `<path stroke="#ff0000" d="M${at} 0h1"/><!--${id} ${state} ${at}-->`),
    )
  }

  return files
}

const PETS: Record<string, Record<string, string>> = {
  tiny: converted('tiny', 'Tiny'),
  other: converted('other', 'Other'),
}
const BLOB = converted('blob', 'Blob')

// The world beneath the plugin: a clock, a store, the host's script and files.
function world(on: On, { hasNode = true, env = undefined as Record<string, string> | undefined, blit = undefined as string | undefined } = {}) {
  const clock = mock.clock(on)
  const toasts: string[] = []
  const runs: string[][] = []
  mock.store(on)

  if (env !== undefined) {
    mock.env(on, env)
  }

  // the terminal's answer to a repaint: taken, or refused with `blit`
  const repaints: unknown[] = []
  on('ui.blit', (_, e) => {
    repaints.push(e)

    return { value: blit === undefined ? {} : { deny: blit } } as never
  })
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', (_, e) => e as never)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.toast', (_, e) => {
    toasts.push(String((e as { text?: string }).text ?? e))

    return { value: undefined } as never
  })
  on('process.run', (_, e) => {
    if (!hasNode) {
      throw new Error('spawn ENOENT')
    }

    runs.push(e.argv.slice(2))
    const [verb, wanted = 'auto'] = e.argv.slice(2)
    const id = wanted === 'auto' ? 'tiny' : wanted
    const answer =
      verb === 'list'
        ? { pets: [{ id: 'tiny', name: 'Tiny', source: 'installed' }], auto: 'tiny' }
        : PETS[id] === undefined
          ? { error: `no pet named "${id}"` }
          : { dir: `/cache/${id}`, id }

    return {
      value: {
        exitCode: 'error' in answer ? 1 : 0,
        stdout: JSON.stringify(answer) + '\n',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    } as never
  })
  on('fs.read', (_, e) => {
    const name = e.path.split('/').pop() ?? ''
    const cached = /^\/cache\/([^/]+)\//.exec(e.path)
    const files = cached ? PETS[cached[1] ?? ''] : e.path.includes('/pets/blob/cache/') ? BLOB : undefined
    const text = files?.[name]

    if (text === undefined) {
      throw new Error('ENOENT')
    }

    return { value: text } as never
  })

  // the pet loads behind the session's start: let that finish
  const start = async ($: Engine) => {
    await $.session.start({ cwd: '/tmp' } as never)
    await clock.advance(0)
  }

  return { clock, toasts, runs, repaints, start }
}

async function labelOn($: Engine) {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const label = (await ui.find({ type: 'Text', text: /idle|working|review|done|failed|needs you|hi!/ }))?.text.trim()
  await ui.unmount()

  return label
}

async function sourceOn($: Engine) {
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })
  await ui.unmount()

  return svg === undefined ? undefined : String(svg.props.source)
}

test('terminal blocks: the loaded pet as a Raster', { options: { terminalStyle: 'blocks' } }, async ($, on) => {
  const { start } = world(on)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const pet = await ui.find({ type: 'Raster', key: 'pet' })

  expect(pet?.props.columns).toBe(2)
  expect(pet?.props.rows).toBe(2)
  expect(await ui.find({ type: 'Text', text: 'Tiny' })).toBeDefined()
  await ui.unmount()
})

test('terminal blocks: a short terminal gets the half-size pet; a shorter one the label', { options: { terminalStyle: 'blocks' } }, async ($, on) => {
  const { start } = world(on)
  await start($)
  const drawn = async (maxRows: number) => {
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows }, surface: 'terminal' })
    const pet = await ui.find({ type: 'Raster', key: 'pet' })
    const label = await ui.find({ type: 'Text', text: /Tiny: / })
    await ui.unmount()

    return pet === undefined ? (label === undefined ? 'nothing' : 'label') : `${pet.props.columns}x${pet.props.rows}`
  }

  // the fixture's full size is 2 columns by 2 rows, its half size 1 by 1
  expect(await drawn(2)).toBe('2x2')
  expect(await drawn(1)).toBe('1x1')
  expect(await drawn(0)).toBe('label')
})

test('a plain terminal draws the pet as a face in its own color, one row, and moves it', async ($, on) => {
  const { clock, start } = world(on)
  await start($)
  await clock.advance(2_500)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const face = await ui.find({ type: 'Text', text: '(•‿•)' })

  expect(face?.props.color).toBe('#ff0000')
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: / Tiny/ })).toBeDefined()

  // a blink is the last of its idle frames
  await clock.advance(160 * 3)
  expect(await ui.find({ type: 'Text', text: '(-‿-)' })).toBeDefined()
  await ui.unmount()

  await $.turn.start({ text: 'hi', turnId: 't1' })
  const working = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await working.find({ type: 'Text', text: /^. \(•_•\)$/ })).toBeDefined()
  await working.unmount()
})

test('a terminal that shows images gets the pet as a picture, in fewer rows', async ($, on) => {
  const { clock, repaints, start } = world(on, { env: { TERM: 'xterm-kitty' } })
  await start($)
  await clock.advance(2_500)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const picture = await ui.find({ type: 'Image', key: 'pet' })

  expect(picture?.props.source).toEqual({ file: '/cache/tiny/png-idle-0.png', format: 'png' })
  expect(picture?.props.rows).toBe(6)
  expect(picture?.props.columns).toBe(11)
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()

  // the frames after it are swapped in by name, no pixel passing through
  await clock.advance(160)
  expect(repaints.at(-1)).toMatchObject({ key: 'pet', source: { file: '/cache/tiny/png-idle-1.png', format: 'png' } })
  await ui.unmount()
})

test('a terminal that turns out not to show the picture gets the face instead', async ($, on) => {
  const { clock, start } = world(on, { env: { TERM: 'xterm-kitty' }, blit: 'the Image draws its alt here' })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Image' })).toBeDefined()

  await clock.advance(1_160)
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /\(.‿.\)/ })).toBeDefined()
  await ui.unmount()
})

test('no picture through tmux', async ($, on) => {
  const { start } = world(on, { env: { TERM: 'xterm-kitty', TMUX: '/tmp/tmux-1/default,1,0' } })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /\(.‿.\)/ })).toBeDefined()
  await ui.unmount()
})

test('the desktop band draws one frame as a plain image and steps to the next', async ($, on) => {
  const { clock, start } = world(on)
  await start($)
  await clock.advance(2_500) // the wave at the start is over: idle

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const first = await ui.find({ type: 'Svg' })

  expect(String(first?.props.source)).toContain('viewBox="0 0 2 2"')
  expect(String(first?.props.source)).toContain('tiny idle 0')
  expect(first?.props.isInteractive).toBeUndefined()
  expect(first?.props.height).toBe(104)

  await clock.advance(160)
  const second = await ui.find({ type: 'Svg' })

  expect(String(second?.props.source)).toContain('tiny idle 1')
  await ui.unmount()
})

test('calm: an idle pet plays through, then rests without redrawing', async ($, on) => {
  const { clock, start } = world(on)
  await start($)
  await clock.advance(2_500)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await clock.advance(160 * 6) // past its two frames, into the rest
  const resting = String((await ui.find({ type: 'Svg' }))?.props.source)

  expect(resting).toContain('tiny idle 0')

  for (let at = 0; at < 10; at += 1) {
    await clock.advance(160)
    expect(String((await ui.find({ type: 'Svg' }))?.props.source)).toBe(resting)
  }

  await ui.unmount()
})

test('options: tall cells draw the pet wider', { options: { terminalCells: 'tall', terminalStyle: 'blocks' } }, async ($, on) => {
  const { start } = world(on)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const pet = await ui.find({ type: 'Raster', key: 'pet' })

  expect([pet?.props.columns, pet?.props.rows]).toEqual([3, 2])
  await ui.unmount()
})

test('options: the pet stands where the setting says', { options: { align: 'center' } }, async ($, on) => {
  const { start } = world(on)
  await start($)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const row = await ui.find({ type: 'Box' })

    expect(row?.props.justifyContent).toBe('center')
    expect(row?.props.width).toBe('100%')
    await ui.unmount()
  }
})

test('options: no label, and a larger pet', { options: { label: false, size: 'large' } }, async ($, on) => {
  const { clock, start } = world(on)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await clock.advance(320)

  expect((await ui.find({ type: 'Svg' }))?.props.height).toBe(156)
  expect(await ui.find({ type: 'Text' })).toBeUndefined()
  await ui.unmount()
})

test('without Node the bundled pet is shown, and the reason said once', async ($, on) => {
  const { toasts, start } = world(on, { hasNode: false })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: 'Blob' })).toBeDefined()
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('Node.js was not found')
  await ui.unmount()

  await start($)
  expect(toasts.length).toBe(1)
})

test('/pet use switches pets and remembers; an unknown id keeps the current one', async ($, on) => {
  const { start } = world(on)
  await start($)

  const missing = await $.command.run({ command: 'pet', args: 'use nope' } as never)
  expect(missing.text).toContain('no pet named "nope"')
  expect(missing.text).toContain('Still showing Tiny')

  const switched = await $.command.run({ command: 'pet', args: 'use other' } as never)
  expect(switched.text).toBe('Showing Other.')

  // the next session starts on the remembered pet
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Other' })).toBeDefined()
  await ui.unmount()

  const listed = await $.command.run({ command: 'pet', args: 'list' } as never)
  expect(listed.text).toContain('tiny')
})

test('a slash command is not a turn: the pet stays idle while the band says working', async ($, on) => {
  const { clock, start } = world(on)
  await start($)
  await clock.advance(2_500)
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, isWorking: true }, surface: 'terminal' })
  await clock.advance(3_000)

  expect(await ui.find({ type: 'Text', text: 'idle' })).toBeDefined()
  await ui.unmount()
})

test('/pet previews a mood, hides and shows the pet', async ($, on) => {
  const { start } = world(on)
  await start($)
  await $.command.run({ command: 'pet', args: 'review' } as never)
  expect(await labelOn($)).toBe('ready for review')

  const hidden = await $.command.run({ command: 'pet', args: 'hide' } as never)
  expect(hidden.text).toContain('hidden')

  const shown = await $.command.run({ command: 'pet', args: 'show' } as never)
  expect(shown.text).toContain('back')
  expect(await labelOn($)).toBe('ready for review')
})

test('a turn that answers: working, a jump, ready for review, idle', async ($, on) => {
  const { clock, start } = world(on)
  await start($)

  await $.turn.start({ text: 'hi', turnId: 't1' })
  expect(await labelOn($)).toBe('working…')

  // a subagent's turn ending changes nothing
  await $.turn.complete({ turnId: 't2', agentId: 'a1', reason: 'answer', answer: '' } as never)
  expect(await labelOn($)).toBe('working…')

  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: '' } as never)
  expect(await labelOn($)).toBe('done!')

  await clock.advance(800)
  expect(await labelOn($)).toBe('ready for review')

  await clock.advance(20_000)
  expect(await labelOn($)).toBe('idle')
})

test('a turn that errors shows failed; an interrupted one goes idle', async ($, on) => {
  const { clock, start } = world(on)
  await start($)

  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.complete({ turnId: 't1', reason: 'error', answer: '' } as never)
  expect(await labelOn($)).toBe('that failed')
  await clock.advance(6_000)
  expect(await labelOn($)).toBe('idle')

  await $.turn.start({ text: 'hi', turnId: 't2' })
  await $.turn.complete({ turnId: 't2', reason: 'aborted', answer: '' } as never)
  expect(await labelOn($)).toBe('idle')
})

test('agents left in flight keep the pet working until they end; a shell does not', async ($, on) => {
  const { clock, start } = world(on)
  on('classic.Stop', () => ({}) as never)
  await start($)

  // a dev server in the background is not the pet at work
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: '' } as never)
  await $.classic.Stop({
    background_tasks: [{ id: 'b1', type: 'shell', status: 'running', description: 'dev server' }],
  } as never)
  expect(await labelOn($)).toBe('done!')

  // an agent is: the stop that names it may come after the turn's end
  await $.turn.start({ text: 'hi', turnId: 't2' })
  await $.turn.complete({ turnId: 't2', reason: 'answer', answer: '' } as never)
  await $.classic.Stop({
    background_tasks: [{ id: 'a1', type: 'agent', status: 'running', description: 'explore', agent_type: 'Explore' }],
  } as never)
  expect(await labelOn($)).toBe('working…')

  // the jump the turn's end began does not come back over it
  await clock.advance(1_000)
  expect(await labelOn($)).toBe('working…')

  await $.turn.complete({ turnId: 't3', agentId: 'a1', reason: 'answer', answer: '' } as never)
  expect(await labelOn($)).toBe('idle')
})

// A tool.call beneath the plugin that answers when the test lets it.
function heldCalls(on: On) {
  const release = new Map<string, (isError: boolean) => void>()
  on('tool.call', (_, e) =>
    new Promise(resolve => {
      release.set(e.tool_use_id, isError => resolve({ result: {}, isError } as never))
    }),
  )

  return (id: string, isError = false) => release.get(id)?.(isError)
}

test('a question is waiting until it is answered, whatever else returns meanwhile', async ($, on) => {
  const { start } = world(on)
  const finish = heldCalls(on)
  await start($)
  await $.turn.start({ text: 'hi', turnId: 't1' })

  const question = $.tool.call({ tool: 'AskUserQuestion', tool_use_id: 'q1', questions: [] } as never)
  const read = $.tool.call({ tool: 'Read', tool_use_id: 'r1', file_path: '/a' } as never)
  const failing = $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'false' } as never)
  expect(await labelOn($)).toBe('needs you')

  // another call ending, cleanly or not, is not the answer
  finish('r1')
  await read
  expect(await labelOn($)).toBe('needs you')
  finish('b1', true)
  await failing
  expect(await labelOn($)).toBe('needs you')

  finish('q1')
  await question
  expect(await labelOn($)).toBe('working…')
})

test('a permission asked: waiting until that tool returns; a refusal is no failure', async ($, on) => {
  const { start } = world(on)
  const finish = heldCalls(on)
  on('classic.PermissionRequest', () => ({}) as never)
  on('classic.PermissionDenied', () => ({}) as never)
  await start($)
  await $.turn.start({ text: 'hi', turnId: 't1' })

  const bash = $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'make' } as never)
  const read = $.tool.call({ tool: 'Read', tool_use_id: 'r1', file_path: '/a' } as never)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} } as never)
  expect(await labelOn($)).toBe('needs you')

  finish('r1')
  await read
  expect(await labelOn($)).toBe('needs you')

  finish('b1')
  await bash
  expect(await labelOn($)).toBe('working…')

  // refused at the dialog: the call errors, and the pet does not call it a failure
  const again = $.tool.call({ tool: 'Bash', tool_use_id: 'b2', command: 'rm -rf x' } as never)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} } as never)
  await $.classic.PermissionDenied({ tool_name: 'Bash', tool_input: {} } as never)
  expect(await labelOn($)).toBe('working…')
  finish('b2', true)
  await again
  expect(await labelOn($)).toBe('working…')
})

test('a failing call shows failed while its turn runs, not after an interrupt', async ($, on) => {
  const { clock, start } = world(on)
  const finish = heldCalls(on)
  await start($)

  await $.turn.start({ text: 'hi', turnId: 't1' })
  const first = $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'false' } as never)
  await clock.advance(0)
  finish('b1', true)
  await first
  expect(await labelOn($)).toBe('that failed')
  await clock.advance(2_500)
  expect(await labelOn($)).toBe('working…')

  // Esc: the turn ends first, then the call it cut resolves as an error
  const cut = $.tool.call({ tool: 'Bash', tool_use_id: 'b2', command: 'sleep 99' } as never)
  await clock.advance(0)
  await $.turn.complete({ turnId: 't1', reason: 'aborted', answer: '' } as never)
  finish('b2', true)
  await cut
  expect(await labelOn($)).toBe('idle')
})

test('on the terminal, the pill of the call that was asked ends the wait; another call\'s does not', async ($, on) => {
  const { clock, start } = world(on)
  const finish = heldCalls(on)
  on('classic.PermissionRequest', () => ({}) as never)
  on('ui.render', { component: 'ToolProgress' }, (engine, e) => engine.ui.resolve(e).Text({ children: e.props.hint }))
  await start($)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const pill = (id: string) =>
    $.ui.mount({
      plugin: 'codex-pet',
      surface: 'terminal',
      component: 'ToolProgress',
      props: { tool_use_id: id, kind: 'background_hint', hint: '(ctrl+b to run in background)' },
    })

  const bash = $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'make' } as never)
  const fetch = $.tool.call({ tool: 'WebFetch', tool_use_id: 'w1', url: 'https://example.com' } as never)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} } as never)
  expect(await labelOn($)).toBe('needs you')

  const other = await pill('w1')
  await clock.advance(1_000)
  expect(await labelOn($)).toBe('needs you')

  const asked = await pill('b1')
  await clock.advance(1_000)
  expect(await labelOn($)).toBe('working…')

  await other.unmount()
  await asked.unmount()
  finish('b1')
  finish('w1')
  await Promise.all([bash, fetch])
})

test('/pet use takes no flag for an id; /pet refresh converts again', async ($, on) => {
  const { runs, start } = world(on)
  await start($)

  const flagged = await $.command.run({ command: 'pet', args: 'use --force' } as never)
  expect(flagged.text).toContain('Usage:')

  await $.command.run({ command: 'pet', args: 'refresh' } as never)
  expect(runs.at(-1)).toEqual(['build', 'auto', '--force'])
})
