"""Build Atlas Numerals: the ten digits the interface draws in place of
Pixelify Sans's own.

Pixelify Sans's 5 is drawn with a rounded, two-sided top that reads as an S or
an 8, its 7 curls over at the top and its 2 ends in a hook. These digits are
drawn on the same grid (11 pixels to the em, a 7-pixel cap height, the same
baseline and advance), so they sit in Pixelify text without moving anything.
index.html loads the fonts with `unicode-range: U+0030-0039` ahead of Pixelify
Sans, so only digits change.

Run from the repository root (needs fontTools: `pip install fonttools`):
    python scripts/build_atlas_numerals.py
It writes public/assets/fonts/AtlasNumerals-Regular.woff and -Bold.woff.
"""

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

UNITS_PER_EM = 1000
PIXEL = UNITS_PER_EM / 11      # Pixelify Sans's pixel
LEFT = 60                      # its left side bearing for digits
BASELINE = -12                 # its digits sit a hair below the baseline
ASCENT, DESCENT = 920, -280    # its line metrics, so mixed lines keep their height
WIN_ASCENT, WIN_DESCENT = 922, 289

# Five pixels wide, seven tall, top row first.
DIGITS = {
    'zero': [
        '.###.',
        '#...#',
        '#...#',
        '#...#',
        '#...#',
        '#...#',
        '.###.',
    ],
    'one': [
        '..#..',
        '.##..',
        '..#..',
        '..#..',
        '..#..',
        '..#..',
        '.###.',
    ],
    'two': [
        '.###.',
        '#...#',
        '....#',
        '...#.',
        '..#..',
        '.#...',
        '#####',
    ],
    'three': [
        '.###.',
        '#...#',
        '....#',
        '..##.',
        '....#',
        '#...#',
        '.###.',
    ],
    'four': [
        '...#.',
        '..##.',
        '.#.#.',
        '#..#.',
        '#####',
        '...#.',
        '...#.',
    ],
    'five': [
        '#####',
        '#....',
        '####.',
        '....#',
        '....#',
        '#...#',
        '.###.',
    ],
    'six': [
        '..##.',
        '.#...',
        '#....',
        '####.',
        '#...#',
        '#...#',
        '.###.',
    ],
    'seven': [
        '#####',
        '....#',
        '...#.',
        '..#..',
        '..#..',
        '..#..',
        '..#..',
    ],
    'eight': [
        '.###.',
        '#...#',
        '#...#',
        '.###.',
        '#...#',
        '#...#',
        '.###.',
    ],
    'nine': [
        '.###.',
        '#...#',
        '#...#',
        '.####',
        '....#',
        '...#.',
        '.##..',
    ],
}

# Regular strokes are one pixel. Bold grows every pixel by `grow` on each
# side (strokes about 1.4 pixels, like Pixelify Sans Bold) and takes its
# wider advance.
WEIGHTS = {
    'Regular': {'weight': 400, 'advance': 586, 'grow': 0},
    'Bold': {'weight': 700, 'advance': 603, 'grow': 18},
}


def runs(rows):
    """Each row's horizontal runs of pixels as (column, row, length), row 0 at the top."""
    for r, row in enumerate(rows):
        c = 0
        while c < len(row):
            if row[c] != '#':
                c += 1
                continue
            end = c
            while end < len(row) and row[end] == '#':
                end += 1
            yield c, r, end - c
            c = end


def glyph(rows, grow):
    pen = TTGlyphPen(None)
    height = len(rows)
    for col, row, length in runs(rows):
        x0 = round(LEFT + col * PIXEL - grow)
        x1 = round(LEFT + (col + length) * PIXEL + grow)
        y0 = round(BASELINE + (height - 1 - row) * PIXEL - grow)
        y1 = round(BASELINE + (height - row) * PIXEL + grow)
        # Clockwise, as TrueType expects for filled contours.
        pen.moveTo((x0, y0))
        pen.lineTo((x0, y1))
        pen.lineTo((x1, y1))
        pen.lineTo((x1, y0))
        pen.closePath()
    return pen.glyph()


def build(style, spec):
    names = ['.notdef', *DIGITS]
    fb = FontBuilder(UNITS_PER_EM, isTTF=True)
    fb.setupGlyphOrder(names)
    fb.setupCharacterMap({ord('0') + i: name for i, name in enumerate(DIGITS)})
    glyphs = {'.notdef': TTGlyphPen(None).glyph()}
    glyphs.update({name: glyph(rows, spec['grow']) for name, rows in DIGITS.items()})
    fb.setupGlyf(glyphs)
    metrics = {'.notdef': (spec['advance'], 0)}
    for name in DIGITS:
        g = glyphs[name]
        g.recalcBounds(fb.font['glyf'])
        metrics[name] = (spec['advance'], g.xMin)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=ASCENT, descent=DESCENT)
    fb.setupNameTable({
        'familyName': 'Atlas Numerals',
        'styleName': style,
        'uniqueFontIdentifier': f'AtlasNumerals-{style}',
        'fullName': f'Atlas Numerals {style}',
        'psName': f'AtlasNumerals-{style}',
        'version': 'Version 1.000',
        'copyright': 'Copyright 2026 Logan Reddell',
    })
    fb.setupOS2(
        usWeightClass=spec['weight'],
        sTypoAscender=ASCENT, sTypoDescender=DESCENT, sTypoLineGap=0,
        usWinAscent=WIN_ASCENT, usWinDescent=WIN_DESCENT,
        fsSelection=0x20 if style == 'Bold' else 0x40,
    )
    fb.setupPost()
    fb.font['head'].macStyle = 1 if style == 'Bold' else 0
    fb.font.flavor = 'woff'
    path = f'public/assets/fonts/AtlasNumerals-{style}.woff'
    fb.save(path)
    print('wrote', path)


if __name__ == '__main__':
    for style, spec in WEIGHTS.items():
        build(style, spec)
