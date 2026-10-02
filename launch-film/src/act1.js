// Act 1 — the believable product-launch film for the new DSBA Hub (0–62 s) plus the DOM side of
// glitch #1 (62–66 s). Every time comes from cues.json.
import { W, H, el, chars, onFrame, scene, browser, cursor, callout, mulberry, clamp, lerp, prog, ease, track, filesPresent, loadBrand, hubLogo } from './lib.js';
import { COHORTS, cohortNodes, crossLinks } from './net.js';

const UI = '../assets/ui';
const YT = '../assets/yt';
const BRAND = '/dsba/public/brand';
const NEWS = '/dsba/public/demo/news';
const LOGOS = new URL('../assets/logos/', import.meta.url).href;

// ───────────────────────────────────────────────────────── s02 the pile-up (the film opens here)
// The film opens on a browser with the three portals a student keeps open, one per tab
// (cues.chaos.tabs: the cursor clicks through them). Then the notifications land on top of it:
// email, texts and WhatsApp.
//
// The pages are 1080 px wide captures of the student rep's own portals (already blurred where they
// need to be): assets/portals/<tab id>.png, shown 1:1 from the top. The tab icons are supplied
// files too; `file` ones live in assets/logos/ and a tab simply has no icon while its file is not
// there. Third-party logos are never drawn, recreated or approximated in this film.
const PORTALS = '../assets/portals';
const TAB_LOGO = { myclass: { src: `${BRAND}/myclass.png` }, 'lse-vle': { file: 'lse.png' }, uol: { src: `${BRAND}/uol.png` } };

// The notifications. One entry per cues.chaos.sources item, in the same order (pops[].src indexes
// both); the app name on the card is the cue's source name.
//   logo  the app icon: a file the student rep supplies in assets/logos/, shown when it is there
//   ic, col  the neutral stand-in while no file exists: an emoji on a plain tile, in colours that
//         are deliberately not the brand's own
//   msgs  [sender in bold, message], used in order and then round again; `pick` computes the nth
// Email only ever comes from the three institutions and texts only from BIBF. WhatsApp is a mix.
const UOL = 'University of London';
const LSE = 'LSE';
const BIBF = 'BIBF';
// every third WhatsApp card is the group BIBF runs; the others are the students' own groups
const WA_BIBF = { group: 'DSBA Announcement', msgs: ['BIBF: Please check your email', 'BIBF: Tomorrow’s class is cancelled', 'BIBF: Timetable updated, see MyClass'] };
const WA_GROUPS = ['DSBA Year 3', 'DSBA Men', 'The Boys', 'ST2133 · Group B', 'DSBA Year 2', 'EC2020 study group', 'DSBA Year 1', 'MN1178 · Group 4', 'Stats revision'];
const WA_CHAT = ['which email was it in??', 'link expired, resend pls', 'is it on the VLE or MyClass?', 'who has the past papers 🙏', 'scroll up, it was answered', 'check the other group', 'wrong group, sorry', 'did anyone get the email?', 'anyone have the notes?', 'forwarded many times', 'what chapter are we on', 'is class cancelled?', '+1', 'same question'];
const whatsapp = (n) => {
  if (n % 3 === 0) return [WA_BIBF.group, WA_BIBF.msgs[(n / 3) % WA_BIBF.msgs.length]];
  const k = n - Math.floor(n / 3) - 1;          // 0, 1, 2 … over the student cards
  return [WA_GROUPS[k % WA_GROUPS.length], WA_CHAT[k % WA_CHAT.length]];
};
const SRC = [
  { logo: 'outlook.png', ic: '✉️', col: '#e8590c',
    msgs: [[UOL, 'Exam entry is now open'], [BIBF, 'Timetable update (v3)'], [LSE, 'Assignment brief uploaded'], [BIBF, 'Room change for Thursday'], [UOL, 'Action needed: confirm your modules'], [LSE, 'Past examination papers updated'], [BIBF, 'Reminder: registration closes soon'], [UOL, 'Your assessment timetable is available'], [BIBF, 'Advisory session this week'], [LSE, 'New announcement in ST2134'], [UOL, 'Registration reminder'], [BIBF, 'Your fee receipt'], [LSE, 'VLE: new forum post in ST2133']] },
  { logo: 'gmail.png', ic: '✉️', col: '#5b6f94',
    msgs: [[LSE, 'New announcement in ST2134'], [UOL, 'Your assessment timetable is available'], [BIBF, 'Advisory session this week'], [LSE, 'Past examination papers updated'], [BIBF, 'Timetable update (v3)'], [UOL, 'Registration reminder'], [LSE, 'VLE: new forum post in ST2133'], [BIBF, 'Your fee receipt'], [UOL, 'Exam entry is now open'], [LSE, 'Assignment brief uploaded'], [BIBF, 'Room change for Thursday'], [UOL, 'Action needed: confirm your modules'], [BIBF, 'Reminder: registration closes soon']] },
  { logo: 'sms.png', ic: '💬', col: '#7048e8',
    msgs: [[BIBF, 'Today’s 4:00 PM class has moved to Room 204'], [BIBF, 'Reminder: registration closes tomorrow'], [BIBF, 'Tomorrow’s class is cancelled'], [BIBF, 'Your attendance has been updated']] },
  { logo: 'whatsapp.png', ic: '💬', col: '#1558f0', pick: whatsapp },
];
const LOGO_FILES = [...SRC.map((s) => s.logo), ...Object.values(TAB_LOGO).map((l) => l.file)].filter(Boolean);

// The first four notifications (one per source: Outlook from University of London, Gmail from LSE,
// a text from BIBF, WhatsApp from the BIBF group) are placed by hand: large, fully inside the frame,
// over the left and right edges of the browser (not its middle) and clear of the caption strip.
// left/top in px, k = size relative to the 400 px cards of the pile. Every later pop uses
// cues.chaos.pops[].x/y/rot.
const HERO = [
  { left: 96, top: 150, k: 1.56, rot: -1.6 },    // Outlook
  { left: 1216, top: 470, k: 1.5, rot: 1.6 },    // Gmail
  { left: 110, top: 560, k: 1.5, rot: 1.8 },     // SMS
  { left: 1250, top: 172, k: 1.4, rot: -2.0 },   // WhatsApp (under the unread count)
];
const BUB_W = 400;       // .bub is 400 px wide at k = 1 (film.css sizes the card in em)
const BUB_FONT = 22;

