"""Draw the majlis behind the table: public/qayd-majlis.svg (artwork, like the cards).

A traditional sitting room seen from the player's place on the floor: a timber ceiling, a warm
plaster wall with a window onto the palms and a niche of coffee pots, a row of sadu cushions along
the wall, and a red carpet under the table. One late-afternoon light comes from the window.

Run: python3 scripts/build-majlis.py
"""
from pathlib import Path

W, H = 390, 780          # the play area behind the table (portrait); wider screens crop / extend the carpet
OUT = Path(__file__).resolve().parent.parent / "public" / "qayd-majlis.svg"

# palette of the room (artwork): burgundy, madder red, cream, charcoal, brass, plaster
BURG, RED, DEEP, CREAM, INK, BRASS, PLASTER, PLASTER2 = "#6b1f33", "#9c2b3c", "#451523", "#f1e3c8", "#2a1a18", "#b9945b", "#efe0c4", "#dcc7a2"

CEIL, WALL0, WALL1, CUSH0, CUSH1, SEAT1 = 0, 12, 84, 84, 116, 128   # y bands (the table covers everything below ~130)
WX, WY, WW, WH = 16, 21, 70, 48                                    # the window


def sadu_tile(x, y, w, h, flip=False):
    """One back cushion: a medallion in a diamond, with small corner diamonds (hand-woven look)."""
    cx, cy = x + w / 2, y + h / 2
    a, b = (RED, DEEP) if not flip else (BURG, RED)
    out = [f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="5" fill="{a}"/>',
           f'<rect x="{x + 1.6:.1f}" y="{y + 1.6:.1f}" width="{w - 3.2:.1f}" height="{h - 3.2:.1f}" rx="4" fill="none" stroke="{CREAM}" stroke-width=".7" stroke-dasharray="1.6 1.4" opacity=".75"/>',
           f'<path d="M{cx},{y + 5} L{x + w - 7},{cy} L{cx},{y + h - 5} L{x + 7},{cy}Z" fill="{b}" stroke="{CREAM}" stroke-width=".9"/>',
           f'<path d="M{cx},{y + 10} L{x + w - 14},{cy} L{cx},{y + h - 10} L{x + 14},{cy}Z" fill="{CREAM}" opacity=".92"/>',
           f'<path d="M{cx},{y + 14.5} L{x + w - 20},{cy} L{cx},{y + h - 14.5} L{x + 20},{cy}Z" fill="{a}"/>',
           f'<circle cx="{cx}" cy="{cy}" r="1.9" fill="{BRASS}"/>']
    for dx, dy in ((7, 7), (w - 7, 7), (7, h - 7), (w - 7, h - 7)):
        px, py = x + dx, y + dy
        out.append(f'<path d="M{px},{py - 2.6} L{px + 2.6},{py} L{px},{py + 2.6} L{px - 2.6},{py}Z" fill="{CREAM}" opacity=".85"/>')
    return "".join(out)


def cushions():
    n, gap = 6, 3.0
    w = (W + 8 - gap * (n - 1)) / n
    out = [f'<rect x="-6" y="{CUSH0 - 2}" width="{W + 12}" height="{CUSH1 - CUSH0 + 4}" fill="{DEEP}"/>']
    for i in range(n):
        out.append(sadu_tile(-4 + i * (w + gap), CUSH0, w, CUSH1 - CUSH0, flip=i % 2 == 1))
    # the seat mattress under the back cushions: woven stripes
    out.append(f'<rect x="-6" y="{CUSH1}" width="{W + 12}" height="{SEAT1 - CUSH1}" fill="{BURG}"/>')
    for k, (dy, col, sw) in enumerate(((2.2, CREAM, .8), (4.6, INK, 1.4), (7.4, BRASS, .8), (10.4, INK, 1.4), (12.8, CREAM, .8))):
        out.append(f'<path d="M-6,{CUSH1 + dy} H{W + 6}" stroke="{col}" stroke-width="{sw}" opacity=".8"/>')
    out.append(f'<path d="M-6,{CUSH1 + 7.4} H{W + 6}" stroke="{RED}" stroke-width="2.4" stroke-dasharray="3 3" opacity=".9"/>')
    out.append(f'<rect x="-6" y="{CUSH0 - 2}" width="{W + 12}" height="{SEAT1 - CUSH0 + 2}" fill="url(#mjCushShade)"/>')
    out.append(f'<rect x="-6" y="{SEAT1}" width="{W + 12}" height="9" fill="url(#mjDrop)"/>')
    return "".join(out)


