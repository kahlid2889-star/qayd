"""Draw the majlis under the table, seen from above: public/qayd-majlis.svg (artwork, like the cards).

A traditional floor sitting seen straight down: a red carpet with borders fills the floor, floor
mattresses with sadu back cushions and arm-rest cubes run along the top and both sides (the players
sit on them), and the afternoon light from a window falls across the carpet.

Run: python3 scripts/build-majlis.py
"""
from pathlib import Path

W, H = 390, 780
OUT = Path(__file__).resolve().parent.parent / "public" / "qayd-majlis.svg"
BURG, RED, DEEP, CREAM, INK, BRASS = "#6b1f33", "#9c2b3c", "#451523", "#f1e3c8", "#2a1a18", "#b9945b"
M = 30          # mattress depth
BACK = 11       # back-cushion depth (against the wall)


def cushion(x, y, w, h, flip=False):
    """A back cushion from above: a padded bar with a woven medallion run."""
    a, b = (RED, DEEP) if not flip else (BURG, RED)
    horiz = w >= h
    out = [f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="4" fill="{a}"/>',
           f'<rect x="{x + 1.2:.1f}" y="{y + 1.2:.1f}" width="{w - 2.4:.1f}" height="{h - 2.4:.1f}" rx="3" fill="none" stroke="{CREAM}" stroke-width=".5" stroke-dasharray="1.4 1.2" opacity=".7"/>']
    n = max(1, int((w if horiz else h) // 13))
    for i in range(n):
        t = (i + .5) / n
        cx, cy = (x + w * t, y + h / 2) if horiz else (x + w / 2, y + h * t)
        r = min(w, h) / 2 - 2
        out.append(f'<path d="M{cx:.1f},{cy - r:.1f} L{cx + r * 1.5:.1f},{cy:.1f} L{cx:.1f},{cy + r:.1f} L{cx - r * 1.5:.1f},{cy:.1f}Z" fill="{b}" stroke="{CREAM}" stroke-width=".5"/>')
        out.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="1.1" fill="{BRASS}"/>')
    out.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="4" fill="url(#{"mjPadH" if horiz else "mjPadV"})"/>')
    return "".join(out)


def cube(cx, cy, s=22):
    """An arm-rest cube from above."""
    x, y = cx - s / 2, cy - s / 2
    return (f'<rect x="{x + 1:.1f}" y="{y + 2:.1f}" width="{s}" height="{s}" rx="4" fill="#000" opacity=".35" filter="url(#mjSoft)"/>'
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{s}" height="{s}" rx="4" fill="{RED}" stroke="{DEEP}" stroke-width=".8"/>'
            f'<path d="M{cx},{y + 3} L{x + s - 3},{cy} L{cx},{y + s - 3} L{x + 3},{cy}Z" fill="{CREAM}"/>'
            f'<path d="M{cx},{y + 6.5} L{x + s - 6.5},{cy} L{cx},{y + s - 6.5} L{x + 6.5},{cy}Z" fill="{DEEP}"/>'
            f'<circle cx="{cx}" cy="{cy}" r="1.6" fill="{BRASS}"/>'
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{s}" height="{s}" rx="4" fill="url(#mjPadH)"/>')


def mattress(x, y, w, h):
    horiz = w >= h
    out = [f'<rect x="{x + 1.5:.1f}" y="{y + 2.5:.1f}" width="{w:.1f}" height="{h:.1f}" rx="5" fill="#000" opacity=".4" filter="url(#mjSoft)"/>',
           f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="5" fill="{BURG}"/>',
           f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="5" fill="url(#{"mjStripeH" if horiz else "mjStripeV"})"/>',
           f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="5" fill="url(#{"mjPadH" if horiz else "mjPadV"})"/>',
           f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="5" fill="none" stroke="{DEEP}" stroke-width=".8"/>']
    return "".join(out)


def carpet():
    out = [f'<rect x="-6" y="-6" width="{W + 12}" height="{H + 12}" fill="#c9ab7c"/>',     # the floor under the carpet edge
           f'<rect x="-6" y="-6" width="{W + 12}" height="{H + 12}" filter="url(#mjGrain)" opacity=".5"/>']
    bx, by, bw, bh = 5, 5, W - 10, H - 12
    out.append(f'<rect x="{bx + 1.5}" y="{by + 2.5}" width="{bw}" height="{bh}" fill="#000" opacity=".35" filter="url(#mjSoft)"/>')
    out.append(f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" fill="{DEEP}" stroke="{CREAM}" stroke-width="1"/>')
    out.append(f'<rect x="{bx + 3}" y="{by + 3}" width="{bw - 6}" height="{bh - 6}" fill="none" stroke="{BRASS}" stroke-width=".7" stroke-dasharray="2.2 1.8"/>')
    out.append(f'<rect x="{bx + 6}" y="{by + 6}" width="{bw - 12}" height="{bh - 12}" fill="url(#mjBorder)"/>')
    ix, iy, iw, ih = bx + 24, by + 24, bw - 48, bh - 48
    out.append(f'<rect x="{ix}" y="{iy}" width="{iw}" height="{ih}" fill="{BURG}" stroke="{CREAM}" stroke-width="1"/>')
    out.append(f'<rect x="{ix}" y="{iy}" width="{iw}" height="{ih}" fill="url(#mjField)"/>')
    out.append(f'<rect x="{ix + 3}" y="{iy + 3}" width="{iw - 6}" height="{ih - 6}" fill="none" stroke="{BRASS}" stroke-width=".6" opacity=".8"/>')
    out.append(f'<path d="M{bx},{by + bh + 2} H{bx + bw}" stroke="{CREAM}" stroke-width="3" stroke-dasharray=".9 1.5" opacity=".8"/>')
    return "".join(out)


def seating():
    out = []
    # top run (the partner's side), then the two side runs
    out.append(mattress(0, 0, W, M + BACK))
    side_top, side_h = M + BACK + 4, 520
    out.append(mattress(0, side_top, M, side_h))
    out.append(mattress(W - M, side_top, M, side_h))
    # back cushions against the walls
    n = 5; gap = 3; cw = (W - 2 * 26 - gap * (n - 1)) / n
    for i in range(n):
        out.append(cushion(26 + i * (cw + gap), 1.5, cw, BACK, flip=i % 2 == 1))
    k = 5; ch = (side_h - 24 - gap * (k - 1)) / k
    for i in range(k):
        y = side_top + 22 + i * (ch + gap)
        out.append(cushion(1.5, y, BACK, ch, flip=i % 2 == 0))
        out.append(cushion(W - BACK - 1.5, y, BACK, ch, flip=i % 2 == 0))
    # arm-rest cubes: the two corners, and between seats
    for cx, cy in ((13, 14), (W - 13, 14), (W * .28, 26), (W * .72, 26), (17, side_top + side_h * .36), (W - 17, side_top + side_h * .36), (17, side_top + side_h - 6), (W - 17, side_top + side_h - 6)):
        out.append(cube(cx, cy))
    return "".join(out)


def light():
    # window light from the top-left: a slanted pane with the shadow of its cross bars, then the room's falloff
    pane = f'M-10,150 L150,96 L330,560 L130,640Z'
    return (f'<g opacity=".9"><path d="{pane}" fill="url(#mjSun)"/>'
            f'<path d="M70,123 L230,600" stroke="#2a0e14" stroke-width="5" opacity=".22"/>'
            f'<path d="M40,372 L262,300" stroke="#2a0e14" stroke-width="5" opacity=".2"/></g>'
            f'<rect x="-6" y="-6" width="{W + 12}" height="{H + 12}" fill="url(#mjVignette)"/>')


DEFS = f'''<defs>
 <linearGradient id="mjPadH" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
 <linearGradient id="mjPadV" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
 <linearGradient id="mjSun" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe7ad" stop-opacity=".42"/><stop offset=".6" stop-color="#ffd98a" stop-opacity=".2"/><stop offset="1" stop-color="#ffd98a" stop-opacity=".04"/></linearGradient>
 <radialGradient id="mjVignette" cx=".4" cy=".42" r=".8"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".65" stop-color="#1a090d" stop-opacity=".12"/><stop offset="1" stop-color="#14060a" stop-opacity=".5"/></radialGradient>
 <filter id="mjSoft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2"/></filter>
 <filter id="mjGrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="5"/><feColorMatrix type="matrix" values="0 0 0 0 .35  0 0 0 0 .25  0 0 0 0 .12  0 0 0 .22 -.06"/></filter>
 <pattern id="mjStripeH" width="14" height="{M + BACK}" patternUnits="userSpaceOnUse">
  <path d="M0,{BACK + 5} H14 M0,{BACK + 25} H14" stroke="{CREAM}" stroke-width=".7" opacity=".8"/><path d="M0,{BACK + 8} H14 M0,{BACK + 22} H14" stroke="{INK}" stroke-width="1.3"/>
  <path d="M0,{BACK + 15} L3.5,{BACK + 11.5} L7,{BACK + 15} L10.5,{BACK + 18.5} L14,{BACK + 15}" stroke="{BRASS}" stroke-width=".9" fill="none"/><path d="M3.5,{BACK + 15} h0 M10.5,{BACK + 15} h0" stroke="{CREAM}" stroke-width="1.6" stroke-linecap="round"/>
 </pattern>
 <pattern id="mjStripeV" width="{M}" height="14" patternUnits="userSpaceOnUse">
  <path d="M5,0 V14 M25,0 V14" stroke="{CREAM}" stroke-width=".7" opacity=".8"/><path d="M8,0 V14 M22,0 V14" stroke="{INK}" stroke-width="1.3"/>
  <path d="M15,0 L11.5,3.5 L15,7 L18.5,10.5 L15,14" stroke="{BRASS}" stroke-width=".9" fill="none"/><path d="M15,3.5 v0 M15,10.5 v0" stroke="{CREAM}" stroke-width="1.6" stroke-linecap="round"/>
 </pattern>
 <pattern id="mjField" width="26" height="26" patternUnits="userSpaceOnUse">
  <path d="M13,3.5 L17,13 L13,22.5 L9,13Z" fill="none" stroke="{CREAM}" stroke-width=".55" opacity=".5"/>
  <circle cx="13" cy="13" r="2.1" fill="{RED}"/><circle cx="13" cy="13" r=".9" fill="{CREAM}"/>
  <path d="M0,0 l3,3 M26,0 l-3,3 M0,26 l3,-3 M26,26 l-3,-3" stroke="{BRASS}" stroke-width=".7" opacity=".65"/>
  <circle cx="0" cy="13" r="1.3" fill="{DEEP}"/><circle cx="26" cy="13" r="1.3" fill="{DEEP}"/><circle cx="13" cy="0" r="1.3" fill="{DEEP}"/><circle cx="13" cy="26" r="1.3" fill="{DEEP}"/>
 </pattern>
 <pattern id="mjBorder" width="18" height="18" patternUnits="userSpaceOnUse">
  <rect width="18" height="18" fill="{RED}"/>
  <path d="M9,2.5 L15.5,9 L9,15.5 L2.5,9Z" fill="{DEEP}" stroke="{CREAM}" stroke-width=".6"/>
  <path d="M9,5.6 L12.4,9 L9,12.4 L5.6,9Z" fill="{CREAM}"/><circle cx="9" cy="9" r="1.2" fill="{BRASS}"/>
  <circle cx="0" cy="0" r="1.6" fill="{CREAM}" opacity=".8"/><circle cx="18" cy="0" r="1.6" fill="{CREAM}" opacity=".8"/><circle cx="0" cy="18" r="1.6" fill="{CREAM}" opacity=".8"/><circle cx="18" cy="18" r="1.6" fill="{CREAM}" opacity=".8"/>
 </pattern>
</defs>'''

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMin slice">'
       + DEFS + carpet() + seating() + light() + "</svg>")
OUT.write_text(svg)
print("wrote", OUT.name, len(svg) // 1024, "KB")
