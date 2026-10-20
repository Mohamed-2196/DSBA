// The chapters and lessons of the module in the editor. Drag a chapter or a lesson by its handle (a lesson may go to
// another chapter), or use the up and down buttons. Hiding keeps a chapter or lesson, and everything students
// attached to it, out of their sight; removing a chapter that still has lessons offers to hide it instead.
import { useState, type DragEvent } from 'react';
import { Badge, Button, ConfirmDialog, cx, glyph, Icon, IconButton, Panel, TextField } from '../../../ui';
import {
  addChapter,
  addLesson,
  canStepLesson,
  moveChapter,
  moveLesson,
  removeChapter,
  removeLesson,
  stepLesson,
  updateChapter,
  updateLesson,
  videoKind,
  type Draft,
  type LessonPlace,
} from './draft';

type Dragged = { type: 'chapter'; index: number } | { type: 'lesson'; at: LessonPlace };
type Target = { type: 'chapter'; index: number } | { type: 'lesson'; at: LessonPlace };

interface Props {
  draft: Draft;
  setDraft: (update: (d: Draft) => Draft) => void;
  /** problems by the API's field names ('chapters.0.lessons.1.url') */
  errors: Record<string, string>;
}

const KIND_LABEL = {
  youtube: 'YouTube video',
  'youtube-playlist': 'YouTube playlist',
  bbb: 'Class recording',
} as const;

