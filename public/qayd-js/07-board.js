/* Draw the board once. viewBox 100 x 119 (the board's own proportions). */
(() => {
  const shell = document.querySelector('#rug .table-shell');
  if (!shell || document.getElementById('qayd-board')) return;
  const W = 100, H = 119, r = 9, d = 2.6;
  const board = `M${r},0 Q${W / 2},${2 * d} ${W - r},0 Q${W},0 ${W},${r} Q${W - 2 * d},${H / 2} ${W},${H - r} Q${W},${H} ${W - r},${H} Q${W / 2},${H - 2 * d} ${r},${H} Q0,${H} 0,${H - r} Q${2 * d},${H / 2} 0,${r} Q0,0 ${r},0Z`;
  const x0 = 16.5, x1 = 83.5, y0 = 21, y1 = 98, pr = 7, pb = 1.6;
  const pad = `M${x0 + pr},${y0} Q${W / 2},${y0 - pb} ${x1 - pr},${y0} Q${x1},${y0} ${x1},${y0 + pr} Q${x1 + pb},${H / 2} ${x1},${y1 - pr} Q${x1},${y1} ${x1 - pr},${y1} Q${W / 2},${y1 + pb} ${x0 + pr},${y1} Q${x0},${y1} ${x0},${y1 - pr} Q${x0 - pb},${H / 2} ${x0},${y0 + pr} Q${x0},${y0} ${x0 + pr},${y0}Z`;
  const rests = [
    `M26,11.2 Q50,13.6 74,11.2`, `M26,${H - 11.2} Q50,${H - 13.6} 74,${H - 11.2}`,
    `M8.6,29 Q10.8,${H / 2} 8.6,${H - 29}`, `M${W - 8.6},29 Q${W - 10.8},${H / 2} ${W - 8.6},${H - 29}`,
  ];
  const cups = [[10.6, 11.6], [W - 10.6, 11.6], [10.6, H - 11.6], [W - 10.6, H - 11.6]];
  const svg = `
<svg id="qayd-board" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
 <defs>
  <linearGradient id="qbLacquer" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="b-hi"/><stop offset=".55" class="b-hi"/><stop offset="1" class="b-lo"/></linearGradient>
  <radialGradient id="qbPad" cx=".5" cy=".42" r=".75"><stop offset="0" class="v-hi"/><stop offset=".55" class="v-mid"/><stop offset="1" class="v-lo"/></radialGradient>
  <linearGradient id="qbRest" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="v-hi"/><stop offset=".5" class="v-mid"/><stop offset="1" class="v-lo"/></linearGradient>
  <linearGradient id="qbRestV" x1="0" y1="0" x2="1" y2="0"><stop offset="0" class="v-hi"/><stop offset=".5" class="v-mid"/><stop offset="1" class="v-lo"/></linearGradient>
  <radialGradient id="qbSteel" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#cfd5db"/><stop offset=".7" stop-color="#8a939d"/><stop offset="1" stop-color="#565e67"/></radialGradient>
  <radialGradient id="qbBowl" cx=".55" cy=".68" r=".75"><stop offset="0" stop-color="#e9edf1"/><stop offset=".5" stop-color="#9aa3ad"/><stop offset="1" stop-color="#3d444c"/></radialGradient>
  <filter id="qbBlur" filterUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="145"><feGaussianBlur stdDeviation="2.4"/></filter>
  <filter id="qbSoft" filterUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="145"><feGaussianBlur stdDeviation=".7"/></filter>
  <!-- velvet: fine nap + long brushed streaks, lit from the top-left -->
  <filter id="qbVelvet" filterUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="145" color-interpolation-filters="sRGB">
   <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="7" result="nap"/>
   <feColorMatrix in="nap" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .28 .28 0 0 -.22" result="napA"/>
   <feTurbulence type="fractalNoise" baseFrequency=".035 .012" numOctaves="2" seed="3" result="brush"/>
   <feColorMatrix in="brush" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 .7 0 0 -.27" result="brushA"/>
   <feTurbulence type="fractalNoise" baseFrequency=".02 .05" numOctaves="1" seed="11" result="shade"/>
   <feColorMatrix in="shade" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .8 0 0 0 -.33" result="shadeA"/>
   <feMerge result="tex"><feMergeNode in="shadeA"/><feMergeNode in="brushA"/><feMergeNode in="napA"/></feMerge>
   <feComposite in="tex" in2="SourceAlpha" operator="in" result="texIn"/>
   <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="texIn"/></feMerge>
  </filter>
  <clipPath id="qbBoardClip"><path d="${board}"/></clipPath>
  <clipPath id="qbPadClip"><path d="${pad}"/></clipPath>
 </defs>
 <path class="bd-shadow" d="${board}" transform="translate(0 4.5)" filter="url(#qbBlur)"/>
 <path class="bd-edge" d="${board}" transform="translate(0 1.5)"/>
 <path class="bd-edge2" d="${board}" transform="translate(0 .75)"/>
 <path d="${board}" fill="url(#qbLacquer)"/>
 <g clip-path="url(#qbBoardClip)">
  <ellipse cx="30" cy="6" rx="46" ry="12" fill="#fff" opacity=".7" filter="url(#qbBlur)"/>
  <path d="${board}" fill="none" stroke="#fff" stroke-width="1.2" opacity=".9"/>
 </g>
 ${rests.map((p, i) => `<path d="${p}" transform="translate(0 .9)" fill="none" stroke="rgba(20,25,40,.35)" stroke-width="8.2" stroke-linecap="round" filter="url(#qbSoft)"/>
 <g filter="url(#qbVelvet)"><path d="${p}" fill="none" stroke="url(#${i < 2 ? 'qbRest' : 'qbRestV'})" stroke-width="7.6" stroke-linecap="round"/></g>
 <path d="${p}" transform="translate(${i < 2 ? '0 -1.5' : '-1.5 0'})" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".16" filter="url(#qbSoft)"/>`).join('')}
 <path d="${pad}" transform="translate(0 1.1)" fill="rgba(20,25,40,.4)" filter="url(#qbSoft)"/>
 <g filter="url(#qbVelvet)"><path d="${pad}" fill="url(#qbPad)"/></g>
 <g clip-path="url(#qbPadClip)">
  <path d="${pad}" fill="none" stroke="#000" stroke-width="5" opacity=".28" filter="url(#qbBlur)"/>
  <path d="${pad}" transform="translate(0 .9)" fill="none" stroke="#fff" stroke-width="1" opacity=".3" filter="url(#qbSoft)"/>
  <image href="/qayd-mark.webp" x="${W / 2 - 15}" y="${H / 2 - 15}" width="30" height="30" opacity=".8" preserveAspectRatio="xMidYMid meet"/>
  <path class="pad-glow" d="${pad}"/>
 </g>
 ${cups.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy + .5}" r="5.6" fill="rgba(0,0,0,.28)" filter="url(#qbSoft)"/>
 <circle cx="${cx}" cy="${cy}" r="5.4" fill="url(#qbSteel)"/>
 <circle cx="${cx}" cy="${cy}" r="4" fill="url(#qbBowl)"/>
 <ellipse cx="${cx - 1.2}" cy="${cy - 1.6}" rx="1.7" ry=".9" fill="#fff" opacity=".8" filter="url(#qbSoft)"/>
 <circle cx="${cx}" cy="${cy}" r="5.4" fill="none" stroke="#fff" stroke-width=".35" opacity=".8"/>`).join('')}
</svg>`;
  shell.insertAdjacentHTML('afterbegin', svg);
})();
