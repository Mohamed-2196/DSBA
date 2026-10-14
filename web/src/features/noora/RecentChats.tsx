// The last few conversations saved in this browser (saved.ts): open one to carry on with it, or delete them all.
import { useEffect, useRef } from 'react';
import { ArrowLeft, ChatsCircle, Trash } from '@phosphor-icons/react';
import { formatClock, formatDayMonth, todayKey } from '../../lib/dates';
import { Button, IconButton } from '../../ui';
import { RECENT_MAX, type SavedChat } from './saved';

function when(at: number): string {
  return todayKey(at) === todayKey() ? formatClock(at) : formatDayMonth(new Date(at));
}

export interface RecentChatsProps {
  chats: readonly SavedChat[];
  /** the conversation on screen */
  current: string;
  onOpen: (chat: SavedChat) => void;
  onBack: () => void;
  onDeleteAll: () => void;
}

export function RecentChats({ chats, current, onOpen, onBack, onDeleteAll }: RecentChatsProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  return (
    <div className="nc-body nc-recent" data-hub="noora-recent">
      <div className="nc-recent__head">
        <IconButton label="Back to the chat" icon={ArrowLeft} size="sm" onClick={onBack} data-hub="noora-recent-back" />
        <h3 ref={heading} className="nc-recent__title" tabIndex={-1}>
          Recent chats
        </h3>
      </div>
      <div className="nc-recent__body">
        {chats.length ? (
          <ul role="list" className="nc-recent__list">
            {chats.map((chat) => {
              const here = chat.id === current;
              const asked = chat.messages.filter((m) => m.from === 'me').length;
              return (
                <li key={chat.id}>
                  <button type="button" className="nc-recent__item" aria-current={here || undefined} onClick={() => onOpen(chat)} data-hub="noora-recent-chat">
                    <span className="nc-recent__name" dir="auto">
                      {chat.title}
                    </span>
                    <span className="nc-recent__meta u-tabular">
                      {when(chat.at)} · {asked} {asked === 1 ? 'question' : 'questions'}
                      {here ? ' · Open now' : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="nc-recent__empty">
            <ChatsCircle aria-hidden="true" weight="duotone" />
            <p>No saved chats yet. Your last {RECENT_MAX} chats show up here.</p>
          </div>
        )}
      </div>
      <div className="nc-recent__foot">
        <p>Saved in this browser only, never on the Hub’s server.</p>
        <Button variant="ghost" size="sm" leadingIcon={Trash} onClick={onDeleteAll} disabled={!chats.length} data-hub="noora-recent-delete-all">
          Delete all chats
        </Button>
      </div>
    </div>
  );
}