export function ChaptersEditor({ draft, setDraft, errors }: Props) {
  const [dragged, setDragged] = useState<Dragged | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [hiding, setHiding] = useState<number | null>(null);
  // Chapters start folded, so a long module stays easy to scan; new ones, and ones with a problem, open.
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const isOpen = (key: string, c: number) =>
    opened.has(key) || Object.keys(errors).some((f) => f.startsWith(`chapters.${c}.`));
  const toggle = (key: string) =>
    setOpened((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const startDrag = (e: DragEvent<HTMLElement>, what: Dragged) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', what.type);
    const row = e.currentTarget.closest<HTMLElement>('[data-drag-row]');
    if (row) e.dataTransfer.setDragImage(row, 16, 16);
    setDragged(what);
  };
  const endDrag = () => {
    setDragged(null);
    setOver(null);
  };
  const allow = (e: DragEvent, target: Target, key: string) => {
    if (!dragged) return;
    // a chapter lands before a chapter; a lesson lands before a lesson, or at the end of a chapter
    if (dragged.type === 'chapter' && target.type !== 'chapter') return;
    e.preventDefault();
    e.stopPropagation();
    setOver(key);
  };
  const drop = (e: DragEvent, target: Target) => {
    e.preventDefault();
    e.stopPropagation();
    const what = dragged;
    endDrag();
    if (!what) return;
    if (what.type === 'chapter' && target.type === 'chapter') {
      const to = target.index > what.index ? target.index - 1 : target.index;
      setDraft((d) => moveChapter(d, what.index, to));
    } else if (what.type === 'lesson') {
      setDraft((d) => {
        if (target.type === 'chapter')
          return moveLesson(d, what.at, {
            chapter: target.index,
            lesson: d.chapters[target.index]?.lessons.length ?? 0,
          });
        const same = target.at.chapter === what.at.chapter;
        const lesson = same && target.at.lesson > what.at.lesson ? target.at.lesson - 1 : target.at.lesson;
        return moveLesson(d, what.at, { chapter: target.at.chapter, lesson });
      });
    }
  };

  const askRemove = (index: number) => {
    if ((draft.chapters[index]?.lessons.length ?? 0) > 0) setHiding(index);
    else setDraft((d) => removeChapter(d, index));
  };
  const hidingChapter = hiding === null ? null : draft.chapters[hiding];

  return (
    <section className="medit__chapters" aria-labelledby="medit-chapters">
      <h4 id="medit-chapters" className="medit__section">
        Chapters and lessons
      </h4>
      {draft.chapters.length === 0 ? (
        <p className="medit__empty">No chapters yet. Add the first one, then its lessons.</p>
      ) : null}
      <ol className="medit__chapter-list">
        {draft.chapters.map((ch, c) => {
          const open = isOpen(ch.key, c);
          return (
            <li
              key={ch.key}
              data-drag-row
              className={cx(
                'medit-chapter',
                ch.hidden && 'is-hidden',
                over === ch.key && 'is-drop-before',
                dragged?.type === 'chapter' && dragged.index === c && 'is-dragging',
              )}
              onDragOver={(e) => allow(e, { type: 'chapter', index: c }, ch.key)}
              onDrop={(e) => drop(e, { type: 'chapter', index: c })}
            >
              <Panel padding="sm" className="medit-chapter__panel">
                <div className="medit-chapter__head">
                  <span
                    className="medit__handle"
                    draggable
                    onDragStart={(e) => startDrag(e, { type: 'chapter', index: c })}
                    onDragEnd={endDrag}
                    title="Drag to move the chapter"
                  >
                    <Icon glyph={glyph.drag} />
                  </span>
                  <TextField
                    className="medit-chapter__title"
                    label={`Chapter ${c + 1}`}
                    value={ch.title}
                    onChange={(e) => setDraft((d) => updateChapter(d, c, { title: e.target.value }))}
                    error={errors[`chapters.${c}.title`]}
                    maxLength={160}
                    required
                  />
                  {ch.hidden ? (
                    <Badge tone="neutral" icon={<Icon glyph={glyph.eyeOff} />} size="sm">
                      Hidden
                    </Badge>
                  ) : null}
                  <span className="medit__tools">
                    <IconButton
                      icon={ch.hidden ? <Icon glyph={glyph.eye} /> : <Icon glyph={glyph.eyeOff} />}
                      label={ch.hidden ? `Show chapter ${c + 1} to students` : `Hide chapter ${c + 1} from students`}
                      size="sm"
                      onClick={() => setDraft((d) => updateChapter(d, c, { hidden: !ch.hidden }))}
                    />
                    <IconButton
                      icon={<Icon glyph={glyph.arrowUp} />}
                      label={`Move chapter ${c + 1} up`}
                      size="sm"
                      disabled={c === 0}
                      onClick={() => setDraft((d) => moveChapter(d, c, c - 1))}
                    />
                    <IconButton
                      icon={<Icon glyph={glyph.arrowDown} />}
                      label={`Move chapter ${c + 1} down`}
                      size="sm"
                      disabled={c === draft.chapters.length - 1}
                      onClick={() => setDraft((d) => moveChapter(d, c, c + 1))}
                    />
                    <IconButton
                      icon={<Icon glyph={glyph.trash} />}
                      label={`Remove chapter ${c + 1}`}
                      size="sm"
                      onClick={() => askRemove(c)}
                    />
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  leadingIcon={open ? <Icon glyph={glyph.chevronDown} /> : <Icon glyph={glyph.chevronRight} />}
                  aria-expanded={open}
                  onClick={() => toggle(ch.key)}
                >
                  {open
                    ? 'Fold the lessons'
                    : `Show ${ch.lessons.length} ${ch.lessons.length === 1 ? 'lesson' : 'lessons'}`}
                </Button>
                {open ? (
                  <>
                    <ol
                      className="medit__lessons"
                      onDragOver={(e) =>
                        dragged?.type === 'lesson' && allow(e, { type: 'chapter', index: c }, `${ch.key}-end`)
                      }
                      onDrop={(e) => drop(e, { type: 'chapter', index: c })}
                    >
                      {ch.lessons.map((l, v) => {
                        const at = { chapter: c, lesson: v };
                        const kind = videoKind(l.url);
                        return (
                          <li
                            key={l.key}
                            data-drag-row
                            className={cx(
                              'medit-lesson',
                              l.hidden && 'is-hidden',
                              over === l.key && 'is-drop-before',
                              dragged?.type === 'lesson' &&
                                dragged.at.chapter === c &&
                                dragged.at.lesson === v &&
                                'is-dragging',
                            )}
                            onDragOver={(e) => dragged?.type === 'lesson' && allow(e, { type: 'lesson', at }, l.key)}
                            onDrop={(e) => drop(e, { type: 'lesson', at })}
                          >
                            <span
                              className="medit__handle"
                              draggable
                              onDragStart={(e) => startDrag(e, { type: 'lesson', at })}
                              onDragEnd={endDrag}
                              title="Drag to move the lesson"
                            >
                              <Icon glyph={glyph.drag} />
                            </span>
                            <span className="medit-lesson__num u-tabular" aria-hidden="true">
                              {v + 1}
                            </span>
                            <div className="medit-lesson__fields">
                              <TextField
                                label={`Lesson ${v + 1} title`}
                                value={l.title}
                                onChange={(e) =>
                                  setDraft((d) =>
                                    updateLesson(d, at, {
                                      title: e.target.value,
                                    }),
                                  )
                                }
                                maxLength={200}
                              />
                              <TextField
                                label="Video link"
                                type="url"
                                inputMode="url"
                                placeholder="https://www.youtube.com/watch?v=…"
                                value={l.url}
                                onChange={(e) =>
                                  setDraft((d) =>
                                    updateLesson(d, at, {
                                      url: e.target.value,
                                    }),
                                  )
                                }
                                error={errors[`chapters.${c}.lessons.${v}.url`]}
                                hint={
                                  kind
                                    ? KIND_LABEL[kind]
                                    : 'A YouTube video or playlist, or a class recording on vc.bibf.com.'
                                }
                                maxLength={500}
                                required
                              />
                            </div>
                            <span className="medit__tools">
                              {l.hidden ? (
                                <Badge tone="neutral" icon={<Icon glyph={glyph.eyeOff} />} size="sm">
                                  Hidden
                                </Badge>
                              ) : null}
                              <IconButton
                                icon={l.hidden ? <Icon glyph={glyph.eye} /> : <Icon glyph={glyph.eyeOff} />}
                                label={
                                  l.hidden ? `Show lesson ${v + 1} to students` : `Hide lesson ${v + 1} from students`
                                }
                                size="sm"
                                onClick={() => setDraft((d) => updateLesson(d, at, { hidden: !l.hidden }))}
                              />
                              <IconButton
                                icon={<Icon glyph={glyph.arrowUp} />}
                                label={`Move lesson ${v + 1} up`}
                                size="sm"
                                disabled={!canStepLesson(draft, at, -1)}
                                onClick={() => setDraft((d) => stepLesson(d, at, -1))}
                              />
                              <IconButton
                                icon={<Icon glyph={glyph.arrowDown} />}
                                label={`Move lesson ${v + 1} down`}
                                size="sm"
                                disabled={!canStepLesson(draft, at, 1)}
                                onClick={() => setDraft((d) => stepLesson(d, at, 1))}
                              />
                              <IconButton
                                icon={<Icon glyph={glyph.trash} />}
                                label={`Remove lesson ${v + 1}`}
                                size="sm"
                                onClick={() => setDraft((d) => removeLesson(d, at))}
                              />
                            </span>
                          </li>
                        );
                      })}
                      {dragged?.type === 'lesson' ? (
                        <li
                          className={cx('medit-lesson__end', over === `${ch.key}-end` && 'is-drop-before')}
                          aria-hidden="true"
                        />
                      ) : null}
                    </ol>
                    <Button
                      variant="ghost"
                      size="sm"
                      leadingIcon={<Icon glyph={glyph.plus} />}
                      onClick={() => setDraft((d) => addLesson(d, c))}
                    >
                      Add a lesson
                    </Button>
                  </>
                ) : null}
              </Panel>
            </li>
          );
        })}
      </ol>
      <Button
        variant="secondary"
        leadingIcon={<Icon glyph={glyph.plus} />}
        onClick={() => {
          const d = addChapter(draft);
          const made = d.chapters.at(-1);
          if (made) setOpened((prev) => new Set(prev).add(made.key));
          setDraft(() => d);
        }}
      >
        Add a chapter
      </Button>

      <ConfirmDialog
        open={hidingChapter != null}
        title="Hide this chapter instead?"
        body={
          hidingChapter
            ? `“${hidingChapter.title || `Chapter ${(hiding ?? 0) + 1}`}” still has ${hidingChapter.lessons.length} ${hidingChapter.lessons.length === 1 ? 'lesson' : 'lessons'}. Hiding it keeps them, and students’ notes and progress, out of sight. To remove the chapter, move or remove its lessons first.`
            : undefined
        }
        confirmLabel="Hide the chapter"
        onConfirm={() => {
          if (hiding !== null) setDraft((d) => updateChapter(d, hiding, { hidden: true }));
          setHiding(null);
        }}
        onClose={() => setHiding(null)}
      />
    </section>
  );
}
