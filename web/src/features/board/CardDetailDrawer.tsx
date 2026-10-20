// A card opened in a drawer (a sheet from the bottom on phones), with everything about it. Each change saves as it is
// made; the title and the description save when you leave them, and when the drawer closes.
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BoardCard, BoardCardDetail, BoardCardUpdate, BoardLabel, BoardSummary } from '../../api/types';
import { formatDay } from '../../lib/dates';
import { BREAKPOINTS, useMediaQuery } from '../../state';
import {
  Button,
  Chip,
  Drawer,
  QueryError,
  Select,
  Skeleton,
  TextArea,
  TextField,
  safeInternalPath,
  Icon,
  glyph,
} from '../../ui';
import { MarkdownEditor } from '../forum/public';
import { useCardDetail, useUpdateCard } from './api';
import { colorVar, columnLabel, PRIORITIES, REMINDERS, type Priority, type RemindBefore } from './board';
import { CardChecklist } from './CardChecklist';
import { CardComments } from './CardComments';
import { CardFiles } from './CardFiles';
import './CardDetailDrawer.css';

export interface CardDetailDrawerProps {
  cardId: string;
  boards: readonly BoardSummary[];
  labels: readonly BoardLabel[];
  /** the account is suspended */
  readOnly: boolean;
  onClose: () => void;
  onMoveColumn: (card: BoardCard, columnId: string) => void;
  onMoveBoard: (card: BoardCard, boardId: string) => void;
  onDelete: (card: BoardCard) => void;
  onManageLabels: () => void;
}

export function CardDetailDrawer({
  cardId,
  boards,
  labels,
  readOnly,
  onClose,
  onMoveColumn,
  onMoveBoard,
  onDelete,
  onManageLabels,
}: CardDetailDrawerProps) {
  const isPhone = useMediaQuery(BREAKPOINTS.mobile);
  const detail = useCardDetail(cardId);
  const card = detail.data;
  const board = card ? boards.find((b) => b.id === card.boardId) : undefined;
  const column = card && board ? board.columns.find((c) => c.id === card.columnId) : undefined;

  return (
    <Drawer
      open
      onClose={onClose}
      side={isPhone ? 'bottom' : 'right'}
      width={600}
      title={card ? <span className="visually-hidden">{card.title}</span> : 'Card'}
      description={board && column ? `${board.name}${board.archived ? ' (archived)' : ''} · ${column.name}` : undefined}
      className="card-detail-drawer"
      data-hub="board-card-drawer"
    >
      {detail.isError ? (
        <QueryError
          error={detail.error}
          title="This card didn’t open"
          onRetry={() => void detail.refetch()}
          retrying={detail.isFetching}
        />
      ) : !card || !board ? (
        <div className="card-detail__loading" aria-busy="true">
          <span className="visually-hidden">Loading the card</span>
          <Skeleton height={44} />
          <Skeleton height={88} />
          <Skeleton height={160} />
        </div>
      ) : (
        <CardForm
          key={card.id}
          card={card}
          board={board}
          boards={boards}
          labels={labels}
          readOnly={readOnly || board.archived}
          onMoveColumn={onMoveColumn}
          onMoveBoard={onMoveBoard}
          onDelete={onDelete}
          onManageLabels={onManageLabels}
        />
      )}
    </Drawer>
  );
}

interface CardFormProps {
  card: BoardCardDetail;
  board: BoardSummary;
  boards: readonly BoardSummary[];
  labels: readonly BoardLabel[];
  readOnly: boolean;
  onMoveColumn: (card: BoardCard, columnId: string) => void;
  onMoveBoard: (card: BoardCard, boardId: string) => void;
  onDelete: (card: BoardCard) => void;
  onManageLabels: () => void;
}