function s02({ tl, cues, stage, S, logos }) {
  const { start, end } = S('s02');
  const { tabs, pops, sources, captions, freeze, implode } = cues.chaos;
  const capsEnd = cues.chaos.captions_end ?? freeze;      // the last caption leaves here
  const tPile = pops[0].t;                                 // the first notification lands
  const root = scene(stage, 's02', start, end);
  root.innerHTML = `<div class="bg-grid"></div>
    <div class="bw bw--tabs"><div class="bw__tabbar"><div class="bw__dots"><i></i><i></i><i></i></div></div><div class="bw__pages"></div><div class="bw__dim"></div></div>
    <div class="bubs"></div><div class="band"></div><div class="unread"><i></i><span></span></div><div class="vignette"></div><div class="dot"></div>`;

  // the browser: three window dots, a tab per portal (no address bar), the page of the active tab
  const win = root.querySelector('.bw--tabs');
  const bar = win.querySelector('.bw__tabbar');
  const view = win.querySelector('.bw__pages');
  const dim = win.querySelector('.bw__dim');
  const tabEls = [];
  const pages = [];
  tabs.forEach((tab) => {
    const logo = TAB_LOGO[tab.id] || {};
    const src = logo.src || (logos.includes(logo.file) ? LOGOS + logo.file : null);
    const te = el('div', 'tab', `${src ? `<span class="tab__ic"><img decoding="sync" alt="" src="${src}"></span>` : ''}<b>${tab.title}</b>`);
    bar.appendChild(te);
    tabEls.push(te);
    const page = el('img', 'bw__page');
    page.decoding = 'sync';
    page.alt = '';
    page.src = `${PORTALS}/${tab.id}.png`;
    view.appendChild(page);
    pages.push(page);
  });
  onFrame((t) => {
    if (t < start || t >= end) return;
    let k = 0;
    tabs.forEach((tab, i) => { if (t >= tab.t) k = i; });
    // switching tabs is a hard swap: the new page starts a few pixels high and settles within three frames
    const lift = k ? Math.round(12 * (1 - ease.out5(prog(t, tabs[k].t, tabs[k].t + 0.2)))) : 0;
    tabEls.forEach((te, i) => te.classList.toggle('is-on', i === k));
    pages.forEach((pg, i) => {
      pg.style.visibility = i === k ? 'inherit' : 'hidden';
      pg.style.transform = i === k && lift ? `translateY(${-lift}px)` : 'none';
    });
    // at the freeze the browser drains of colour with the pile
    win.style.filter = t >= freeze ? `grayscale(${ease.out3(prog(t, freeze, freeze + 0.16)).toFixed(3)})` : 'none';
  });
  // the cursor clicks through the tabs at their cue times (window pixels; the arrow's tip is at 4, 2)
  const cur = cursor(win);
  gsap.set(cur.el, { x: 596, y: 452, autoAlpha: 1 });
  tabs.slice(1).forEach((tab, i) => {
    const te = tabEls[i + 1];
    // it lands on the tab past its title, so the arrow never covers the name
    cur.move(tl, te.offsetLeft + te.offsetWidth * 0.86 - 4, te.offsetTop + te.offsetHeight * 0.56 - 2, tab.t - 0.62, 0.5);
    cur.click(tl, tab.t);
  });
  cur.move(tl, 664, 318, tabs[tabs.length - 1].t + 0.14, 0.42);
  // From the first notification the browser recedes (smaller, dimmed) so the cards and the captions
  // read on top of it; it stays under the pile, greys at the freeze and goes into the dot with the cards.
  tl.to(win, { scale: 0.92, duration: 0.6, ease: 'power3.out' }, tPile - 0.04);
  tl.to(dim, { opacity: 0.66, duration: 0.5, ease: 'power2.out' }, tPile - 0.04);
  tl.to(dim, { opacity: 0.78, duration: 0.16, ease: 'power2.out' }, freeze);
  tl.to(win, { x: 960 - (win.offsetLeft + win.offsetWidth / 2), y: 540 - (win.offsetTop + win.offsetHeight / 2), scale: 0, rotation: -7, duration: 0.64, ease: 'power3.in' }, implode[0] + 0.03);

  const layer = root.querySelector('.bubs');
  const tile = (s) => (logos.includes(s.logo)
    ? `<div class="bub__ic bub__ic--logo"><img decoding="sync" alt="" src="${LOGOS + s.logo}"></div>`
    : `<div class="bub__ic" style="background:${s.col}"><b>${s.ic}</b></div>`);
  const used = SRC.map(() => 0);
  pops.forEach((p, i) => {
    const s = SRC[p.src];
    const n = used[p.src];
    used[p.src] += 1;
    const [who, text] = s.pick ? s.pick(n) : s.msgs[n % s.msgs.length];
    const hero = HERO[i];
    const k = hero ? hero.k : 1;
    const left = hero ? hero.left : Math.round(p.x * W - 60);
    const top = hero ? hero.top : Math.round(p.y * H - 20);
    const rot = hero ? hero.rot : p.rot;
    const b = el('div', `bub${i % 3 === 1 ? ' bub--l' : ''}`);
    b.innerHTML = `${tile(s)}<div class="bub__b"><div class="bub__app"><span>${sources[p.src]}</span><em>now</em></div><div class="bub__who">${who}</div><div class="bub__m">${text}</div></div>`;
    b.style.left = `${left}px`;
    b.style.top = `${top}px`;
    b.style.zIndex = i;
    if (hero) b.style.fontSize = `${(BUB_FONT * k).toFixed(2)}px`;
    layer.appendChild(b);
    gsap.set(b, { rotation: rot });
    tl.from(b, { scale: 0.3, opacity: 0, duration: hero ? 0.3 : 0.24, ease: 'back.out(2.4)' }, p.t);
    const r = mulberry(i * 31 + 7)();
    tl.to(b, { x: 960 - (left + (BUB_W / 2) * k), y: 540 - (top + 60 * k), scale: 0, rotation: rot + (r - 0.5) * 260, duration: 0.5 + r * 0.32, ease: 'power3.in' }, implode[0] + r * 0.14);
  });
  // the unread count: 1, 2, 3 with the first cards, then it runs away to 1,284
  const unread = root.querySelector('.unread');
  const unreadN = unread.querySelector('span');
  tl.from(unread, { y: -90, opacity: 0, duration: 0.4, ease: 'back.out(1.6)' }, pops[0].t + 0.05);
  tl.to(unread, { opacity: 0, duration: 0.2 }, freeze + 0.9);
  onFrame((t) => {
    if (t < start || t >= end) return;
    const n = pops.filter((p) => p.t <= Math.min(t, freeze)).length;
    const count = Math.max(n, Math.round(1284 * (Math.max(0, n - 1) / (pops.length - 1)) ** 1.6));
    unreadN.textContent = `${count.toLocaleString('en-US')} unread`;
  });
  // Captions: one place for the whole scene, the lower third, under the browser. Each stays until the
  // next; the last one leaves at captions_end, so the pile is alone at its densest before the freeze.
  // The dark strip behind them is only there while cards can land under a line of type.
  const band = root.querySelector('.band');
  gsap.set(band, { opacity: 0 });
  tl.to(band, { opacity: 1, duration: 0.4 }, tPile);
  tl.to(band, { opacity: 0, duration: 0.24 }, capsEnd - 0.16);
  tl.to(band, { opacity: 1, duration: 0.36 }, freeze + 0.14);
  tl.to(band, { opacity: 0, duration: 0.3 }, implode[0] - 0.05);
  captions.forEach((c, i) => {
    const cap = el('div', 'cap', c.text);
    root.insertBefore(cap, unread);
    const stop = i < captions.length - 1 ? captions[i + 1].t : capsEnd;
    tl.from(cap, { y: 46, opacity: 0, scale: 0.96, duration: 0.26, ease: 'power3.out' }, c.t);
    tl.to(cap, { y: -34, opacity: 0, duration: 0.16, ease: 'power2.in' }, stop - 0.16);
  });
  // the freeze: everything stops and drains of colour
  tl.to(layer, { filter: 'grayscale(1) brightness(0.42)', scale: 0.985, duration: 0.16, ease: 'power2.out' }, freeze);
  const calm = el('div', 'cap cap--calm', cues.chaos.calm);
  root.insertBefore(calm, unread);
  tl.from(calm, { opacity: 0, y: 24, duration: 0.4, ease: 'power2.out' }, freeze + 0.22);
  tl.to(calm, { opacity: 0, scale: 0.9, duration: 0.22, ease: 'power2.in' }, implode[0] - 0.12);
  const dot = root.querySelector('.dot');
  tl.from(dot, { scale: 0, duration: 0.3, ease: 'back.out(3)' }, implode[1] - 0.34);
}

