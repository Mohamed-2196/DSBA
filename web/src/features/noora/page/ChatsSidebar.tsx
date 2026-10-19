// The full page's list of chats: "New chat", a search over every saved chat's name and words, and the chats by day
// (Today, Yesterday, Previous 7 days...). Each can be renamed in place or deleted. Everything is in this browser only.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useDebouncedValue } from '../../../state';
import { Button, IconButton, Menu, SearchField, cx, Icon, glyph } from '../../../ui';
import { groupChats, searchChats, TITLE_MAX, type SavedChat } from '../saved';

export interface ChatsSidebarProps {
  chats: readonly SavedChat[];
  /** the conversation on screen */
  current: string;
  onOpen: (chat: SavedChat) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (chat: SavedChat) => void;
  onDeleteAll: () => void;
  /** hide the list (the button in its header); null: it can't be hidden here (the phone drawer has its own close) */
  onHide: (() => void) | null;
}

function RenameField({ chat, onDone }: { chat: SavedChat; onDone: (title: string | null) => void }) {
  const [value, setValue] = useState(chat.title);
  const box = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    box.current?.focus();
    box.current?.select();
  }, []);
  const finish = (title: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(title);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(null);
    }
  };
  return (
    <input
      ref={box}
      className="np-chat__rename"
      value={value}
      maxLength={TITLE_MAX}
      aria-label="Chat name"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(value)}
      data-hub="noora-rename-input"
    />
  );
}

export function ChatsSidebar({
  chats,
  current,
  onOpen,
  onNew,
  onRename,
  onDelete,
  onDeleteAll,
  onHide,
}: ChatsSidebarProps) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 150);
  const [renaming, setRenaming] = useState<string | null>(null);
  const groups = useMemo(() => groupChats(searchChats(chats, debounced)), [chats, debounced]);
  const searching = debounced.trim().length > 0;

  return (
    <div className="np-side__inner" data-hub="noora-sidebar">
      <div className="np-side__head">
        {onHide ? (
          <IconButton
            label="Hide chats"
            icon={<Icon glyph={glyph.sidebar} />}
            size="sm"
            tooltip
            onClick={onHide}
            data-hub="noora-sidebar-hide"
          />
        ) : null}
        <h2 className="np-side__title">Chats</h2>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<Icon glyph={glyph.edit} />}
          onClick={onNew}
          className="np-side__new"
          data-hub="noora-page-new"
        >
          New chat
        </Button>
      </div>
      <div className="np-side__search">
        <SearchField
          value={query}
          onValueChange={setQuery}
          onClear={() => setQuery('')}
          placeholder="Search chats"
          label="Search chats"
          data-hub="noora-search-chats"
        />
      </div>
      <nav className="np-side__list" aria-label="Your chats">
        {groups.length ? (
          groups.map((group) => (
            <section key={group.name} className="np-group" aria-labelledby={`np-group-${group.name}`}>
              <h3 id={`np-group-${group.name}`} className="np-group__name">
                {group.name}
              </h3>
              <ul role="list" className="np-group__list">
                {group.chats.map((chat) => {
                  const here = chat.id === current;
                  return (
                    <li key={chat.id} className={cx('np-chat', here && 'is-current')} data-hub="noora-chat-item">
                      {renaming === chat.id ? (
                        <RenameField
                          chat={chat}
                          onDone={(title) => {
                            setRenaming(null);
                            if (title !== null && title.trim() !== chat.title) onRename(chat.id, title);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="np-chat__open"
                          aria-current={here ? 'page' : undefined}
                          onClick={() => onOpen(chat)}
                          data-hub="noora-chat-open"
                        >
                          <span className="np-chat__title" dir="auto">
                            {chat.title}
                          </span>
                        </button>
                      )}
                      {renaming === chat.id ? null : (
                        <Menu
                          align="end"
                          label={`Options for “${chat.title}”`}
                          trigger={
                            <IconButton
                              label={`Options for “${chat.title}”`}
                              icon={<Icon glyph={glyph.more} />}
                              size="sm"
                              className="np-chat__more"
                              data-hub="noora-chat-more"
                            />
                          }
                          items={[
                            {
                              id: 'rename',
                              label: 'Rename',
                              icon: <Icon glyph={glyph.edit} />,
                              onSelect: () => setRenaming(chat.id),
                            },
                            {
                              id: 'delete',
                              label: 'Delete',
                              icon: <Icon glyph={glyph.trash} />,
                              danger: true,
                              onSelect: () => onDelete(chat),
                            },
                          ]}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        ) : (
          <div className="np-side__empty" data-hub="noora-chats-empty">
            <Icon glyph={glyph.forum} />
            <p>{searching ? 'No chats match. Try other words.' : 'No chats yet. Your chats show up here.'}</p>
          </div>
        )}
      </nav>
      <div className="np-side__foot">
        <p>Saved in this browser only, never on the Hub’s server. Signing out deletes them.</p>
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<Icon glyph={glyph.trash} />}
          onClick={onDeleteAll}
          disabled={!chats.length}
          data-hub="noora-delete-all"
        >
          Delete all chats
        </Button>
      </div>
    </div>
  );
}
