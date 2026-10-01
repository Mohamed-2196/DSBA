// Acts 2–3: the fake birthday (68–80.5), the DOM side of glitch #2 (80.5–85), the letter (86.5–95)
// and the Teacher's Day reveal, names and outro (95–120).
import { W, H, el, chars, onFrame, scene, typeText, logoTile, mulberry, clamp, prog, ease } from './lib.js';

const BRAND = '/dsba/public/brand';
const PASTEL = ['#ff6fae', '#ffd23f', '#6be3c1', '#9b7bff', '#ff9a4d', '#5cc8ff'];
const GLYPH = '█▓▒░#@$%&?!<>/\\';

// ───────────────────────────────────────────────────────── s08 birthday + glitch #2 DOM
function s08({ tl, cues, config, stage }) {
  const B = cues.birthday;
  const G = cues.g2;
  const CUT = G.start;
  const root = scene(stage, 's08', 68, 85, 'bday');
  const [a, b] = config.admin.birthday_line.split(',');
  const L1 = `${a.trim()},`;
  const L2 = (b || '').trim();
  // bunting
  const flags = Array.from({ length: 17 }, (_, i) => {
    const x = 0 + i * 120;
    const y = 30 + 70 * Math.sin((Math.PI * x) / W);
    return `<polygon points="${x - 46},${y - 6} ${x + 46},${y + 6} ${x},${y + 92}" fill="${PASTEL[i % PASTEL.length]}" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>`;
  }).join('');
  const cake = `<svg class="cake" viewBox="0 0 420 330">
    <ellipse cx="210" cy="300" rx="205" ry="24" fill="#fff" stroke="#e8c7f5" stroke-width="5"/>
    <rect x="40" y="196" width="340" height="100" rx="20" fill="#ff9ecb"/><path d="M40 222 q21 26 42 0 q21 26 43 0 q21 26 42 0 q21 26 43 0 q21 26 42 0 q21 26 43 0 q21 26 42 0 q21 26 43 0 V206 q0-10-10-10 H50 q-10 0-10 10z" fill="#fff"/>
    <rect x="92" y="126" width="236" height="78" rx="18" fill="#c9b6ff"/><path d="M92 148 q20 22 39 0 q20 22 39 0 q20 22 40 0 q20 22 39 0 q20 22 39 0 q20 22 40 0 V136 q0-10-10-10 H102 q-10 0-10 10z" fill="#fff"/>
    <rect x="146" y="72" width="128" height="60" rx="16" fill="#ffe680"/>
    ${[176, 210, 244].map((x, i) => `<rect x="${x - 5}" y="34" width="10" height="42" rx="4" fill="${PASTEL[(i + 2) % 6]}"/><ellipse class="flame" cx="${x}" cy="20" rx="9" ry="15" fill="#ff9a2e"/><ellipse class="flame" cx="${x}" cy="23" rx="4.5" ry="8" fill="#fff3b0"/>`).join('')}
    <circle cx="80" cy="250" r="9" fill="#fff"/><circle cx="140" cy="262" r="9" fill="#fff"/><circle cx="210" cy="250" r="9" fill="#fff"/><circle cx="280" cy="262" r="9" fill="#fff"/><circle cx="340" cy="250" r="9" fill="#fff"/>
  </svg>`;
  root.innerHTML = `<div class="rays"></div><svg class="bunting" viewBox="0 0 1920 180"><path d="M-10 26 Q 960 170 1930 26" fill="none" stroke="#fff" stroke-width="6"/>${flags}</svg>
    <div class="balloons"></div><canvas width="1920" height="1080"></canvas>
    <div class="bday-title"><div class="l1">${L1}</div><div class="l2">${L2}</div></div>
    <div class="ribbon">Love, the DSBA tutors &amp; students 🎂</div>${cake}
    <div class="karaoke"></div><div class="surprise">SURPRISE!</div>
    <div class="term"><div class="term__head">celebrationd 2.0 — /dev/projector</div><p class="bad"></p><p></p><p class="warn"></p><p></p><p class="pb"></p></div>`;
  const rays = root.querySelector('.rays');
  // balloons
  const BX = [120, 300, 470, 1450, 1620, 1800, 210, 1710];
  const BY = [330, 210, 400, 400, 210, 330, 600, 600];
  const bobs = BX.map((x, i) => {
    const wrap = el('div', 'balloon', `<svg viewBox="0 0 150 400"><path d="M75 172 q-16 40 6 80 q20 40 -4 82 q-12 26 2 60" fill="none" stroke="#fff" stroke-width="4"/>
      <ellipse cx="75" cy="88" rx="64" ry="80" fill="${PASTEL[i % 6]}"/><ellipse cx="52" cy="58" rx="16" ry="24" fill="#fff" opacity=".45"/><path d="M63 164 l12-10 l12 10 l-8 12 h-8z" fill="${PASTEL[i % 6]}"/></svg>`);
    wrap.style.left = `${x - 75}px`;
    wrap.style.top = `${BY[i] - 90}px`;
    root.querySelector('.balloons').appendChild(wrap);
    tl.from(wrap, { y: 1250, duration: 1.3 + (i % 3) * 0.15, ease: 'back.out(1.05)' }, B.card_in + i * 0.07);
    return wrap.firstChild;
  });
  // title
  const title = root.querySelector('.bday-title');
  const c1 = chars(title.querySelector('.l1'));
  const c2 = chars(title.querySelector('.l2'));
  c1.forEach((c, i) => tl.from(c, { y: -260, opacity: 0, rotation: (mulberry(i + 3)() - 0.5) * 60, duration: 0.7, ease: 'bounce.out' }, B.card_in + 0.2 + i * 0.03));
  c2.forEach((c, i) => tl.from(c, { scale: 0, opacity: 0, duration: 0.5, ease: 'back.out(3)' }, B.card_in + 0.75 + i * 0.04));
  const sup = root.querySelector('.surprise');
  tl.fromTo(sup, { scale: 0.2, rotation: -9 }, { scale: 1, rotation: -5, duration: 0.3, ease: 'back.out(3)' }, B.surprise);
  tl.to(sup, { scale: 1.7, opacity: 0, duration: 0.25, ease: 'power2.in' }, B.surprise + 0.5);
  tl.from(root.querySelector('.ribbon'), { scale: 0, duration: 0.45, ease: 'back.out(2.4)' }, B.card_in + 1.3);
  const cakeEl = root.querySelector('.cake');
  tl.from(cakeEl, { y: 520, duration: 0.8, ease: 'back.out(1.3)' }, B.card_in + 0.5);
  const flames = [...root.querySelectorAll('.flame')];
  // karaoke: one phrase on screen at a time
  const kar = root.querySelector('.karaoke');
  const notes = B.melody;
  const JOIN = new Set(['py', 'day', 'min']);
  const name = (config.admin.syllables || ['Ad', 'min']);
  const phrases = [[0, 6], [6, 12], [12, 19], [19, 25]].map(([s, e]) => {
    const line = el('div');
    line.style.position = 'absolute';
    line.style.left = '0';
    line.style.right = '0';
    line.style.bottom = '0';
    const spans = notes.slice(s, e).map((n) => {
      const sp = el('span');
      let txt = n.syl;
      if (n.syl === 'Ad') txt = name[0];
      if (n.syl === 'min') txt = name[1];
      sp.textContent = txt;
      const joined = JOIN.has(n.syl) && !(n.syl === 'min' && config.admin.syllables);
      sp.style.marginLeft = joined ? '0' : '0.3em';
      line.appendChild(sp);
      return { sp, n };
    });
    kar.appendChild(line);
    return { line, spans, t0: notes[s].t, t1: e < notes.length ? notes[e].t : 999 };
  });
  // confetti: a burst on SURPRISE, then a steady fall
  const ctx = root.querySelector('canvas').getContext('2d');
  const r = mulberry(68);
  const fall = Array.from({ length: 240 }, () => ({ x: r() * W, y: -r() * 1300, vy: 150 + r() * 200, amp: 20 + r() * 60, fr: 0.6 + r() * 1.2, ph: r() * 6.3, sp: 2 + r() * 5, w: 12 + r() * 12, h: 7 + r() * 8, c: PASTEL[Math.floor(r() * 6)] }));
  const burst = Array.from({ length: 150 }, () => { const an = r() * Math.PI * 2; const v = 500 + r() * 1300; return { vx: Math.cos(an) * v, vy: Math.sin(an) * v - 300, sp: 3 + r() * 7, w: 12 + r() * 12, h: 7 + r() * 8, c: PASTEL[Math.floor(r() * 6)] }; });
  const piece = (x, y, p, tau) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tau * p.sp * 0.6);
    ctx.scale(1, Math.cos(tau * p.sp));
    ctx.fillStyle = p.c;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  };
  const term = root.querySelector('.term');
  const lines = term.querySelectorAll('p');
  G.terminal_lines.forEach((ln, i) => typeText(lines[i], ln.text, ln.t, G.terminal_cps, { caret: '▊' }));
  const pb = term.querySelector('.pb');
  onFrame((t) => {
    if (t < 68 || t >= 85) return;
    const tf = Math.min(t, CUT);            // the party freezes when the song is cut
    const tau = tf - 68;
    rays.style.transform = `rotate(${tau * 7}deg)`;
    bobs.forEach((bEl, i) => { bEl.style.transform = `translateY(${Math.sin(tf * 1.3 + i * 1.7) * 12}px) rotate(${Math.sin(tf * 0.9 + i) * 3}deg)`; });
    ctx.clearRect(0, 0, W, H);
    for (const p of fall) {
      const y = ((p.y + p.vy * tau) % (H + 260) + (H + 260)) % (H + 260) - 130;
      if (p.y + p.vy * tau < -130) continue;
      piece(p.x + Math.sin(tau * p.fr + p.ph) * p.amp, y, p, tau);
    }
    const k = 1.7;
    for (const p of burst) {
      const d = (1 - Math.exp(-k * tau)) / k;
      const y = 430 + p.vy * d + 620 * tau * tau;
      if (y > H + 40) continue;
      piece(960 + p.vx * d, y, p, tau);
    }
    // the title bumps on every note
    let last = -9;
    for (const n of notes) if (n.t <= tf) last = n.t;
    title.style.transform = `scale(${1 + 0.045 * Math.exp(-(tf - last) * 9)})`;
    flames.forEach((f, i) => {
      f.style.visibility = t >= CUT + 0.12 ? 'hidden' : 'visible';
      f.style.transformBox = 'fill-box';
      f.style.transformOrigin = '50% 100%';
      f.style.transform = `scale(${1 + 0.12 * Math.sin(tf * 17 + i)}, ${1 + 0.2 * Math.sin(tf * 23 + i * 2)})`;
    });
    for (const ph of phrases) {
      ph.line.style.visibility = tf >= ph.t0 - 0.3 && tf < ph.t1 - 0.3 ? 'inherit' : 'hidden';
      for (const { sp, n } of ph.spans) {
        const now = tf >= n.t && tf < n.t + n.dur && t < CUT;
        sp.className = now ? 'now' : tf >= n.t + n.dur ? 'sung' : '';
        sp.style.transform = now ? 'translateY(-10px) scale(1.14)' : '';
      }
    }
    // glitch #2, DOM side: the greeting scrambles, then the terminal takes over
    const f = Math.round(t * 30);
    const rr = mulberry(f * 7 + 1);
    const scr = (cs, base, final, from, to) => cs.forEach((c, i) => {
      let ch = base[i] === ' ' ? ' ' : base[i];
      if (t >= to) ch = final[i] === ' ' ? ' ' : final[i];
      else if (t >= from && rr() < 0.25 + 0.6 * prog(t, from, to)) ch = GLYPH[Math.floor(rr() * GLYPH.length)];
      if (c.textContent !== ch) c.textContent = ch;
    });
    const f1 = L1.replace(/BIRTH/i, '█████');
    const f2 = L2.replace(/[A-Za-z]/g, '?');
    scr(c1, L1, f1, CUT + 0.02, CUT + 0.62);
    scr(c2, L2, f2, CUT + 0.02, CUT + 0.62);
    term.style.visibility = t >= G.terminal_lines[0].t - 0.1 ? 'inherit' : 'hidden';
    const pp = prog(t, 83.95, 84.68);
    const cells = Math.round(pp * 24);
    pb.textContent = t >= 83.9 ? `[${'█'.repeat(cells)}${'░'.repeat(24 - cells)}] ${Math.round(pp * 100)}%` : '';
  });
}