// ───────────────────────────────────────────────────────── s03 the name
// The wordmark artwork is sized to the cap height of the 300 px type beside it (the image has a
// sliver of padding under its letters, so it hangs that much below the baseline).
const LOGO_H = 222;
const LOGO_DROP = -3;
function s03({ tl, cues, stage, S }) {
  const { start, end } = S('s03');
  const T = cues.logo;
  const root = scene(stage, 's03', start, end);
  // the highlighter lands on "help"; if the line is ever rewritten without it, on its last two words
  const words = T.tagline_text.split(' ');
  let a = words.findIndex((w) => /^help\b/i.test(w));
  let b = a + 1;
  if (a < 0) { a = Math.max(0, words.length - 2); b = words.length; }
  const tagHtml = [words.slice(0, a).join(' '), `<span class="hl">${words.slice(a, b).join(' ')}</span>`, words.slice(b).join(' ')].filter(Boolean).join(' ');
  root.innerHTML = `<div class="bg-grid"></div><div class="flash"></div><div class="shock"></div><div class="intro-label">${T.label}</div>
    <div class="lockup"><div class="lockup__row"><div class="wordmark">${T.wordmark}</div></div>
      <div class="tagline">${tagHtml}</div>
      <div class="subline">${T.subline_text}</div><div class="pills"></div></div>
    <div class="partners"><span>For the DSBA programme at</span><img decoding="sync" src="${BRAND}/bibf-white.png"><i></i><img decoding="sync" class="crest" src="${BRAND}/uol.png"></div>
    <div class="vignette"></div>`;
  const lockup = root.querySelector('.lockup');
  const row = root.querySelector('.lockup__row');
  // Mohamed's DSBA wordmark (assets/brand): the artwork says "DSBA", the type beside it says "Hub".
  // Without the file the name is set in type alone.
  const logo = hubLogo(LOGO_H);
  if (logo) {
    row.insertBefore(logo, row.firstChild);
    row.classList.add('has-logo');
    row.querySelector('.wordmark').textContent = T.wordmark.replace(/^DSBA\s*/, '');
    logo.style.marginBottom = `${LOGO_DROP}px`;
  }
  // the drop: the dot the pile collapsed into bursts, and the name comes out of it
  const flash = root.querySelector('.flash');
  tl.fromTo(flash, { scale: 0.08, opacity: 1 }, { scale: 7, opacity: 0, duration: 0.95, ease: 'power2.out' }, T.drop);
  tl.fromTo(root.querySelector('.shock'), { scale: 0.04, opacity: 1 }, { scale: 5.6, opacity: 0, duration: 0.8, ease: 'power2.out' }, T.drop);
  // The name lands exactly where the dot was (frame centre) and holds there, alone, under its label;
  // it then rises into the lockup as the tagline arrives.
  const rise = 540 - (lockup.offsetTop + row.offsetTop + row.offsetHeight / 2);
  tl.fromTo(row, { scale: 0.03, y: rise }, { scale: 1.1, y: rise, duration: 0.62, ease: 'expo.out' }, T.drop);
  tl.to(row, { scale: 1, y: 0, duration: 0.7, ease: 'power3.inOut' }, T.tagline - 0.45);
  const label = root.querySelector('.intro-label');
  gsap.set(label, { y: rise });
  tl.from(label, { opacity: 0, duration: 0.4, ease: 'power2.out' }, T.drop + 0.3);
  tl.to(label, { opacity: 0, duration: 0.3 }, T.tagline - 0.55);
  const tag = root.querySelector('.tagline');
  const hl = tag.querySelector('.hl');
  tl.from(tag, { y: 56, opacity: 0, duration: 0.6, ease: 'power4.out' }, T.tagline);
  tl.fromTo(hl, { '--hlx': 0 }, { '--hlx': 1, duration: 0.4, ease: 'power3.out' }, T.tagline + 0.22);
  tl.fromTo(hl, { color: '#f2f6ff' }, { color: '#0a1f44', duration: 0.16, ease: 'none' }, T.tagline + 0.26);
  tl.from(root.querySelector('.subline'), { y: 30, opacity: 0, duration: 0.55, ease: 'power3.out' }, T.subline);
  const pills = root.querySelector('.pills');
  T.pills_text.forEach((p, i) => {
    const pill = el('div', 'pill', p);
    pills.appendChild(pill);
    tl.from(pill, { scale: 0.4, opacity: 0, y: 34, duration: 0.42, ease: 'back.out(2.2)' }, T.pills + i * T.pill_step);
  });
  const partners = root.querySelector('.partners');
  tl.from(partners, { opacity: 0, y: 26, duration: 0.5, ease: 'power2.out' }, T.pills + 2.1);
  tl.to(lockup, { y: -170, opacity: 0, scale: 0.92, duration: 0.5, ease: 'power3.in' }, end - 0.55);
  tl.to(partners, { opacity: 0, duration: 0.3 }, end - 0.55);
}

