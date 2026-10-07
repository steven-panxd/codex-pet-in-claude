#!/usr/bin/env python3
"""Draws an original placeholder pet in the Codex pet format:
a 1536x1872 atlas, 8 columns x 9 rows of 192x208 cells, one state per row,
plus pet.json. Stands in for a real pet until one is installed."""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

W, H, SCALE = 48, 52, 4
BODY, SHADE, BELLY, INK, CHEEK, WHITE = (
    (64, 178, 170, 255),
    (38, 128, 128, 255),
    (214, 244, 236, 255),
    (24, 36, 48, 255),
    (255, 140, 150, 255),
    (255, 255, 255, 255),
)
SPARK = (255, 204, 64, 255)

# state -> frames, in the atlas's row order
ROWS = [
    ('idle', 6),
    ('running-right', 8),
    ('running-left', 8),
    ('waving', 4),
    ('jumping', 5),
    ('failed', 8),
    ('waiting', 6),
    ('running', 6),
    ('review', 6),
]


def frame(state: str, i: int) -> Image.Image:
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    dx = dy = 0
    squash = 0
    eyes = 'open'
    look = 0
    legs = 0
    arm = 0

    if state == 'idle':
        squash = (0, 0, 1, 1, 0, 0)[i]
        eyes = 'shut' if i == 4 else 'open'
    elif state in ('running-right', 'running-left', 'running'):
        legs = 1 if i % 2 == 0 else -1
        dy = -1 if i % 2 else 0
        look = 2 if state == 'running-right' else -2 if state == 'running-left' else 0
        dx = look
    elif state == 'waving':
        arm = 1 + i % 2
    elif state == 'jumping':
        dy = (0, -6, -10, -6, 0)[i]
        squash = (2, -1, -1, -1, 2)[i]
    elif state == 'failed':
        dx = (-2, 2, -2, 2, -1, 1, 0, 0)[i]
        eyes = 'cross'
        squash = 2
    elif state == 'waiting':
        eyes = 'shut' if i == 5 else 'open'
        look = (-1, -1, 0, 1, 1, 0)[i]
    elif state == 'review':
        look = (-2, -1, 0, 1, 2, 0)[i]
        eyes = 'glasses'

    top, bottom = 14 + dy + squash, 44 + dy
    left, right = 10 + dx, 38 + dx
    # legs
    for side, sx in ((-1, 17), (1, 29)):
        lift = 2 if legs == side else 0
        d.rectangle([sx + dx - 2, bottom - 2, sx + dx + 2, bottom + 4 - lift - (dy and 0)], fill=SHADE)
    # ears
    d.polygon([(left + 3, top + 4), (left + 6, top - 6), (left + 12, top + 1)], fill=SHADE)
    d.polygon([(right - 3, top + 4), (right - 6, top - 6), (right - 12, top + 1)], fill=SHADE)
    # body
    d.rounded_rectangle([left, top, right, bottom], radius=10, fill=BODY, outline=SHADE)
    d.ellipse([left + 7, top + 14, right - 7, bottom - 2], fill=BELLY)
    # arms
    if arm:
        d.rectangle([right, top + 2 - arm * 3, right + 4, top + 12 - arm * 3], fill=SHADE)
    else:
        d.rectangle([right, top + 14, right + 3, top + 22], fill=SHADE)
    d.rectangle([left - 3, top + 14, left, top + 22], fill=SHADE)
    # face
    ey = top + 9
    for ex in (left + 8 + look, right - 11 + look):
        if eyes == 'shut':
            d.line([ex, ey + 2, ex + 3, ey + 2], fill=INK)
        elif eyes == 'cross':
            d.line([ex, ey, ex + 3, ey + 3], fill=INK)
            d.line([ex + 3, ey, ex, ey + 3], fill=INK)
        else:
            d.rectangle([ex, ey, ex + 3, ey + 4], fill=INK)
            d.point((ex + 1, ey + 1), fill=WHITE)
            if eyes == 'glasses':
                d.rectangle([ex - 2, ey - 2, ex + 5, ey + 6], outline=INK)
    if eyes == 'glasses':
        d.line([left + 14 + look, ey + 1, right - 14 + look, ey + 1], fill=INK)
    d.point((left + 6, ey + 7), fill=CHEEK)
    d.point((right - 6, ey + 7), fill=CHEEK)
    mx = (left + right) // 2 + look
    if state == 'failed':
        d.line([mx - 2, ey + 9, mx + 2, ey + 9], fill=INK)
    else:
        d.line([mx - 2, ey + 7, mx, ey + 9], fill=INK)
        d.line([mx, ey + 9, mx + 2, ey + 7], fill=INK)
    # extras
    if state == 'waiting':
        for n in range(1 + i % 3):
            d.rectangle([18 + n * 5, 3, 20 + n * 5, 5], fill=INK)
    if state == 'running':
        for n in range(3):
            sx = (4 + n * 17 + i * 5) % 44
            d.rectangle([sx, 4 + (n * 3 + i) % 6, sx + 1, 5 + (n * 3 + i) % 6], fill=SPARK)
    if state in ('running-right', 'running-left'):
        tail = left - 6 if state == 'running-right' else right + 3
        d.line([tail, top + 10 + i % 2 * 4, tail + 3, top + 10 + i % 2 * 4], fill=SHADE)
        d.line([tail, top + 20 - i % 2 * 4, tail + 3, top + 20 - i % 2 * 4], fill=SHADE)

    return im.resize((W * SCALE, H * SCALE), Image.NEAREST)


def main() -> None:
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    atlas = Image.new('RGBA', (W * SCALE * 8, H * SCALE * 9), (0, 0, 0, 0))
    for row, (state, count) in enumerate(ROWS):
        for col in range(count):
            atlas.paste(frame(state, col), (col * W * SCALE, row * H * SCALE))
    atlas.save(out / 'spritesheet.png')
    (out / 'pet.json').write_text(
        json.dumps(
            {
                'id': 'blob',
                'displayName': 'Blob',
                'description': 'A small teal blob: the pet this plugin ships, shown when no Codex pet is found.',
                'spritesheetPath': 'spritesheet.png',
            },
            indent=2,
        )
        + '\n'
    )
    print(f'{out}: {atlas.size[0]}x{atlas.size[1]}')


if __name__ == '__main__':
    main()
