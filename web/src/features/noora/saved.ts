// Her conversations, kept in this browser only and never on the server. Both keys start with 'hub.mine.', so signing
// out or deleting the account removes them (shared lab computers):
//   hub.mine.noora.chat   (sessionStorage) the conversation open in this tab, so a reload carries on with it
//   hub.mine.noora.chats  (localStorage)   every saved conversation, the one with the newest message first: the full
//                                          page's sidebar and the card's "Recent chats"
// Pictures are kept only as their names: their object URLs end with the page. Stored JSON is checked before it is
// trusted. Pure, apart from the two small sessionStorage helpers.
import { daysBetween, todayKey } from '../../lib/dates';
import type { Attachment } from './files';
import type { Message, MyMessage, NooraMessage } from './types';

export const CURRENT_KEY = 'hub.mine.noora.chat';
export const CHATS_KEY = 'hub.mine.noora.chats';
export const CHATS_MAX = 60; // conversations kept
const MESSAGES_MAX = 60; // newest messages kept of each
export const TITLE_MAX = 80; // characters

export interface SavedChat {
  id: string;
  /** when its newest message was written (ms since the epoch) */
  at: number;
  /** its first question, or the name the student gave it */
  title: string;
  /** the student renamed it: the title no longer follows the first question */
  named?: boolean;
  messages: Message[];
}

export const newChatId = (): string => `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function isAttachment(v: unknown): v is Attachment {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    (v.kind === 'image' || v.kind === 'file') &&
    typeof v.name === 'string' &&
    typeof v.size === 'number'
  );
}

function isMessage(v: unknown): v is Message {
  if (!isObject(v) || typeof v.id !== 'number' || typeof v.at !== 'number' || typeof v.text !== 'string') return false;
  if (v.from === 'me') return Array.isArray(v.attachments) && v.attachments.every(isAttachment);
  return v.from === 'noora' && typeof v.mood === 'string' && Array.isArray(v.refs);
}

function isChat(c: unknown): c is SavedChat {
  return (
    isObject(c) &&
    typeof c.id === 'string' &&
    typeof c.at === 'number' &&
    typeof c.title === 'string' &&
    (c.named === undefined || typeof c.named === 'boolean') &&
    Array.isArray(c.messages) &&
    c.messages.every(isMessage)
  );
}

/** A conversation as it is stored: the newest messages, and pictures without their URLs. */
export function forStorage(messages: readonly Message[]): Message[] {
  return messages
    .slice(-MESSAGES_MAX)
    .map(
      (m): Message =>
        m.from === 'me'
          ? ({ ...m, attachments: m.attachments.map((a) => ({ ...a, url: null })) } satisfies MyMessage)
          : (m satisfies NooraMessage),
    );
}

const shorten = (text: string): string =>
  text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1).trimEnd()}…` : text;

/** What a conversation is called in the list: its first question. */
export function titleOf(messages: readonly Message[]): string {
  const first = messages.find((m): m is MyMessage => m.from === 'me');
  if (!first) return 'New chat';
  const text = first.text.replace(/\s+/g, ' ').trim();
  if (!text) return first.attachments.length ? shorten(first.attachments.map((a) => a.name).join(', ')) : 'New chat';
  return shorten(text);
}

/** The list with this conversation saved (replacing its older copy), in the order of their newest messages: opening
 *  an old conversation leaves it where it was. The oldest beyond the limit go. */
export function withChat(list: readonly SavedChat[], id: string, messages: readonly Message[]): SavedChat[] {
  const before = list.find((c) => c.id === id);
  const others = list.filter((c) => c.id !== id);
  if (!messages.length) return others;
  const stored = forStorage(messages);
  const at = stored[stored.length - 1]?.at ?? Date.now();
  const chat: SavedChat = before?.named
    ? { id, at, title: before.title, named: true, messages: stored }
    : { id, at, title: titleOf(stored), messages: stored };
  return [chat, ...others].sort((x, y) => y.at - x.at).slice(0, CHATS_MAX);
}

/** The messages with her reply in them: in its place when it is there already (still coming in), or after them. */
export function withReply(messages: readonly Message[], reply: NooraMessage): Message[] {
  return messages.some((m) => m.id === reply.id)
    ? messages.map((m) => (m.id === reply.id ? reply : m))
    : [...messages, reply];
}

/** The list once the student leaves conversation `id` for another: saved as it is, with the question just asked and
 *  the answer on its way stopped where it was (`stopped`). Saving waits while she answers, so a switch saves here. */
export function leaveChat(
  list: readonly SavedChat[],
  id: string,
  messages: readonly Message[],
  stopped: NooraMessage | null,
): SavedChat[] {
  return withChat(list, id, stopped ? withReply(messages, stopped) : messages);
}

/** The list with one conversation renamed. An empty name gives it back its first question. */
export function renameChat(list: readonly SavedChat[], id: string, title: string): SavedChat[] {
  const name = shorten(title.replace(/\s+/g, ' ').trim());
  return list.map((c): SavedChat => {
    if (c.id !== id) return c;
    return name
      ? { ...c, title: name, named: true }
      : { id: c.id, at: c.at, title: titleOf(c.messages), messages: c.messages };
  });
}

export const withoutChat = (list: readonly SavedChat[], id: string): SavedChat[] => list.filter((c) => c.id !== id);

/** The saved list, from whatever was stored (anything that isn't a conversation is dropped). */
export function parseChats(value: unknown): SavedChat[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isChat).slice(0, CHATS_MAX);
}

/** The conversations whose name or words hold every word of the query, in the list's order. */
export function searchChats(list: readonly SavedChat[], query: string): SavedChat[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...list];
  return list.filter((c) => {
    const text = `${c.title}\n${c.messages.map((m) => m.text).join('\n')}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

export type ChatGroupName = 'Today' | 'Yesterday' | 'Previous 7 days' | 'Previous 30 days' | 'Earlier';
export interface ChatGroup {
  name: ChatGroupName;
  chats: SavedChat[];
}

function groupOf(at: number, now: number): ChatGroupName {
  const days = daysBetween(todayKey(at), todayKey(now));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days <= 7) return 'Previous 7 days';
  if (days <= 30) return 'Previous 30 days';
  return 'Earlier';
}

/** The list by day (Bahrain's days), newest first: Today, Yesterday, Previous 7 days, Previous 30 days, Earlier. */
export function groupChats(list: readonly SavedChat[], now: number = Date.now()): ChatGroup[] {
  const groups: ChatGroup[] = [];
  for (const chat of [...list].sort((a, b) => b.at - a.at)) {
    const name = groupOf(chat.at, now);
    const last = groups[groups.length - 1];
    if (last?.name === name) last.chats.push(chat);
    else groups.push({ name, chats: [chat] });
  }
  return groups;
}

/** The tab's conversation, from whatever was stored. */
export function parseCurrent(value: unknown): { id: string; messages: Message[] } | null {
  if (
    !isObject(value) ||
    typeof value.id !== 'string' ||
    !Array.isArray(value.messages) ||
    !value.messages.every(isMessage)
  )
    return null;
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
    if (messages.length)
      window.sessionStorage.setItem(CURRENT_KEY, JSON.stringify({ id, messages: forStorage(messages) }));
    else window.sessionStorage.removeItem(CURRENT_KEY);
  } catch {
    /* storage unavailable or full: the conversation lasts as long as the page */
  }
}