// ───────────────────────────────────────────────────────── s04 newsletter
function s04({ tl, cues, config, stage, S }) {
  const { start, end } = S('s04');
  const T = cues.newsletter;
  const root = scene(stage, 's04', start, end);
  root.innerHTML = `<div class="bg-grid"></div>`;
  const title = el('div', 'sec-title', `<div class="kick">Feature 01</div><div class="title-serif">${T.title}</div>`);
  const order = ['newsletter', 'issue-top', 'issue-council', 'issue-speech'];
  const bw = browser({ width: 1380, url: `${config.product.url}/#/newsletter`, screens: order });
  bw.el.style.left = '440px';
  bw.el.style.top = '140px';
  root.append(bw.el, title, el('div', 'vignette'));
  tl.from(title, { opacity: 0, y: 70, duration: 0.6, ease: 'power4.out' }, T.start);
  tl.to(title, { scale: 0.3, x: -30, y: -78, duration: 0.7, ease: 'power3.inOut' }, T.start + 0.65);
  tl.fromTo(bw.el, { opacity: 0, rotationY: -36, rotationX: 15, z: -900, y: 280 }, { opacity: 1, rotationY: -9, rotationX: 4, z: 0, y: 0, duration: 1.25, ease: 'power3.out' }, T.browser_in);
  tl.to(bw.el, { rotationY: 7, rotationX: 2, duration: 4.4, ease: 'sine.inOut' }, T.browser_in + 1.25);
  // "scroll" between screens: each new screen slides up from below
  order.forEach((name, i) => {
    bw.imgs[name].style.clipPath = 'inset(64px 0 0 265px)';
    if (i) {
      gsap.set(bw.imgs[name], { y: H });
      tl.to(bw.imgs[name], { y: 0, duration: 0.6, ease: 'power3.inOut' }, T.slides[i - 1]);
      tl.to(bw.imgs[order[i - 1]], { y: -H, duration: 0.6, ease: 'power3.inOut' }, T.slides[i - 1]);
    }
  });
  // the app's rail and top bar stay put while the reading pane slides underneath
  const chrome = el('img', 'bw__screen');
  chrome.src = `${UI}/newsletter.png`;
  chrome.decoding = 'sync';
  chrome.style.clipPath = 'polygon(0 0, 1920px 0, 1920px 64px, 265px 64px, 265px 1080px, 0 1080px)';
  chrome.style.zIndex = 5;
  bw.content.appendChild(chrome);
  const s0 = bw.s0;
  const at = (sx, sy) => [sx * s0, 46 + sy * s0];
  const spots = [[930, 352, 'right', 0.82], [880, 492, 'right', 0.72], [1690, 470, 'left', 0.6], [1290, 560, 'left', 0.62]];
  T.callouts.forEach((c, i) => {
    const [sx, sy, side, hold] = spots[i];
    callout(bw.el, c.text, ...at(sx, sy), { side }).show(tl, c.t, hold);
  });
  // the stories fan out in front
  tl.to(bw.el, { scale: 0.84, opacity: 0.16, z: -260, duration: 0.55, ease: 'power3.inOut' }, T.covers - 0.1);
  const covers = el('div', 'covers');
  root.insertBefore(covers, title);
  const picks = [
    { src: `${NEWS}/speech-day.jpg`, w: 340, x: -520, r: -9, z: 0, d: 0.12 },
    { src: `${NEWS}/cfa-research-challenge.jpg`, w: 560, x: 540, r: 7, z: 0, d: 0.24 },
    { src: `${UI}/cover-0.png`, w: 430, x: 0, r: 0, z: 120, d: 0 },
  ];
  picks.forEach((c) => {
    const img = el('img', 'cover');
    img.src = c.src;
    img.decoding = 'sync';
    img.style.width = `${c.w}px`;
    covers.appendChild(img);
    gsap.set(img, { xPercent: -50, yPercent: -50, x: c.x, rotation: c.r, z: c.z });
    tl.from(img, { y: 900, rotation: c.r * 4 + 14, opacity: 0, duration: 0.85, ease: 'back.out(1.25)' }, T.covers + c.d);
    tl.to(img, { y: -14, duration: 2.0, ease: 'sine.inOut' }, T.covers + 1.15);
  });
  const cw = T.caption.split(', ');
  const cap = el('div', 'caption', `${cw[0]}, <span class="hl">${cw[1]}</span>`);
  root.insertBefore(cap, title);
  tl.from(cap, { y: 50, opacity: 0, duration: 0.5, ease: 'power4.out' }, T.read_time);
  tl.fromTo(cap.querySelector('.hl'), { '--hlx': 0 }, { '--hlx': 1, duration: 0.35, ease: 'power3.out' }, T.read_time + 0.35);
  tl.to([covers, cap, title], { x: -260, opacity: 0, duration: 0.42, ease: 'power3.in' }, end - 0.48);
}

