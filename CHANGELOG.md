# Changelog

## 0.4.1

- The pet stands in the center of the band by default; `align` moves it.

## 0.4.0

- A terminal that shows no images now draws the pet as a face of characters on one row, in the pet's main color, instead of coarse blocks.
- `terminalStyle` (`auto`, `picture`, `face`, `blocks`) replaces `terminalImages`; `blocks` keeps the old look.

## 0.3.1

- Terminals without images: quadrant blocks, twice the horizontal detail of the half blocks before.
- New setting `terminalCells`, for terminals whose roomy line spacing made the pet look stretched.

## 0.3.0

- Terminals that show images (kitty, Ghostty) draw the pet's own pixels, in fewer rows. Experimental; half blocks remain the fallback.
- New settings: `align` (left, center, right) and `terminalImages`.
- `/pet` typed right at startup waits for the pet to load.

## 0.2.0

- Pets are read from this machine at run time: `~/.codex/pets`, then the Codex app's own, then the bundled Blob.
- `/pet list`, `/pet use <id|auto>`, `/pet refresh`.
- Settings: `pet`, `size`, `animation`, `label`.
- Desktop: the spritesheet's own 192 by 208 pixels a frame.
- Terminal: a half-size pet for short terminals and the `small` size.
- Moods follow questions to the person, failed and interrupted turns, and background work still in flight.

## 0.1.0

- First prototype: one converted pet above the prompt.
