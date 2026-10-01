// Act 1 — the believable product-launch film (0–64 s) plus the DOM side of glitch #1 (64–68 s).
import { W, H, el, chars, onFrame, scene, browser, cursor, callout, pulsePath, logoTile, mulberry, clamp, lerp, prog, ease, track } from './lib.js';

const UI = '../assets/ui';
const BRAND = '/dsba/public/brand';

// ───────────────────────────────────────────────────────── s01 cold open
function s01({ tl, cues, config, stage }) {
  const root = scene(stage, 's01', 0, 8);
  const L = cues.cold_open_lines;
  root.innerHTML = `<div class="bg-grid"></div>
    <svg class="pulse-svg" viewBox="0 0 1920 1080"><path d="${pulsePath(W, 540, 0.5, 1.5)}"/></svg>
    <div class="s01-stack">
      <div class="s01-line">3 cohorts.</div>
      <div class="s01-line"><small></small> tutors.</div>
      <div class="s01-line"><small></small> students.</div>
      <div class="s01-line s01-line--hl"><span class="hl">…and ${config.program.group_chats} group chats.</span></div>
    </div><div class="vignette"></div>`;
  const path = root.querySelector('path');
  const len = path.getTotalLength();
  gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
  tl.to(path, { strokeDashoffset: 0, duration: 1.45, ease: 'power2.inOut' }, 0.35);
  tl.to(path, { opacity: 0.2, y: 430, duration: 0.5, ease: 'power3.inOut' }, 1.85);
  const lines = [...root.querySelectorAll('.s01-line')];
  L.forEach((l, i) => tl.from(lines[i], { y: 80, opacity: 0, duration: 0.5, ease: 'power4.out' }, l.t));
  const [n17, n160] = root.querySelectorAll('small');
  onFrame((t) => {
    n17.textContent = Math.round(config.program.tutors * ease.out3(prog(t, L[1].t, L[1].t + 0.45)));
    n160.textContent = `~${Math.round(160 * ease.out3(prog(t, L[2].t, L[2].t + 0.6)))}`;
  });
  const hl = root.querySelector('.hl');
  tl.fromTo(hl, { '--hlx': 0 }, { '--hlx': 1, duration: 0.38, ease: 'power3.out' }, L[3].t + 0.04);
  tl.fromTo(lines[3], { rotation: -3.5 }, { rotation: -1.2, duration: 0.7, ease: 'elastic.out(1.1, 0.35)', transformOrigin: '0 60%' }, L[3].t);
  tl.to(root.querySelector('.s01-stack'), { x: -160, opacity: 0, duration: 0.42, ease: 'power3.in' }, 7.55);
}

// ───────────────────────────────────────────────────────── s02 chaos
const MSG = ['Is the exam on Sunday??', 'which room??', 'anyone have the Year 2 notes?', 'link to the slides pls', 'WHO moved the Drive folder', 'did anyone get the email?', 'deadline extended???', 'is the mock tomorrow', 'wrong group, sorry', 'past papers?? 🙏', 'which Drive folder is it', 'pls reply 😭', 'same question', 'is class cancelled?', 'check the other group', 'forwarded many times', 'what chapter are we on', 'resend the link, it expired', 'anyone awake?', 'calculator allowed??', 'who has the formula sheet', '+1', 'scroll up, it was answered', 'I can’t find it 😩'];
const WHO = ['DSBA Year 2', 'Stats study grp', 'Econ 2026 📈', 'DSBA Official', 'Year 1 ❤️', 'Programming help', 'Year 3 seniors', 'Maths revision', 'DSBA memes', 'Group project 4', 'Past papers swap', 'Class reps'];
const ICON = [['💬', '#2e3bff'], ['📎', '#12b886'], ['📢', '#f03e5e'], ['❓', '#7048e8'], ['📚', '#f08c00'], ['🗓️', '#0fa3b1'], ['🔗', '#4a5175']];

