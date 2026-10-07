export type Mood =
  | 'idle'
  | 'running-right'
  | 'running-left'
  | 'waving'
  | 'jumping'
  | 'failed'
  | 'waiting'
  | 'running'
  | 'review'

declare module 'claude-code' {
  interface PluginState {
    'codex-pet': {
      mood: Mood
      isHidden: boolean
      /** Counts the desktop's frame changes: each write redraws the band. */
      step: number
      /** Counts the pets loaded, 0 before the first: a write redraws the band. */
      loads: number
    }
  }
}
