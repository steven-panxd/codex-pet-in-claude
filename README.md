# Codex Pet for Claude Code

English | [简体中文](README.zh-CN.md)

Your Codex pet, living above the Claude Code prompt. It works while Claude works, waits when you are needed, and celebrates when a turn is done.

It reads the pets already on your machine, in the Codex pet format, and draws them in the Claude Code desktop app and in terminals that show images. In any other terminal the pet is a small face of characters that follows the same moods. No pet artwork is bundled except Blob, a small original pet shown when no Codex pet is found.

> An unofficial community plugin. Not affiliated with, endorsed by, or sponsored by OpenAI or Anthropic. "Codex" is a trademark of OpenAI; "Claude" is a trademark of Anthropic.

## What it shows

| The session | The pet |
| --- | --- |
| A turn is running | `running` |
| Claude asks you a question, wants a plan approved, or a tool needs permission | `waiting` |
| A tool call fails | `failed`, briefly (not when you refused it, or interrupted the turn) |
| A turn finishes | `jumping`, then `review` for 20 seconds, then `idle` |
| A turn ends in an error | `failed` for 6 seconds |
| You interrupt a turn | `idle` |
| The turn is over but background agents are still going | stays `running` until they finish (background shell commands do not count) |
| The session starts | `waving` |

## Requirements

