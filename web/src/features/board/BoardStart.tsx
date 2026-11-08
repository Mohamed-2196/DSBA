// A student's first board: each template is one click from a board of its own, named after it and opened at once.
import { useState } from 'react';
import { useAuth } from '../../auth';
import { Button, Icon, Spinner, cx, glyph } from '../../ui';
import { useCreateBoard } from './api';
import { paperColumns, startName, TEMPLATES, type BoardTemplate, type PaperColumn, type TemplateInfo } from './board';
import './BoardStart.css';

export interface BoardStartProps {
  /** names of the boards already there (archived ones), so a new one doesn't repeat them */
  taken: readonly string[];
  readOnly: boolean;
  onStarted: (boardId: string) => void;
}

export function BoardStart({ taken, readOnly, onStarted }: BoardStartProps) {
  const create = useCreateBoard();
  const planning = useAuth().featureOn('board.plan');
  const [starting, setStarting] = useState<BoardTemplate | null>(null);

  const start = (id: BoardTemplate) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t || create.isPending) return;
    setStarting(id);
    create.mutate(
      { name: startName(t.suggested, taken), template: t.id, color: t.color },
      { onSuccess: (board) => onStarted(board.id), onSettled: () => setStarting(null) },
    );
  };

  return (
    <section className="board-start" aria-labelledby="board-start-title" data-hub="board-start">
      <h2 className="board-start__title" id="board-start-title">
        Start a board
      </h2>
      <p className="board-start__lead">
        {readOnly
          ? 'Your account is suspended, so you can’t make boards right now.'
          : 'Pick a template and it opens straight away. You can rename it, change its columns and add more boards later.'}
      </p>
      <ul role="list" className="board-start__grid" data-read-only={readOnly || undefined}>
        {TEMPLATES.map((t) => (
          <li key={t.id} className="board-start__item" data-t={t.id}>
            <button
              type="button"
              className={cx('board-start__option', starting === t.id && 'is-starting')}
              disabled={readOnly || create.isPending}
              aria-label={`Start ${/^[aeiou]/i.test(t.name) ? 'an' : 'a'} ${t.name} board`}
              aria-describedby={`board-start-${t.id}`}
              onClick={() => start(t.id)}
              data-hub={`board-template-${t.id}`}
            >
              <span className="board-start__stage" aria-hidden="true">
                <Paper template={t} />
              </span>
              <span className="board-start__cap">
                <span className="board-start__name">
                  {t.name}
                  {starting === t.id ? <Spinner size={18} /> : null}
                </span>
                <span className="board-start__blurb" id={`board-start-${t.id}`}>
                  {t.blurb}
                  <span className="visually-hidden"> Columns: {t.columns.join(', ')}.</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {planning ? (
        <div className="board-start__aside">
          <p>
            Revising for an exam? Open its module and choose <strong>Plan my revision</strong>: the lessons and past
            papers go on a board, spread over the days you have.
          </p>
          <Button size="sm" variant="ghost" to="/modules" trailingIcon={<Icon glyph={glyph.forward} />}>
            Your modules
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/** How many index cards each Study pile has, in column order: a desk mid-week, not a tidy diagram. */
const PILE_DEPTH = [3, 1, 2];

/** A column's name as written on the paper, the done one after its tick. */
function Written({ column }: { column: PaperColumn }) {
  return (
    <>
      {column.done ? <Icon glyph={glyph.success} size={14} className="board-start__tick" /> : null}
      {column.label}
    </>
  );
}

/** The template drawn as the paper you'd use for that job, with its real columns written on it. Decorative. */
function Paper({ template }: { template: TemplateInfo }) {
  const columns = paperColumns(template);
  switch (template.id) {
    case 'study':
      return (
        <span className="board-start__paper board-start__paper--study">
          {columns.map((c, i) => (
            <span key={c.name} className={cx('board-start__pile', c.done && 'is-done')} data-n={PILE_DEPTH[i] ?? 1}>
              {Array.from({ length: PILE_DEPTH[i] ?? 1 }, (_, k) => (
                <i key={k} />
              ))}
              <span className="board-start__pile-name">
                <Written column={c} />
              </span>
            </span>
          ))}
        </span>
      );
    case 'assignment':
      return (
        <span className="board-start__paper board-start__paper--assignment">
          <span className="board-start__staple" />
          {columns.map((c) => (
            <span key={c.name} className={cx('board-start__line', c.done && 'is-done')}>
              {c.done ? null : <span className="board-start__box" />}
              <Written column={c} />
            </span>
          ))}
        </span>
      );
    case 'personal':
      return (
        <span className="board-start__paper board-start__paper--personal">
          <span className="board-start__tape" />
          {columns.map((c) => (
            <span key={c.name} className="board-start__line">
              <Written column={c} />
            </span>
          ))}
        </span>
      );
    case 'weekly':
      return (
        <span className="board-start__paper board-start__paper--weekly">
          <span className="board-start__rings">
            {Array.from({ length: 9 }, (_, k) => (
              <i key={k} />
            ))}
          </span>
          <span className="board-start__days">
            {columns.map((c) => (
              <span key={c.name} className="board-start__day">
                {c.done ? <Icon glyph={glyph.success} size={14} className="board-start__tick" /> : c.label}
                {c.marked ? <i /> : null}
              </span>
            ))}
          </span>
        </span>
      );
    default:
      return (
        <span className="board-start__paper board-start__paper--blank">
          {columns.map((c) => (
            <span key={c.name} className={cx('board-start__half', c.done && 'is-done')}>
              <Written column={c} />
            </span>
          ))}
        </span>
      );
  }
}
