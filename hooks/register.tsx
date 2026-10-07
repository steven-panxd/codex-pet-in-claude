import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Mood } from '../types'
import { FACES, LABEL, MOODS, cellsOf, faceOf, frameCount, imageOf, isMood, petOf, stateOf, svgOf } from './draw'
import type { Pet, TerminalSize } from './draw'

const FRAME_MS = 160
// the timer's period while nothing moves: a hidden band, a resting pet
const REST_MS = 1_000
// calm: a pet that is idle, waiting or up for review plays its frames
// through, then holds the first this long, so a quiet session draws little
const CALM_REST_MS = 8_000
const CALM_MOODS: ReadonlySet<Mood> = new Set<Mood>(['idle', 'waiting', 'review'])
const REVIEW_MS = 20_000
const FLASH_MS = 2_500
const FAILED_MS = 6_000
const JUMP_MS = 5 * FRAME_MS // the jump's five frames, once through
// how long background agents a turn left behind may keep the pet at work
// with no word of them: one that ends unseen must not pin it there
const AGENTS_CAP_MS = 15 * 60_000
const DESKTOP_HEIGHT = { small: 72, medium: 104, large: 156 } // CSS pixels
// a terminal that shows images: rows the picture takes, and the fewest worth drawing
const IMAGE_ROWS = { small: 4, medium: 6, large: 9 }
const IMAGE_MIN_ROWS = 3
const JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' } as const
// what may run scripts/pet.mjs, in the order tried: an app started from the
// dock has a short PATH, so the usual homes of node are named too
const RUNNERS = [['node'], ['bun'], ['/opt/homebrew/bin/node'], ['/usr/local/bin/node']]
const SCRIPT_TIMEOUT_MS = 60_000
const SHELL_TIMEOUT_MS = 20_000
const STORE_PET = 'pet' // the id /pet use chose, across sessions
const STORE_WARNED = 'warned' // the last problem toasted, so it is said once
const STORE_RUNNER = 'runner' // the command that ran the script last time

const mood = atom({ plugin: 'codex-pet', key: 'mood' } as const, 'idle')
const isHidden = atom({ plugin: 'codex-pet', key: 'isHidden' } as const, false)
const step = atom({ plugin: 'codex-pet', key: 'step' } as const, 0)
const loads = atom({ plugin: 'codex-pet', key: 'loads' } as const, 0)

type Settings = {
  pet: string
  size: keyof typeof DESKTOP_HEIGHT
  animation: 'lively' | 'calm' | 'still'
  hasLabel: boolean
  /** In a terminal: the pet's picture where it can be shown and a face elsewhere, or one of them always, or blocks of color. */
  style: 'auto' | 'picture' | 'face' | 'blocks'
  align: keyof typeof JUSTIFY
  hasTallCells: boolean
}

// What scripts/pet.mjs prints: one line of JSON, an `error` when it failed.
type ScriptAnswer = {
  error?: string
  dir?: string
  id?: string
  name?: string
  /** A pet `auto` passed over because it would not convert, and why. */
  skipped?: string
  pets?: { id: string; name: string; source: string }[]
  auto?: string
}

const SOURCE: Record<string, string> = {
  installed: 'installed in ~/.codex/pets',
  'codex-app': 'from the Codex app',
  bundled: 'bundled',
}

// The module's own state: lost on a reload, which loads the pet again.
let settings: Settings = { pet: 'auto', size: 'medium', animation: 'calm', hasLabel: true, style: 'auto', align: 'center', hasTallCells: false }
let pet: Pet | undefined
let runner: string[] | undefined
// the session's pet being loaded: a command typed at once waits on it
let booting: Promise<void> | undefined

// What the session's events say. The main loop's turn is running; agents its
// last stop left in flight; and what waits on the person: the calls that are
// a question to them, the tools a permission dialog is open for, and the
// inputs an MCP server asked for.
let isTurnRunning = false
let agentsInFlight = 0
let agentsCap: Timer | undefined
const questions = new Set<string>()
const permissions: string[] = []
let elicitations = 0
// tool calls in flight, by id: which tool each is
const calls = new Map<string, string>()
// tools the person just refused at the dialog: their error is no failure
const refused: string[] = []
// calls whose run-in-background pill the terminal drew, a sign the call is
// past its dialog; the timer settles them, since a render hook writes nothing
const pilled = new Set<string>()
const started: string[] = []

