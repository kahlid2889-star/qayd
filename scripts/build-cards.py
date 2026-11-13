"""Rebuild the 32 card faces (public/qayd-js/02-cards.js) with one index style.

Before: every rank had its own font and its own size (A/K/Q/J large, 7-10 small).
Now: one bold serif (Caladea Bold outlines), one cap height and one suit size on every
card, the same pip grid on number cards, and the original court paintings untouched.

Run: python3 scripts/build-cards.py   (needs fonttools and the Caladea font)
"""
import base64, json, re, sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = Path(__file__).resolve().parent.parent
HTML = ROOT / "public" / "qayd-js" / "02-cards.js"  # the file that holds window.QAID_CARD_ART
FONT = "/usr/share/fonts/truetype/crosextra/Caladea-Bold.ttf"
W, H = 240, 324
BLACK, RED = "#15171a", "#c8102e"
RANKS = ["7", "8", "9", "10", "J", "Q", "K", "A"]  # r = 0..7
CAP = 50.0          # index cap height, the same on every card
INDEX_X = 29.0      # centre of the index column
INDEX_W = 42.0      # widest a rank may be
INDEX_TOP = 15.0    # top of the rank glyph
SUIT = 34.0         # index suit size
SUIT_GAP = 6.0

font = TTFont(FONT)
glyphs, cmap, upm = font.getGlyphSet(), font.getBestCmap(), font["head"].unitsPerEm
cap_units = font["OS/2"].sCapHeight or 700


def rank_path(text):
    """Outline of the rank: its ink box is CAP tall, at most INDEX_W wide, centred on INDEX_X."""
    from fontTools.pens.boundsPen import BoundsPen
    squeeze, track = (0.74, -0.06 * upm) if len(text) > 1 else (1.0, 0)
    bounds = BoundsPen(glyphs)
    x = 0
    for ch in text:
        g = glyphs[cmap[ord(ch)]]
        g.draw(TransformPen(bounds, (squeeze, 0, 0, 1, x, 0)))
        x += g.width * squeeze + track
    x0, y0, x1, y1 = bounds.bounds
    sy = CAP / (y1 - y0)
    sx = min(sy, INDEX_W / (x1 - x0))
    left = INDEX_X - (x1 - x0) * sx / 2 - x0 * sx
    out, x = [], 0
    for ch in text:
        g = glyphs[cmap[ord(ch)]]
        pen = SVGPathPen(glyphs, lambda v: ("%.1f" % v).rstrip("0").rstrip("."))
        g.draw(TransformPen(pen, (sx * squeeze, 0, 0, -sy, left + x * sx, INDEX_TOP + y1 * sy)))
        out.append(pen.getCommands())
        x += g.width * squeeze + track
    return " ".join(out)


def read_current():
    html = HTML.read_text()
    m = re.search(r"window\.QAID_CARD_ART = Object\.freeze\((\{.*?\})\);", html, re.S)
    art = json.loads(m.group(1))
    svg = {int(k): base64.b64decode(v.split(",", 1)[1]).decode() for k, v in art.items()}
    return html, m, svg


def suit_shapes(svg):
    shapes = {}
    for s in range(4):
        m = re.search(r'<g transform="translate\([^)]*\) scale\([\d.]+\)[^"]*" fill="#[0-9a-f]+">(.*?)</g>', svg[s * 8])
        shapes[s] = m.group(1)  # markup drawn in a 24x24 box
    return shapes


def pip(shape, colour, cx, cy, size, flip=False):
    k = size / 24
    t = f"translate({cx - size / 2:.2f} {cy - size / 2:.2f}) scale({k:.4f})" + (" rotate(180 12 12)" if flip else "")
    return f'<g transform="{t}" fill="{colour}">{shape}</g>'


def index(rank, shape, colour):
    one = (f'<path d="{rank_path(rank)}" fill="{colour}"/>'
           + pip(shape, colour, INDEX_X, INDEX_TOP + CAP + SUIT_GAP + SUIT / 2, SUIT))
    return one + f'<g transform="rotate(180 {W / 2} {H / 2})">{one}</g>'


# Pip grid: two columns and a centre line, kept clear of the index columns.
L, C, R = 88.0, 120.0, 152.0
T, B = 62.0, 262.0
def rows(n): return [T + (B - T) * i / (n - 1) for i in range(n)]
LAYOUT = {
    "7": [(L, y) for y in rows(3)] + [(R, y) for y in rows(3)] + [(C, (rows(3)[0] + rows(3)[1]) / 2)],
    "8": [(L, y) for y in rows(3)] + [(R, y) for y in rows(3)] + [(C, (rows(3)[0] + rows(3)[1]) / 2), (C, (rows(3)[1] + rows(3)[2]) / 2)],
    "9": [(L, y) for y in rows(4)] + [(R, y) for y in rows(4)] + [(C, H / 2)],
    "10": [(L, y) for y in rows(4)] + [(R, y) for y in rows(4)] + [(C, (rows(4)[0] + rows(4)[1]) / 2), (C, (rows(4)[2] + rows(4)[3]) / 2)],
}
PIP = {"7": 44, "8": 44, "9": 40, "10": 40}


def build(s, r, old, shape):
    rank, colour = RANKS[r], (RED if s in (1, 2) else BLACK)
    body = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="none">',
            f'<rect width="{W}" height="{H}" fill="#ffffff"/>']
    if rank in LAYOUT:
        for cx, cy in LAYOUT[rank]:
            body.append(pip(shape, colour, cx, cy, PIP[rank], flip=cy > H / 2 + 1))
    elif rank == "A":
        body.append(pip(shape, colour, W / 2, H / 2, 118))
    else:
        image = re.search(r"<image [^>]+/>", old).group(0)
        frame = re.search(r'<rect x="[^"]+" y="[^"]+" width="[^"]+" height="[^"]+" fill="none"[^>]*/>', old)
        body.append(image)
        if frame:
            body.append(re.sub(r'stroke="#[0-9a-f]+"', f'stroke="{BLACK}"', frame.group(0)))
    body.append(index(rank, shape, colour))
    body.append("</svg>")
    return "".join(body)


def main():
    html, match, svg = read_current()
    shapes = suit_shapes(svg)
    art = {}
    for s in range(4):
        for r in range(8):
            key = s * 8 + r
            art[str(key)] = "data:image/svg+xml;base64," + base64.b64encode(build(s, r, svg[key], shapes[s]).encode()).decode()
    new = "window.QAID_CARD_ART = Object.freeze(" + json.dumps(art, separators=(",", ":")) + ");"
    HTML.write_text(html[:match.start()] + new + html[match.end():])
    print("rebuilt", len(art), "cards;", (len(new) - (match.end() - match.start())) // 1024, "KB change")


if __name__ == "__main__":
    sys.exit(main())
