// What the Daily keeps on this device: a guest's plays (the server keeps nothing for guests), the games whose
// rules a person has seen, and Sudoku's pencil marks. Plays and marks are personal: 'hub.mine.' keys go on sign-out,
// so the next person at a shared computer starts afresh. Storage can be missing or refused (a private window): every
// read falls back to nothing and every write is best effort.
import { writeStored } from '../../../state';
import type { GameId, Mark, Move, Picture, PlayStatus } from '../types';

const GUEST = 'hub.mine.daily.guest.';
const NOTES = 'hub.mine.daily.notes.';
const SEEN = 'hub.daily.seen';
/** Days of moves and notes kept: older ones are cleared as new ones are written. */
const KEEP_DAYS = 14;

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* refused or full: the play goes on without it */
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nothing to do */
  }
}

/** Removes this device's day-stamped keys under `prefix` for days before `today` minus KEEP_DAYS. */
export function prune(prefix: string, today: string, keep: number = KEEP_DAYS): void {
  try {
    const cutoff = new Date(`${today}T00:00:00Z`).getTime() - keep * 86_400_000;
    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const day = key.slice(prefix.length, prefix.length + 10);
      const at = new Date(`${day}T00:00:00Z`).getTime();
      if (!Number.isFinite(at) || at < cutoff) stale.push(key);
    }
    stale.forEach(remove);
  } catch {
    /* nothing to do */
  }
}

// ── A guest's plays ─────────────────────────────────────────────────────────────────────────────

/** A guest's play of a day's game (and difficulty). */
export interface GuestPlay {
  /** the version of the day's puzzle the moves were made on: an editor's fix to today's puzzle makes a new one */
  revision: number;
  /** oldest first */
  moves: Move[];
  /** a fix started this play again: the game says so until the next move */
  restarted: boolean;
  /** how the play stands, for the hub */
  status: PlayStatus;
  /** the finished play's picture, for the hub's tile */
  picture: Picture | null;
}

/** A day's guest plays, by game and difficulty ('word:default', 'sudoku:hard'). */
export type GuestPlays = Record<string, GuestPlay>;

export const NO_GUEST_PLAY: GuestPlay = { revision: 0, moves: [], restarted: false, status: 'new', picture: null };

const STATUSES: readonly PlayStatus[] = ['new', 'playing', 'won', 'lost'];
const MARKS: readonly Mark[] = ['hit', 'near', 'miss', 'wrong', 'l1', 'l2', 'l3', 'l4'];

function parsePicture(value: unknown): Picture | null {
  if (!Array.isArray(value)) return null;
  const rows = value.filter(Array.isArray) as unknown[][];
  if (rows.length !== value.length || rows.some((row) => !row.every((m) => MARKS.includes(m as Mark)))) return null;
  return rows as Picture;
}

/** The key that keeps a day's guest plays (one key a day, so the hub can follow it). */
export const guestDayKey = (day: string) => `${GUEST}${day}`;

/** Where a game's play sits among the day's. */
export const guestSlot = (game: GameId, variant: string) => `${game}:${variant || 'default'}`;

function parsePlay(value: unknown): GuestPlay | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { revision, moves, restarted, status, picture } = value as Record<string, unknown>;
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0 || !Array.isArray(moves)) return null;
  return {
    revision,
    moves: moves as Move[],
    restarted: restarted === true,
    status: STATUSES.find((s) => s === status) ?? (moves.length ? 'playing' : 'new'),
    picture: parsePicture(picture),
  };
}

/** A day's guest plays as kept, without anything malformed. */
export function parseGuestPlays(value: unknown): GuestPlays {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const plays: GuestPlays = {};
  for (const [slot, play] of Object.entries(value as Record<string, unknown>)) {
    const parsed = parsePlay(play);
    if (parsed) plays[slot] = parsed;
  }
  return plays;
}

/** A guest's play on a day's game (and difficulty); none when there is none. */
export function guestPlay(day: string, game: GameId, variant = ''): GuestPlay {
  return parseGuestPlays(read(guestDayKey(day)))[guestSlot(game, variant)] ?? NO_GUEST_PLAY;
}

export function saveGuestPlay(day: string, game: GameId, variant: string, play: GuestPlay, today: string): void {
  const plays = { ...parseGuestPlays(read(guestDayKey(day))), [guestSlot(game, variant)]: play };
  writeStored(guestDayKey(day), plays);
  prune(GUEST, today);
}

/** Forgets a guest's play: the server couldn't replay its moves. */
export function clearGuestPlay(day: string, game: GameId, variant = ''): void {
  const plays = parseGuestPlays(read(guestDayKey(day)));
  delete plays[guestSlot(game, variant)];
  writeStored(guestDayKey(day), Object.keys(plays).length ? plays : undefined);
}

// ── The rules, seen once per game ───────────────────────────────────────────────────────────────

export function hasSeenRules(game: GameId): boolean {
  const seen = read(SEEN);
  return Array.isArray(seen) && seen.includes(game);
}

export function markRulesSeen(game: GameId): void {
  const seen = read(SEEN);
  const list = Array.isArray(seen) ? seen.filter((g): g is string => typeof g === 'string') : [];
  if (!list.includes(game)) write(SEEN, [...list, game]);
}

// ── Sudoku's pencil marks ───────────────────────────────────────────────────────────────────────

export type Notes = Record<number, number[]>;

const notesKey = (day: string, variant: string) => `${NOTES}${day}:${variant}`;

/** The pencil marks on a day's Sudoku: cell (0-80) to its digits. Anything malformed is dropped. */
export function loadNotes(day: string, variant: string): Notes {
  const stored = read(notesKey(day, variant));
  if (!stored || typeof stored !== 'object') return {};
  const notes: Notes = {};
  for (const [cell, digits] of Object.entries(stored as Record<string, unknown>)) {
    const i = Number(cell);
    if (!Number.isInteger(i) || i < 0 || i > 80 || !Array.isArray(digits)) continue;
    const clean = digits.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 9);
    if (clean.length) notes[i] = [...new Set(clean)].sort((a, b) => a - b);
  }
  return notes;
}

export function saveNotes(day: string, variant: string, notes: Notes, today: string): void {
  if (Object.keys(notes).length === 0) remove(notesKey(day, variant));
  else write(notesKey(day, variant), notes);
  prune(NOTES, today);
}