// ───────────────────────────────────────────────────────── s05 forum
function s05({ tl, cues, config, stage, manifest: M, S }) {
  const { start, end } = S('s05');
  const T = cues.forum;
  const EGG = T.easter_egg;
  const root = scene(stage, 's05', start, end);
  root.innerHTML = `<div class="bg-grid"></div>`;
  const title = el('div', 'sec-title', `<div class="kick">Feature 02 · Forum</div><div class="title-sans">Ask anything.</div>`);
  const frames = Array.from({ length: M.composerFrames }, (_, i) => `composer-${String(i).padStart(2, '0')}`);
  const bw = browser({ width: 1380, url: `${config.product.url}/#/forum`, screens: ['forum', ...frames, 'composer-final', 'forum-posted'] });
  bw.el.style.left = '100px';
  bw.el.style.top = '140px';
  root.append(bw.el, title, el('div', 'vignette'));
  gsap.set(title, { left: 'auto', right: 110, transformOrigin: '100% 0', textAlign: 'right' });
  tl.from(title, { opacity: 0, y: 70, duration: 0.6, ease: 'power4.out' }, T.start);
  tl.to(title, { scale: 0.34, y: -100, x: 30, duration: 0.7, ease: 'power3.inOut' }, T.start + 0.65);
  tl.fromTo(bw.el, { opacity: 0, rotationY: 36, rotationX: 14, z: -900, y: 280, x: 340 }, { opacity: 1, rotationY: 8, rotationX: 3, z: 0, y: 0, x: 200, duration: 1.0, ease: 'power3.out' }, T.start + 0.72);
  tl.to(bw.el, { rotationY: -5, rotationX: 2, duration: end - start - 2.4, ease: 'sine.inOut' }, T.start + 1.6);

  // which screen is up, and where the camera looks (screen pixels + zoom)
  const tOpen = T.composer_open;
  const tPost = T.post_appears;
  const tTyped = T.typing[T.typing.length - 1];
  const tFinal = tTyped + 0.12;          // the page scrolls down to the attached question + Post
  const screenAt = (t) => {
    if (t < tOpen + 0.06) return 'forum';
    if (t >= tPost) return 'forum-posted';
    if (t >= tFinal) return 'composer-final';
    return frames[T.typing.filter((x) => x <= t).length];
  };
  const eggY = M.postedEggRow.y + M.postedEggRow.h / 2;
  const att = M.composerAttachmentFinal;
  const lin = (p) => p;
  const cam = track([
    { t: T.threads_in + 0.2, v: { fx: 960, fy: 540, z: 1 } },
    { t: T.threads_in + 1.3, v: { fx: 940, fy: 590, z: 1.5 } },
    { t: tOpen - 0.55, v: { fx: 940, fy: 600, z: 1.56 } },
    { t: tOpen - 0.15, v: { fx: 1180, fy: 420, z: 1.16 } },
    { t: tOpen + 0.06, v: { fx: 930, fy: 520, z: 1.3 }, cut: true },
    { t: tTyped + 0.1, v: { fx: 930, fy: 690, z: 1.18 }, e: lin },
    { t: tFinal, v: { fx: 930, fy: att.y + att.h / 2 - 40, z: 1.3 }, cut: true },
    { t: T.post_click - 0.05, v: { fx: 960, fy: att.y + att.h / 2 + 30, z: 1.2 }, e: lin },
    { t: tPost, v: { fx: 930, fy: 440, z: 1.56 }, cut: true },
    { t: EGG.start - 0.5, v: { fx: 930, fy: 450, z: 1.5 }, e: lin },
    { t: EGG.start - 0.02, v: { fx: 900, fy: eggY, z: 2.05 } },
    { t: EGG.end + 0.2, v: { fx: 900, fy: eggY, z: 2.2 }, e: lin },
  ]);
  // the vote count the film animates (the captures hide the real one)
  const vote = el('div', 'votebox');
  bw.content.appendChild(vote);
  const marker = el('div', 'marker');
  bw.content.appendChild(marker);
  Object.assign(marker.style, { left: `${M.postedEggRow.x + 78}px`, top: `${M.postedEggRow.y + 12}px`, width: '326px', height: '30px' });
  tl.fromTo(marker, { scaleX: 0 }, { scaleX: 1, duration: 0.34, ease: 'power3.out' }, EGG.end - 0.45);
  tl.fromTo(vote, { scale: 1 }, { scale: 1.9, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.out' }, EGG.end - 0.02);
  onFrame((t) => {
    if (t < start || t >= end) return;
    const name = screenAt(t);
    for (const [n, img] of Object.entries(bw.imgs)) img.style.visibility = n === name ? 'inherit' : 'hidden';
    const c = cam(t);
    gsap.set(bw.content, bw.focus(c.fx, c.fy, c.z));
    const r = name === 'forum' ? M.forumEggCount : M.postedEggCount;
    const onList = name === 'forum' || name === 'forum-posted';
    vote.style.visibility = onList ? 'inherit' : 'hidden';
    marker.style.visibility = name === 'forum-posted' ? 'inherit' : 'hidden';
    Object.assign(vote.style, { left: `${r.x - 8}px`, top: `${r.y}px`, width: `${r.w + 16}px`, height: `${r.h}px` });
    const n = EGG.ticks.filter((x) => x <= t).length;
    vote.textContent = String(23 + Math.round((EGG.votes - 23) * (n / EGG.ticks.length)));
    vote.classList.toggle('is-hot', t >= EGG.start);
  });
  // upvote rings on the first rows
  [0, 1, 2].forEach((i) => {
    const ring = el('div', 'ring');
    ring.style.left = `${M.forumFirstRow.x + 40}px`;
    ring.style.top = `${M.forumFirstRow.y + 43 + i * 105}px`;
    bw.content.appendChild(ring);
    tl.fromTo(ring, { scale: 0.3, opacity: 0.95 }, { scale: 1.7, opacity: 0, duration: 0.5, ease: 'power2.out' }, T.threads_in + 1.0 + i * 0.22);
  });
  const caps = [
    ['Upvote what', 'helped.', T.threads_in + 1.05, T.threads_in + 2.2],
    ['Answers you can', 'trust.', T.threads_in + 2.2, tOpen - 0.1],
    ['Stuck? Ask', 'every cohort.', tOpen + 0.3, tOpen + 2.2],
  ];
  caps.forEach(([a, b, t0, t1]) => {
    const cap = el('div', 'caption caption--left', `${a} <span class="hl">${b}</span>`);
    root.appendChild(cap);
    tl.from(cap, { y: 60, opacity: 0, duration: 0.3, ease: 'power4.out' }, t0);
    tl.fromTo(cap.querySelector('.hl'), { '--hlx': 0 }, { '--hlx': 1, duration: 0.26, ease: 'power3.out' }, t0 + 0.2);
    tl.to(cap, { opacity: 0, y: -26, duration: 0.14, ease: 'power2.in' }, t1 - 0.14);
  });
  // cursor (screen pixels)
  const cur = cursor(bw.content);
  const sx = M.forumStart.x + M.forumStart.w / 2;
  const sy = M.forumStart.y + M.forumStart.h / 2;
  cur.place(tl, 1180, 640, tOpen - 0.6);
  cur.move(tl, sx, sy, tOpen - 0.55, 0.5);
  cur.click(tl, tOpen);
  cur.move(tl, M.composerTitle.x + 470, M.composerTitle.y + 70, tOpen + 0.1, 0.25);
  const px = M.composerPost.x + M.composerPost.w / 2;
  const py = M.composerPost.y + M.composerPost.h / 2;
  tl.set(cur.el, { x: px - 260, y: py - 150 }, tFinal);
  cur.move(tl, px, py, tFinal + 0.02, Math.max(0.15, T.post_click - tFinal - 0.06), 'power2.out');
  cur.click(tl, T.post_click);
  tl.to(cur.el, { autoAlpha: 0, duration: 0.1 }, tPost);
  // The reply pops in over the frame, top right, clear of the thread it answers and of the row the
  // camera lands on. It is long, so it stays until the scene leaves. The cue sheet holds one card
  // (cues.forum.reply_cards with its time in cues.forum.replies); any further one would stack below it.
  const tint = ['#c5f6fa', '#d0e2ff', '#ffe8cc'];
  const spot = { right: 96, top: 214, step: 250 };
  T.reply_cards.forEach((r, i) => {
    const at = T.replies[i] ?? T.replies[T.replies.length - 1] + 0.5 * (i - T.replies.length + 1);
    const bg = r.year ? tint[r.year - 1] : '#e7edfb';
    const tags = `${r.flair ? `<em class="reply__flair">${r.flair}</em>` : ''}${r.year ? `<em style="background:${bg}">Year ${r.year}</em>` : ''}`;
    const card = el('div', 'reply', `<div class="reply__av" style="background:${bg}">${r.name.split(' ').map((w) => w[0]).join('')}</div>
      <div class="reply__b"><div class="reply__n">${r.name}${tags}</div><div class="reply__m">${r.text}</div></div>`);
    card.style.right = `${spot.right}px`;
    card.style.top = `${spot.top + i * spot.step}px`;
    root.insertBefore(card, title);
    gsap.set(card, { rotation: i % 2 ? -1.4 : 1.4 });
    tl.from(card, { x: 260, opacity: 0, scale: 0.8, duration: 0.36, ease: 'back.out(1.8)' }, at);
    tl.to(card, { x: 180, opacity: 0, duration: 0.22, ease: 'power2.in' }, end - 0.34 + i * 0.03);
  });
  // the vote widget pulses while the count runs up
  [0.05, 0.5, 0.95, 1.4].forEach((d) => {
    const ring = el('div', 'ring');
    ring.style.left = `${M.postedEggCount.x + M.postedEggCount.w / 2}px`;
    ring.style.top = `${M.postedEggCount.y - 6}px`;
    bw.content.appendChild(ring);
    tl.fromTo(ring, { scale: 0.4, opacity: 0.9 }, { scale: 1.5, opacity: 0, duration: 0.45, ease: 'power2.out' }, EGG.start + d);
  });
  tl.to(bw.el, { opacity: 0, x: -140, rotationY: -22, duration: 0.3, ease: 'power3.in' }, end - 0.32);
  tl.to(title, { opacity: 0, duration: 0.25 }, end - 0.3);
}

// ───────────────────────────────────────────────────────── s06 montage
function s06({ tl, cues, config, stage, manifest: M, S }) {
  const { start, end } = S('s06');
  const T = cues.montage;
  const cuts = Object.fromEntries(T.cuts.map((c) => [c.id, c]));
  const root = scene(stage, 's06', start, end);
  root.innerHTML = `<div class="bg-grid"></div>`;
  const cmdk = Array.from({ length: M.cmdkFrames }, (_, i) => `cmdk-${String(i).padStart(2, '0')}`);
  const careerSeq = Array.from({ length: M.careerFrames }, (_, i) => `career-${String(i).padStart(2, '0')}`);
  const bw = browser({ width: 1500, url: config.product.url, screens: ['library', 'viewer-fine', 'lessons', ...careerSeq, 'calendar', 'grades', ...cmdk] });
  bw.el.style.left = '210px';
  bw.el.style.top = '70px';
  root.append(bw.el);
  gsap.set(bw.el, { opacity: 0 });
  const tPlay = T.lesson_play_click;
  const [tScroll0] = T.career_scroll;          // the page scrolls from the employers to the certificates
  const post = M.lessonsPoster;
  // each beat: screen, frame pose, camera start → end (slow push), until the next beat
  const beats = [
    { t: cuts.library.t, s: 'library', ry: -13, rx: 5, a: [960, 500, 1.0], b: [900, 470, 1.14] },
    { t: T.file_preview_click, s: 'viewer-fine', ry: -13, rx: 5, a: [936, 575, 1.4], b: [936, 590, 1.95] },
    { t: cuts.lessons.t, s: 'lessons', ry: 11, rx: 4, a: [1000, 560, 1.08], b: [post.x + post.w / 2 + 60, post.y + post.h / 2 + 10, 1.42] },
    { t: cuts.career.t, s: 'career', ry: -9, rx: 5, a: [1092, 520, 1.2], b: [1092, 580, 1.33] },
    { t: cuts.calendar.t, s: 'calendar', ry: -8, rx: 7, a: [1090, 440, 1.08], b: [1090, 500, 1.36] },
    { t: cuts.grades.t, s: 'grades', ry: 12, rx: 3, a: [1090, 420, 1.12], b: [1090, 440, 1.38] },
    { t: cuts.search.t, s: null, ry: 0, rx: 2, a: [960, 480, 1.16], b: [960, 470, 1.3] },
    { t: cuts.network.t, s: 'OUT' },
  ];
  const urls = { library: '/#/library', 'viewer-fine': '/#/library/st2187-business-analytics', lessons: '/#/modules/st2133', career: '/#/career', calendar: '/#/calendar', grades: '/#/grades' };
  const urlEl = bw.el.querySelector('.bw__url');
  // the lesson "plays": a real frame of the lecture + a progress bar, over the poster
  const play = el('div', 'playframe', `<img src="${YT}/qIzC1-9PwQo.frame3.jpg"><div class="playframe__bar"><i></i><b></b></div><div class="playframe__t"></div>`);
  Object.assign(play.style, { left: `${post.x}px`, top: `${post.y}px`, width: `${post.w}px`, height: `${post.h}px` });
  bw.content.appendChild(play);
  const playBar = play.querySelector('.playframe__bar b');
  const playT = play.querySelector('.playframe__t');
  onFrame((t) => {
    if (t < start || t >= end) return;
    let k = 0;
    while (k < beats.length - 1 && t >= beats[k + 1].t) k += 1;
    const b = beats[k];
    if (b.s === 'OUT') { gsap.set(bw.el, { opacity: 0 }); return; }
    const next = beats[k + 1].t;
    const p = prog(t, b.t, next);
    let name = b.s;
    if (!name) name = cmdk[T.search_typing.filter((x) => x <= t).length];
    const page = name;                           // for the address bar
    // one captured frame per film frame while the page scrolls; the first before, the last after
    if (name === 'career') name = careerSeq[clamp(Math.round((t - tScroll0) * 30), 0, careerSeq.length - 1)];
    for (const [n, img] of Object.entries(bw.imgs)) img.style.visibility = n === name ? 'inherit' : 'hidden';
    const punch = 1 + 0.07 * (1 - ease.out5(prog(t, b.t, b.t + 0.32)));
    gsap.set(bw.el, { rotationY: b.ry + p * (b.ry > 0 ? -3 : 3), rotationX: b.rx, scale: punch, opacity: 1 });
    gsap.set(bw.content, bw.focus(lerp(b.a[0], b.b[0], p), lerp(b.a[1], b.b[1], p), lerp(b.a[2], b.b[2], p)));
    urlEl.lastChild.textContent = `${config.product.url}${urls[page] || ''}`;
    const playing = b.s === 'lessons' && t >= tPlay + 0.04;
    play.style.visibility = playing ? 'inherit' : 'hidden';
    if (playing) {
      const pp = t - tPlay;
      play.style.opacity = String(clamp(pp / 0.14));
      playBar.style.width = `${(62 + pp * 2.2).toFixed(2)}%`;
      const sec = Math.floor(9 * 60 + 24 + pp * 1);
      playT.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} / 14:15`;
    }
  });
  // library: the new files lift off the shelf toward the viewer
  const fly = M.thumbs.slice(0, 6).map((th, i) => {
    const img = el('img', 'thumbfly');
    img.src = `${UI}/${th.name}.png`;
    img.decoding = 'sync';
    Object.assign(img.style, { left: `${th.x}px`, top: `${th.y}px`, width: `${th.w}px`, height: `${th.h}px`, zIndex: 10 + i });
    bw.content.appendChild(img);
    tl.to(img, { y: -70 - Math.sin((i / 5) * Math.PI) * 60, x: (i - 2.5) * 26, scale: 1.62, rotation: (i - 2.5) * 4.5, duration: 0.45, ease: 'back.out(1.5)' }, cuts.library.t + 0.3 + i * 0.05);
    return img;
  });
  onFrame((t) => { const on = t >= cuts.library.t && t < T.file_preview_click; fly.forEach((f) => { f.style.visibility = on ? 'inherit' : 'hidden'; }); });
  // cursor: opens a file, presses play
  const cur = cursor(bw.content);
  const t0 = M.thumbs[0];
  cur.place(tl, 1100, 760, cuts.library.t + 0.3);
  cur.move(tl, t0.x + 60, t0.y - 40, cuts.library.t + 0.36, 0.5);
  cur.click(tl, T.file_preview_click - 0.04);
  tl.set(cur.el, { autoAlpha: 0 }, T.file_preview_click + 0.02);
  const pl = M.lessonsPlay;
  tl.set(cur.el, { x: 1420, y: 860, autoAlpha: 1 }, cuts.lessons.t + 0.05);
  cur.move(tl, pl.x + pl.w / 2 - 4, pl.y + pl.h / 2 - 2, cuts.lessons.t + 0.15, 0.6);
  cur.click(tl, tPlay);
  const ring = el('div', 'ring');
  Object.assign(ring.style, { left: `${pl.x + pl.w / 2}px`, top: `${pl.y + pl.h / 2}px`, width: '120px', height: '120px', margin: '-60px', borderColor: '#fff', zIndex: 12 });
  bw.content.appendChild(ring);
  tl.fromTo(ring, { scale: 0.6, opacity: 0.9 }, { scale: 2.6, opacity: 0, duration: 0.8, ease: 'power2.out' }, tPlay);
  tl.to(cur.el, { autoAlpha: 0, duration: 0.2 }, tPlay + 0.35);
  tl.set(cur.el, { autoAlpha: 0 }, cuts.career.t);
  // captions (one at a time, bottom left)
  T.cuts.forEach((c, i) => {
    if (c.id === 'built_by') return;
    const words = c.caption.split(' ');
    const last = words.pop();
    const cap = el('div', 'caption caption--left', `${words.join(' ')} <span class="hl">${last}</span>`);
    root.appendChild(cap);
    const stop = T.cuts[i + 1] ? T.cuts[i + 1].t : end;
    tl.from(cap, { y: 60, opacity: 0, duration: 0.3, ease: 'power4.out' }, c.t + 0.06);
    tl.fromTo(cap.querySelector('.hl'), { '--hlx': 0 }, { '--hlx': 1, duration: 0.26, ease: 'power3.out' }, c.t + 0.26);
    tl.to(cap, { opacity: 0, y: -26, duration: 0.12, ease: 'power2.in' }, stop - 0.12);
  });
  // network: three cohorts of students, joined up (the same layout returns, in gold, in Act 3)
  const svgNS = 'http://www.w3.org/2000/svg';
  const net = document.createElementNS(svgNS, 'svg');
  net.setAttribute('class', 'net');
  net.setAttribute('viewBox', '0 0 1920 1080');
  root.appendChild(net);
  const pts = cohortNodes();
  const links = crossLinks(pts, 72);
  const mk = (tag, attrs) => { const n = document.createElementNS(svgNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); net.appendChild(n); return n; };
  const NT = cuts.network.t;
  links.forEach(([a, b], i) => {
    const A = pts[a];
    const B = pts[b];
    const ln = mk('line', { x1: A.x, y1: A.y, x2: B.x, y2: B.y });
    const len = Math.hypot(B.x - A.x, B.y - A.y);
    gsap.set(ln, { strokeDasharray: len, strokeDashoffset: len });
    tl.to(ln, { strokeDashoffset: 0, duration: 0.55, ease: 'power2.out' }, NT + 0.7 + (i / links.length) * 1.0);
  });
  pts.forEach((p, i) => {
    const c = mk('circle', { cx: p.x, cy: p.y, r: 6.5, fill: p.hex });
    tl.from(c, { attr: { r: 0 }, duration: 0.3, ease: 'back.out(3)' }, NT + 0.04 + (i / pts.length) * 0.62);
  });
  COHORTS.forEach((g, i) => {
    const tx = mk('text', { x: g.c[0], y: g.c[1] - 198, 'text-anchor': 'middle', fill: g.hex, 'font-size': 38, 'font-weight': 700, 'font-family': 'Schibsted' });
    tx.textContent = g.label;
    tl.from(tx, { opacity: 0, duration: 0.3 }, NT + 0.3 + i * 0.1);
  });
  // "Built by students. For all of DSBA."
  const big = el('div', 'big-center', `<div>Built by students.</div><div><span class="hl">For all of DSBA.</span></div>`);
  root.appendChild(big);
  root.appendChild(el('div', 'vignette'));
  const BT = cuts.built_by.t;
  tl.to(net, { opacity: 0.2, duration: 0.3 }, BT - 0.1);
  tl.from(chars(big.children[0]), { y: 110, opacity: 0, duration: 0.55, ease: 'power4.out', stagger: 0.018 }, BT);
  tl.from(big.children[1], { y: 80, opacity: 0, duration: 0.5, ease: 'power4.out' }, BT + 0.5);
  tl.fromTo(big.querySelector('.hl'), { '--hlx': 0 }, { '--hlx': 1, duration: 0.36, ease: 'power3.out' }, BT + 0.72);
  tl.to([big, net], { opacity: 0, scale: 0.94, duration: 0.3, ease: 'power3.in' }, end - 0.32);
}

// ───────────────────────────────────────────────────────── s07 launch + glitch #1 (DOM side)
const ERRS = [
  { bar: 'hub.exe', ic: '✕', m: 'hub.exe has stopped responding.', x: 130, y: 96 },
  { bar: 'file-watcher', ic: '!', warn: 1, m: 'Unexpected file found:<br>surprise.mp4', x: 930, y: 150 },
  { bar: 'launchd', ic: '✕', m: 'Launch sequence overridden.', x: 250, y: 420 },
  { bar: 'system', ic: '!', warn: 1, m: 'This was never about an app.', x: 950, y: 520 },
  { bar: 'surprise.mp4', ic: '▶', m: 'Loading the real reason<br>we’re here…', x: 530, y: 300, prog: 1 },
  { bar: 'notice', ic: '!', warn: 1, m: 'Please remain seated.', x: 640, y: 690 },
];

function s07({ tl, cues, config, stage, S }) {
  const T = cues.launch;
  const G = cues.g1;
  const start = S('s07').start;
  const root = scene(stage, 's07', start, G.end);
  const NAME = config.product.name;
  root.innerHTML = `<div class="bg-grid"></div><div class="wall"></div><div class="wall-shade"></div>
    <div class="count"></div>
    <div class="launch-top"><span>${NAME}</span></div>
    <div class="launch-h">Launching today.</div>
    <div class="btn-launch"><span>Launch ${NAME}</span></div>
    <div class="vignette"></div>`;
  const wall = root.querySelector('.wall');
  const shots = ['home-dark', 'forum-dark', 'library-dark', 'newsletter-dark', 'career-dark', 'lessons-dark', 'forum-dark', 'calendar-dark', 'library-dark'];
  shots.forEach((n, i) => {
    const img = el('img');
    img.src = `${UI}/${n}.png`;
    img.decoding = 'sync';
    img.style.left = `${-1340 + (i % 3) * 900}px`;
    img.style.top = `${-790 + Math.floor(i / 3) * 524}px`;
    wall.appendChild(img);
  });
  const top = root.querySelector('.launch-top');
  const mark = hubLogo(40);
  if (mark) {
    top.insertBefore(mark, top.firstChild);
    top.classList.add('has-logo');
    top.querySelector('span').textContent = NAME.replace(/^DSBA\s*/, '');
  }
  const h = root.querySelector('.launch-h');
  const btn = root.querySelector('.btn-launch');
  const label = btn.querySelector('span');
  const count = root.querySelector('.count');
  tl.from(wall, { opacity: 0, duration: 0.6 }, T.start);
  tl.from(top, { y: -40, opacity: 0, duration: 0.5, ease: 'power3.out' }, T.start + 0.1);
  tl.from(chars(h), { y: 100, opacity: 0, duration: 0.6, ease: 'power4.out', stagger: 0.022 }, T.start + 0.25);
  tl.from(btn, { scale: 0.5, opacity: 0, duration: 0.55, ease: 'back.out(1.9)' }, T.button_in);
  tl.to(h, { scale: 0.46, y: -128, duration: 0.5, ease: 'power3.inOut', transformOrigin: '50% 0' }, T.countdown[0] - 0.55);
  // cursor glides to the button and presses it
  const cur = cursor(root);
  root.insertBefore(cur.el, root.querySelector('.vignette'));
  cur.place(tl, 1560, 980, T.button_in + 0.5);
  cur.move(tl, 1010, 668, T.button_in + 0.6, T.click - T.button_in - 1.0, 'power1.inOut');
  cur.click(tl, T.click);
  tl.to(btn, { scale: 0.93, duration: 0.07, ease: 'power2.out' }, T.click - 0.02);
  tl.to(btn, { scale: 1.02, duration: 0.09, ease: 'power2.out' }, T.click + 0.06);
  const GL = '█▓▒░#@$%&?!<>/\\';
  const BASE = `Launch ${NAME}`;
  const errEls = ERRS.map((e) => {
    const w = el('div', 'errwin', `<div class="errwin__bar"><span>${e.bar}</span><b>×</b></div>
      <div class="errwin__body"><div class="errwin__ic${e.warn ? ' warn' : ''}">${e.ic}</div><div>${e.m}</div></div>
      ${e.prog ? '<div class="errwin__prog"><i></i></div>' : '<div class="errwin__foot"><div class="errwin__ok">OK</div></div>'}`);
    w.style.left = `${e.x}px`;
    w.style.top = `${e.y}px`;
    root.insertBefore(w, root.querySelector('.vignette'));
    return w;
  });
  const bar = root.querySelector('.errwin__prog i');
  const tErr = G.segments.find((s) => s.kind === 'errors').t0;     // the app is declared dead
  const tStatic = G.segments.find((s) => s.kind === 'static').t0;
  onFrame((t) => {
    if (t < start || t >= G.end) return;
    // background wall drifts; after the click it shudders
    const f = Math.round(t * 30);
    const r = mulberry(f * 13 + 5);
    const shake = t >= G.start && t < tErr ? 1 : 0;
    gsap.set(wall, { rotationX: 54, rotationZ: -24, x: (t - start) * -14 + shake * (r() - 0.5) * 40, y: (t - start) * 6 + shake * (r() - 0.5) * 30, scale: 1.12 });
    // countdown numerals
    let cTxt = '';
    let cP = 0;
    T.countdown.forEach((ct, i) => { if (t >= ct && t < ct + 0.98) { cTxt = String(3 - i); cP = t - ct; } });
    count.textContent = cTxt;
    count.style.opacity = cTxt ? String(1 - ease.in3(clamp((cP - 0.55) / 0.42))) : '0';
    count.style.transform = `scale(${1.5 - 0.5 * ease.out5(clamp(cP / 0.4))})`;
    // the button label breaks down
    let txt = BASE;
    if (t >= T.click + 0.05 && t < G.start) txt = 'Launching…';
    else if (t >= G.start && t < tErr) {
      const k = Math.round(3 + 10 * prog(t, G.start, tErr));
      const a = [...BASE];
      for (let i = 0; i < k; i += 1) a[Math.floor(r() * a.length)] = GL[Math.floor(r() * GL.length)];
      txt = a.join('');
    } else if (t >= tErr) txt = 'launch.exe not responding';
    if (label.textContent !== txt) label.textContent = txt;
    btn.style.background = t >= tErr ? 'linear-gradient(180deg,#ff5470,#d81e45)' : '';
    btn.style.fontFamily = t >= tErr ? 'var(--mono)' : '';
    btn.style.fontSize = t >= tErr ? '38px' : '';
    cur.el.style.opacity = t >= G.start + 0.4 ? '0' : '';
    h.style.visibility = t >= tErr ? 'hidden' : '';
    // error windows appear instantly at their cue times (the glitch engine supplies the pop)
    errEls.forEach((w, i) => { w.style.visibility = t >= G.error_windows[i] ? 'inherit' : 'hidden'; });
    bar.style.width = `${Math.round(100 * prog(t, G.error_windows[4] + 0.05, tStatic + 0.5))}%`;
  });
}

export async function buildAct1(C) {
  // which real logo files have been supplied (assets/logos/, assets/brand/hub-logo.png)
  const [logos] = await Promise.all([filesPresent(LOGOS, LOGO_FILES), loadBrand()]);
  const A = { ...C, logos };
  s02(A); s03(A); s04(A); s05(A); s06(A); s07(A);
}