// The mood the events have asked for; the band draws the `mood` atom, which
// follows it. Only `show` writes it.
let target: Mood = 'idle'
let generation = 0
let revert: Timer | undefined

// What the band last drew, for the frame timer.
let bandId: string | undefined
// undefined until the band is first drawn: until then the desktop's frames
// are read too, so its first drawing has them
let isOnDesktop: boolean | undefined
let terminalSize: TerminalSize = 'lo'
// whether this terminal shows images (the kitty graphics protocol), as far as
// its environment says; and what the band drew last, a picture or half blocks
let hasImages = false
let isImageDrawn = false
// the band drew the pet as a face of characters, redrawn a frame at a time
let isFaceDrawn = false
// the picture drawn has not been repainted yet: the first repaint says
// whether the terminal took it or drew its text in its place
let isImageUnproven = false
let ticks = 0
let frame = 0
let restedMs = 0
let timer: Timer | undefined
let isTicking = false
const cells = new Map<string, string>()

function removeOne(list: string[], item: string): boolean {
  const at = list.indexOf(item)

  if (at >= 0) {
    list.splice(at, 1)
  }

  return at >= 0
}

// The mood with nothing passing over it: waiting on the person comes first.
function baseMood(): Mood {
  if (questions.size > 0 || permissions.length > 0 || elicitations > 0) {
    return 'waiting'
  }

  return isTurnRunning || agentsInFlight > 0 ? 'running' : 'idle'
}

function isBase(one: Mood): boolean {
  return one === 'idle' || one === 'running' || one === 'waiting'
}

// The frame timer, one period from now: after a change, and after each tick.
function wake($: EngineInterface, delay = FRAME_MS): void {
  timer?.cancel()
  timer = $.clock.after(delay, () => void tick($))
}

// Shows `to`. Given `after`, it then moves on to `then`, or to the base mood
// as it stands by then; a `review` goes back to the base in its own time.
async function show($: EngineInterface, to: Mood, after?: number, then?: Mood): Promise<void> {
  generation += 1
  const mine = generation
  revert?.cancel()
  // armed before anything is awaited, so a later `show` cancels it
  const wait = after ?? (to === 'review' ? REVIEW_MS : undefined)
  revert = wait === undefined ? undefined : $.clock.after(wait, () => void show($, then ?? baseMood()))
  target = to
  ticks = 0
  frame = 0
  restedMs = 0

  if (isOnDesktop !== false) {
    await ensurePaths($, to)
  }

  // a later `show` came in meanwhile: this one is not what is wanted now
  if (mine !== generation) {
    return
  }

  await update($, mood, () => to)
  wake($)
}

// The facts changed: shows the base mood, unless something passing (a jump,
// a failure, the review) is on, which ends in the base mood by itself. A wait
// on the person is never held back.
async function settle($: EngineInterface): Promise<void> {
  const base = baseMood()

  if (base !== target && (base === 'waiting' || isBase(target))) {
    await show($, base)
  }
}

