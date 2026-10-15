import {
  ArrowDown,
  ArrowUp,
  CalendarDots,
  ChatCircleDots,
  CheckSquare,
  Clock,
  DownloadSimple,
  FileText,
  Paperclip,
  Plus,
  Tag,
  Trash,
} from '@phosphor-icons/react';
import { useRef, useState, type FormEvent } from 'react';
import type { BoardCardDetail, BoardColumn, BoardLabel, BoardSummary, ChecklistItem } from '../../api/types';
import { uploadFile, formatSize, UPLOAD_RULES, type UploadProgress } from '../../api/uploads';
import { BREAKPOINTS, useMediaQuery, useToast } from '../../state';
import { Badge, Button, ConfirmDialog, Drawer, IconButton, Select, Skeleton, TextArea, TextField, cx, safeInternalPath } from '../../ui';
import {
  useAttachFile,
  useCardDetail,
  useDeleteCard,
  useDeleteComment,
  useDetachFile,
  useMoveCard,
  useUpdateCard,
  useAddComment,
} from './api';
import {
  checklistProgress,
  colorVar,
  moveItem,
  newItemId,
  PRIORITIES,
  REMINDERS,
  type Priority,
  type RemindBefore,
} from './board';
import './CardDetailDrawer.css';

export interface CardDetailDrawerProps {
  cardId: string | null;
  boardId: string;
  columns: readonly BoardColumn[];
  boards: readonly BoardSummary[];
  labels: readonly BoardLabel[];
  readOnly: boolean;
  onClose: () => void;
}

export function CardDetailDrawer({
  cardId,
  boardId,
  columns,
  boards,
  labels,
  readOnly,
  onClose,
}: CardDetailDrawerProps) {
  const isPhone = useMediaQuery(BREAKPOINTS.mobile);
  const detailQuery = useCardDetail(cardId, { enabled: !!cardId });
  const card = detailQuery.data;

  if (!cardId) return null;

  return (
    <Drawer
      open={!!cardId}
      onClose={onClose}
      side={isPhone ? 'bottom' : 'right'}
      width={isPhone ? '100vw' : 560}
      title={card ? card.title : 'Loading card…'}
      className="card-detail-drawer"
    >
      {detailQuery.isPending || !card ? (
        <div className="card-detail-skeleton" aria-busy="true">
          <Skeleton height={28} width="80%" />
          <Skeleton height={100} />
          <Skeleton height={140} />
        </div>
      ) : (
        <CardDetailForm
          key={card.id}
          card={card}
          boardId={boardId}
          columns={columns}
          boards={boards}
          labels={labels}
          readOnly={readOnly}
          onClose={onClose}
        />
      )}
    </Drawer>
  );
}

interface FormProps {
  card: BoardCardDetail;
  boardId: string;
  columns: readonly BoardColumn[];
  boards: readonly BoardSummary[];
  labels: readonly BoardLabel[];
  readOnly: boolean;
  onClose: () => void;
}