function s02({ tl, cues, stage }) {
  const root = scene(stage, 's02', 8, 18);
  const { pops, captions, freeze } = cues.chaos;
  root.innerHTML = `<div class="bg-grid"></div><div class="bubs"></div><div class="band"></div><div class="unread"><i></i><span>0</span></div><div class="vignette"></div><div class="dot"></div>`;
  const layer = root.querySelector('.bubs');
  pops.forEach((p, i) => {
    const b = el('div', `bub${i % 3 === 1 ? ' bub--l' : ''}`);
    const [ic, col] = ICON[i % ICON.length];
    b.innerHTML = `<div class="bub__ic" style="background:${col}">${ic}</div><div><div class="bub__t">${WHO[(i * 5) % WHO.length]}<em>now</em></div><div class="bub__m">${MSG[i % MSG.length]}</div></div>`;
    const left = p.x * W - 60;
    const top = p.y * H - 20;
    b.style.left = `${left}px`;
    b.style.top = `${top}px`;
    b.style.zIndex = i;
    layer.appendChild(b);
    gsap.set(b, { rotation: p.rot });
    tl.from(b, { scale: 0.3, opacity: 0, duration: 0.24, ease: 'back.out(2.4)' }, p.t);
    const r = mulberry(i * 31 + 7)();
    tl.to(b, { x: 960 - (left + 200), y: 540 - (top + 50), scale: 0, rotation: p.rot + (r - 0.5) * 260, duration: 0.5 + r * 0.32, ease: 'power3.in' }, cues.chaos.implode[0] + r * 0.14);
  });
  const unread = root.querySelector('.unread');
  const unreadN = unread.querySelector('span');
  tl.from(unread, { y: -90, opacity: 0, duration: 0.4, ease: 'back.out(1.6)' }, 8.35);
  tl.to(unread, { opacity: 0, duration: 0.2 }, freeze + 0.9);
  onFrame((t) => {
    const n = pops.filter((p) => p.t <= Math.min(t, freeze)).length;
    unreadN.textContent = `${Math.round(1284 * (n / pops.length) ** 1.45).toLocaleString('en-US')} unread`;
  });
  const band = root.querySelector('.band');
  tl.from(band, { opacity: 0, duration: 0.3 }, captions[0].t - 0.1);
  tl.to(band, { opacity: 0, duration: 0.3 }, cues.chaos.implode[0] - 0.05);
  captions.forEach((c, i) => {
    const cap = el('div', 'cap', c.text);
    root.insertBefore(cap, unread);
    const end = i < captions.length - 1 ? captions[i + 1].t : freeze;
    tl.from(cap, { y: 46, opacity: 0, scale: 0.96, duration: 0.26, ease: 'power3.out' }, c.t);
    tl.to(cap, { y: -34, opacity: 0, duration: 0.16, ease: 'power2.in' }, end - 0.16);
  });
  // the freeze: everything stops and drains of colour
  tl.to(layer, { filter: 'grayscale(1) brightness(0.42)', scale: 0.985, duration: 0.16, ease: 'power2.out' }, freeze);
  const calm = el('div', 'cap cap--calm', 'There has to be a better way.');
  root.insertBefore(calm, unread);
  tl.from(calm, { opacity: 0, y: 24, duration: 0.4, ease: 'power2.out' }, freeze + 0.22);
  tl.to(calm, { opacity: 0, scale: 0.9, duration: 0.22, ease: 'power2.in' }, cues.chaos.implode[0] - 0.12);
  const dot = root.querySelector('.dot');
  tl.from(dot, { scale: 0, duration: 0.3, ease: 'back.out(3)' }, cues.chaos.implode[1] - 0.34);
}

// ───────────────────────────────────────────────────────── s03 logo
function s03({ tl, cues, stage }) {
  const T = cues.logo;
  const root = scene(stage, 's03', 18, 26);
  root.innerHTML = `<div class="bg-grid"></div><div class="flash"></div><div class="intro-label">Introducing</div>
    <div class="lockup"><div class="lockup__row"><div class="wordmark">DSBA Pulse</div></div>
      <div class="tagline">DSBA, <span class="hl">rebuilt from scratch.</span></div><div class="pills"></div></div>
    <div class="partners"><span>For the DSBA programme at</span><img src="${BRAND}/bibf-white.png"><i></i><img class="crest" src="${BRAND}/uol.png"></div>
    <div class="vignette"></div>`;
  const row = root.querySelector('.lockup__row');
  const tile = logoTile(176);
  row.insertBefore(tile, row.firstChild);
  const flash = root.querySelector('.flash');
  tl.fromTo(flash, { scale: 0.08, opacity: 1 }, { scale: 7, opacity: 0, duration: 0.95, ease: 'power2.out' }, T.drop);
  tl.from(tile, { scale: 0, rotation: -120, duration: 0.75, ease: 'back.out(1.7)' }, T.drop);
  tl.from(chars(root.querySelector('.wordmark')), { y: 130, opacity: 0, duration: 0.7, ease: 'power4.out', stagger: 0.035 }, T.drop + 0.08);
  const label = root.querySelector('.intro-label');
  tl.from(label, { opacity: 0, y: 24, duration: 0.4, ease: 'power2.out' }, T.drop + 0.3);
  tl.to(label, { opacity: 0, duration: 0.3 }, T.tagline - 0.4);
  const tag = root.querySelector('.tagline');
  tl.from(tag, { y: 56, opacity: 0, duration: 0.6, ease: 'power4.out' }, T.tagline);
  tl.fromTo(tag.querySelector('.hl'), { '--hlx': 0 }, { '--hlx': 1, duration: 0.4, ease: 'power3.out' }, T.tagline + 0.45);
  const pills = root.querySelector('.pills');
  T.pills_text.forEach((p, i) => {
    const pill = el('div', 'pill', p);
    pills.appendChild(pill);
    tl.from(pill, { scale: 0.4, opacity: 0, y: 34, duration: 0.42, ease: 'back.out(2.2)' }, T.pills + i * 0.5);
  });
  const partners = root.querySelector('.partners');
  tl.from(partners, { opacity: 0, y: 26, duration: 0.5, ease: 'power2.out' }, T.pills + 2.0);
  tl.to(root.querySelector('.lockup'), { y: -170, opacity: 0, scale: 0.92, duration: 0.5, ease: 'power3.in' }, 25.45);
  tl.to(partners, { opacity: 0, duration: 0.3 }, 25.45);
}