async function runScript($: EngineInterface, args: readonly string[]): Promise<ScriptAnswer> {
  const script = `${$.plugin.root}/scripts/pet.mjs`

  if (runner === undefined) {
    const stored = await $.store.get(STORE_RUNNER).catch(() => undefined)
    runner = Array.isArray(stored) && stored.every(part => typeof part === 'string') ? stored : undefined
  }

  // last, the person's own shell as they log in: a node a version manager
  // put on the PATH is found there and nowhere else (fish takes no "$@")
  const shell = await $.env.get('SHELL').catch(() => undefined)
  const viaShell =
    shell === undefined || shell === '' || shell.endsWith('fish') ? [] : [[shell, '-lic', 'exec node "$0" "$@"']]
  const known = runner === undefined ? [] : [runner]

  for (const command of [...known, ...RUNNERS, ...viaShell]) {
    try {
      const ran = await $.process.run([...command, script, ...args], {
        timeoutMs: command.length > 1 ? SHELL_TIMEOUT_MS : SCRIPT_TIMEOUT_MS,
      })
      const answer: ScriptAnswer = JSON.parse(ran.stdout.trim().split('\n').pop() ?? '')

      if (runner?.join(' ') !== command.join(' ')) {
        runner = command
        await $.store.set(STORE_RUNNER, command).catch(() => undefined)
      }

      return answer
    } catch {
      // not installed here, or it printed no answer: try the next
    }
  }

  runner = undefined

  return { error: 'Node.js was not found, and reading a Codex pet needs it' }
}

async function readPet($: EngineInterface, dir: string): Promise<Pet | undefined> {
  try {
    return petOf(await $.fs.read(`${dir}/meta.json`), dir)
  } catch {
    return undefined
  }
}

// Reads the mood's desktop frames once; a state that cannot be read is left
// empty, so the band draws the label alone rather than asking again.
async function ensurePaths($: EngineInterface, of: Mood): Promise<void> {
  const current = pet

  if (current === undefined) {
    return
  }

  const state = stateOf(current, of)

  if (current.paths.has(state)) {
    return
  }

  let frames: string[] = []

  try {
    const parsed: unknown = JSON.parse(await $.fs.read(`${current.dir}/svg-${state}.json`))
    frames = Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    // gone from the cache: the label alone is drawn until /pet refresh
  }

  current.paths.set(state, frames)
}

// Loads the pet `wanted` names, converting it first when it is not cached.
// Answers what went wrong, if anything; with `orBundled`, a pet that cannot
// be loaded is replaced by the bundled one, and otherwise the current stays.
async function loadPet(
  $: EngineInterface,
  wanted: string,
  { orBundled, isForced = false }: { orBundled: boolean; isForced?: boolean },
): Promise<string | undefined> {
  const built = await runScript($, ['build', wanted, ...(isForced ? ['--force'] : [])])
  const converted = built.dir === undefined ? undefined : await readPet($, built.dir)
  const problem =
    converted === undefined
      ? (built.error ?? 'the converted pet could not be read')
      : built.skipped === undefined
        ? undefined
        : `skipped ${built.skipped}`
  const loaded = converted ?? (orBundled ? await readPet($, `${$.plugin.root}/pets/blob/cache`) : undefined)

  if (loaded !== undefined) {
    pet = loaded
    cells.clear()
    ticks = 0
    frame = 0

    if (isOnDesktop !== false) {
      await ensurePaths($, target)
    }

    await update($, loads, n => n + 1)
    wake($)
  }

  return problem
}

// Whether the terminal the session runs in shows images: kitty and Ghostty
// do, by their own word in the environment. Not through tmux, which passes
// none on, nor over ssh, where the terminal cannot read this machine's files.
async function detectImages($: EngineInterface): Promise<boolean> {
  if (settings.style !== 'auto') {
    return settings.style === 'picture'
  }

  const [term, program, kitty, ghostty, tmux, ssh] = await Promise.all([
    $.env.get('TERM').catch(() => undefined),
    $.env.get('TERM_PROGRAM').catch(() => undefined),
    $.env.get('KITTY_WINDOW_ID').catch(() => undefined),
    $.env.get('GHOSTTY_RESOURCES_DIR').catch(() => undefined),
    $.env.get('TMUX').catch(() => undefined),
    $.env.get('SSH_CONNECTION').catch(() => undefined),
  ])
  const isCapable = term === 'xterm-kitty' || term === 'xterm-ghostty' || program === 'ghostty' || !!kitty || !!ghostty

  return isCapable && !tmux && !ssh
}

async function chosenPet($: EngineInterface): Promise<string> {
  const stored = await $.store.get(STORE_PET).catch(() => undefined)

  return typeof stored === 'string' && stored !== '' ? stored : settings.pet
}