function CardDetailForm({ card, boardId, columns, boards, labels, readOnly, onClose }: FormProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const update = useUpdateCard();
  const move = useMoveCard();
  const removeCard = useDeleteCard();
  const attach = useAttachFile();
  const detach = useDetachFile();
  const addComment = useAddComment();
  const deleteComment = useDeleteComment();

  // Local state for immediate edits
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? '');
  const [dueDate, setDueDate] = useState(card.dueDate ?? '');
  const [dueTime, setDueTime] = useState(card.dueTime ? card.dueTime.slice(0, 5) : '');
  const [remindBefore, setRemindBefore] = useState<RemindBefore | 'none'>(
    card.remindBefore != null ? card.remindBefore : 'none',
  );
  const [priority, setPriority] = useState<Priority>(card.priority);
  const [activeLabelIds, setActiveLabelIds] = useState<string[]>(card.labelIds ?? []);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(card.checklist ?? []);
  const [newTodoText, setNewTodoText] = useState('');
  const [commentText, setCommentText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);

  // Column / Board placement
  const handleColumnChange = (newColId: string) => {
    move.mutate({ id: card.id, columnId: newColId, afterId: null });
  };

  const handleBoardChange = (newBoardId: string) => {
    const targetBoard = boards.find((b) => b.id === newBoardId);
    if (!targetBoard || !targetBoard.columns[0]) return;
    move.mutate({ id: card.id, columnId: targetBoard.columns[0].id, afterId: null });
  };

  // Debounced/instant patch helper
  const savePatch = (patch: Parameters<typeof update.mutate>[0]['patch']) => {
    if (readOnly) return;
    update.mutate({ id: card.id, patch });
  };

  const handleTitleBlur = () => {
    const t = title.trim();
    if (t && t !== card.title) savePatch({ title: t });
    else setTitle(card.title);
  };

  const handleDescriptionBlur = () => {
    const d = description.trim() || null;
    if (d !== card.description) savePatch({ description: d });
  };

  const handleDueDateChange = (newDate: string) => {
    setDueDate(newDate);
    savePatch({ dueDate: newDate || null });
  };

  const handleDueTimeChange = (newTime: string) => {
    setDueTime(newTime);
    savePatch({ dueTime: newTime ? `${newTime}:00` : null });
  };

  const handleReminderChange = (val: string) => {
    const parsed = val === 'none' ? null : (Number(val) as RemindBefore);
    setRemindBefore(val === 'none' ? 'none' : parsed!);
    savePatch({ remindBefore: parsed });
  };

  const handlePriorityChange = (val: Priority) => {
    setPriority(val);
    savePatch({ priority: val });
  };

  const toggleLabel = (labelId: string) => {
    const next = activeLabelIds.includes(labelId)
      ? activeLabelIds.filter((id) => id !== labelId)
      : [...activeLabelIds, labelId];
    setActiveLabelIds(next);
    savePatch({ labelIds: next });
  };

  // Checklist actions
  const toggleChecklistItem = (itemId: string) => {
    const next = checklist.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item));
    setChecklist(next);
    savePatch({ checklist: next });
  };

  const removeChecklistItem = (itemId: string) => {
    const next = checklist.filter((item) => item.id !== itemId);
    setChecklist(next);
    savePatch({ checklist: next });
  };

  const moveChecklistItem = (itemId: string, by: -1 | 1) => {
    const next = moveItem(checklist, itemId, by);
    setChecklist(next);
    savePatch({ checklist: next });
  };

  const addChecklistItem = (e: FormEvent) => {
    e.preventDefault();
    const t = newTodoText.trim();
    if (!t) return;
    const next = [...checklist, { id: newItemId(), text: t, done: false }];
    setChecklist(next);
    setNewTodoText('');
    savePatch({ checklist: next });
  };

  // File uploads
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !files[0] || readOnly) return;
    const file = files[0];
    try {
      setUploadProgress({ loaded: 0, total: file.size });
      const out = await uploadFile('board', file, {
        onProgress: (p) => setUploadProgress(p),
      });
      attach.mutate({ cardId: card.id, uploadId: out.uploadId });
    } catch (err) {
      toast.push({ tone: 'alert', title: 'File upload failed', body: (err as Error).message });
    } finally {
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSetCover = (uploadId: string | null) => {
    savePatch({ coverId: uploadId });
  };

  // Comments
  const handleAddComment = (e: FormEvent) => {
    e.preventDefault();
    const text = commentText.trim();
    if (!text || readOnly) return;
    addComment.mutate(
      { cardId: card.id, body: text },
      {
        onSuccess: () => setCommentText(''),
      },
    );
  };

  const check = checklistProgress(checklist);

  return (
    <div className="card-detail">
      {/* Title */}
      <div className="card-detail__section">
        <TextField
          label="Title"
          required
          value={title}
          disabled={readOnly}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          maxLength={200}
        />
      </div>

      {/* Board & Column */}
      <div className="card-detail__row">
        <div className="card-detail__field">
          <Select
            label="Board"
            disabled={readOnly || boards.length <= 1}
            value={boardId}
            onChange={(e) => handleBoardChange(e.target.value)}
            options={boards.filter((b) => !b.archived).map((b) => ({
              value: b.id,
              label: `${b.emoji ? `${b.emoji} ` : ''}${b.name}`,
            }))}
          />
        </div>
        <div className="card-detail__field">
          <Select
            label="Column"
            disabled={readOnly}
            value={card.columnId}
            onChange={(e) => handleColumnChange(e.target.value)}
            options={columns.map((c) => ({
              value: c.id,
              label: `${c.name}${c.done ? ' (Done)' : ''}`,
            }))}
          />
        </div>
      </div>

      {/* Priority & Labels */}
      <div className="card-detail__row">
        <div className="card-detail__field">
          <Select
            label="Priority"
            disabled={readOnly}
            value={priority}
            onChange={(e) => handlePriorityChange(e.target.value as Priority)}
            options={PRIORITIES.map((p) => ({ value: p.id, label: p.label }))}
          />
        </div>
      </div>

      {/* Labels Tags */}
      {labels.length > 0 ? (
        <div className="card-detail__section">
          <span className="card-detail__subheading">
            <Tag aria-hidden="true" /> Labels
          </span>
          <div className="card-detail__label-chips">
            {labels.map((l) => {
              const active = activeLabelIds.includes(l.id);
              return (
                <button
                  type="button"
                  key={l.id}
                  disabled={readOnly}
                  className={cx('card-detail__label-chip', active && 'is-active')}
                  style={{
                    borderColor: colorVar(l.color),
                    color: active ? '#fff' : colorVar(l.color),
                    backgroundColor: active ? colorVar(l.color) : 'transparent',
                  }}
                  onClick={() => toggleLabel(l.id)}
                >
                  <span className="card-detail__chip-dot" style={{ backgroundColor: colorVar(l.color) }} aria-hidden="true" />
                  {l.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Dates, times & reminders */}
      <div className="card-detail__section">
        <span className="card-detail__subheading">
          <Clock aria-hidden="true" /> Due date & reminder
        </span>
        <div className="card-detail__row">
          <TextField
            label="Date"
            type="date"
            value={dueDate}
            disabled={readOnly}
            onChange={(e) => handleDueDateChange(e.target.value)}
          />
          <TextField
            label="Time"
            type="time"
            value={dueTime}
            disabled={readOnly}
            onChange={(e) => handleDueTimeChange(e.target.value)}
            hint="Bahrain time"
          />
          <Select
            label="Reminder"
            disabled={readOnly}
            value={String(remindBefore)}
            onChange={(e) => handleReminderChange(e.target.value)}
            options={[
              { value: 'none', label: 'No reminder' },
              ...REMINDERS.map((r) => ({ value: String(r.id), label: r.label })),
            ]}
          />
        </div>
      </div>

      {/* Description */}
      <div className="card-detail__section">
        <TextArea
          label="Description"
          rows={4}
          value={description}
          disabled={readOnly}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleDescriptionBlur}
          placeholder="Notes, links, details (supports Markdown)…"
        />
      </div>

      {/* Checklist */}
      <div className="card-detail__section">
        <div className="card-detail__section-header">
          <span className="card-detail__subheading">
            <CheckSquare aria-hidden="true" /> Checklist {checklist.length ? `(${check.done}/${check.total})` : ''}
          </span>
        </div>

        {checklist.length ? (
          <ul role="list" className="card-detail__checklist">
            {checklist.map((item, idx) => (
              <li key={item.id} className={cx('card-detail__checklist-item', item.done && 'is-done')}>
                <input
                  type="checkbox"
                  id={`chk-${item.id}`}
                  checked={item.done}
                  disabled={readOnly}
                  onChange={() => toggleChecklistItem(item.id)}
                  className="card-detail__checkbox"
                />
                <label htmlFor={`chk-${item.id}`} className="card-detail__item-text">
                  {item.text}
                </label>
                {readOnly ? null : (
                  <div className="card-detail__item-actions">
                    <IconButton
                      label="Move up"
                      icon={ArrowUp}
                      size="sm"
                      disabled={idx === 0}
                      onClick={() => moveChecklistItem(item.id, -1)}
                    />
                    <IconButton
                      label="Move down"
                      icon={ArrowDown}
                      size="sm"
                      disabled={idx === checklist.length - 1}
                      onClick={() => moveChecklistItem(item.id, 1)}
                    />
                    <IconButton
                      label="Remove"
                      icon={Trash}
                      size="sm"
                      onClick={() => removeChecklistItem(item.id)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        {readOnly ? null : (
          <form className="card-detail__add-todo" onSubmit={addChecklistItem}>
            <TextField
              label="Add to-do item"
              hideLabel
              value={newTodoText}
              onChange={(e) => setNewTodoText(e.target.value)}
              placeholder="Add an item…"
            />
            <Button size="sm" type="submit" disabled={!newTodoText.trim()}>
              Add
            </Button>
          </form>
        )}
      </div>

      {/* Attachments */}
      <div className="card-detail__section">
        <div className="card-detail__section-header">
          <span className="card-detail__subheading">
            <Paperclip aria-hidden="true" /> Attachments ({card.attachments?.length ?? 0})
          </span>
          {readOnly ? null : (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                className="visually-hidden"
                accept={UPLOAD_RULES.board.accept}
                onChange={handleFileSelect}
              />
              <Button
                size="sm"
                variant="ghost"
                leadingIcon={Plus}
                loading={!!uploadProgress}
                onClick={() => fileInputRef.current?.click()}
              >
                Upload file
              </Button>
            </div>
          )}
        </div>

        {uploadProgress ? (
          <div className="card-detail__progress">
            <span>Uploading… {formatSize(uploadProgress.loaded)} of {formatSize(uploadProgress.total)}</span>
          </div>
        ) : null}

        {card.attachments?.length ? (
          <ul role="list" className="card-detail__attachments">
            {card.attachments.map((att) => {
              const isCover = card.coverUrl === att.url;
              return (
                <li key={att.id} className="card-detail__attachment-item">
                  {att.image ? (
                    <div className="card-detail__att-thumb">
                      <img src={att.url} alt="" loading="lazy" />
                    </div>
                  ) : (
                    <div className="card-detail__att-icon">
                      <FileText aria-hidden="true" />
                    </div>
                  )}
                  <div className="card-detail__att-info">
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="card-detail__att-name"
                    >
                      {att.fileName}
                    </a>
                    <span className="card-detail__att-meta">
                      {formatSize(att.sizeBytes)}
                      {isCover ? <Badge tone="signal" size="sm">Cover</Badge> : null}
                    </span>
                  </div>
                  <div className="card-detail__att-actions">
                    {att.image && !readOnly ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSetCover(isCover ? null : att.id)}
                      >
                        {isCover ? 'Remove cover' : 'Set as cover'}
                      </Button>
                    ) : null}
                    <a
                      href={att.url}
                      download={att.fileName}
                      className="card-detail__download-btn"
                      title="Download file"
                    >
                      <DownloadSimple aria-hidden="true" />
                    </a>
                    {readOnly ? null : (
                      <IconButton
                        label="Delete attachment"
                        icon={Trash}
                        size="sm"
                        onClick={() => detach.mutate({ cardId: card.id, uploadId: att.id })}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {/* Linked Hub Item */}
      {card.link ? (
        <div className="card-detail__section">
          <span className="card-detail__subheading">
            <CalendarDots aria-hidden="true" /> Linked hub item
          </span>
          <div className="card-detail__link-box">
            <strong>{card.link.title ?? 'Linked item'}</strong>
            {card.link.url ? (
              <a href={safeInternalPath(card.link.url) ?? undefined} className="card-detail__open-link">
                View in hub →
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Comments to self */}
      <div className="card-detail__section">
        <div className="card-detail__section-header">
          <span className="card-detail__subheading">
            <ChatCircleDots aria-hidden="true" /> Comments to self ({card.comments?.length ?? 0})
          </span>
        </div>

        {card.comments?.length ? (
          <ul role="list" className="card-detail__comments">
            {card.comments.map((comm) => (
              <li key={comm.id} className="card-detail__comment-item">
                <div className="card-detail__comment-bubble">
                  <p className="card-detail__comment-text">{comm.body}</p>
                  <span className="card-detail__comment-date">
                    {new Date(comm.createdAt).toLocaleString()}
                  </span>
                </div>
                {readOnly ? null : (
                  <IconButton
                    label="Delete comment"
                    icon={Trash}
                    size="sm"
                    className="card-detail__delete-comment"
                    onClick={() => deleteComment.mutate({ cardId: card.id, commentId: comm.id })}
                  />
                )}
              </li>
            ))}
          </ul>
        ) : null}

        {readOnly ? null : (
          <form className="card-detail__comment-form" onSubmit={handleAddComment}>
            <TextArea
              label="Write a comment to self"
              hideLabel
              rows={2}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Write a note to yourself…"
            />
            <Button size="sm" type="submit" disabled={!commentText.trim()} loading={addComment.isPending}>
              Add comment
            </Button>
          </form>
        )}
      </div>

      {/* Delete Card */}
      {readOnly ? null : (
        <div className="card-detail__danger-zone">
          <Button
            variant="danger"
            leadingIcon={Trash}
            onClick={() => setConfirmDelete(true)}
          >
            Delete card
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete “${card.title}”?`}
        body="This card, its checklist, attachments and comments will be permanently removed."
        confirmLabel="Delete card"
        tone="danger"
        onConfirm={() => {
          removeCard.mutate(card.id, {
            onSuccess: () => {
              onClose();
            },
          });
          setConfirmDelete(false);
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
