/* The baloot board, drawn once as an SVG. viewBox 100 x 119 (the board's own proportions).
   Colours come from the identity tokens (--velvet*, --board*) so it follows the theme. */
(() => {
  const shell = document.querySelector('#rug .table-shell');
  if (!shell) return;
  document.getElementById('qayd-board')?.remove();
  const W = 100, H = 119;
  /* A rounded outline whose sides bow inward by `bow` (negative bows outward). Corners are smooth arcs. */
  const outline = (x0, y0, x1, y1, r, bow) => {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, k = r * 0.45;
    return `M${x0 + r},${y0} Q${mx},${y0 + 2 * bow} ${x1 - r},${y0} C${x1 - k},${y0} ${x1},${y0 + k} ${x1},${y0 + r} `
      + `Q${x1 - 2 * bow},${my} ${x1},${y1 - r} C${x1},${y1 - k} ${x1 - k},${y1} ${x1 - r},${y1} `
      + `Q${mx},${y1 - 2 * bow} ${x0 + r},${y1} C${x0 + k},${y1} ${x0},${y1 - k} ${x0},${y1 - r} `
      + `Q${x0 + 2 * bow},${my} ${x0},${y0 + r} C${x0},${y0 + k} ${x0 + k},${y0} ${x0 + r},${y0}Z`;
  };
  const board = outline(0, 0, W, H, 11, 2.7);
  const pad = outline(16.5, 21, 83.5, 98, 8, -1.5);
  const padIn = outline(18.6, 23.1, 81.4, 95.9, 6.6, -1.3);
  const rests = [
    { d: `M26.5,11.4 Q50,13.9 73.5,11.4`, g: 'qbRestH', hl: '0 -1.7' },
    { d: `M26.5,${H - 11.4} Q50,${H - 13.9} 73.5,${H - 11.4}`, g: 'qbRestH', hl: '0 -1.7' },
    { d: `M8.8,29.5 Q11,${H / 2} 8.8,${H - 29.5}`, g: 'qbRestV', hl: '-1.7 0' },
    { d: `M${W - 8.8},29.5 Q${W - 11},${H / 2} ${W - 8.8},${H - 29.5}`, g: 'qbRestV', hl: '-1.7 0' },
  ];
  const cups = [[10.8, 11.8], [W - 10.8, 11.8], [10.8, H - 11.8], [W - 10.8, H - 11.8]];
  const U = 'filterUnits="userSpaceOnUse" x="-12" y="-12" width="124" height="150"';
  const svg = `
<svg id="qayd-board" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
 <defs>
  <linearGradient id="qbLacquer" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="b-hi"/><stop offset=".6" class="b-hi"/><stop offset="1" class="b-lo"/></linearGradient>
  <linearGradient id="qbGloss" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <radialGradient id="qbPad" cx=".46" cy=".38" r=".8"><stop offset="0" class="v-hi"/><stop offset=".5" class="v-mid"/><stop offset="1" class="v-lo"/></radialGradient>
  <linearGradient id="qbSheen" x1="0" y1="0" x2="1" y2="1"><stop offset=".18" stop-color="#fff" stop-opacity="0"/><stop offset=".36" stop-color="#fff" stop-opacity=".13"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset=".72" stop-color="#000" stop-opacity=".1"/><stop offset=".9" stop-color="#000" stop-opacity="0"/></linearGradient>
  <linearGradient id="qbRestH" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="v-hi"/><stop offset=".45" class="v-mid"/><stop offset="1" class="v-lo"/></linearGradient>
  <linearGradient id="qbRestV" x1="0" y1="0" x2="1" y2="0"><stop offset="0" class="v-hi"/><stop offset=".45" class="v-mid"/><stop offset="1" class="v-lo"/></linearGradient>
  <linearGradient id="qbRim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#b9c0c8"/><stop offset=".5" stop-color="#f4f6f8"/><stop offset=".72" stop-color="#7f8892"/><stop offset="1" stop-color="#dfe3e7"/></linearGradient>
  <radialGradient id="qbBowl" cx=".58" cy=".7" r=".8"><stop offset="0" stop-color="#f1f3f5"/><stop offset=".42" stop-color="#a9b1ba"/><stop offset=".8" stop-color="#555d66"/><stop offset="1" stop-color="#30363d"/></radialGradient>
  <filter id="qbBlur" ${U}><feGaussianBlur stdDeviation="2.6"/></filter>
  <filter id="qbSoft" ${U}><feGaussianBlur stdDeviation=".65"/></filter>
  <filter id="qbFine" ${U}><feGaussianBlur stdDeviation=".28"/></filter>
  <!-- velvet: a very fine nap with faint brushed streaks; kept subtle so it reads as cloth, not noise -->
  <filter id="qbVelvet" ${U} color-interpolation-filters="sRGB">
   <feTurbulence type="fractalNoise" baseFrequency="2.4" numOctaves="2" seed="7" result="nap"/>
   <feColorMatrix in="nap" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .22 .22 0 0 -.17" result="napLight"/>
   <feColorMatrix in="nap" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 .34 0 -.14" result="napDark"/>
   <feTurbulence type="fractalNoise" baseFrequency=".05 .011" numOctaves="2" seed="4" result="brush"/>
   <feColorMatrix in="brush" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 .55 0 0 -.235" result="brushLight"/>
   <feMerge result="tex"><feMergeNode in="napDark"/><feMergeNode in="brushLight"/><feMergeNode in="napLight"/></feMerge>
   <feComposite in="tex" in2="SourceAlpha" operator="in" result="texIn"/>
   <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="texIn"/></feMerge>
  </filter>
  <clipPath id="qbBoardClip"><path d="${board}"/></clipPath>
  <clipPath id="qbPadClip"><path d="${pad}"/></clipPath>
 </defs>

 <!-- contact shadow, wood edge, lacquer -->
 <path class="bd-shadow" d="${board}" transform="translate(0 5)" filter="url(#qbBlur)"/>
 <path class="bd-edge" d="${board}" transform="translate(0 1.7)"/>
 <path class="bd-edge2" d="${board}" transform="translate(0 .85)"/>
 <path d="${board}" fill="url(#qbLacquer)"/>
 <g clip-path="url(#qbBoardClip)">
  <path d="${board}" fill="url(#qbGloss)" opacity=".55"/>
  <path d="${board}" fill="none" stroke="#fff" stroke-width="1.1" opacity=".75"/>
  <path d="${board}" transform="translate(0 -.6)" fill="none" stroke="#000" stroke-width=".9" opacity=".08" filter="url(#qbSoft)"/>
 </g>

 <!-- four arm rests -->
 ${rests.map((r) => `<path d="${r.d}" transform="translate(0 1.1)" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="8.4" stroke-linecap="round" filter="url(#qbSoft)"/>
 <g filter="url(#qbVelvet)"><path d="${r.d}" fill="none" stroke="url(#${r.g})" stroke-width="7.6" stroke-linecap="round"/></g>
 <path d="${r.d}" transform="translate(${r.hl})" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".2" filter="url(#qbSoft)"/>`).join('')}

 <!-- the playing pad -->
 <path d="${pad}" transform="translate(0 1.3)" fill="#000" fill-opacity=".34" filter="url(#qbSoft)"/>
 <g filter="url(#qbVelvet)"><path d="${pad}" fill="url(#qbPad)"/></g>
 <g clip-path="url(#qbPadClip)">
  <path d="${pad}" fill="url(#qbSheen)"/>
  <path d="${pad}" fill="none" stroke="#000" stroke-width="6" opacity=".3" filter="url(#qbBlur)"/>
  <path d="${pad}" transform="translate(0 1)" fill="none" stroke="#fff" stroke-width="1" opacity=".28" filter="url(#qbSoft)"/>
  <path d="${padIn}" fill="none" stroke="#000" stroke-width=".5" opacity=".22" filter="url(#qbFine)"/>
  <path d="${padIn}" fill="none" stroke="#fff" stroke-width=".28" stroke-dasharray="1.1 .9" stroke-linecap="round" opacity=".42"/>
  <g opacity=".86"><image href="/qayd-mark.webp" x="${W / 2 - 14}" y="${H / 2 - 14}" width="28" height="28" preserveAspectRatio="xMidYMid meet"/></g>
  <path class="pad-glow" d="${pad}"/>
 </g>

 <!-- steel cups -->
 ${cups.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy + .7}" r="5.9" fill="#000" fill-opacity=".3" filter="url(#qbSoft)"/>
 <circle cx="${cx}" cy="${cy}" r="5.5" fill="url(#qbRim)"/>
 <circle cx="${cx}" cy="${cy}" r="5.5" fill="none" stroke="#fff" stroke-width=".3" opacity=".9"/>
 <circle cx="${cx}" cy="${cy}" r="4.15" fill="url(#qbBowl)"/>
 <circle cx="${cx}" cy="${cy}" r="4.15" fill="none" stroke="#000" stroke-width=".35" opacity=".35"/>
 <path d="M${cx - 2.9},${cy - 1.2} A3.2 3.2 0 0 1 ${cx + 1.4},${cy - 2.9}" fill="none" stroke="#fff" stroke-width=".7" stroke-linecap="round" opacity=".75" filter="url(#qbFine)"/>
 <ellipse cx="${cx + 1.3}" cy="${cy + 1.6}" rx="1.5" ry=".8" fill="#fff" opacity=".35" filter="url(#qbSoft)"/>`).join('')}
</svg>`;
  shell.insertAdjacentHTML('afterbegin', svg);
})();