- Claude Code 2.1.289 or later, with plugin function hooks. This is an early-access API that Anthropic is rolling out gradually: it may change between releases, and **it may not be switched on for your account yet**. See [Nothing shows up](#nothing-shows-up).
- Node.js 18 or later (or Bun) on your `PATH`, to convert a pet's spritesheet. Without it the plugin still runs and shows Blob.
- For a pet whose spritesheet is WebP (most are), one of: macOS (its `sips` is used), `dwebp` from libwebp, ImageMagick, `ffmpeg`, or Python with Pillow. PNG spritesheets need nothing.

## Install

```bash
claude plugin marketplace add steven-panxd/codex-pet-in-claude
```

```bash
claude plugin install codex-pet@codex-pet
```

Or try it from a checkout without installing:

```bash
claude --plugin-dir /path/to/codex-pet-in-claude
```

## Which pet

With the default setting, `auto`, the plugin picks in this order:

1. a pet you installed in `~/.codex/pets` (for example with `npx petdex install <slug>`, or one you hatched in Codex),
2. the Codex desktop app's own default pet, if the app is installed (macOS),
3. Blob.

`/pet list` names every pet found, and `/pet use <id>` switches. The choice is remembered across sessions.

## Commands

| Command | What it does |
| --- | --- |
| `/pet` | Says which pet is showing and lists the commands |
| `/pet list` | Lists the pets found on this machine |
| `/pet use <id>` | Switches to a pet and remembers it |
| `/pet use auto` | Goes back to following the `pet` setting |
| `/pet refresh` | Converts the current pet again, whatever is cached |
| `/pet hide`, `/pet show` | Hides the pet for this session, or brings it back |
| `/pet <mood>` | Previews a mood for 6 seconds: `idle`, `running`, `waiting`, `review`, `failed`, `jumping`, `waving`, `running-left`, `running-right` |

## Settings

Set these in `/config`, under the plugin's name.

| Setting | Values | Default | |
| --- | --- | --- | --- |
| `pet` | `auto`, or a pet's id | `auto` | The pet shown unless `/pet use` chose another |
| `size` | `small`, `medium`, `large` | `medium` | Desktop: 72, 104 or 156 pixels tall. A terminal picture: 4, 6 or 9 rows. Terminal blocks: 7 rows for `small`, 13 otherwise |
| `animation` | `lively`, `calm`, `still` | `calm` | `calm` lets a pet that is idle, waiting or up for review rest between movements; `still` draws one frame a mood |
| `label` | on, off | on | The pet's name and what it is doing, beside it |
| `align` | `left`, `center`, `right` | `center` | Where the pet stands in the band above the prompt |
| `terminalStyle` | `auto`, `picture`, `face`, `blocks` | `auto` | How the pet is drawn in a terminal. See below |
| `terminalCells` | `standard`, `tall` | `standard` | For the terminal picture and blocks. Set to `tall` if the pet looks stretched upward in your terminal (its line spacing is roomy): it is then drawn wider to keep its shape |

## How it looks on each surface

- **Desktop app**: the pet's own pixels, up to 192 by 208 a frame, in up to 32 colors a mood. A pet too detailed to fit a frame at that size is drawn at half size or with fewer colors.
- **Terminal that shows images** (kitty, Ghostty): the pet's own pixels, 4, 6 or 9 rows tall by `size`. Experimental: it is covered by tests but has not been tried in a real kitty or Ghostty yet. It is not used through tmux or over ssh, and if the terminal turns out not to draw the picture the plugin falls back to the face by itself.
- **Any other terminal**: a face of plain characters in the pet's main color, on one row, such as `(•‿•) Codex idle`. It blinks, spins while a turn runs, and changes with each mood. A character cell cannot hold enough pixels to do the pet's artwork justice, so the plugin does not try by default.
- **Blocks**, if you want the pet's shape anyway: set `terminalStyle` to `blocks` for quadrant block characters, 48 by 26 pixels in 13 rows, or 24 by 14 in 7 rows when the terminal is short or `size` is `small`. Recognizable, coarse.

## Privacy and what it touches

- It reads `~/.codex/pets` and, on macOS, the pet spritesheets inside the Codex app's bundle. It reads nothing else of Codex's: no settings, no sessions, no credentials.
- Converted frames are cached in `~/.cache/codex-pet-claude` (or `$XDG_CACHE_HOME/codex-pet-claude`). You may delete that folder; it is rebuilt at the next session's start, or by `/pet refresh`.
- Nothing is sent anywhere. The plugin makes no network requests.
- Pets from the Codex app are OpenAI's artwork. They are read in place on your own machine and are not included in or redistributed by this plugin.

## Nothing shows up

The plugin installs on any account, but its pet only appears where Claude Code runs plugin function hooks, which is behind a gradual rollout (seen in Claude Code 2.1.292).

1. Update Claude Code, then restart it.
2. Check whether the rollout has reached your account. This prints `true` when it has:

   ```bash
   grep -o '"tengu_plugin_hooks_modules": *[a-z]*' ~/.claude.json
   ```

3. If it prints `false` or nothing, the plugin cannot draw yet on your account, and nothing in this repository can change that. Star or watch the repository to try again later.
4. If it prints `true` and there is still no pet, run `/pet`. A reply means the plugin is loaded: try `/pet show`, then `/pet list`. No reply means it is not installed or not enabled: check `claude plugin list`.

## Known limits

- After you approve a permission prompt, the pet stays `waiting` until that tool call finishes. Claude Code raises no event for the approval itself. In a terminal, a long-running command's "run in background" hint ends the wait early; the desktop app has no such sign.
- The Codex app's built-in pets are found on macOS only. Elsewhere, set `CODEX_APP_ASAR` to the app's `app.asar`, or install a pet into `~/.codex/pets`.
- The two rows of look-direction frames in newer spritesheets, and `running-left` / `running-right`, are not tied to anything: the pet does not move across the screen.
- In the desktop app the pet animates by redrawing about six times a second while it moves, some 50 KB a frame. `calm` rests a pet that is idle, waiting or up for review most of the time, so only a running turn animates throughout; `still` stops animation altogether.
- A pet named the same as one from an earlier source is listed with its source, as `codex@codex-app`.

## Development

```bash
node --test scripts/pet.test.mjs
```

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

- `scripts/pet.mjs` finds pets and converts one into the frames the plugin draws. It has no dependencies.
- `hooks/register.tsx` is the plugin: the session events it follows and what it draws.
- `hooks/draw.ts` turns converted frames into terminal cells and SVG.
- `pets/blob` is the bundled pet: its spritesheet, and its frames already converted (`cache/`) so it draws without Node. After changing the spritesheet, rebuild them with `node scripts/pet.mjs build blob --out pets/blob/cache`.

## License

MIT, for the code and for Blob. See [LICENSE](LICENSE).
