// One game's items: by theme and status, found by any of their words, a page at a time. A row opens its form. An item
// can be retired (it never runs again, and the days it ran keep it) and brought back, or deleted if it never ran.
// The word game's guess list and Nearest neighbour's vocabulary sit under their games' items.
import { Archive, ArrowCounterClockwise, Plus, Trash, UploadSimple } from '@phosphor-icons/react';
import { useState } from 'react';
import { errorMessage } from '../../../api/errors';
import type { DailyContentOverview, ItemOut } from '../../../api/types';
import { formatDay } from '../../../lib/dates';
import { useDebouncedValue, useToast } from '../../../state';
import { useModules } from '../../../state/modules';
import { Badge, Button, ConfirmDialog, EmptyState, IconButton, Panel, QueryError, SearchField, SegmentedControl, Select, Skeleton, cx, formatCount } from '../../../ui';
import { useDailyItems, useDeleteItem, useRetireItem } from './api';
import { GuessList } from './GuessList';
import { ImportDialog } from './ImportDialog';
import { ItemDialog } from './ItemDialog';
import { gameInfo, listWords, rightOption, titleOf, usesLine, type ContentGame, type ItemStatus } from './lib/items';
import { Vocabulary } from './Vocabulary';

const STATUSES: { value: ItemStatus; label: string }[] = [
  { value: 'active', label: 'In use' },
  { value: 'retired', label: 'Retired' },
  { value: 'all', label: 'All' },
];

const article = (noun: string) => (/^[aeiou]/i.test(noun) ? 'an' : 'a');
/** Games whose items are single words: shown in columns. */
const WORDS: ReadonlySet<ContentGame> = new Set(['word', 'search', 'nearest']);
/** The list each of these games keeps beside its items. */
const SECOND_LIST: Partial<Record<ContentGame, { items: string; list: string }>> = {
  word: { items: 'Answer words', list: 'Guess list' },
  nearest: { items: 'Secret words', list: 'Vocabulary' },
};
const shortDay = (day: string) => formatDay(day, { month: 'short' });

export function ItemsPart({ game, overview }: { game: ContentGame; overview: DailyContentOverview }) {
  const info = gameInfo(game);
  const [theme, setTheme] = useState('');
  const [status, setStatus] = useState<ItemStatus>('active');
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim(), 250);
  const list = useDailyItems(game, theme, status, q);
  const [editing, setEditing] = useState<ItemOut | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [removing, setRemoving] = useState<ItemOut | null>(null);
  const [view, setView] = useState<'items' | 'list'>('items');
  const retire = useRetireItem();
  const remove = useDeleteItem();
  const { push: toast } = useToast();
  const titles = new Map(overview.themes.map((t) => [t.id, t.title]));
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;
  const filtered = theme !== '' || status !== 'active' || q !== '';

  const setRetired = (item: ItemOut, retired: boolean) => {
    const title = titleOf(item.data);
    retire.mutate(
      { id: item.id, version: item.version, retired },
      {
        onSuccess: (out) =>
          toast({
            title: retired ? `“${title}” is retired` : `“${title}” is back`,
            body: retired ? 'It won’t run again. The days it ran keep it.' : 'It can run again from the next new day.',
            tone: 'success',
            action: retired ? { label: 'Bring it back', onClick: () => retire.mutate({ id: out.id, version: out.version, retired: false }) } : undefined,
          }),
        onError: (e) => toast({ title: retired ? 'It wasn’t retired' : 'It wasn’t brought back', body: errorMessage(e), tone: 'alert' }),
      },
    );
  };

  const second = SECOND_LIST[game];
  return (
    <div className="dcms__stack">
      {second ? (
        <SegmentedControl
          label={`${info.label}: what to edit`}
          className="dcms__views"
          options={[
            { value: 'items', label: second.items },
            { value: 'list', label: second.list },
          ]}
          value={view}
          onChange={setView}
        />
      ) : null}
      {view === 'list' && game === 'word' ? <GuessList /> : null}
      {view === 'list' && game === 'nearest' ? <Vocabulary tags={overview.tags} /> : null}
      {view === 'list' ? null : (
        <Panel as="section" padding="md" className="dcms-part" aria-labelledby="dcms-items-title">
          <div className="dcms-part__head">
            <div className="dcms-part__intro">
              <h3 id="dcms-items-title" className="dcms-part__title">
                {info.label}
              </h3>
              <p className="dcms__note">{info.about}</p>
            </div>
            <div className="dcms-part__actions">
              <Button leadingIcon={UploadSimple} onClick={() => setImporting(true)}>
                Import
              </Button>
              <Button variant="primary" leadingIcon={Plus} onClick={() => setEditing('new')}>
                {`Add ${article(info.noun)} ${info.noun}`}
              </Button>
            </div>
          </div>

          <div className="dcms-filters">
            <Select
              label="Theme"
              className="dcms-filters__theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              options={[{ value: '', label: 'Every theme' }, ...overview.themes.map((t) => ({ value: t.id, label: t.title }))]}
            />
            <SegmentedControl label="Show" options={STATUSES} value={status} onChange={setStatus} className="dcms-filters__status" />
            <SearchField
              className="dcms-filters__search"
              label={`Find ${info.noun}s`}
              placeholder="Find by any of its words"
              value={query}
              onValueChange={setQuery}
              onClear={() => setQuery('')}
            />
          </div>

          {list.isError ? (
            <QueryError error={list.error} title={`The ${info.noun}s didn’t load`} onRetry={() => void list.refetch()} retrying={list.isFetching} size="sm" />
          ) : list.isPending ? (
            <Skeleton lines={6} />
          ) : items.length === 0 ? (
            <EmptyState
              size="sm"
              title={filtered ? `No ${info.noun}s match` : `No ${info.noun}s yet`}
              body={filtered ? 'Try another theme or other words.' : `Add one, or import a list.`}
              action={
                filtered ? null : (
                  <Button variant="primary" leadingIcon={Plus} onClick={() => setEditing('new')}>
                    {`Add ${article(info.noun)} ${info.noun}`}
                  </Button>
                )
              }
            />
          ) : (
            <>
              <p className="dcms__count" aria-live="polite">
                {items.length < total ? `${formatCount(items.length)} of ${formatCount(total)}` : `${formatCount(total)} ${total === 1 ? info.noun : `${info.noun}s`}`}
              </p>
              <ul className={cx('dcms-items', WORDS.has(game) && 'is-grid', list.isPlaceholderData && 'is-stale')} aria-busy={list.isFetching || undefined}>
                {items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    themeTitle={titles.get(item.theme) ?? item.theme}
                    busy={retire.isPending && retire.variables?.id === item.id}
                    onOpen={() => setEditing(item)}
                    onRetire={() => setRetired(item, !item.retired)}
                    onRemove={() => setRemoving(item)}
                  />
                ))}
              </ul>
              {list.hasNextPage ? (
                <Button className="dcms__more" onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage}>
                  Show more
                </Button>
              ) : null}
            </>
          )}
        </Panel>
      )}


      {editing ? (
        <ItemDialog key={editing === 'new' ? 'new' : editing.id} game={game} item={editing === 'new' ? null : editing} themes={overview.themes} defaultTheme={theme} onClose={() => setEditing(null)} />
      ) : null}
      {importing ? <ImportDialog game={game} themes={overview.themes} defaultTheme={theme} onClose={() => setImporting(false)} /> : null}
      <ConfirmDialog
        open={removing !== null}
        title={`Delete “${removing ? titleOf(removing.data) : ''}”?`}
        body="It has never run, so no day keeps it. Deleting it can’t be undone; to keep it out of the puzzles, retire it instead."
        confirmLabel="Delete"
        tone="danger"
        busy={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : null}
        onConfirm={() => {
          if (!removing) return;
          remove.mutate(
            { id: removing.id, version: removing.version },
            {
              onSuccess: () => {
                toast({ title: `“${titleOf(removing.data)}” is deleted.`, tone: 'success' });
                setRemoving(null);
              },
            },
          );
        }}
        onClose={() => {
          remove.reset();
          setRemoving(null);
        }}
      />
    </div>
  );
}

