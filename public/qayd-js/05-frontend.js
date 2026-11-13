/* Qaid next frontend */
/* Official قيد mark: the supplied PNG, unmodified. */
(() => {
  function metalSrc() {
    return '/qaid-mark.jpg';
  }
  function metalMark() {
    return '<img class="qn-brand-img" alt="" src="'+window.QAID_BRAND+'">';
  }
  function apply(root=document) {
    const targets=root.matches?.('.qaid-logo')?[root]:[...root.querySelectorAll?.('.qaid-logo')||[]];
    for(const el of targets){
      if(el.dataset.qn==='metal')continue;
      el.classList.add('qn-logo');
      el.dataset.qn='metal';
      el.innerHTML=metalMark();
      el.setAttribute('aria-label','قيد');
    }
  }
  apply();
  const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)apply(node);});
  observer.observe(document.body,{childList:true,subtree:true});
  window.QaidBrand={refresh:apply, src:metalSrc};
})();

/* Qaid / next home. Presentation only: the original controls and game hooks survive. */
(() => {
  'use strict';
  if (window.QaidHomeNext) return;

  const root = document.documentElement;
  const find = selector => document.querySelector(selector);
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const move = (parent, node) => { if (parent && node && node.parentNode !== parent) parent.appendChild(node); };
  let mounted = false, menu = null, actions = null, idBadge = null;
  let onlineObserver = null, logoObserver = null, logoFrame = 0;

  function suit() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#su0');
    svg.appendChild(use);
    return svg;
  }

  // Change only noninteractive copy; never recreate a button, avatar, or its icon.
  function buttonCopy(button, title, subtitle) {
    if (!button) return;
    let label = button.querySelector('.home-action-label');
    if (!label) {
      label = make('span', 'home-action-label');
      for (const node of [...button.childNodes]) {
        if (node.nodeType === Node.TEXT_NODE) node.remove();
      }
      button.insertBefore(label, button.querySelector('small'));
    }
    label.textContent = title;
    let small = button.querySelector('small');
    if (subtitle !== undefined) {
      if (!small) { small = make('small'); button.appendChild(small); }
      small.textContent = subtitle;
    }
    button.type = 'button';
  }

  function refreshLogo() {
    logoFrame = 0;
    const asset = getComputedStyle(root).getPropertyValue('--qaid-next-logo').trim();
    const liveMark = Boolean(find('.qaid-logo.qn-logo'));
    root.classList.toggle('qaid-next-logo-pending', !liveMark && (!asset || asset === 'none'));
  }
  function scheduleLogo() {
    if (!logoFrame) logoFrame = requestAnimationFrame(refreshLogo);
  }

  function rebuildSplash() {
    const splash = find('#sp');
    if (!splash || splash.dataset.homeNext === 'true') return;
    const logo = splash.querySelector('.qaid-logo') || make('span', 'qaid-logo');
    logo.setAttribute('role', 'img');
    logo.setAttribute('aria-label', 'قيد');
    const brand = make('div', 'home-splash-brand');
    brand.appendChild(logo);
    const rule = make('i', 'home-splash-rule');
    rule.setAttribute('aria-hidden', 'true');
    const heading = make('h1', 'home-splash-tagline', 'بلوت على أصوله');
    splash.replaceChildren(brand, rule, heading);
    splash.dataset.homeNext = 'true';
  }

  function syncIdentity(user) {
    if (!idBadge) return;
    const id = user && typeof user.id === 'string' ? user.id : '';
    const value = idBadge.querySelector('b');
    value.textContent = id;
    idBadge.hidden = !id;
    if (id) idBadge.setAttribute('aria-label', 'معرّف اللاعب ' + id);
    else idBadge.removeAttribute('aria-label');
    // #pn, #lv, #wn, #cn and P are owned by the existing account/game modules.
  }

  function mount() {
    if (mounted) return;
    menu = find('#mn');
    const bar = menu && menu.querySelector('.bar');
    const card = menu && menu.querySelector('.card');
    const play = menu && menu.querySelector('.menu-play');
    const go = find('#go');
    if (!menu || !bar || !card || !play || !go) return;
    mounted = true;
    menu.classList.add('home-next');
    menu.setAttribute('aria-label', 'ديوانية قيد');
    bar.classList.add('home-identity-bar');
    const identity = card.querySelector('.pr');
    const brand = bar.querySelector('.brand');
    const eyebrow = play.querySelector('.eyebrow');
    const oldNote = play.querySelector(':scope > .note');
    const nav = find('#nv');
    const row = menu.querySelector('.row2');
    const gear = find('#gear');
    const bell = find('#bell');
    const friends = null;

    const hero = make('section', 'home-hero');
    hero.setAttribute('aria-label', 'بلوت على أصوله');
    const heroCopy = make('div', 'home-hero-copy');
    if (eyebrow) { eyebrow.textContent = 'صكّة تجمعنا'; heroCopy.appendChild(eyebrow); }
    if (brand) {
      const subtitle = brand.querySelector('.subtitle');
      if (subtitle) {
        const title = make('h1', 'home-hero-title');
        title.appendChild(subtitle);
        heroCopy.appendChild(brand);
        heroCopy.appendChild(title);
      } else heroCopy.appendChild(brand);
    }
    if (oldNote) { oldNote.textContent = 'الورق جاهز، ناقصك أنت.'; oldNote.classList.add('home-hero-note'); heroCopy.appendChild(oldNote); }
    const art = make('div', 'home-hero-art');
    hero.append(heroCopy, art);

    // The compact identity header reuses the original rendered avatar and name.
    if (identity) {
      identity.classList.add('home-identity');
      const note = identity.querySelector('.note');
      if (note) note.textContent = 'ديوانيتك';
      move(bar, identity);
    }
    // Original DOM objects, including all listeners, are moved rather than copied.
    for (const node of [gear, bell, identity, friends]) if (node) bar.appendChild(node);

    actions = play;
    actions.classList.add('home-main-actions');
    actions.setAttribute('aria-label', 'اختر طاولتك');
    buttonCopy(go, 'العب بلوت', 'لعب فردي · ضد الكمبيوتر');
    go.setAttribute('aria-label', 'العب بلوت — خيارات اللعب الفردي ضد الكمبيوتر');
    const arrow = make('span', 'home-action-arrow', '←');
    arrow.setAttribute('aria-hidden', 'true');
    go.appendChild(arrow);

    card.classList.add('home-record');
    const recordHeading = make('div', 'home-record-heading');
    recordHeading.appendChild(make('span', 'home-record-title', 'سجلّك في قيد'));
    idBadge = make('span', 'home-player-id');
    idBadge.id = 'home-player-id';
    idBadge.hidden = true;
    idBadge.appendChild(make('span', '', 'ID'));
    const idValue = make('b');
    idValue.dir = 'ltr';
    idBadge.appendChild(idValue);
    recordHeading.appendChild(idBadge);
    card.insertBefore(recordHeading, card.firstChild);

    const secondary = make('section', 'home-secondary');
    secondary.setAttribute('aria-label', 'خيارات الديوانية');
    if (row) {
      row.classList.add('home-secondary-row');
      for (const button of [find('#roster-link'), find('#fr')]) if (button) row.appendChild(button);
      buttonCopy(find('#roster-link'), 'شخصيات قيد', 'اختر رفيق الطاولة');
      buttonCopy(find('#fr'), 'صكة على الماشي', 'حر · ٦١');
      secondary.appendChild(row);
    }
    const quickRow = make('div', 'home-secondary-row home-soon-row');
    const quick = find('#sk');
    const rules = find('#rules-link');
    buttonCopy(quick, 'صكّة قيد', 'لعب سريع · ١٥٢');
    if (rules) rules.hidden = true;
    move(quickRow, quick);
    secondary.appendChild(quickRow);

    // Navigation stays in document flow; no overlay competes with the controls.
    for (const node of [bar, hero, actions, card, secondary, nav]) if (node) menu.appendChild(node);
    if (nav) {
      nav.setAttribute('aria-label', 'التنقل الرئيسي');
      nav.setAttribute('role', 'navigation');
      nav.querySelector('.hm')?.setAttribute('aria-current', 'page');
    }
    rebuildSplash();
    refreshLogo();
    if (window.QaidRank && QaidRank.paint) QaidRank.paint();
    logoObserver = new MutationObserver(scheduleLogo);
    logoObserver.observe(root, { attributes: true, attributeFilter: ['style'] });
    if (document.head) logoObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
  }

  window.addEventListener('qaid:brand', scheduleLogo);
  document.addEventListener('load', scheduleLogo, true);
  window.QaidHomeNext = Object.freeze({
    mount,
    refresh() { mount(); refreshLogo(); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();

/* Prerecorded regional voice selection. No runtime TTS requests or password access. */
(() => {
  const banks=Array.isArray(window.QAID_VOICE_BANKS)?window.QAID_VOICE_BANKS:[];
  const modes=new Set([...banks.map(b=>b.id),'varied']);
  function hostPrefs(){try{if(typeof P!=='undefined'&&P&&typeof P==='object')return P;}catch(_){}return null;}
  function get(){const p=hostPrefs();let saved=p?.speechVoice;try{saved=saved||localStorage.getItem('qaid-speech-voice');}catch(_){}return modes.has(saved)?saved:'saudi';}
  function set(mode){if(!modes.has(mode))return get();window.QaidAudio?.stopSpeech();const p=hostPrefs();if(p)p.speechVoice=mode;try{localStorage.setItem('qaid-speech-voice',mode);if(typeof save==='function')save();}catch(_){}window.dispatchEvent(new CustomEvent('qaid-voice-selection',{detail:{mode}}));return mode;}
  function key(word,player,explicit){
    if(banks.some(b=>String(word).startsWith(b.id+'.')))return word;
    let mode=modes.has(explicit)?explicit:get();
    if(mode==='varied'){const seat=Number.isFinite(Number(player))?Math.abs(Math.trunc(Number(player))):0;mode=banks[seat%Math.max(1,banks.length)]?.id||'saudi';}
    const candidate=mode+'.'+word;return window.QAID_VOICE_CLIPS?.[candidate]?candidate:word;
  }
  window.QaidVoiceSelection={get,set,key,banks};
  const base=window.drawAudioControls;
  if(typeof base!=='function')return;
  function draw(){
    base();const audio=window.QaidAudio,extra=document.getElementById('qaid-audio-extra');if(!audio||!extra||banks.length<2)return; /* one voice: nothing to choose */
    let section=document.getElementById('qaid-voice-choice');
    if(!section){section=document.createElement('section');section.id='qaid-voice-choice';section.innerHTML='<h3>صوت الكلمات</h3><div id="c-voice-bank" class="ch" role="group" aria-label="اختيار صوت الكلمات"></div><p class="qaid-audio-note">السعودي هو الافتراضي. تتوفر أصوات كويتية وقطرية، أو تنويع الصوت حسب اللاعب. هذه أصوات مولّدة مسبقًا، ولا تحتاج اتصالًا بخدمة كلام أثناء اللعب.</p>';const group=section.querySelector('#c-voice-bank');for(const bank of [...banks,{id:'varied',label:'تنويع حسب اللاعب'}]){const button=document.createElement('button');button.type='button';button.dataset.voice=bank.id;button.textContent=bank.label;button.setAttribute('data-audio-skip','');group.append(button);}document.getElementById('c-speech')?.after(section);}
    if(!document.getElementById('qaid-voice-choice-style')){const style=document.createElement('style');style.id='qaid-voice-choice-style';style.textContent='#c-voice-bank{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}#c-voice-bank button{min-width:0;min-height:44px;line-height:1.4;font-size:14px}#qaid-voice-choice .qaid-audio-note{font-size:12px}';document.head.append(style);}
    const render=()=>{for(const button of section.querySelectorAll('button[data-voice]')){const on=button.dataset.voice===get();button.classList.toggle('on',on);button.setAttribute('aria-pressed',String(on));}};
    const sample=document.getElementById('speech-preview');if(sample){sample.textContent='تجربة «بَسْ»';sample.onclick=event=>{audio.au(event);audio.stopSpeech();if(get()==='varied'){for(const bank of banks)audio.voice('pass',{player:'preview',voice:bank.id,priority:10});}else audio.voice('pass',{player:'preview',priority:10});};}
    for(const button of section.querySelectorAll('button[data-voice]'))button.onclick=event=>{set(button.dataset.voice);render();sample?.onclick(event);};
    if(draw._handler)window.removeEventListener('qaid-voice-selection',draw._handler);draw._handler=render;window.addEventListener('qaid-voice-selection',render);render();
  }
  window.drawAudioControls=draw;
})();

/* Qaid Next speech: short, decision-only labels; never synthetic browser voices. */
(() => {
  const normal=t=>String(t||'').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/[!؟.،]/g,'').trim();
  function keys(text) {
    const t=normal(text);if(t.length>55)return [];
    const direct={'بس':'pass','ولا':'pass','صن':'sun','قبلك':'sun','اصنها':'sun','حكم':'hokm','حكم ثاني':'hokm2','اشكل':'ashkal','اشكل · صن':'ashkal','اكمل حكم':'hokm','دبل':'double','دبل ×٢':'double','دبل ×2':'double','دبل مفتوح':'double','دبل مقفل':'double','ثري':'three','فور':'four','قهوة':'coffee','سرا':'sequence','خمسين':'fifty','٥٠':'fifty','50':'fifty','مية':'hundred','مئة':'hundred','١٠٠':'hundred','100':'hundred','بلوت':'baloot','سوا':'sawa','قيدها':'qaid','كبوت':'kaboot','اكك':'akk'};
    if(direct[t])return [direct[t]];
    if(/^حكم\s*([♠♥♦♣]|سبيت|هاص|ديمن|شريا)$/.test(t))return ['hokm'];
    if(t.includes('+'))return t.split('+').flatMap(keys).slice(0,3);
    return [];
  }
  const modalIds=['ov','se'];
  const blocked=()=>modalIds.some(id=>document.getElementById(id)?.classList.contains('on'));
  function emit(label,player=0) {if(blocked())return;for(const key of keys(label))QaidAudio.voice(key,{player});}
  let bubbling=false;
  const motion=window.CardMotion;
  if(motion){window.CardMotion=Object.freeze({...motion,cancelAll(){QaidAudio.stopSpeech();return motion.cancelAll();}});}
  const observed=new WeakSet();
  const modals=new MutationObserver(records=>{if(records.some(r=>r.target.classList.contains('on')))QaidAudio.stopSpeech();});
  function observeDialogs(){for(const id of modalIds){const el=document.getElementById(id);if(el&&!observed.has(el)){observed.add(el);modals.observe(el,{attributes:true,attributeFilter:['class']});if(el.classList.contains('on'))QaidAudio.stopSpeech();}}}
  function mountObservers(){observeDialogs();if(!document.body)return;new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&modalIds.includes(n.id))))observeDialogs();}).observe(document.body,{childList:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountObservers,{once:true});else mountObservers();
  if(typeof bub==='function') {const original=bub;bub=function(p,t){bubbling=true;try{return original(p,t);}finally{bubbling=false;emit(t,p);}};}
  if(typeof say==='function') {const original=say;say=function(t,...args){const out=original(t,...args);if(!bubbling&&/^سوا\s/.test(normal(t)))emit('سوا');return out;};}
  if(typeof show==='function') {const original=show;show=function(id,...args){if(id!=='gm')QaidAudio.stopSpeech();return original(id,...args);};}
  // Server logs are newest-first and capped. Compare overlap, not array length.
  function additions(previous,next){
    if(!previous.length)return next.slice().reverse();
    const minimum=Math.max(0,next.length-previous.length);
    for(let shift=minimum;shift<next.length;shift++){
      const available=Math.min(previous.length,next.length-shift);
      if(available>0&&previous.slice(0,available).every((line,i)=>line===next[shift+i]))return next.slice(0,shift).reverse();
    }
    return []; // No overlap means rebaseline rather than replay an old history.
  }
  let roomCode='',round=-1,previous=[];
  window.addEventListener('qaid:table-snapshot',e=>{
    const d=e.detail;if(!d)return;const logs=Array.isArray(d.logs)?d.logs:[];
    if(d.code!==roomCode||d.round!==round){roomCode=d.code;round=d.round;previous=logs.slice();QaidAudio.stopSpeech();return;}
    for(const line of additions(previous,logs)) {
      const item=String(line),colon=item.indexOf(':');if(colon<0)continue;
      const who=item.slice(0,colon).trim();const actor=(d.players||[]).findIndex(p=>p&&p.name===who);if(actor<0)continue;
      let statement=item.slice(colon+1).trim().replace(/^أعلن\s+/,'');emit(statement,(actor-d.seat+4)%4);
    }
    previous=logs.slice();
  });
  window.addEventListener('qaid:auth',()=>{roomCode='';round=-1;previous=[];QaidAudio.stopSpeech();});
  window.QaidSpeechEvents={emit,keys,additions};
})();