// ───────────────────────────────────────────────────────── s04 newsletter
function s04({ tl, cues, stage, manifest }) {
  const T = cues.newsletter;
  const root = scene(stage, 's04', 26, 36);
  root.innerHTML = `<div class="bg-grid"></div>`;
  const title = el('div', 'sec-title', `<div class="kick">Newsletter</div><div class="title-serif">The Pulse</div>`);
  const bw = browser({ width: 1380, url: 'dsba-pulse.app/newsletter', screens: ['newsletter', 'issue-top', 'issue-cohort', 'issue-deadlines'] });
  bw.el.style.left = '440px';
  bw.el.style.top = '140px';
  root.append(bw.el, title, el('div', 'vignette'));
  tl.from(title, { opacity: 0, y: 70, duration: 0.6, ease: 'power4.out' }, T.start);
  tl.to(title, { scale: 0.34, x: -30, y: -100, duration: 0.8, ease: 'power3.inOut' }, T.start + 0.8);
  tl.fromTo(bw.el, { opacity: 0, rotationY: -36, rotationX: 15, z: -900, y: 280 }, { opacity: 1, rotationY: -9, rotationX: 4, z: 0, y: 0, duration: 1.25, ease: 'power3.out' }, T.browser_in);
  tl.to(bw.el, { rotationY: 7, rotationX: 2, duration: 4.4, ease: 'sine.inOut' }, T.browser_in + 1.25);
  // "scroll" between screens: each new screen slides up from below
  const order = ['newsletter', 'issue-top', 'issue-cohort', 'issue-deadlines'];
  const slideAt = [null, T.callouts[0] + 0.95, T.callouts[1] + 0.12, T.callouts[2] - 0.12];
  order.forEach((name, i) => {
    bw.imgs[name].style.clipPath = 'inset(64px 0 0 265px)';
    if (i) {
      gsap.set(bw.imgs[name], { y: H });
      tl.to(bw.imgs[name], { y: 0, duration: 0.62, ease: 'power3.inOut' }, slideAt[i]);
      tl.to(bw.imgs[order[i - 1]], { y: -H, duration: 0.62, ease: 'power3.inOut' }, slideAt[i]);
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
  callout(bw.el, 'A new issue every week', ...at(1630, 372), { side: 'left' }).show(tl, T.callouts[0], 0.85);
  callout(bw.el, 'News from every cohort', ...at(1010, 410)).show(tl, T.callouts[1] + 0.5, 1.0);
  callout(bw.el, 'Deadlines you won’t miss', ...at(1080, 470)).show(tl, T.callouts[2] + 0.35, 0.95);
  // covers fan out in front
  tl.to(bw.el, { scale: 0.84, opacity: 0.16, z: -260, duration: 0.55, ease: 'power3.inOut' }, T.covers - 0.1);
  const covers = el('div', 'covers');
  root.insertBefore(covers, title);
  const picks = [{ n: 'cover-3', w: 330, x: -470, r: -10, z: 0 }, { n: 'cover-1', w: 330, x: 470, r: 10, z: 0 }, { n: 'cover-0', w: 440, x: 0, r: 0, z: 120 }];
  picks.forEach((c, i) => {
    const img = el('img', 'cover');
    img.src = `${UI}/${c.n}.png`;
    img.decoding = 'sync';
    img.style.width = `${c.w}px`;
    covers.appendChild(img);
    gsap.set(img, { xPercent: -50, yPercent: -50, x: c.x, rotation: c.r, z: c.z });
    tl.from(img, { y: 900, rotation: c.r * 4 + 14, opacity: 0, duration: 0.85, ease: 'back.out(1.25)' }, T.covers + [0.12, 0.24, 0][i]);
    tl.to(img, { y: -14, duration: 2.0, ease: 'sine.inOut' }, T.covers + 1.15);
  });
  const cap = el('div', 'caption', 'A 7-minute read. <span class="hl">Every week.</span>');
  root.insertBefore(cap, title);
  tl.from(cap, { y: 50, opacity: 0, duration: 0.5, ease: 'power4.out' }, T.read_time);
  tl.fromTo(cap.querySelector('.hl'), { '--hlx': 0 }, { '--hlx': 1, duration: 0.35, ease: 'power3.out' }, T.read_time + 0.35);
  tl.to([covers, cap, title], { x: -260, opacity: 0, duration: 0.42, ease: 'power3.in' }, 35.52);
}

// ───────────────────────────────────────────────────────── s05 forum
function s05({ tl, cues, stage, manifest: M }) {
  const T = cues.forum;
  const EGG = T.easter_egg;
  const root = scene(stage, 's05', 36, 46);
  root.innerHTML = `<div class="bg-grid"></div>`;
  const title = el('div', 'sec-title', `<div class="kick">Forum</div><div class="title-sans">Ask anything.</div>`);
  const frames = Array.from({ length: M.composerFrames }, (_, i) => `composer-${String(i).padStart(2, '0')}`);
  const bw = browser({ width: 1380, url: 'dsba-pulse.app/forum', screens: ['forum', ...frames, 'composer-final', 'forum-posted'] });
  bw.el.style.left = '100px';
  bw.el.style.top = '140px';
  root.append(bw.el, title, el('div', 'vignette'));
  gsap.set(title, { left: 'auto', right: 110, transformOrigin: '100% 0', textAlign: 'right' });
  tl.from(title, { opacity: 0, y: 70, duration: 0.6, ease: 'power4.out' }, T.start);
  tl.to(title, { scale: 0.34, y: -100, x: 30, duration: 0.8, ease: 'power3.inOut' }, T.start + 0.75);
  tl.fromTo(bw.el, { opacity: 0, rotationY: 36, rotationX: 14, z: -900, y: 280, x: 340 }, { opacity: 1, rotationY: 8, rotationX: 3, z: 0, y: 0, x: 200, duration: 1.15, ease: 'power3.out' }, T.start + 0.45);
  tl.to(bw.el, { rotationY: -5, rotationX: 2, duration: 7.6, ease: 'sine.inOut' }, T.start + 1.6);

  // which screen is up, and where the camera looks (screen pixels + zoom)
  const tOpen = T.composer_open;
  const tPost = T.post_appears;
  const screenAt = (t) => {
    if (t < tOpen + 0.06) return 'forum';
    if (t >= tPost) return 'forum-posted';
    if (t >= T.typing[T.typing.length - 1] + 0.3) return 'composer-final';
    const n = T.typing.filter((x) => x <= t).length;
    return frames[n];
  };
  const eggY = M.postedEggRow.y + M.postedEggRow.h / 2;
  const cam = track([
    { t: T.threads_in + 0.2, v: { fx: 960, fy: 540, z: 1 } },
    { t: T.threads_in + 1.3, v: { fx: 940, fy: 590, z: 1.5 } },
    { t: tOpen - 0.55, v: { fx: 940, fy: 600, z: 1.56 } },
    { t: tOpen - 0.15, v: { fx: 1180, fy: 420, z: 1.16 } },
    { t: tOpen + 0.06, v: { fx: 930, fy: 430, z: 1.42 }, cut: true },
    { t: T.typing[T.typing.length - 1] + 0.1, v: { fx: 930, fy: 420, z: 1.32 }, e: (p) => p },
    { t: T.post_click - 0.12, v: { fx: 930, fy: 700, z: 1.1 } },
    { t: tPost, v: { fx: 930, fy: 440, z: 1.56 }, cut: true },
    { t: EGG.start - 0.5, v: { fx: 930, fy: 450, z: 1.5 }, e: (p) => p },
    { t: EGG.start - 0.02, v: { fx: 900, fy: eggY, z: 2.05 } },
    { t: EGG.end + 0.2, v: { fx: 900, fy: eggY, z: 2.2 }, e: (p) => p },
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
    if (t < 36 || t >= 46) return;
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
  // upvote rings on the first rows, then callouts
  [0, 1, 2].forEach((i) => {
    const ring = el('div', 'ring');
    ring.style.left = `${M.forumFirstRow.x + 40}px`;
    ring.style.top = `${M.forumFirstRow.y + 43 + i * 105}px`;
    bw.content.appendChild(ring);
    tl.fromTo(ring, { scale: 0.3, opacity: 0.95 }, { scale: 1.7, opacity: 0, duration: 0.5, ease: 'power2.out' }, T.threads_in + 1.0 + i * 0.22);
  });
  const caps = [
    ['Upvote what', 'helped.', T.threads_in + 1.05, T.threads_in + 2.0],
    ['Answers you can', 'trust.', T.threads_in + 2.0, tOpen - 0.1],
    ['Ask your', 'cohort.', tOpen + 0.3, T.post_click + 0.05],
    ['Get answers', 'fast.', T.replies[0] - 0.15, EGG.start - 0.3],
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
  cur.move(tl, M.composerTitle.x + 420, M.composerTitle.y + 70, tOpen + 0.1, 0.25);
  const px = M.composerPost.x + M.composerPost.w / 2;
  const py = M.composerPost.y + M.composerPost.h / 2;
  cur.move(tl, px, py, T.post_click - 0.45, 0.4);
  cur.click(tl, T.post_click);
  tl.to(cur.el, { autoAlpha: 0, duration: 0.1 }, tPost);
  // replies pop in over the frame
  const replies = [
    { n: 'Noor E.', y: 'Year 3', c: 'var(--y3)', bg: '#ffe8cc', m: 'Past papers. All of them. Twice.', x: 1080, top: 440, r: 2.5 },
    { n: 'Ali H.', y: 'Year 2', c: 'var(--y2)', bg: '#e5dbff', m: 'Office hours saved my life.', x: 1150, top: 640, r: -2 },
  ];
  replies.forEach((r, i) => {
    const card = el('div', 'reply', `<div class="reply__av" style="background:${r.bg};color:#0e1542">${r.n.split(' ').map((w) => w[0]).join('')}</div>
      <div><div class="reply__n">${r.n}<em style="background:${r.bg};color:#0e1542">${r.y}</em></div><div class="reply__m">${r.m}</div></div>`);
    card.style.left = `${r.x}px`;
    card.style.top = `${r.top}px`;
    root.insertBefore(card, title);
    gsap.set(card, { rotation: r.r });
    tl.from(card, { x: 260, opacity: 0, scale: 0.8, duration: 0.42, ease: 'back.out(1.8)' }, T.replies[i]);
    tl.to(card, { x: 180, opacity: 0, duration: 0.22, ease: 'power2.in' }, EGG.start + 0.5 + i * 0.12);
  });
  // the vote widget pulses while the count runs up
  [0.05, 0.5, 0.95, 1.4].forEach((d) => {
    const ring = el('div', 'ring');
    ring.style.left = `${M.postedEggCount.x + M.postedEggCount.w / 2}px`;
    ring.style.top = `${M.postedEggCount.y - 6}px`;
    bw.content.appendChild(ring);
    tl.fromTo(ring, { scale: 0.4, opacity: 0.9 }, { scale: 1.5, opacity: 0, duration: 0.45, ease: 'power2.out' }, EGG.start + d);
  });
  tl.to(bw.el, { opacity: 0, x: -140, rotationY: -22, duration: 0.3, ease: 'power3.in' }, 45.68);
  tl.to(title, { opacity: 0, duration: 0.25 }, 45.7);
}

// ───────────────────────────────────────────────────────── s06 montage
function s06({ tl, cues, stage, manifest: M }) {
  const T = cues.montage;
  const cuts = Object.fromEntries(T.cuts.map((c) => [c.id, c]));
  const root = scene(stage, 's06', 46, 58);
  root.innerHTML = `<div class="bg-grid"></div>`;
  const cmdk = Array.from({ length: M.cmdkFrames }, (_, i) => `cmdk-${String(i).padStart(2, '0')}`);
  const bw = browser({ width: 1500, url: 'dsba-pulse.app', screens: ['library', 'viewer-nb', 'lessons', 'calendar', 'grades', ...cmdk] });
  bw.el.style.left = '210px';
  bw.el.style.top = '70px';
  root.append(bw.el);
  // each beat: screen, frame pose, camera start → end (slow push), until the next beat
  const beats = [
    { t: cuts.library.t, s: 'library', ry: -13, rx: 5, a: [960, 500, 1.0], b: [900, 470, 1.14] },
    { t: T.file_preview_click, s: 'viewer-nb', ry: -13, rx: 5, a: [1010, 520, 1.28], b: [1010, 560, 1.2] },
    { t: cuts.lessons.t, s: 'lessons', ry: 11, rx: 4, a: [1000, 560, 1.08], b: [1040, 620, 1.3] },
    { t: cuts.calendar.t, s: 'calendar', ry: -8, rx: 7, a: [1090, 430, 1.1], b: [1090, 480, 1.42] },
    { t: cuts.grades.t, s: 'grades', ry: 12, rx: 3, a: [1090, 420, 1.12], b: [1090, 440, 1.38] },
    { t: cuts.search.t, s: null, ry: 0, rx: 2, a: [960, 480, 1.16], b: [960, 470, 1.3] },
    { t: cuts.network.t, s: 'OUT' },
  ];
  const urls = { library: '/library', 'viewer-nb': '/library/st2195-block-6-notebook', lessons: '/modules/st2133', calendar: '/calendar', grades: '/grades' };
  const urlEl = bw.el.querySelector('.bw__url');
  onFrame((t) => {
    if (t < 46 || t >= 58) return;
    let k = 0;
    while (k < beats.length - 1 && t >= beats[k + 1].t) k += 1;
    const b = beats[k];
    if (b.s === 'OUT') { gsap.set(bw.el, { opacity: 0 }); return; }
    const next = beats[k + 1].t;
    const p = prog(t, b.t, next);
    let name = b.s;
    if (!name) name = cmdk[T.search_typing.filter((x) => x <= t).length];
    for (const [n, img] of Object.entries(bw.imgs)) img.style.visibility = n === name ? 'inherit' : 'hidden';
    const punch = 1 + 0.07 * (1 - ease.out5(prog(t, b.t, b.t + 0.32)));
    gsap.set(bw.el, { rotationY: b.ry + p * (b.ry > 0 ? -3 : 3), rotationX: b.rx, scale: punch, opacity: 1 });
    gsap.set(bw.content, bw.focus(lerp(b.a[0], b.b[0], p), lerp(b.a[1], b.b[1], p), lerp(b.a[2], b.b[2], p)));
    urlEl.lastChild.textContent = `dsba-pulse.app${b.s ? urls[b.s] : ''}`;
  });
  // library: the new files lift off the shelf toward the viewer
  const fly = M.thumbs.slice(0, 6).map((th, i) => {
    const img = el('img', 'thumbfly');
    img.src = `${UI}/${th.name}.png`;
    img.decoding = 'sync';
    Object.assign(img.style, { left: `${th.x}px`, top: `${th.y}px`, width: `${th.w}px`, height: `${th.h}px`, zIndex: 10 + i });
    bw.content.appendChild(img);
    tl.to(img, { y: -70 - Math.sin((i / 5) * Math.PI) * 60, x: (i - 2.5) * 26, scale: 1.62, rotation: (i - 2.5) * 4.5, duration: 0.5, ease: 'back.out(1.5)' }, cuts.library.t + 0.38 + i * 0.07);
    return img;
  });
  onFrame((t) => { const on = t >= cuts.library.t && t < T.file_preview_click; fly.forEach((f) => { f.style.visibility = on ? 'inherit' : 'hidden'; }); });
  // cursor: opens a file, presses play
  const cur = cursor(bw.content);
  const t2 = M.thumbs[2];
  cur.place(tl, 1300, 760, cuts.library.t + 0.5);
  cur.move(tl, t2.x + 90, t2.y + 60, cuts.library.t + 0.6, 0.6);
  cur.click(tl, T.file_preview_click - 0.04);
  tl.set(cur.el, { autoAlpha: 0 }, T.file_preview_click + 0.02);
  const pl = M.lessonsPlay;
  tl.set(cur.el, { x: 1420, y: 860, autoAlpha: 1 }, cuts.lessons.t + 0.05);
  cur.move(tl, pl.x + pl.w / 2 - 4, pl.y + pl.h / 2 - 2, cuts.lessons.t + 0.15, 0.6);
  cur.click(tl, T.lesson_play_click);
  const ring = el('div', 'ring');
  Object.assign(ring.style, { left: `${pl.x + pl.w / 2}px`, top: `${pl.y + pl.h / 2}px`, width: '120px', height: '120px', margin: '-60px', borderColor: '#fff' });
  bw.content.appendChild(ring);
  tl.fromTo(ring, { scale: 0.6, opacity: 0.9 }, { scale: 2.6, opacity: 0, duration: 0.8, ease: 'power2.out' }, T.lesson_play_click);
  tl.set(cur.el, { autoAlpha: 0 }, cuts.calendar.t);
  // captions (one at a time, bottom left)
  T.cuts.forEach((c, i) => {
    if (c.id === 'built_by') return;
    const words = c.caption.split(' ');
    const last = words.pop();
    const cap = el('div', 'caption caption--left', `${words.join(' ')} <span class="hl">${last}</span>`);
    root.appendChild(cap);
    const end = T.cuts[i + 1] ? T.cuts[i + 1].t : 58;
    tl.from(cap, { y: 60, opacity: 0, duration: 0.3, ease: 'power4.out' }, c.t + 0.06);
    tl.fromTo(cap.querySelector('.hl'), { '--hlx': 0 }, { '--hlx': 1, duration: 0.26, ease: 'power3.out' }, c.t + 0.26);
    tl.to(cap, { opacity: 0, y: -26, duration: 0.12, ease: 'power2.in' }, end - 0.12);
  });
  // network: three cohorts and 17 tutors, joined up
  const svgNS = 'http://www.w3.org/2000/svg';
  const net = document.createElementNS(svgNS, 'svg');
  net.setAttribute('class', 'net');
  net.setAttribute('viewBox', '0 0 1920 1080');
  root.appendChild(net);
  const rnd = mulberry(2026);
  const groups = [{ c: [470, 500], n: 52, col: 'var(--y1)', label: 'Year 1' }, { c: [960, 300], n: 56, col: 'var(--y2)', label: 'Year 2' }, { c: [1450, 500], n: 52, col: 'var(--y3)', label: 'Year 3' }];
  const pts = [];
  groups.forEach((g, gi) => {
    for (let i = 0; i < g.n; i += 1) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 190;
      pts.push({ x: g.c[0] + Math.cos(a) * r * 1.25, y: g.c[1] + Math.sin(a) * r * 0.8, g: gi, col: g.col });
    }
  });
  const tutors = Array.from({ length: 17 }, (_, i) => {
    const a = (i / 17) * Math.PI * 2 - Math.PI / 2;
    return { x: 960 + Math.cos(a) * 250, y: 640 + Math.sin(a) * 105 };
  });
  const mk = (tag, attrs) => { const n = document.createElementNS(svgNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); net.appendChild(n); return n; };
  const NT = cuts.network.t;
  const lines = [];
  tutors.forEach((tu) => { for (let k = 0; k < 3; k += 1) { const p = pts[Math.floor(rnd() * pts.length)]; lines.push(mk('line', { x1: tu.x, y1: tu.y, x2: p.x, y2: p.y, class: 'g' })); } });
  for (let k = 0; k < 46; k += 1) { const a = pts[Math.floor(rnd() * pts.length)]; let b = pts[Math.floor(rnd() * pts.length)]; if (b.g === a.g) b = pts[(pts.indexOf(b) + 60) % pts.length]; lines.push(mk('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y })); }
  lines.forEach((ln, i) => {
    const len = Math.hypot(ln.x2.baseVal.value - ln.x1.baseVal.value, ln.y2.baseVal.value - ln.y1.baseVal.value);
    gsap.set(ln, { strokeDasharray: len, strokeDashoffset: len });
    tl.to(ln, { strokeDashoffset: 0, duration: 0.5, ease: 'power2.out' }, NT + 0.55 + (i / lines.length) * 0.75);
  });
  pts.forEach((p, i) => {
    const c = mk('circle', { cx: p.x, cy: p.y, r: 6.5, fill: p.col });
    tl.from(c, { attr: { r: 0 }, duration: 0.3, ease: 'back.out(3)' }, NT + 0.04 + (i / pts.length) * 0.62);
  });
  tutors.forEach((p, i) => {
    const c = mk('circle', { cx: p.x, cy: p.y, r: 13, fill: '#f5c86b', stroke: '#fff3c4', 'stroke-width': 2.5 });
    tl.from(c, { attr: { r: 0 }, duration: 0.34, ease: 'back.out(3)' }, NT + 0.5 + i * 0.022);
  });
  const labels = [...groups.map((g) => ({ t: g.label, x: g.c[0], y: g.c[1] - 196, col: g.col })), { t: 'Tutors', x: 960, y: 800, col: '#f5c86b' }];
  labels.forEach((l, i) => {
    const tx = mk('text', { x: l.x, y: l.y, 'text-anchor': 'middle', fill: l.col, 'font-size': 38, 'font-weight': 700, 'font-family': 'Schibsted' });
    tx.textContent = l.t;
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
  tl.to([big, net], { opacity: 0, scale: 0.94, duration: 0.3, ease: 'power3.in' }, 57.68);
}

// ───────────────────────────────────────────────────────── s07 launch + glitch #1 (DOM side)
const ERRS = [
  { bar: 'pulse.exe', ic: '✕', m: 'pulse.exe has stopped responding.', x: 130, y: 96 },
  { bar: 'file-watcher', ic: '!', warn: 1, m: 'Unexpected file found:<br>surprise.mp4', x: 930, y: 150 },
  { bar: 'launchd', ic: '✕', m: 'Launch sequence overridden.', x: 250, y: 420 },
  { bar: 'system', ic: '!', warn: 1, m: 'This was never about an app.', x: 950, y: 520 },
  { bar: 'surprise.mp4', ic: '▶', m: 'Loading the real reason<br>we’re here…', x: 530, y: 300, prog: 1 },
  { bar: 'notice', ic: '!', warn: 1, m: 'Please remain seated.', x: 640, y: 690 },
];

function s07({ tl, cues, stage }) {
  const T = cues.launch;
  const G = cues.g1;
  const root = scene(stage, 's07', 58, 68);
  root.innerHTML = `<div class="bg-grid"></div><div class="wall"></div><div class="wall-shade"></div>
    <div class="count"></div>
    <div class="launch-top"><span>DSBA Pulse</span></div>
    <div class="launch-h">Launching today.</div>
    <div class="btn-launch"><span>Launch DSBA Pulse</span></div>
    <div class="vignette"></div>`;
  const wall = root.querySelector('.wall');
  const shots = ['home-dark', 'forum-dark', 'library-dark', 'newsletter-dark', 'calendar-dark', 'lessons-dark', 'forum-dark', 'home-dark', 'library-dark'];
  shots.forEach((n, i) => {
    const img = el('img');
    img.src = `${UI}/${n}.png`;
    img.decoding = 'sync';
    img.style.left = `${-1340 + (i % 3) * 900}px`;
    img.style.top = `${-790 + Math.floor(i / 3) * 524}px`;
    wall.appendChild(img);
  });
  const top = root.querySelector('.launch-top');
  top.insertBefore(logoTile(64), top.firstChild);
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
  const BASE = 'Launch DSBA Pulse';
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
  onFrame((t) => {
    if (t < 58 || t >= 68) return;
    // background wall drifts; after the click it shudders
    const f = Math.round(t * 30);
    const r = mulberry(f * 13 + 5);
    const shake = t >= G.start && t < 65.5 ? 1 : 0;
    gsap.set(wall, { rotationX: 54, rotationZ: -24, x: (t - 58) * -14 + shake * (r() - 0.5) * 40, y: (t - 58) * 6 + shake * (r() - 0.5) * 30, scale: 1.12 });
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
    else if (t >= G.start && t < 65.5) {
      const k = Math.round(3 + 12 * prog(t, G.start, 65.5));
      const a = [...BASE];
      for (let i = 0; i < k; i += 1) a[Math.floor(r() * a.length)] = GL[Math.floor(r() * GL.length)];
      txt = a.join('');
    } else if (t >= 65.5) txt = 'launch.exe not responding';
    if (label.textContent !== txt) label.textContent = txt;
    btn.style.background = t >= 65.5 ? 'linear-gradient(180deg,#ff5470,#d81e45)' : '';
    btn.style.fontFamily = t >= 65.5 ? 'var(--mono)' : '';
    btn.style.fontSize = t >= 65.5 ? '38px' : '';
    cur.el.style.opacity = t >= 64.4 ? '0' : '';
    h.style.visibility = t >= 65.5 ? 'hidden' : '';
    // error windows appear instantly at their cue times (the glitch engine supplies the pop)
    errEls.forEach((w, i) => { w.style.visibility = t >= G.error_windows[i] ? 'inherit' : 'hidden'; });
    bar.style.width = `${Math.round(100 * prog(t, G.error_windows[4] + 0.05, 67.5))}%`;
  });
}

export function buildAct1(C) {
  s01(C); s02(C); s03(C); s04(C); s05(C); s06(C); s07(C);
}
