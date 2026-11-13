/* Qaid stable draft layout */
/* Draft layout replacement. Does not change rules, bids, cards or online state. */
fitTable = function fitStableTable() {
  const stage=document.querySelector('#tb'),table=document.querySelector('#tw'),game=document.querySelector('#gm'),topSeat=document.querySelector('#s2');
  if(!stage||!table||!topSeat||!game.classList.contains('on'))return;
  const width=stage.clientWidth;let height=stage.clientHeight,spill=16;if(width<10||height<10)return;
  const landscape=innerWidth>innerHeight&&innerHeight<600;
  // Portrait: the hand lies under the table. The felt ends above the lifted cards, never beneath them.
  const handBox=document.querySelector('#hand');
  if(handBox&&!landscape){const s=stage.getBoundingClientRect(),hb=handBox.getBoundingClientRect();
    if(hb.height>10&&hb.top-30<s.bottom){height=Math.max(150,hb.top-30-s.top);spill=0;}}
  const topReserve=landscape?64:118; /* room above the table for the majlis wall and the top seat */
  const rugWidth=Math.min(width*.92,580); /* a bigger table: it nearly fills the width */
  const rugHeight=Math.max(60,Math.min(rugWidth*(landscape?.82:1.19),height-topReserve+spill));
  const top=topReserve+Math.max(0,height-topReserve-rugHeight)*.38;
  table.dataset.compact=height<290?'true':'false';table.dataset.landscape=landscape?'true':'false';
  table.style.setProperty('--table-w',rugWidth.toFixed(2)+'px');table.style.setProperty('--table-h',rugHeight.toFixed(2)+'px');table.style.setProperty('--table-top',top.toFixed(2)+'px');
  table.style.setProperty('--seat-outset',Math.min(34,Math.max(0,(width-rugWidth)/2-2)).toFixed(2)+'px');
  topSeat.style.top=-(landscape?61:92)+'px';
  table.querySelectorAll('.seat .fan').forEach(fan=>{const n=fan.querySelectorAll('.cb').length;fan.dataset.count=String(n);fan.setAttribute('aria-label',n+' أوراق');});
  const playWidth=Math.max(24,Math.min(86,rugWidth*.255,rugHeight/2.35));document.documentElement.style.setProperty('--tw',playWidth.toFixed(2)+'px');
  if(typeof placeEats==='function')placeEats();
};
addEventListener('resize',()=>requestAnimationFrame(()=>{fitTable();if(R)renderHand();}));
if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>fitTable()).observe(document.querySelector('#gm'));
requestAnimationFrame(fitTable);

(() => {
  const fixClub = () => {
    const symbol = document.getElementById('su3');
    if (!symbol) return;
    symbol.setAttribute('viewBox', '0 0 24 24');
    symbol.innerHTML = '<circle cx="12" cy="7" r="5"/><circle cx="6" cy="15" r="5"/><circle cx="18" cy="15" r="5"/><circle cx="12" cy="13" r="4"/><path d="M10.5 14h3l2 9h-7z"/>';
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fixClub, { once: true });
  else fixClub();
})();

