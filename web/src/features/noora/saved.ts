// Her conversations, kept in this browser only and never on the server:
//   hub.noora.chat    (sessionStorage) the conversation open in this tab, so a reload carries on with it
//   hub.noora.recent  (localStorage)   the last few conversations, newest first, to go back to; "Delete all chats"
//                                      removes them
// Pictures are kept only as their names: their object URLs end with the page. Stored JSON is checked before it is
// trusted. Pure, apart from the two small sessionStorage helpers.
import type { Attachment } from './files';
import type { Message, MyMessage, NooraMessage } from './types';

export const CURRENT_KEY = 'hub.noora.chat';
export const RECENT_KEY = 'hub.noora.recent';
export const RECENT_MAX = 5; // conversations kept
const MESSAGES_MAX = 40; // newest messages kept of each
const TITLE_MAX = 80; // characters

export interface SavedChat {
  id: string;
  /** when its newest message was written (ms since the epoch) */
  at: number;
  /** its first question */
  title: string;
  messages: Message[];
}

export const newChatId = (): string => `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function isAttachment(v: unknown): v is Attachment {
  return isObject(v) && typeof v.id === 'string' && (v.kind === 'image' || v.kind === 'file') && typeof v.name === 'string' && typeof v.size === 'number';
}

function isMessage(v: unknown): v is Message {
  if (!isObject(v) || typeof v.id !== 'number' || typeof v.at !== 'number' || typeof v.text !== 'string') return false;
  if (v.from === 'me') return Array.isArray(v.attachments) && v.attachments.every(isAttachment);
  return v.from === 'noora' && typeof v.mood === 'string' && Array.isArray(v.refs);
}

/** A conversation as it is stored: settled messages only, the newest ones, and pictures without their URLs. */
export function forStorage(messages: readonly Message[]): Message[] {
  return messages.slice(-MESSAGES_MAX).map((m): Message => (m.from === 'me' ? ({ ...m, attachments: m.attachments.map((a) => ({ ...a, url: null })) } satisfies MyMessage) : (m satisfies NooraMessage)));
}

/** What a conversation is called in the list: its first question. */
export function titleOf(messages: readonly Message[]): string {
  const first = messages.find((m): m is MyMessage => m.from === 'me');
  if (!first) return 'New chat';
  const text = first.text.replace(/\s+/g, ' ').trim();
  if (!text) return first.attachments.length ? first.attachments.map((a) => a.name).join(', ').slice(0, TITLE_MAX) : 'New chat';
  return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1).trimEnd()}…` : text;
}

/** The list with this conversation saved at its top (replacing its older copy), the oldest beyond the limit gone. */
export function withChat(list: readonly SavedChat[], id: string, messages: readonly Message[]): SavedChat[] {
  const others = list.filter((c) => c.id !== id);
  if (!messages.length) return others;
  const stored = forStorage(messages);
  const chat: SavedChat = { id, at: stored[stored.length - 1]?.at ?? Date.now(), title: titleOf(stored), messages: stored };
  return [chat, ...others].slice(0, RECENT_MAX);
}

/** The saved list, from whatever was stored (anything that isn't one is dropped). */
export function parseRecent(value: unknown): SavedChat[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((c): c is SavedChat => isObject(c) && typeof c.id === 'string' && typeof c.at === 'number' && typeof c.title === 'string' && Array.isArray(c.messages) && c.messages.every(isMessage))
    .slice(0, RECENT_MAX);
}

/** The tab's conversation, from whatever was stored. */
export function parseCurrent(value: unknown): { id: string; messages: Message[] } | null {
  if (!isObject(value) || typeof value.id !== 'string' || !Array.isArray(value.messages) || !value.messages.every(isMessage)) return null;
  return { id: value.id, messages: value.messages };
}

export function readCurrent(): { id: string; messages: Message[] } | null {
  try {
    const raw = window.sessionStorage.getItem(CURRENT_KEY);
    return raw ? parseCurrent(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeCurrent(id: string, messages: readonly Message[]): void {
  try {
    if (messages.length) window.sessionStorage.setItem(CURRENT_KEY, JSON.stringify({ id, messages: forStorage(messages) }));
    else window.sessionStorage.removeItem(CURRENT_KEY);
  } catch {
    /* storage unavailable or full: the conversation lasts as long as the page */
  }
}
