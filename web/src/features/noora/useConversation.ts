// One chat with her and the conversations saved in this browser (saved.ts), for the card and the full page alike:
// the tab's conversation is carried on after a reload, every settled conversation is saved, and the student can
// switch to another, start a new one, rename or delete one, or delete them all.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NooraScript } from '../../api/types';
import { removeStored, useLocalStorage } from '../../state';
import { CHATS_KEY, newChatId, parseChats, readCurrent, renameChat, withChat, withoutChat, writeCurrent, type SavedChat } from './saved';
import { useChat, type Chat, type ChatAi } from './useChat';

export interface Conversation extends Chat {
  /** the conversation on screen */
  chatId: string;
  /** every saved conversation, newest first */
  chats: SavedChat[];
  /** show a saved conversation (null: a new one). The one left is saved first; an answer on its way stops. */
  switchTo: (chat: SavedChat | null) => void;
  /** delete one saved conversation (the one on screen: a new one starts) */
  remove: (id: string) => void;
  rename: (id: string, title: string) => void;
  /** delete every saved conversation, and start a new one */
  removeAll: () => void;
}

export function useConversation({ year, calm, ai, script }: { year: number | null; calm: boolean; ai: ChatAi | null; script: NooraScript }): Conversation {
  const [first] = useState(readCurrent);
  const [chatId, setChatId] = useState(() => first?.id ?? newChatId());
  const [stored, setStored] = useLocalStorage<unknown>(CHATS_KEY, []);
  const chats = useMemo(() => parseChats(stored), [stored]);
  const chat = useChat({ year, calm, ai, script, initial: first?.messages });
  const { busy, messages, stop, clear, load } = chat;

  // Only settled conversations are saved.
  useEffect(() => {
    if (busy) return;
    writeCurrent(chatId, messages);
    if (messages.length) setStored((list: unknown) => withChat(parseChats(list), chatId, messages));
  }, [busy, chatId, messages, setStored]);

  const switchTo = useCallback(
    (next: SavedChat | null) => {
      if (next && next.id === chatId) return;
      if (busy) stop();
      if (next) load(next.messages);
      else clear();
      setChatId(next?.id ?? newChatId());
    },
    [chatId, busy, stop, load, clear],
  );

  const remove = useCallback(
    (id: string) => {
      setStored((list: unknown) => withoutChat(parseChats(list), id));
      if (id !== chatId) return;
      clear();
      setChatId(newChatId());
    },
    [chatId, clear, setStored],
  );

  const rename = useCallback((id: string, title: string) => setStored((list: unknown) => renameChat(parseChats(list), id, title)), [setStored]);

  const removeAll = useCallback(() => {
    clear();
    removeStored(CHATS_KEY);
    setChatId(newChatId());
  }, [clear]);

  return { ...chat, chatId, chats, switchTo, remove, rename, removeAll };
}