// Says a problem once, not at every session's start.
async function report($: EngineInterface, problem: string | undefined): Promise<void> {
  try {
    const last = await $.store.get(STORE_WARNED)

    if (problem === undefined) {
      if (last !== undefined) {
        await $.store.delete(STORE_WARNED)
      }

      return
    }

    if (last === problem) {
      return
    }

    await $.store.set(STORE_WARNED, problem)
  } catch {
    // no store: say it anyway
  }

  if (problem !== undefined) {
    $.ui.toast(`Codex Pet: ${problem}. Showing ${pet?.name ?? 'no pet'}; /pet list names the pets found.`, {
      timeoutMs: 10_000,
    })
  }
}

// The session's pet, loaded behind the session's start rather than in it:
// a first conversion, or a slow shell, holds nothing up.
async function boot($: EngineInterface): Promise<void> {
  try {
    hasImages = await detectImages($)
    await report($, await loadPet($, await chosenPet($), { orBundled: true }))
  } catch {
    // no pet this session: the band draws nothing
  }
}

async function paint($: EngineInterface, current: Pet): Promise<void> {
  if (isOnDesktop === true) {
    await update($, step, n => (n + 1) % 1_000_000)
  } else if (bandId !== undefined && isImageDrawn) {
    const answer = await $.ui.blit({ requestId: bandId, key: 'pet', source: imageOf(current, target, frame) })
    isImageUnproven = false

    // the terminal drew the picture's text in its place: no pictures from here on
    if (answer.deny !== undefined) {
      hasImages = false
      await update($, loads, n => n + 1)
    }
  } else if (bandId !== undefined && isFaceDrawn) {
    await update($, step, n => (n + 1) % 1_000_000)
  } else if (bandId !== undefined) {
    const key = `${terminalSize}:${target}:${frame}`
    const packed = cells.get(key) ?? cellsOf(current, terminalSize, target, frame)
    cells.set(key, packed)
    await $.ui.blit({ requestId: bandId, key: 'pet', cells: packed })
  }
}

// One period of the frame timer. Answers how long until the next.
async function advance($: EngineInterface): Promise<number> {
  // a call whose pill appeared is running: its permission dialog is behind it
  while (started.length > 0) {
    const tool = calls.get(started.shift() ?? '')

    if (tool !== undefined && removeOne(permissions, tool)) {
      await settle($)
    }
  }

  const current = pet

  if (current === undefined || (isOnDesktop !== true && bandId === undefined)) {
    return REST_MS
  }

  // the desktop drew before this mood's frames were read: read, then redraw
  if (isOnDesktop === true && !current.paths.has(stateOf(current, target))) {
    await ensurePaths($, target)
    await paint($, current)

    return FRAME_MS
  }

  // a picture just drawn is repainted once, moving or not, to hear whether
  // the terminal took it
  if (isImageDrawn && isImageUnproven) {
    await paint($, current)
  }

  const count = isFaceDrawn ? FACES[target].length : frameCount(current, target)

  if (settings.animation === 'still' || count <= 1) {
    return REST_MS
  }

  // calm: once through, then the first frame held a while
  if (settings.animation === 'calm' && CALM_MOODS.has(target) && ticks >= count) {
    restedMs += REST_MS

    if (restedMs >= CALM_REST_MS) {
      ticks = 0
      restedMs = 0
    }

    return REST_MS
  }

  ticks += 1
  const due = ticks % count

  if (due !== frame) {
    frame = due
    await paint($, current)
  }

  return FRAME_MS
}

async function tick($: EngineInterface): Promise<void> {
  // this period's timer has fired: whoever finishes arms the next
  timer = undefined

  if (isTicking) {
    return
  }

  isTicking = true
  let delay = REST_MS

  try {
    delay = await advance($)
  } catch {
    // a band gone between the tick and the paint is no fault
  } finally {
    isTicking = false
  }

  // unless a change woke the timer meanwhile
  if (timer === undefined) {
    wake($, delay)
  }
}

