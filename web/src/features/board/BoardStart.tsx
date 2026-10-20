// A student's first board: each template is one click from a board of its own, named after it and opened at once.
import { useState, type CSSProperties } from 'react';
import { Button, Icon, Spinner, cx, glyph } from '../../ui';
import { useCreateBoard } from './api';
import { colorVar, startName, TEMPLATES, type BoardTemplate } from './board';
import './BoardStart.css';

export interface BoardStartProps {
  /** names of the boards already there (archived ones), so a new one doesn't repeat them */
  taken: readonly string[];
  readOnly: boolean;
  onStarted: (boardId: string) => void;
}

export function BoardStart({ taken, readOnly, onStarted }: BoardStartProps) {
  const create = useCreateBoard();
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
      <ul role="list" className="board-start__grid">
        {TEMPLATES.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className={cx('board-start__option', starting === t.id && 'is-starting')}
              style={{ '--tpl': colorVar(t.color) } as CSSProperties}
              disabled={readOnly || create.isPending}
              aria-label={`Start a ${t.name} board`}
              aria-describedby={`board-start-${t.id}`}
              onClick={() => start(t.id)}
              data-hub={`board-template-${t.id}`}
            >
              <span className="board-start__head">
                <span className="board-start__name">{t.name}</span>
                {starting === t.id ? (
                  <Spinner size={18} />
                ) : (
                  <Icon glyph={glyph.forward} size={20} className="board-start__go" />
                )}
              </span>
              <span className="board-start__blurb" id={`board-start-${t.id}`}>
                {t.blurb}
                <span className="visually-hidden"> Columns: {t.columns.join(', ')}.</span>
              </span>
              <span className="board-start__columns" aria-hidden="true">
                {t.columns.map((c, i) => {
                  const done = i === t.columns.length - 1;
                  return (
                    <span key={c} className={cx('board-start__column', done && 'is-done')}>
                      {done ? <Icon glyph={glyph.success} size={16} /> : null}
                      {t.id === 'weekly' && !done ? c.slice(0, 3) : c}
                    </span>
                  );
                })}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="board-start__aside">
        <p>
          Revising for an exam? Open its module and choose <strong>Plan my revision</strong>: the lessons and past
          papers go on a board, spread over the days you have.
        </p>
        <Button size="sm" variant="ghost" to="/modules" trailingIcon={<Icon glyph={glyph.forward} />}>
          Your modules
        </Button>
      </div>
    </section>
  );
}
