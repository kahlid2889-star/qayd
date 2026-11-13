/* The baloot table, drawn once as an SVG. viewBox 100 x 119.
   A low walnut table for the majlis floor: carved frame with a brass inlay and corner caps,
   a burgundy baize top with a woven gold border, and the قيد mark in a ring at the centre.
   The baize takes the identity colours (--velvet*); wood and brass are artwork. */
(() => {
  const shell = document.querySelector('#rug .table-shell');
  if (!shell) return;
  document.getElementById('qayd-board')?.remove();
  const W = 100, H = 119;
  const rr = (x, y, w, h, r) => `M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x + r} Q${x},${y + h} ${x},${y + h - r} V${y + r} Q${x},${y} ${x + r},${y}Z`;
  const frame = rr(0, 0, W, H, 7.5), lip = rr(4.6, 4.6, W - 9.2, H - 9.2, 4.6), felt = rr(6.4, 6.4, W - 12.8, H - 12.8, 3.6);
  const b1 = rr(9.6, 9.6, W - 19.2, H - 19.2, 2.2), b2 = rr(11.4, 11.4, W - 22.8, H - 22.8, 1.6);
  /* woven border: a run of small diamonds between the two gold lines */
  const diamonds = [];
  const dia = (x, y, s) => `M${x},${y - s} L${x + s},${y} L${x},${y + s} L${x - s},${y}Z`;
  for (let x = 15; x <= W - 15; x += 3.5) { diamonds.push(dia(x, 10.5, .62)); diamonds.push(dia(x, H - 10.5, .62)); }
  for (let y = 15; y <= H - 15; y += 3.5) { diamonds.push(dia(10.5, y, .62)); diamonds.push(dia(W - 10.5, y, .62)); }
  /* corner ornaments on the baize: a sadu triangle fan */
  const corner = (cx, cy, sx, sy) => {
    const p = (dx, dy) => `${cx + sx * dx},${cy + sy * dy}`;
    return `<path d="M${p(0, 0)} L${p(9, 0)} L${p(0, 9)}Z" fill="url(#qbGold)" opacity=".5"/>`
      + `<path d="M${p(1.6, 1.6)} L${p(6, 1.6)} L${p(1.6, 6)}Z" fill="none" stroke="#f3dfa6" stroke-width=".3" opacity=".9"/>`
      + `<path d="M${p(11, 0)} l${sx * 1.3},${sy * 1.3} l${-sx * 1.3},${sy * 1.3} l${-sx * 1.3},${-sy * 1.3}Z M${p(0, 11)} l${sx * 1.3},${sy * 1.3} l${-sx * 1.3},${sy * 1.3} l${-sx * 1.3},${-sy * 1.3}Z" fill="url(#qbGold)" opacity=".75"/>`;
  };
  const caps = [[5.2, 5.2], [W - 5.2, 5.2], [5.2, H - 5.2], [W - 5.2, H - 5.2]];
  const U = 'filterUnits="userSpaceOnUse" x="-12" y="-12" width="124" height="150"';
  const svg = `
<svg id="qayd-board" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
 <defs>
  <linearGradient id="qbWood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a5a34"/><stop offset=".45" stop-color="#5e3a20"/><stop offset="1" stop-color="#3a2212"/></linearGradient>
  <linearGradient id="qbWoodLip" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2c190d"/><stop offset="1" stop-color="#7a4f2d"/></linearGradient>
  <linearGradient id="qbGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6e2a8"/><stop offset=".5" stop-color="#c9a15a"/><stop offset="1" stop-color="#8f6a2c"/></linearGradient>
  <radialGradient id="qbFelt" cx=".42" cy=".34" r=".85"><stop offset="0" class="v-hi"/><stop offset=".55" class="v-mid"/><stop offset="1" class="v-lo"/></radialGradient>
  <radialGradient id="qbCap" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="#fff3c8"/><stop offset=".45" stop-color="#d1a655"/><stop offset="1" stop-color="#7a5a22"/></radialGradient>
  <linearGradient id="qbLight" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9b4" stop-opacity=".2"/><stop offset=".45" stop-color="#ffe9b4" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient>
  <filter id="qbBlur" ${U}><feGaussianBlur stdDeviation="2.8"/></filter>
  <filter id="qbSoft" ${U}><feGaussianBlur stdDeviation=".6"/></filter>
  <!-- walnut grain: long, slightly wavy fibres -->
  <filter id="qbGrain" ${U} color-interpolation-filters="sRGB">
   <feTurbulence type="fractalNoise" baseFrequency=".018 .55" numOctaves="3" seed="9" result="n"/>
   <feColorMatrix in="n" type="matrix" values="0 0 0 0 .1  0 0 0 0 .05  0 0 0 0 .02  0 0 0 1.5 -.62" result="dark"/>
   <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 .86  0 0 0 0 .6  0 .9 0 0 -.5" result="lite"/>
   <feMerge result="g"><feMergeNode in="dark"/><feMergeNode in="lite"/></feMerge>
   <feComposite in="g" in2="SourceAlpha" operator="in" result="gin"/>
   <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="gin"/></feMerge>
  </filter>
  <!-- baize: a very fine, even nap -->
  <filter id="qbNap" ${U} color-interpolation-filters="sRGB">
   <feTurbulence type="fractalNoise" baseFrequency="2.6" numOctaves="2" seed="3" result="n"/>
   <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .2 .2 0 0 -.16" result="l"/>
   <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 .32 0 -.13" result="d"/>
   <feMerge result="t"><feMergeNode in="d"/><feMergeNode in="l"/></feMerge>
   <feComposite in="t" in2="SourceAlpha" operator="in" result="tin"/>
   <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="tin"/></feMerge>
  </filter>
  <clipPath id="qbFrameClip"><path d="${frame}"/></clipPath>
  <clipPath id="qbFeltClip"><path d="${felt}"/></clipPath>
 </defs>

 <!-- the table's shadow on the carpet -->
 <path d="${frame}" transform="translate(1.6 5.2)" fill="#000" fill-opacity=".55" filter="url(#qbBlur)"/>
 <path d="${frame}" transform="translate(0 1.9)" fill="#22120a"/>

 <!-- walnut frame -->
 <g filter="url(#qbGrain)"><path d="${frame}" fill="url(#qbWood)"/></g>
 <g clip-path="url(#qbFrameClip)">
  <path d="${frame}" fill="none" stroke="#ffdcae" stroke-width="1.1" opacity=".35"/>
  <path d="${frame}" transform="translate(0 -.9)" fill="none" stroke="#000" stroke-width="1.4" opacity=".3" filter="url(#qbSoft)"/>
  <path d="${rr(2.3, 2.3, W - 4.6, H - 4.6, 5.6)}" fill="none" stroke="url(#qbGold)" stroke-width=".55"/>
  <path d="${rr(2.3, 2.9, W - 4.6, H - 4.6, 5.6)}" fill="none" stroke="#000" stroke-width=".4" opacity=".35"/>
 </g>
 <path d="${lip}" fill="url(#qbWoodLip)"/>

 <!-- baize top -->
 <g filter="url(#qbNap)"><path d="${felt}" fill="url(#qbFelt)"/></g>
 <g clip-path="url(#qbFeltClip)">
  <path d="${felt}" fill="none" stroke="#000" stroke-width="5" opacity=".42" filter="url(#qbBlur)"/>
  <path d="${felt}" fill="url(#qbLight)"/>
  <path d="${b1}" fill="none" stroke="url(#qbGold)" stroke-width=".42" opacity=".9"/>
  <path d="${b2}" fill="none" stroke="url(#qbGold)" stroke-width=".3" opacity=".8"/>
  <path d="${diamonds.join(' ')}" fill="url(#qbGold)" opacity=".85"/>
  ${corner(12.6, 12.6, 1, 1)}${corner(W - 12.6, 12.6, -1, 1)}${corner(12.6, H - 12.6, 1, -1)}${corner(W - 12.6, H - 12.6, -1, -1)}
  <circle cx="${W / 2}" cy="${H / 2}" r="17.5" fill="none" stroke="url(#qbGold)" stroke-width=".4" opacity=".75"/>
  <circle cx="${W / 2}" cy="${H / 2}" r="16.2" fill="none" stroke="url(#qbGold)" stroke-width=".25" stroke-dasharray=".9 .9" opacity=".8"/>
  <circle cx="${W / 2}" cy="${H / 2}" r="15.4" fill="#000" opacity=".12"/>
  <g opacity=".9"><image href="/qayd-mark.webp" x="${W / 2 - 12.5}" y="${H / 2 - 12.5}" width="25" height="25" preserveAspectRatio="xMidYMid meet"/></g>
  <path class="pad-glow" d="${felt}"/>
 </g>
 <path d="${felt}" fill="none" stroke="#1c0f08" stroke-width=".5" opacity=".7"/>

 <!-- brass corner caps -->
 ${caps.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy + .35}" r="2.25" fill="#000" opacity=".4" filter="url(#qbSoft)"/>
 <circle cx="${cx}" cy="${cy}" r="2.05" fill="url(#qbCap)"/>
 <circle cx="${cx}" cy="${cy}" r="2.05" fill="none" stroke="#5c421a" stroke-width=".25"/>
 <circle cx="${cx}" cy="${cy}" r="1.05" fill="none" stroke="#fff4cf" stroke-width=".22" opacity=".8"/>
 <circle cx="${cx - .55}" cy="${cy - .6}" r=".4" fill="#fff" opacity=".8"/>`).join('')}
</svg>`;
  shell.insertAdjacentHTML('afterbegin', svg);
})();