// ───────────────────────────────────────────────────────── s09 the letter
function s09({ tl, cues, stage }) {
  const T = cues.letter;
  const root = scene(stage, 's09', 86.5, 95, 'letter');
  root.innerHTML = `<canvas width="1920" height="1080" style="position:absolute;inset:0"></canvas>
    <div class="letter-block"><div class="dear"></div><p></p><p></p><p></p><p class="last"></p></div><div class="vignette"></div><div class="gold-flash"></div>`;
  const block = root.querySelector('.letter-block');
  const slots = [block.querySelector('.dear'), ...block.querySelectorAll('p')];
  T.lines.forEach((ln, i) => typeText(slots[i], ln.text, ln.t, T.cps, { caret: '|' }));
  tl.to(block, { opacity: 0, y: -46, filter: 'blur(14px)', duration: 0.5, ease: 'power2.in' }, T.dissolve);
  tl.fromTo(root.querySelector('.gold-flash'), { opacity: 0 }, { opacity: 1, duration: 0.16, ease: 'power2.in' }, 94.84);
  // gold dust gathers and rises toward the drop
  const ctx = root.querySelector('canvas').getContext('2d');
  const r = mulberry(95);
  const dust = Array.from({ length: 220 }, () => ({ b: 91.6 + r() ** 0.6 * 3.3, x: r() * W, v: 180 + r() * 520, a: 20 + r() * 60, f: 0.5 + r() * 1.5, s: 1.6 + r() * 3.6 }));
  onFrame((t) => {
    if (t < 86.5 || t >= 95) return;
    ctx.clearRect(0, 0, W, H);
    for (const p of dust) {
      if (t < p.b) continue;
      const tau = t - p.b;
      const y = H + 20 - p.v * tau * (1 + tau * 0.5);
      if (y < -20) continue;
      ctx.globalAlpha = clamp(tau * 3) * 0.9;
      ctx.fillStyle = '#ffd98a';
      ctx.shadowColor = '#f5c86b';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(p.x + Math.sin(tau * p.f * 4) * p.a, y, p.s, 0, 6.3);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  });
}

// ───────────────────────────────────────────────────────── s10–s12 Teacher's Day, names, outro
function s10({ tl, cues, config, stage }) {
  const D = cues.teachers_day.drop;
  const N = cues.names;
  const O = cues.outro;
  const root = scene(stage, 's10', 95, 120.1, 'td');
  root.innerHTML = `<div class="td-rays"></div><canvas width="1920" height="1080"></canvas>
    <div class="td-head"><div class="td-happy">HAPPY</div><div class="td-title">Teacher’s Day</div>
      <div class="td-sub">Yes, it was yesterday. We needed a day to fool you.</div></div>
    <div class="names-intro">To the ${config.program.tutors} people who taught us,</div><div class="names"></div>
    <div class="thanks">Thank you.</div>
    <div class="outro-h">Thank you for teaching us.</div>
    <div class="outro-s">${config.program.cohorts} cohorts &nbsp;·&nbsp; ${config.program.students} students &nbsp;·&nbsp; 1 DSBA</div>
    <div class="outro-f"><div class="mini"></div><div class="tag">#HappyTeachersDay</div><img src="${BRAND}/bibf-white.png"><img class="crest" src="${BRAND}/uol.png"></div>
    <div class="vignette"></div><div class="gold-flash" style="opacity:1"></div>`;
  const rays = root.querySelector('.td-rays');
  const head = root.querySelector('.td-head');
  const title = root.querySelector('.td-title');
  const sub = root.querySelector('.td-sub');
  tl.to(root.querySelector('.gold-flash'), { opacity: 0, duration: 0.7, ease: 'power2.out' }, D);
  tl.from(chars(root.querySelector('.td-happy')), { opacity: 0, y: 40, duration: 0.5, ease: 'power3.out', stagger: 0.06 }, D + 0.12);
  tl.fromTo(title, { scale: 2.5, opacity: 0, filter: 'drop-shadow(0 10px 40px rgba(245,200,107,.45)) blur(20px)' }, { scale: 1, opacity: 1, filter: 'drop-shadow(0 10px 40px rgba(245,200,107,.45)) blur(0px)', duration: 0.75, ease: 'expo.out' }, D);
  tl.to(title, { backgroundPosition: '0% 0', duration: 1.7, ease: 'power2.inOut' }, D + 1.0);
  tl.from(sub, { opacity: 0, y: 34, duration: 0.6, ease: 'power3.out' }, cues.teachers_day.subline);
  tl.to(sub, { opacity: 0, duration: 0.35 }, N.intro - 0.75);
  tl.to(head, { scale: 0.4, y: -206, duration: 0.75, ease: 'power3.inOut' }, N.intro - 0.7);
  // names: three rows, each card lands on a beat
  const intro = root.querySelector('.names-intro');
  tl.from(intro, { opacity: 0, y: 24, duration: 0.5, ease: 'power2.out' }, N.intro);
  const grid = root.querySelector('.names');
  const CW = 292; const CH = 128; const GAP = 20;
  const rows = [6, 6, config.tutors.length - 12];
  const cards = [];
  let idx = 0;
  rows.forEach((n, ri) => {
    const left = (W - (n * CW + (n - 1) * GAP)) / 2;
    for (let c = 0; c < n; c += 1, idx += 1) {
      const nm = config.tutors[idx];
      const card = el('div', 'name');
      card.textContent = nm;
      if (nm.length > 22) card.style.fontSize = '29px';
      card.style.left = `${left + c * (CW + GAP)}px`;
      card.style.top = `${ri * (CH + GAP)}px`;
      grid.appendChild(card);
      const at = N.times[idx];
      tl.from(card, { scale: 0.4, opacity: 0, y: 44, duration: 0.42, ease: 'back.out(2)' }, at);
      tl.fromTo(card, { filter: 'brightness(2.6)' }, { filter: 'brightness(1)', duration: 0.55, ease: 'power2.out' }, at);
      cards.push({ x: left + c * (CW + GAP) + CW / 2, y: 318 + ri * (CH + GAP) + CH / 2, t: at });
    }
  });
  const thanks = root.querySelector('.thanks');
  tl.from(chars(thanks), { y: 70, opacity: 0, duration: 0.6, ease: 'power4.out', stagger: 0.045 }, N.thank_you);
  // outro
  tl.to([grid, intro, thanks, head], { opacity: 0, y: '-=70', duration: 0.6, ease: 'power2.in' }, O.start);
  tl.from(chars(root.querySelector('.outro-h')), { y: 70, opacity: 0, duration: 0.7, ease: 'power4.out', stagger: 0.022 }, O.start + 0.55);
  tl.from(root.querySelector('.outro-s'), { opacity: 0, y: 26, duration: 0.6, ease: 'power2.out' }, O.signoff);
  const mini = root.querySelector('.mini');
  mini.append(logoTile(56), document.createTextNode('DSBA Pulse'));
  tl.from(root.querySelector('.outro-f'), { opacity: 0, y: 26, duration: 0.6, ease: 'power2.out' }, O.hashtag);
  // particles: the burst on the drop, sparks under each name, slow gold dust throughout
  const ctx = root.querySelector('canvas').getContext('2d');
  const r = mulberry(1005);
  const sparks = Array.from({ length: 520 }, () => { const an = r() * Math.PI * 2; const v = 260 + r() ** 0.7 * 1700; return { vx: Math.cos(an) * v, vy: Math.sin(an) * v * 0.8, life: 1.8 + r() * 3, s: 1.5 + r() * 3.2, c: r() < 0.7 ? '#ffd98a' : '#fff3c4' }; });
  const dust = Array.from({ length: 170 }, () => ({ x: r() * W, y: r() * H, v: 24 + r() * 70, a: 12 + r() * 40, f: 0.3 + r() * 0.9, s: 1 + r() * 2.6, ph: r() * 6.3 }));
  const pops = cards.map((c) => ({ ...c, bits: Array.from({ length: 16 }, () => { const an = r() * Math.PI * 2; const v = 120 + r() * 320; return { vx: Math.cos(an) * v, vy: Math.sin(an) * v * 0.6 - 60, s: 1.2 + r() * 2.2 }; }) }));
  onFrame((t) => {
    if (t < 95 || t > 120.1) return;
    const tau = t - D;
    rays.style.transform = `rotate(${tau * 5}deg)`;
    rays.style.opacity = String(clamp(tau * 2) * (t > O.start ? 0.55 : 1));
    ctx.clearRect(0, 0, W, H);
    ctx.shadowColor = '#f5c86b';
    ctx.shadowBlur = 12;
    for (const p of dust) {
      const y = ((p.y + p.v * tau) % (H + 40)) - 20;
      ctx.globalAlpha = (0.25 + 0.45 * (0.5 + 0.5 * Math.sin(tau * p.f * 3 + p.ph))) * clamp(tau);
      ctx.fillStyle = '#ffd98a';
      ctx.beginPath();
      ctx.arc(p.x + Math.sin(tau * p.f + p.ph) * p.a, y, p.s, 0, 6.3);
      ctx.fill();
    }
    const k = 1.5;
    for (const p of sparks) {
      if (tau > p.life) continue;
      const d = (1 - Math.exp(-k * tau)) / k;
      const x = 960 + p.vx * d;
      const y = 470 + p.vy * d + 150 * tau * tau;
      ctx.globalAlpha = clamp(1 - tau / p.life) ** 1.4;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(x, y, p.s * (1 + 0.6 * clamp(1 - tau)), 0, 6.3);
      ctx.fill();
    }
    for (const c of pops) {
      const ta = t - c.t;
      if (ta < 0 || ta > 0.9) continue;
      for (const bit of c.bits) {
        ctx.globalAlpha = clamp(1 - ta / 0.9);
        ctx.fillStyle = '#fff3c4';
        ctx.beginPath();
        ctx.arc(c.x + bit.vx * ta, c.y + bit.vy * ta + 260 * ta * ta, bit.s, 0, 6.3);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  });
}

export function buildAct23(C) {
  s08(C); s09(C); s10(C);
}
