"""Draw the pixel-art icon (a little monitor with a glowing trace) and write
ext/icons/*.png.

    python tools/make_icons.py
"""
from pathlib import Path
from PIL import Image

ART = [
    "................",
    ".cccccccccccccc.",
    ".cbbbbbbbbbbbbc.",
    ".cbkkkkkkkkkkbc.",
    ".cbkkkkkkgkkkbc.",
    ".cbkkkkkgkgkkbc.",
    ".cbkkkkgkkgkkbc.",
    ".cbgkkgkkkkgkbc.",
    ".cbkgkgkkkkkgbc.",
    ".cbkkgkkkkkkkbc.",
    ".cbkkkkkkkkkkbc.",
    ".cbbbbbbbbbbbbc.",
    ".cccccccccccccc.",
    "......cccc......",
    "....cccccccc....",
    "................",
]
COL = {
    '.': (0, 0, 0, 0), 'c': (154, 163, 156, 255), 'b': (40, 46, 42, 255),
    'k': (10, 14, 12, 255), 'g': (216, 240, 220, 255),
}
out = Path(__file__).resolve().parent.parent / 'ext' / 'icons'
out.mkdir(parents=True, exist_ok=True)
base = Image.new('RGBA', (16, 16))
for y, row in enumerate(ART):
    for x, ch in enumerate(row):
        base.putpixel((x, y), COL[ch])
for size in (16, 32, 48, 128):
    base.resize((size, size), Image.NEAREST).save(out / f'icon{size}.png')
print('wrote', out)