async function listPets($: EngineInterface): Promise<string> {
  const answer = await runScript($, ['list'])

  if (answer.pets === undefined) {
    return `Could not list pets: ${answer.error ?? 'the script printed nothing'}.`
  }

  const rows = answer.pets.map(one => {
    const mark = one.id === pet?.id ? '>' : ' '

    return `${mark} ${one.id.padEnd(16)} ${one.name.padEnd(24)} ${SOURCE[one.source] ?? one.source}`
  })

  // fenced: a command's text is drawn as markdown, which would reflow the columns
  return [
    'Pets found (`>` is showing). `/pet use <id>` switches; `/pet use auto` follows the setting.',
    '```',
    ...rows,
    '```',
    `auto would pick: ${answer.auto ?? 'none'}`,
  ].join('\n')
}

function showing(problem: string | undefined, isKept = false): string {
  const name = pet?.name ?? 'no pet'

  return problem === undefined ? `Showing ${name}.` : `${problem}. ${isKept ? 'Still showing' : 'Showing'} ${name}.`
}

async function usePet($: EngineInterface, wanted: string): Promise<string> {
  if (wanted.startsWith('-')) {
    return usage()
  }

  if (wanted === 'auto') {
    await $.store.delete(STORE_PET).catch(() => undefined)

    return showing(await loadPet($, settings.pet, { orBundled: true }))
  }

  const problem = await loadPet($, wanted, { orBundled: false })

  if (problem !== undefined) {
    return showing(problem, true)
  }

  // the id as the script knows it, whatever case it was typed in
  await $.store.set(STORE_PET, pet?.id ?? wanted).catch(() => undefined)

  return showing(undefined)
}

