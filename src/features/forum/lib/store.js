// Forum store: only the student's own activity is persisted (localStorage via useLocalStorage);
// seed threads stay in code so their relative times stay fresh. All functions are pure.
//
// state = {
//   threads:  [{ id, title, body, category, moduleId, tags, authorId: 'me', authorYear, createdAt }],
//   replies:  { [threadId]: [{ id, threadId, parentId, authorId, authorYear, body, createdAt, sim? }] },
//   votes:    { 't:<threadId>': true, 'r:<replyId>': true },
//   accepted: { [threadId]: replyId | null },      // the student's own threads
//   pending:  [{ id, threadId, replyId, authorId, body, typingAt, dueAt }],  // classmates "typing"
// }
import { getModule } from '../../../data/modules.js';
import { FORUM_STUDENTS, ME_ID } from '../data/authors.js';
import { categoryForYear, getCategory, MAX_TAGS } from '../data/taxonomy.js';
import { SEED_IDS } from './model.js';

export const FORUM_KEY = 'dsba.forum.v1';
export const DRAFT_KEY = 'dsba.forum.draft.v1';
export const EMPTY_STATE = Object.freeze({ threads: [], replies: {}, votes: {}, accepted: {}, pending: [] });

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Defensive: whatever is in storage, return a well-formed state. */
export function normalizeState(raw) {
  if (!isObj(raw)) return EMPTY_STATE;
  return {
    threads: Array.isArray(raw.threads) ? raw.threads.filter((t) => isObj(t) && typeof t.id === 'string' && typeof t.title === 'string') : [],
    replies: isObj(raw.replies) ? raw.replies : {},
    votes: isObj(raw.votes) ? raw.votes : {},
    accepted: isObj(raw.accepted) ? raw.accepted : {},
    pending: Array.isArray(raw.pending) ? raw.pending.filter((p) => isObj(p) && p.id && p.threadId) : [],
  };
}

// ── Reducers ────────────────────────────────────────────────────────────────────────────────

export function toggleVote(state, key) {
  const votes = { ...state.votes };
  if (votes[key]) delete votes[key];
  else votes[key] = true;
  return { ...state, votes };
}

export function addReply(state, reply) {
  const list = Array.isArray(state.replies[reply.threadId]) ? state.replies[reply.threadId] : [];
  return { ...state, replies: { ...state.replies, [reply.threadId]: [...list, reply] } };
}

export function setAccepted(state, threadId, replyId) {
  return { ...state, accepted: { ...state.accepted, [threadId]: replyId || null } };
}

/** Move a pending classmate reply into the thread (idempotent). */
export function landPending(state, pendingId, now = Date.now()) {
  const p = state.pending.find((x) => x.id === pendingId);
  if (!p) return state;
  const rest = { ...state, pending: state.pending.filter((x) => x.id !== pendingId) };
  const exists = (state.replies[p.threadId] || []).some((r) => r.id === p.replyId);
  if (exists) return rest;
  return addReply(rest, {
    id: p.replyId,
    threadId: p.threadId,
    parentId: null,
    authorId: p.authorId,
    authorYear: null,
    body: p.body,
    createdAt: Math.min(now, p.dueAt),
    sim: true,
  });
}

// ── Creating content ────────────────────────────────────────────────────────────────────────

/** 'How do I find the MGF?' → 'how-do-i-find-the-mgf' (≤ 64 chars, cut at a word). */
export function slugify(s) {
  const full = String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  if (full.length <= 64) return full;
  const cut = full.slice(0, 64);
  const i = cut.lastIndexOf('-');
  return i > 32 ? cut.slice(0, i) : cut;
}