interface ItemRowProps {
  item: ItemOut;
  themeTitle: string;
  busy: boolean;
  onOpen: () => void;
  onRetire: () => void;
  onRemove: () => void;
}

function ItemRow({ item, themeTitle, busy, onOpen, onRetire, onRemove }: ItemRowProps) {
  const title = titleOf(item.data);
  return (
    <li className={cx('dcms-item', item.retired && 'is-retired')}>
      <button type="button" className="dcms-item__open" onClick={onOpen} aria-label={`Edit “${title}”`}>
        <span className={cx('dcms-item__title', (item.game === 'word' || item.game === 'search') && 'is-word')}>
          <span className="dcms-item__text">{title}</span>
          {item.data.game === 'groups' ? (
            <Badge tone="outline" size="sm">
              {`Level ${item.data.level}`}
            </Badge>
          ) : null}
          {item.retired ? (
            <Badge tone="neutral" size="sm">
              Retired
            </Badge>
          ) : null}
        </span>
        <ItemDetails item={item} />
        <span className="dcms-item__meta">
          {themeTitle} · {usesLine(item.uses, item.lastUsed ?? null, shortDay)}
        </span>
      </button>
      <span className="dcms-item__tools">
        <IconButton size="sm" icon={item.retired ? ArrowCounterClockwise : Archive} label={item.retired ? `Bring back “${title}”` : `Retire “${title}”`} tooltip disabled={busy} onClick={onRetire} />
        {item.uses === 0 ? <IconButton size="sm" icon={Trash} label={`Delete “${title}”`} tooltip onClick={onRemove} /> : null}
      </span>
    </li>
  );
}

function ItemDetails({ item }: { item: ItemOut }) {
  const { getModule } = useModules();
  const data = item.data;
  if (data.game === 'groups') return <span className="dcms-item__detail">{listWords(data.words)}</span>;
  if (data.game === 'quiz') {
    const module = data.moduleId ? getModule(data.moduleId) : null;
    return (
      <span className="dcms-item__detail">
        Right answer: {rightOption(data)}
        {module ? ` · ${module.unitCode ? `${module.unitCode} ` : ''}${module.shortName}` : ''}
      </span>
    );
  }
  if (data.game === 'nearest' && item.closest?.length) {
    return <span className="dcms-item__detail">Closest: {item.closest.slice(0, 6).join(', ')}</span>;
  }
  return null;
}