def carpet():
    y0 = SEAT1
    out = [f'<rect x="-6" y="{y0}" width="{W + 12}" height="{H - y0 + 6}" fill="{BURG}"/>',
           f'<rect x="-6" y="{y0}" width="{W + 12}" height="{H - y0 + 6}" fill="url(#mjField)"/>']
    # borders: an outer guard, a main border of rosettes, an inner guard; then the field
    bx, by, bw, bh = 9, y0 + 12, W - 18, H - y0 - 26
    out.append(f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" fill="{DEEP}" stroke="{CREAM}" stroke-width="1.1"/>')
    out.append(f'<rect x="{bx + 3.2}" y="{by + 3.2}" width="{bw - 6.4}" height="{bh - 6.4}" fill="none" stroke="{BRASS}" stroke-width=".8" stroke-dasharray="2.2 1.8"/>')
    out.append(f'<rect x="{bx + 6}" y="{by + 6}" width="{bw - 12}" height="{bh - 12}" fill="url(#mjBorder)"/>')
    ix, iy, iw, ih = bx + 24, by + 24, bw - 48, bh - 48
    out.append(f'<rect x="{ix}" y="{iy}" width="{iw}" height="{ih}" fill="{BURG}" stroke="{CREAM}" stroke-width="1"/>')
    out.append(f'<rect x="{ix}" y="{iy}" width="{iw}" height="{ih}" fill="url(#mjField)"/>')
    out.append(f'<rect x="{ix + 3}" y="{iy + 3}" width="{iw - 6}" height="{ih - 6}" fill="none" stroke="{BRASS}" stroke-width=".7" opacity=".8"/>')
    # fringe at the near edge
    out.append(f'<path d="M{bx},{by + bh + 2.4} H{bx + bw}" stroke="{CREAM}" stroke-width="3.4" stroke-dasharray=".9 1.5" opacity=".75"/>')
    return "".join(out)


def wall():
    out = [f'<rect x="-6" y="{WALL0}" width="{W + 12}" height="{WALL1 - WALL0}" fill="url(#mjPlaster)"/>',
           f'<rect x="-6" y="{WALL0}" width="{W + 12}" height="{WALL1 - WALL0}" filter="url(#mjGrain)" opacity=".5"/>',
           # a painted dado band above the cushions
           f'<rect x="-6" y="{WALL1 - 9}" width="{W + 12}" height="9" fill="{BURG}" opacity=".9"/>',
           f'<path d="M-6,{WALL1 - 9} H{W + 6}" stroke="{BRASS}" stroke-width="1"/>',
           f'<path d="M-6,{WALL1 - 5} H{W + 6}" stroke="{CREAM}" stroke-width=".5" stroke-dasharray="3 2.4" opacity=".8"/>']
    # window (left): deep reveal, sky, dunes, palms, a garden wall; timber frame
    x, y, w, h = WX, WY, WW, WH
    out += [f'<rect x="{x - 4}" y="{y - 4}" width="{w + 8}" height="{h + 8}" rx="2" fill="#c9b189"/>',
            f'<rect x="{x - 4}" y="{y - 4}" width="{w + 8}" height="{h + 8}" rx="2" fill="none" stroke="#8a6a3d" stroke-width=".8"/>',
            f'<g clip-path="url(#mjWin)"><rect x="{x}" y="{y}" width="{w}" height="{h}" fill="url(#mjSky)"/>',
            f'<circle cx="{x + w - 14}" cy="{y + 13}" r="5.5" fill="#fff3cf" opacity=".95"/><circle cx="{x + w - 14}" cy="{y + 13}" r="12" fill="#ffe6a8" opacity=".35"/>',
            f'<path d="M{x},{y + h * .7} Q{x + w * .26},{y + h * .56} {x + w * .54},{y + h * .67} T{x + w},{y + h * .62} V{y + h} H{x}Z" fill="#d9b27c"/>',
            f'<path d="M{x},{y + h * .8} Q{x + w * .35},{y + h * .7} {x + w * .7},{y + h * .79} T{x + w},{y + h * .75} V{y + h} H{x}Z" fill="#c59a62"/>',
            f'<rect x="{x}" y="{y + h * .86}" width="{w}" height="{h * .14}" fill="#7d8f4e"/>']
    for px, s in ((x + 18, .78), (x + 30, .56)):          # two date palms
        base = y + h * .87
        out.append(f'<path d="M{px},{base} q{-1.2 * s},{-12 * s} {.6 * s},{-25 * s}" stroke="#5b4027" stroke-width="{2.2 * s:.2f}" fill="none" stroke-linecap="round"/>')
        tx, ty = px + .6 * s, base - 25 * s
        for ang in (-78, -52, -24, 6, 34, 62, 92, 122, 152):
            import math
            r = 13 * s; ex, ey = tx + r * math.cos(math.radians(ang - 90)), ty + r * math.sin(math.radians(ang - 90)) + abs(ang) * .055 * s
            out.append(f'<path d="M{tx:.1f},{ty:.1f} Q{(tx + ex) / 2:.1f},{min(ty, ey) - 3.5 * s:.1f} {ex:.1f},{ey:.1f}" stroke="#3f6b3a" stroke-width="{1.5 * s:.2f}" fill="none" stroke-linecap="round"/>')
    out += [f'</g><path d="M{x + w / 2},{y} V{y + h} M{x},{y + h / 2} H{x + w}" stroke="#6a4a28" stroke-width="2.2"/>',
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" stroke="#6a4a28" stroke-width="2.6"/>',
            f'<rect x="{x - 6}" y="{y + h + 3}" width="{w + 12}" height="3.4" rx="1" fill="#7b5a34"/>']
    # niche with brass coffee pots (right)
    nx, ny, nw, nh = 304, WALL0 + 11, 68, 44
    out += [f'<rect x="{nx - 3}" y="{ny - 3}" width="{nw + 6}" height="{nh + 6}" rx="2" fill="#a47a43"/>',
            f'<rect x="{nx}" y="{ny}" width="{nw}" height="{nh}" fill="#5a3a22"/>',
            f'<rect x="{nx}" y="{ny}" width="{nw}" height="{nh}" fill="url(#mjNiche)"/>',
            f'<path d="M{nx},{ny + nh / 2} H{nx + nw} M{nx + nw / 2},{ny} V{ny + nh}" stroke="#a47a43" stroke-width="2.4"/>']
    for i, (cx, cy) in enumerate(((nx + nw * .25, ny + nh * .25), (nx + nw * .75, ny + nh * .25), (nx + nw * .25, ny + nh * .75), (nx + nw * .75, ny + nh * .75))):
        s = .62
        out.append(f'<g transform="translate({cx:.1f} {cy + 7.5:.1f}) scale({s})">'
                   f'<path d="M-6,0 Q-8.5,-6 -4.5,-10 L-3,-15 L3,-15 L4.5,-10 Q8.5,-6 6,0Z" fill="url(#mjBrass)"/>'
                   f'<path d="M-3,-15 L0,-20 L3,-15Z" fill="#d7b46e"/><circle cx="0" cy="-20.6" r="1" fill="#f0d79a"/>'
                   f'<path d="M4.6,-9.5 Q11.5,-12.5 12.5,-17" stroke="#c9a35a" stroke-width="1.5" fill="none" stroke-linecap="round"/>'
                   f'<path d="M-5.2,-8 Q-10.5,-6 -7,-1.5" stroke="#a9843f" stroke-width="1.3" fill="none"/>'
                   f'<path d="M-3.4,-9 Q-1.5,-4 -3.6,-1.2" stroke="#fff2c9" stroke-width=".8" fill="none" opacity=".7"/></g>')
    # a hanging lantern between them
    lx = 262
    out += [f'<path d="M{lx},{WALL0} V{WALL0 + 16}" stroke="#3a2a1c" stroke-width=".8"/>', '<g transform="translate(0 -4)">',
            f'<path d="M{lx - 5},{WALL0 + 16} h10 l2,4 h-14z" fill="#3f7f78"/>',
            f'<rect x="{lx - 6}" y="{WALL0 + 20}" width="12" height="15" rx="2.5" fill="#ffe2a1" opacity=".9"/>',
            f'<rect x="{lx - 6}" y="{WALL0 + 20}" width="12" height="15" rx="2.5" fill="none" stroke="#3f7f78" stroke-width="1.2"/>',
            f'<path d="M{lx - 6},{WALL0 + 27.5} h12 M{lx},{WALL0 + 20} v15" stroke="#3f7f78" stroke-width=".7"/>',
            f'<path d="M{lx - 7},{WALL0 + 35} h14 l-2,3.4 h-10z" fill="#3f7f78"/>',
            f'<circle cx="{lx}" cy="{WALL0 + 28}" r="20" fill="url(#mjGlow)"/>', '</g>']
    return "".join(out)


def ceiling():
    out = [f'<rect x="-6" y="{CEIL}" width="{W + 12}" height="{WALL0 - CEIL}" fill="#4a3220"/>']
    for i in range(14):
        x = -6 + i * 30.5
        out.append(f'<rect x="{x:.1f}" y="{CEIL}" width="15" height="{WALL0 - CEIL}" fill="url(#mjBeam)"/>')
    out.append(f'<rect x="-6" y="{WALL0}" width="{W + 12}" height="7" fill="url(#mjDrop)" opacity=".7"/>')
    out.append(f'<rect x="-6" y="{WALL0 - 3}" width="{W + 12}" height="5" fill="#2e1d12" opacity=".55"/>')
    return "".join(out)


def light():
    # the window's light: a soft beam across the wall and down onto the carpet, then the room's falloff
    return (f'<path d="M{WX + 3},{WY + WH} L{WX + WW},{WY + WH} L330,{H} L96,{H}Z" fill="url(#mjBeamLight)" opacity=".5"/>'
            f'<rect x="{WX}" y="{WY}" width="{WW}" height="{WH}" fill="#fff0c2" opacity=".08"/>'
            f'<rect x="-6" y="0" width="{W + 12}" height="{H + 6}" fill="url(#mjVignette)"/>'
            f'<rect x="-6" y="{H - 250}" width="{W + 12}" height="256" fill="url(#mjFloorFade)"/>')


DEFS = f'''<defs>
 <linearGradient id="mjPlaster" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2cfa9"/><stop offset=".5" stop-color="{PLASTER}"/><stop offset="1" stop-color="{PLASTER2}"/></linearGradient>
 <linearGradient id="mjSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fb9d6"/><stop offset=".55" stop-color="#cfe0e2"/><stop offset="1" stop-color="#f3dcae"/></linearGradient>
 <linearGradient id="mjBeam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a5433"/><stop offset=".5" stop-color="#9b6f44"/><stop offset="1" stop-color="#5b3d24"/></linearGradient>
 <linearGradient id="mjNiche" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity=".05"/></linearGradient>
 <linearGradient id="mjBrass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4dc9c"/><stop offset=".5" stop-color="#c79a4a"/><stop offset="1" stop-color="#8a6426"/></linearGradient>
 <linearGradient id="mjCushShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".34"/></linearGradient>
 <linearGradient id="mjDrop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".42"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
 <linearGradient id="mjBeamLight" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="#ffe9b0" stop-opacity=".55"/><stop offset=".5" stop-color="#ffd98a" stop-opacity=".2"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></linearGradient>
 <linearGradient id="mjFloorFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c0a0f" stop-opacity="0"/><stop offset="1" stop-color="#1c0a0f" stop-opacity=".5"/></linearGradient>
 <radialGradient id="mjGlow"><stop offset="0" stop-color="#ffdf9b" stop-opacity=".5"/><stop offset="1" stop-color="#ffdf9b" stop-opacity="0"/></radialGradient>
 <radialGradient id="mjVignette" cx=".36" cy=".3" r=".95"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".6" stop-color="#1a090d" stop-opacity=".1"/><stop offset="1" stop-color="#14060a" stop-opacity=".5"/></radialGradient>
 <clipPath id="mjWin"><rect x="{WX}" y="{WY}" width="{WW}" height="{WH}"/></clipPath>
 <filter id="mjGrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="5"/><feColorMatrix type="matrix" values="0 0 0 0 .35  0 0 0 0 .25  0 0 0 0 .12  0 0 0 .22 -.06"/></filter>
 <!-- carpet field: small repeated flowers on burgundy -->
 <pattern id="mjField" width="26" height="26" patternUnits="userSpaceOnUse">
  <path d="M13,3.5 L17,13 L13,22.5 L9,13Z" fill="none" stroke="{CREAM}" stroke-width=".55" opacity=".5"/>
  <circle cx="13" cy="13" r="2.1" fill="{RED}"/><circle cx="13" cy="13" r=".9" fill="{CREAM}"/>
  <path d="M0,0 l3,3 M26,0 l-3,3 M0,26 l3,-3 M26,26 l-3,-3" stroke="{BRASS}" stroke-width=".7" opacity=".65"/>
  <circle cx="0" cy="13" r="1.3" fill="{DEEP}"/><circle cx="26" cy="13" r="1.3" fill="{DEEP}"/><circle cx="13" cy="0" r="1.3" fill="{DEEP}"/><circle cx="13" cy="26" r="1.3" fill="{DEEP}"/>
 </pattern>
 <!-- carpet main border: rosettes between leaf pairs -->
 <pattern id="mjBorder" width="18" height="18" patternUnits="userSpaceOnUse">
  <rect width="18" height="18" fill="{RED}"/>
  <path d="M9,2.5 L15.5,9 L9,15.5 L2.5,9Z" fill="{DEEP}" stroke="{CREAM}" stroke-width=".6"/>
  <path d="M9,5.6 L12.4,9 L9,12.4 L5.6,9Z" fill="{CREAM}"/><circle cx="9" cy="9" r="1.2" fill="{BRASS}"/>
  <circle cx="0" cy="0" r="1.6" fill="{CREAM}" opacity=".8"/><circle cx="18" cy="0" r="1.6" fill="{CREAM}" opacity=".8"/><circle cx="0" cy="18" r="1.6" fill="{CREAM}" opacity=".8"/><circle cx="18" cy="18" r="1.6" fill="{CREAM}" opacity=".8"/>
 </pattern>
</defs>'''

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMin slice">'
       + DEFS + carpet() + wall() + ceiling() + cushions() + light() + "</svg>")
OUT.write_text(svg)
print("wrote", OUT.name, len(svg) // 1024, "KB")