function uniqueThreadId(title, state) {
  const base = slugify(title) || 'thread';
  const taken = new Set([...SEED_IDS, ...state.threads.map((t) => t.id), 'new']);
  if (!taken.has(base)) return base;
  for (let i = 2; ; i += 1) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

let replySeq = 0;
function newReplyId(threadId, state, now) {
  replySeq += 1;
  const n = (state.replies[threadId] || []).length + 1;
  return `${threadId}:u${n}-${now.toString(36).slice(-4)}${replySeq}`;
}

/** Sanitised new thread from the composer (authored by the current user). */
export function makeThread(state, { title, body, category, moduleId, tags, year }, now = Date.now()) {
  const mod = moduleId ? getModule(moduleId) : null;
  const cat = getCategory(category) ? category : categoryForYear(mod?.year ?? year) || 'general';
  return {
    id: uniqueThreadId(title, state),
    title: String(title).trim().replace(/\s+/g, ' '),
    body: String(body || '').trim(),
    category: cat,
    moduleId: mod ? mod.id : null,
    tags: [...new Set(tags || [])].slice(0, MAX_TAGS),
    authorId: ME_ID,
    authorYear: year ?? null,
    createdAt: now,
  };
}

export function makeReply(state, { threadId, parentId = null, body, year }, now = Date.now()) {
  return { id: newReplyId(threadId, state, now), threadId, parentId, authorId: ME_ID, authorYear: year ?? null, body: String(body).trim(), createdAt: now };
}

/** Add a thread (auto-upvoted by its author, like most forums) and schedule classmates' replies. */
export function addThread(state, thread, now = Date.now()) {
  return {
    ...state,
    threads: [thread, ...state.threads],
    votes: { ...state.votes, [`t:${thread.id}`]: true },
    pending: [...state.pending, ...planClassmateReplies(thread, now)],
  };
}

// ── Classmates reply to a new thread (the forum feels alive; deterministic) ─────────────────

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

const pick = (list, seed) => list[seed % list.length];

function replyBodies(thread) {
  const mod = thread.moduleId ? getModule(thread.moduleId) : null;
  const seed = hash(thread.title);
  if (thread.category === 'study-groups') {
    return [
      pick(['Count me in!', "I'm in. Is there space for one more?", 'Sounds good, I can make it.'], seed),
      pick(['Interested too. Can we confirm the time the day before?', "I'll bring the past papers.", 'Could we do a quick recap of last week at the start?'], seed >>> 3),
    ];
  }
  if (mod) {
    const name = mod.unitCode || mod.shortName;
    return [
      pick(['Good question, I got stuck on exactly this last week. Following.', 'Following, I have the same question.', 'Same here. Glad someone asked.'], seed),
      pick(
        [
          `Try the worked examples in the ${name} chapters first, then one past paper question on it. Happy to go through it together if you're still stuck.`,
          `This came up in our ${name} revision session. Post what you've tried so far and I'll check it tonight.`,
          `The ${name} notes in the Library cover this. Have a look, and reply here if it still doesn't click.`,
        ],
        seed >>> 3,
      ),
    ];
  }
  return [
    pick(['Thanks for posting this, I was wondering the same.', 'Following.', 'Good question!'], seed),
    pick(["Someone in Year 3 will know. I'll ask in our group chat.", 'Following. Please post an update if you find out.'], seed >>> 3),
  ];
}

function classmatesFor(thread, seed) {
  const mod = thread.moduleId ? getModule(thread.moduleId) : null;
  const year = getCategory(thread.category)?.year || mod?.year || null;
  const pool = FORUM_STUDENTS.filter((s) => s.kind === 'student' && (!year || s.year === year));
  const list = pool.length >= 2 ? pool : FORUM_STUDENTS;
  const first = list[seed % list.length];
  const second = list[(seed + 1 + ((seed >>> 5) % (list.length - 1))) % list.length];
  return [first.id, (second.id === first.id ? list[(seed + 1) % list.length] : second).id];
}

/** Two classmates "type" and reply a few seconds after a thread is posted. */
export function planClassmateReplies(thread, now = Date.now()) {
  const seed = hash(thread.id);
  const [a, b] = classmatesFor(thread, seed);
  const [bodyA, bodyB] = replyBodies(thread);
  return [
    { id: `${thread.id}~1`, threadId: thread.id, replyId: `${thread.id}:c1`, authorId: a, body: bodyA, typingAt: now + 2400, dueAt: now + 6200 },
    { id: `${thread.id}~2`, threadId: thread.id, replyId: `${thread.id}:c2`, authorId: b, body: bodyB, typingAt: now + 9000, dueAt: now + 14500 },
  ];
}