function CardForm({
  card,
  board,
  boards,
  labels,
  readOnly,
  onMoveColumn,
  onMoveBoard,
  onDelete,
  onManageLabels,
}: CardFormProps) {
  const labelsId = useId();
  const dueId = useId();
  const update = useUpdateCard();
  const save = (patch: BoardCardUpdate) => {
    if (!readOnly) update.mutate({ id: card.id, boardId: card.boardId, patch });
  };

  // The title and the description are drafts until they're left, or the drawer closes.
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? '');
  const [titleError, setTitleError] = useState<string | undefined>();
  const saved = useRef({ title: card.title, description: card.description ?? '' });
  const drafts = useRef({ title, description });
  drafts.current = { title, description };
  const flushTitle = () => {
    const t = drafts.current.title.trim();
    if (!t || t === saved.current.title) return;
    saved.current.title = t;
    save({ title: t });
  };
  const flushDescription = () => {
    const d = drafts.current.description.trim();
    if (d === saved.current.description.trim()) return;
    saved.current.description = d;
    save({ description: d || null });
  };
  const flush = useRef<() => void>(() => undefined);
  flush.current = () => {
    flushTitle();
    flushDescription();
  };
  useEffect(() => () => flush.current(), []);

  const active = boards.filter((b) => !b.archived);
  const dueFrom = card.dueDate ? null : card.planDate ? 'plan' : card.link?.date ? 'event' : null;
  const otherDue = dueFrom === 'plan' ? card.planDate : dueFrom === 'event' ? (card.link?.date ?? null) : null;

  return (
    <div className="card-detail">
      <div className="card-detail__title">
        <TextArea
          label="Card title"
          hideLabel
          rows={1}
          value={title}
          maxLength={200}
          required
          disabled={readOnly}
          error={titleError}
          onChange={(e) => {
            // one line: a pasted line break becomes a space
            const next = e.target.value.replace(/\s*\n\s*/g, ' ');
            setTitle(next);
            setTitleError(next.trim() ? undefined : 'Give the card a title.');
          }}
          onBlur={() => {
            if (!title.trim()) {
              setTitle(saved.current.title);
              setTitleError(undefined);
            } else flushTitle();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              flushTitle();
            }
          }}
          data-hub="board-card-title"
        />
      </div>

      <div className="card-detail__grid">
        <Select
          label="Column"
          value={card.columnId}
          disabled={readOnly}
          onChange={(e) => onMoveColumn(card, e.target.value)}
          options={board.columns.map((c) => ({ value: c.id, label: columnLabel(c) }))}
        />
        <Select
          label="Priority"
          value={card.priority}
          disabled={readOnly}
          onChange={(e) => save({ priority: e.target.value as Priority })}
          options={PRIORITIES.map((p) => ({ value: p.id, label: p.label }))}
        />
        {active.length > 1 && !board.archived ? (
          <Select
            label="Board"
            className="card-detail__wide"
            value={card.boardId}
            disabled={readOnly}
            hint="Moving it to another board puts it in that board’s first column."
            onChange={(e) => onMoveBoard(card, e.target.value)}
            options={active.map((b) => ({ value: b.id, label: b.name }))}
          />
        ) : null}
      </div>

      <section className="card-detail__section" aria-labelledby={labelsId}>
        <div className="card-detail__section-head">
          <h3 className="card-detail__h" id={labelsId}>
            <Icon glyph={glyph.bookmark} />
            Labels
          </h3>
          {readOnly ? null : (
            <Button size="sm" variant="ghost" onClick={onManageLabels}>
              {labels.length ? 'Edit labels' : 'Make labels'}
            </Button>
          )}
        </div>
        {labels.length ? (
          <div className="card-detail__chips" role="group" aria-labelledby={labelsId}>
            {labels.map((l) => {
              const on = card.labelIds.includes(l.id);
              return (
                <Chip
                  key={l.id}
                  size="sm"
                  selected={on}
                  color={colorVar(l.color)}
                  disabled={readOnly}
                  onChange={() =>
                    save({ labelIds: on ? card.labelIds.filter((id) => id !== l.id) : [...card.labelIds, l.id] })
                  }
                >
                  {l.name}
                </Chip>
              );
            })}
          </div>
        ) : (
          <p className="card-detail__none">Labels sort cards across your boards, like Urgent or Reading.</p>
        )}
      </section>

      <section className="card-detail__section" aria-labelledby={dueId}>
        <h3 className="card-detail__h" id={dueId}>
          <Icon glyph={glyph.clock} />
          Due
        </h3>
        <div className="card-detail__grid card-detail__grid--due">
          <TextField
            label="Date"
            type="date"
            min="2000-01-01"
            max="2100-12-31"
            value={card.dueDate ?? ''}
            disabled={readOnly}
            onChange={(e) => save({ dueDate: e.target.value || null })}
          />
          <TextField
            label="Time (Bahrain)"
            type="time"
            value={card.dueTime ? card.dueTime.slice(0, 5) : ''}
            disabled={readOnly || !card.dueDate}
            onChange={(e) => save({ dueTime: e.target.value ? `${e.target.value}:00` : null })}
          />
          <Select
            label="Reminder"
            value={card.dueDate && card.remindBefore != null ? String(card.remindBefore) : 'none'}
            disabled={readOnly || !card.dueDate}
            onChange={(e) =>
              save({ remindBefore: e.target.value === 'none' ? null : (Number(e.target.value) as RemindBefore) })
            }
            options={[
              { value: 'none', label: card.dueDate ? 'No reminder' : 'Set a date first' },
              ...REMINDERS.map((r) => ({ value: String(r.id), label: r.label })),
            ]}
          />
        </div>
        {otherDue ? (
          <p className="card-detail__note">
            {dueFrom === 'plan' ? 'Your revision plan puts it on' : 'It’s due with its calendar date,'}{' '}
            {formatDay(otherDue, { weekday: 'short', month: 'short', year: false })}. A date here comes first.
          </p>
        ) : card.dueDate && card.remindBefore != null ? (
          <p className="card-detail__note">
            The reminder comes as a notification{card.dueTime ? '' : ', at 09:00 when there’s no time'}.
          </p>
        ) : null}
      </section>

      <MarkdownEditor
        label="Description"
        value={description}
        onChange={setDescription}
        rows={5}
        tools="basic"
        placeholder={readOnly ? '' : 'Notes, steps, links'}
        textareaProps={{ maxLength: 10000, disabled: readOnly, onBlur: flushDescription }}
        className="card-detail__description"
      />

      <CardChecklist items={card.checklist} readOnly={readOnly} onChange={(checklist) => save({ checklist })} />

      <CardFiles card={card} readOnly={readOnly} />

      {card.link ? <LinkedItem card={card} /> : null}

      <CardComments card={card} readOnly={readOnly} />

      <footer className="card-detail__foot">
        <span className="card-detail__added">Added {formatDay(new Date(card.createdAt), { month: 'short' })}</span>
        {readOnly ? null : (
          <Button
            variant="ghost"
            leadingIcon={<Icon glyph={glyph.trash} />}
            className="card-detail__delete"
            onClick={() => onDelete(card)}
            data-hub="board-card-delete"
          >
            Delete card
          </Button>
        )}
      </footer>
    </div>
  );
}

function LinkedItem({ card }: { card: BoardCardDetail }) {
  const headingId = useId();
  const link = card.link;
  if (!link) return null;
  const to = link.url ? safeInternalPath(link.url) : null;
  return (
    <section className="card-detail__section" aria-labelledby={headingId}>
      <h3 className="card-detail__h" id={headingId}>
        <Icon glyph={glyph.calendar} />
        From the hub
      </h3>
      {link.title && to ? (
        <Link to={to} className="card-detail__link">
          {link.title}
        </Link>
      ) : (
        <p className="card-detail__none">What this card linked to is no longer in the hub.</p>
      )}
    </section>
  );
}
