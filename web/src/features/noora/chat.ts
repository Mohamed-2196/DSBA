// Small pieces both chats share (the card and the full page): her face for the reply on its way, how she stands
// beside the card, what a screen reader hears, and whether a drag carries files.
import type { DragEvent } from 'react';
import type { ChatMood } from './poses';
import { plainText } from './rich';
import type { Bust } from './sprites';
import type { Message } from './types';
import type { Pending } from './useChat';

/** Her expression in the header, from the reply that is on its way (see useChat for `pending`). */
export function faceFor(pending: Pending | null, waving: boolean): Bust {
  if (!pending) return waving ? 'wave' : 'neutral';
  if (pending.phase === 'thinking') return 'thinking';
  const { mood, refs } = pending.reply;
  if (mood === 'angry') return 'angry';
  if (mood === 'sad') return 'thinking'; // puzzled: there is no sad portrait
  if (pending.phase === 'done' && refs.length) return 'winking'; // found it
  if (mood === 'laughing') return 'laughing';
  return mood === 'wave' ? 'wave' : 'neutral';
}

/** How she stands beside the chat (poses.ts), from the same reply. */
export function moodFor(pending: Pending | null, waving: boolean): ChatMood | null {
  if (!pending) return waving ? 'wave' : null;
  if (pending.phase === 'thinking') return 'thinking';
  if (pending.phase === 'typing') return 'talking';
  return pending.reply.mood === 'sad' || pending.reply.mood === 'angry' ? 'sad' : 'happy';
}

/**
 * What a screen reader hears: that she is thinking, that she is answering (once, not word by word), then the whole
 * reply at once. Nothing for a conversation that was already there (`heardUpTo`).
 */
export function spokenFor(messages: Message[], pending: Pending | null, heardUpTo: number): string {
  if (pending && pending.phase === 'thinking') return 'Noora is thinking.';
  if (pending && pending.phase === 'typing') return 'Noora is answering.';
  const last = messages[messages.length - 1];
  if (!last || last.from !== 'noora' || last.id <= heardUpTo) return '';
  const notice = last.notice ? `${last.notice} ` : '';
  const where = last.refs.length ? ` Where to look: ${last.refs.map((r) => `${r.code}, ${r.label}`).join('; ')}.` : '';
  const working = (last.steps ?? []).map((s) => s.say).join(' ');
  return `${notice}${plainText(last.text)}${last.formula ? ` ${last.formula.say}` : ''}${working ? ` ${working}` : ''}${where}`;
}

/** The newest message's id (0: none). */
export const highestId = (messages: readonly Message[]): number => messages.reduce((top, m) => Math.max(top, m.id), 0);

export const carriesFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer.types).includes('Files');