/* Qaid — departure-dialog presentation only, unpublished.
 * Include once after the existing game/online scripts (or with defer).
 * Does not call/wrap ov, closeOv, leaveGame or any account/online/game action.
 * The original #ob, buttons, IDs and handlers remain untouched except classes.
 */
(() => {
  'use strict';
  const normalize = value => String(value || '')
    .normalize('NFC')
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  function attach() {
    const sheet = document.getElementById('ob');
    if (!sheet || sheet.dataset.qtbExitObserver === 'ready') return;
    sheet.dataset.qtbExitObserver = 'ready';

    function classify() {
      sheet.classList.remove('qtb-exit-dialog');
      const children = Array.from(sheet.children);
      const heading = children.find(node => node.tagName === 'H2');
      const title = normalize(heading && heading.textContent);
      const buttons = children.filter(node => node.tagName === 'BUTTON');
      if (buttons.length !== 2 || !['نطلع من الصكة؟', 'تغادر الجلسة؟'].includes(title)) return;

      const confirm = buttons.find(button => title === 'نطلع من الصكة؟'
        ? normalize(button.textContent) === 'خروج للديوانية'
        : button.id === 'online-exit-confirm' && normalize(button.textContent) === 'مغادرة');
      const cancel = buttons.find(button => button !== confirm && /^(?:لا[،,]?\s*)?نكمل$/.test(normalize(button.textContent)));
      if (!confirm || !cancel) return;

      // Classes on the existing nodes only. No wrapper or handler replacement.
      confirm.classList.add('qtb-role-primary', 'qtb-exit-confirm');
      cancel.classList.add('qtb-role-secondary', 'qtb-exit-cancel');
      sheet.classList.add('qtb-exit-dialog');
    }

    classify();
    // ov() replaces direct children with innerHTML. Attribute changes and the
    // rest of the document are deliberately not observed (no game-loop work).
    new MutationObserver(classify).observe(sheet, { childList: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach, { once: true });
  } else {
    attach();
  }
})();