// Downloads a pet from petdex.dev by its name there, or its page's address,
// then shows it. The script does the fetching and checks what arrives.
async function installPet($: EngineInterface, wanted: string): Promise<string> {
  const slug = wanted
    .replace(/^https?:\/\/(www\.)?petdex\.dev\/([a-z-]+\/)?pets\//, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase()
  const installed = await runScript($, ['install', slug])

  if (installed.id === undefined) {
    return showing(installed.error ?? 'the pet could not be installed', true)
  }

  const shown = await usePet($, installed.id)

  return `Installed ${installed.name ?? installed.id} from petdex.dev into ~/.codex/pets. ${shown}`
}

function usage(): string {
  const now = pet === undefined ? 'No pet is loaded.' : `Showing ${pet.name} (${SOURCE[pet.source] ?? pet.source}): ${LABEL[target]}`

  return [
    now,
    '',
    'Usage: `/pet list` | `use <id|auto>` | `install <name on petdex.dev>` | `refresh` | `hide` | `show` | `<mood>`',
    '',
    `Moods to preview: ${MOODS.join(', ')}`,
  ].join('\n')
}

export const register: Register = (on, options) => {
  settings = {
    pet: typeof options.pet === 'string' && options.pet !== '' ? options.pet : 'auto',
    size: options.size === 'small' || options.size === 'large' ? options.size : 'medium',
    animation: options.animation === 'lively' || options.animation === 'still' ? options.animation : 'calm',
    hasLabel: options.label !== false,
    style:
      options.terminalStyle === 'picture' || options.terminalStyle === 'face' || options.terminalStyle === 'blocks'
        ? options.terminalStyle
        : 'auto',
    align: options.align === 'left' || options.align === 'right' ? options.align : 'center',
    hasTallCells: options.terminalCells === 'tall',
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pet',
      description: 'Your Codex pet: /pet list | use <id|auto> | install <name> | refresh | hide | show | <mood>',
    })

    booting = boot($)
    void show($, 'waving', FLASH_MS)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    isTurnRunning = true
    // nothing of the last turn is still asked of the person
    questions.clear()
    permissions.length = 0
    refused.length = 0
    elicitations = 0
    await show($, 'running')

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // a subagent's run ends in a turn.complete too: one fewer in flight
    if (e.agentId !== undefined) {
      if (agentsInFlight > 0) {
        agentsInFlight -= 1
        await settle($)
      }

      return next(e)
    }

    isTurnRunning = false
    questions.clear()
    permissions.length = 0
    elicitations = 0

    if (e.reason === 'aborted') {
      await show($, baseMood())
    } else if (e.reason !== 'answer') {
      await show($, 'failed', FAILED_MS)
    } else if (agentsInFlight > 0) {
      await show($, 'running')
    } else {
      await show($, 'jumping', JUMP_MS, 'review')
    }

    return next(e)
  })

  // The main loop's stop says what is still in flight behind it; it may come
  // before or after turn.complete, so both settle on the same count. Agents
  // count, shells do not: a dev server left running is not the pet at work.
  on('classic.Stop', async ($, e, next) => {
    agentsInFlight = (e.background_tasks ?? []).filter(
      task => task.agent_type !== undefined || /agent/i.test(task.type),
    ).length
    agentsCap?.cancel()
    agentsCap = undefined

    if (agentsInFlight > 0) {
      agentsCap = $.clock.after(AGENTS_CAP_MS, () => {
        agentsInFlight = 0
        void settle($)
      })

      if (!isTurnRunning && target !== 'failed') {
        await show($, 'running')
      }
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.PermissionRequest', async ($, e, next) => {
    permissions.push(e.tool_name)
    await settle($)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.PermissionDenied', async ($, e, next) => {
    removeOne(permissions, e.tool_name)
    refused.push(e.tool_name)
    await settle($)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.Elicitation', async ($, e, next) => {
    elicitations += 1
    await settle($)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.ElicitationResult', async ($, e, next) => {
    elicitations = Math.max(0, elicitations - 1)
    await settle($)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const id = e.tool_use_id
    // these two tools are the model waiting on the person
    const isQuestion = tool === 'AskUserQuestion' || tool === 'ExitPlanMode'
    calls.set(id, tool)

    if (isQuestion) {
      questions.add(id)
      await settle($)
    }

    const ran = await next(e)
    // this call is over, and with it whatever of it waited on the person
    calls.delete(id)
    pilled.delete(id)
    questions.delete(id)
    removeOne(permissions, tool)
    const wasRefused = removeOne(refused, tool)
    const hasFailed = ran.deny === undefined && ran.isError === true
    // not a failure worth showing: the person said no, or the turn it ran
    // in was interrupted, or the pet is waiting on the person for another
    const isWorthShowing = !wasRefused && (isTurnRunning || e.agentId !== undefined) && baseMood() !== 'waiting'

    if (hasFailed && isWorthShowing) {
      await show($, 'failed', FLASH_MS)
    } else {
      await settle($)
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'pet' }, async ($, e) => {
    await booting
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = rest.join(' ')

    if (verb === 'list') {
      return { text: await listPets($) }
    }

    if (verb === 'use' && arg !== '') {
      return { text: await usePet($, arg) }
    }

    if (verb === 'install' && arg !== '') {
      return { text: await installPet($, arg) }
    }

    if (verb === 'refresh') {
      return { text: showing(await loadPet($, await chosenPet($), { orBundled: true, isForced: true })) }
    }

    if (verb === 'hide' || verb === 'show') {
      await update($, isHidden, () => verb === 'hide')
      wake($)

      return { text: `${pet?.name ?? 'The pet'} is ${verb === 'hide' ? 'hidden; /pet show brings it back' : 'back'}.` }
    }

    if (isMood(verb)) {
      await update($, isHidden, () => false)
      await show($, verb, 6_000)

      return { text: `${pet?.name ?? 'The pet'}: ${verb}` }
    }

    return { text: usage() }
  })

  // Approving a permission dialog raises no event of its own. On the terminal
  // a long call then draws its pill, which says that call is running: the one
  // sign there is, and only there (the desktop raises no ToolProgress).
  on('ui.render', { component: 'ToolProgress' }, ($, e, next) => {
    const id = e.props.tool_use_id

    if (calls.has(id) && !pilled.has(id)) {
      pilled.add(id)
      started.push(id)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // each read subscribes the band: a write to any of them draws it again
    const [now, hidden] = await Promise.all([read($, mood), read($, isHidden), read($, step), read($, loads)])
    const current = pet

    if (hidden || e.props.hasSurvey || current === undefined) {
      bandId = undefined
      isOnDesktop = undefined
      isFaceDrawn = false

      return next(e)
    }

    isOnDesktop = e.surface === 'desktop'
    const label = `${current.name}: ${LABEL[now]}`
    // the band is as wide as the prompt: where in it the pet stands
    const justify = JUSTIFY[settings.align]

    if (e.surface === 'terminal') {
      const { Box, Image, Raster, Text } = $.ui.resolve(e)
      const beside = settings.hasLabel && (
        <Box flexDirection="column" justifyContent="flex-end" marginLeft={1}>
          <Text bold>{current.name}</Text>
          <Text dimColor>{LABEL[now]}</Text>
        </Box>
      )
      // a terminal that shows images gets the pet's own pixels, in fewer rows
      const imageRows = Math.min(IMAGE_ROWS[settings.size], e.props.maxRows)

      if (hasImages && imageRows >= IMAGE_MIN_ROWS) {
        // a cell is about twice as tall as it is wide
        const columns = Math.max(1, Math.round((imageRows * (settings.hasTallCells ? 2.4 : 2) * current.png.width) / current.png.height))
        isImageUnproven ||= !isImageDrawn || bandId !== e.requestId
        bandId = e.requestId
        isImageDrawn = true
        isFaceDrawn = false

        return (
          <Box width="100%" justifyContent={justify}>
            <Image key="pet" source={imageOf(current, now, frame)} columns={columns} rows={imageRows} alt={label} />
            {beside}
          </Box>
        )
      }

      isImageDrawn = false
      isFaceDrawn = settings.style !== 'blocks'

      // no picture here: a face of characters, one row and sharp, rather
      // than the pet in blocks of color too coarse to do it justice
      if (isFaceDrawn) {
        bandId = e.requestId

        return (
          <Box width="100%" justifyContent={justify}>
            <Text color={current.tint} bold>
              {faceOf(now, frame)}
            </Text>
            {settings.hasLabel && <Text bold> {current.name}</Text>}
            {settings.hasLabel && <Text dimColor> {LABEL[now]}</Text>}
          </Box>
        )
      }

      // the small size, or a terminal too short for the full one, draws the
      // half-size pet; one too short for that, the label alone
      const full: TerminalSize = settings.hasTallCells ? 'loTall' : 'lo'
      const half: TerminalSize = settings.hasTallCells ? 'tinyTall' : 'tiny'
      const fits = (one: TerminalSize) => e.props.maxRows >= current.terminal[one].rows
      const size = settings.size !== 'small' && fits(full) ? full : fits(half) ? half : undefined

      if (size === undefined) {
        bandId = undefined

        return settings.hasLabel ? <Text dimColor>{label}</Text> : next(e)
      }

      bandId = e.requestId
      terminalSize = size

      return (
        <Box width="100%" justifyContent={justify}>
          <Raster
            key="pet"
            columns={current.terminal[size].columns}
            rows={current.terminal[size].rows}
            cells={cellsOf(current, size, now, frame)}
          />
          {beside}
        </Box>
      )
    }

    if (e.surface === 'desktop') {
      const { Box, Svg, Text } = $.ui.resolve(e)
      const source = svgOf(current, now, frame)
      const height = DESKTOP_HEIGHT[settings.size]

      // this mood's frames are not read yet: the timer reads them and redraws
      if (source === undefined) {
        return settings.hasLabel ? <Text dimColor>{label}</Text> : next(e)
      }

      return (
        <Box width="100%" justifyContent={justify}>
          <Svg
            source={source}
            alt={label}
            width={Math.round((height * current.svg.width) / current.svg.height)}
            height={height}
          />
          {settings.hasLabel && (
            <Box flexDirection="column" justifyContent="flex-end" marginLeft={1}>
              <Text bold>{current.name}</Text>
              <Text dimColor>{LABEL[now]}</Text>
            </Box>
          )}
        </Box>
      )
    }

    return next(e)
  })
}
