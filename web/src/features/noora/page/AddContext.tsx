// "Add context" on the full page: a module, a lesson, a past paper's question or one of the student's notes goes to
// Noora with every question until it is taken off. The API loads the module's lessons and the paper's page itself;
// a note's words are read here and sent with the question. One of each at most (a lesson stands for its module).
import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ModuleSummary } from '../../../api/types';
import { useAuth } from '../../../auth';
import { useDebouncedValue } from '../../../state';
import { useModules } from '../../../state/modules';
import {
  Button,
  Menu,
  Modal,
  QueryError,
  SearchField,
  Select,
  Skeleton,
  cx,
  glyph,
  Icon,
  type Glyph,
} from '../../../ui';
import { questionNumber, useModuleQuestions } from '../../library/public';
import { moduleDetailQuery } from '../../modules/public';
import { useNotes } from '../../notes/public';

import type { Added, NotePick, PaperPick, Subject } from './added';

type Kind = 'module' | 'lesson' | 'paper' | 'note';
const TITLES: Record<Kind, string> = {
  module: 'Add a module',
  lesson: 'Add a lesson',
  paper: 'Add a past paper question',
  note: 'Add one of your notes',
};

const moduleName = (m: ModuleSummary): string => [m.unitCode, m.name].filter(Boolean).join(' ');

function useModuleOptions(year: number | null) {
  const { modules } = useModules();
  return useMemo(() => {
    const sorted = [...modules].sort(
      (a, b) => (a.year === year ? -1 : 0) - (b.year === year ? -1 : 0) || a.year - b.year,
    );
    return sorted.map((m) => ({ value: m.id, label: `Year ${m.year} · ${moduleName(m)}` }));
  }, [modules, year]);
}

function ModulePicker({
  year,
  onAdd,
  onClose,
}: {
  year: number | null;
  onAdd: (s: Subject) => void;
  onClose: () => void;
}) {
  const { modules } = useModules();
  const options = useModuleOptions(year);
  const [id, setId] = useState(options[0]?.value.toString() ?? '');
  const module = modules.find((m) => m.id === id);
  return (
    <PickerFrame
      title={TITLES.module}
      description="Noora reads its chapters and lessons with each question."
      onClose={onClose}
      canAdd={!!module}
      onAdd={() => module && onAdd({ kind: 'module', moduleId: module.id, label: moduleName(module) })}
    >
      <Select label="Module" value={id} onChange={(e) => setId(e.target.value)} options={options} data-autofocus />
    </PickerFrame>
  );
}

function LessonPicker({
  year,
  onAdd,
  onClose,
}: {
  year: number | null;
  onAdd: (s: Subject) => void;
  onClose: () => void;
}) {
  const { modules } = useModules();
  const options = useModuleOptions(year);
  const [moduleId, setModuleId] = useState(options[0]?.value.toString() ?? '');
  const [lessonId, setLessonId] = useState('');
  const detail = useQuery({ ...moduleDetailQuery(moduleId), enabled: !!moduleId });
  const lessons = useMemo(
    () =>
      (detail.data?.chapters ?? []).flatMap((c, ci) =>
        c.videos.map((v, vi) => ({
          value: v.id,
          label: `Chapter ${ci + 1} · ${v.title?.trim() || `Lesson ${vi + 1}`}`,
          chapter: c.title,
        })),
      ),
    [detail.data],
  );
  const chosen = lessons.find((l) => l.value === lessonId) ?? lessons[0];
  const module = modules.find((m) => m.id === moduleId);
  return (
    <PickerFrame
      title={TITLES.lesson}
      description="Noora knows which lesson you mean, and the module around it."
      onClose={onClose}
      canAdd={!!chosen && !!module}
      onAdd={() =>
        chosen &&
        module &&
        onAdd({
          kind: 'lesson',
          moduleId,
          lessonId: chosen.value,
          label: `${module.unitCode ?? module.shortName}: ${chosen.label.replace(/^Chapter \d+ · /, '')}`,
        })
      }
    >
      <Select
        label="Module"
        value={moduleId}
        onChange={(e) => {
          setModuleId(e.target.value);
          setLessonId('');
        }}
        options={options}
        data-autofocus
      />
      {detail.isPending ? (
        <Skeleton height={44} radius={10} />
      ) : detail.isError ? (
        <QueryError
          error={detail.error}
          title="The lessons didn’t load"
          onRetry={() => void detail.refetch()}
          retrying={detail.isFetching}
          size="sm"
          panel={false}
        />
      ) : lessons.length ? (
        <Select
          label="Lesson"
          value={chosen?.value ?? ''}
          onChange={(e) => setLessonId(e.target.value)}
          options={lessons.map(({ value, label }) => ({ value, label }))}
        />
      ) : (
        <p className="np-pick__empty">This module has no lessons yet. Add the module instead.</p>
      )}
    </PickerFrame>
  );
}

function PaperPicker({
  year,
  onAdd,
  onClose,
}: {
  year: number | null;
  onAdd: (p: PaperPick) => void;
  onClose: () => void;
}) {
  const options = useModuleOptions(year);
  const [moduleId, setModuleId] = useState(options[0]?.value.toString() ?? '');
  const [questionId, setQuestionId] = useState('');
  const questions = useModuleQuestions(moduleId);
  const list = useMemo(
    () =>
      (questions.data ?? []).flatMap((q) =>
        q.page == null
          ? []
          : [
              {
                value: q.id,
                label: `${q.paper.title} · Question ${questionNumber(q)} · page ${q.page}`,
                pick: {
                  itemId: q.paper.id,
                  page: q.page,
                  question: questionNumber(q),
                  label: `${q.paper.title}, question ${questionNumber(q)}`,
                },
              },
            ],
      ),
    [questions.data],
  );
  const chosen = list.find((q) => q.value === questionId) ?? list[0];
  return (
    <PickerFrame
      title={TITLES.paper}
      description="Noora reads that page of the paper and the examiners’ report for its sitting."
      onClose={onClose}
      canAdd={!!chosen}
      onAdd={() => chosen && onAdd(chosen.pick)}
    >
      <Select
        label="Module"
        value={moduleId}
        onChange={(e) => {
          setModuleId(e.target.value);
          setQuestionId('');
        }}
        options={options}
        data-autofocus
      />
      {questions.isPending ? (
        <Skeleton height={44} radius={10} />
      ) : questions.isError ? (
        <QueryError
          error={questions.error}
          title="The questions didn’t load"
          onRetry={() => void questions.refetch()}
          retrying={questions.isFetching}
          size="sm"
          panel={false}
        />
      ) : list.length ? (
        <Select
          label="Question"
          value={chosen?.value ?? ''}
          onChange={(e) => setQuestionId(e.target.value)}
          options={list.map(({ value, label }) => ({ value, label }))}
        />
      ) : (
        <p className="np-pick__empty">
          No questions of this module’s papers are tagged yet. Open a past paper in the library and ask about a question
          there.
        </p>
      )}
    </PickerFrame>
  );
}

function NotePicker({ onAdd, onClose }: { onAdd: (n: NotePick) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query, 250);
  const notes = useNotes({ q });
  const items = notes.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <PickerFrame
      title={TITLES.note}
      description="Its words go to Noora with your questions, until you take it off."
      onClose={onClose}
      canAdd={false}
      onAdd={() => undefined}
    >
      <SearchField
        value={query}
        onValueChange={setQuery}
        onClear={() => setQuery('')}
        placeholder="Search your notes"
        label="Search your notes"
        data-autofocus
      />
      {notes.isPending ? (
        <Skeleton height={120} radius={10} />
      ) : notes.isError ? (
        <QueryError
          error={notes.error}
          title="Your notes didn’t load"
          onRetry={() => void notes.refetch()}
          retrying={notes.isFetching}
          size="sm"
          panel={false}
        />
      ) : items.length ? (
        <ul role="list" className="np-pick__notes">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className="np-pick__note"
                onClick={() => onAdd({ noteId: n.id, label: n.title.trim() || 'Untitled note' })}
                data-hub="noora-pick-note"
              >
                <span className="np-pick__note-title">{n.title.trim() || 'Untitled note'}</span>
                {n.excerpt ? <span className="np-pick__note-excerpt">{n.excerpt}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="np-pick__empty">
          {q
            ? 'No notes match. Try other words.'
            : 'You have no notes yet. Write one in your notebook, then add it here.'}
        </p>
      )}
    </PickerFrame>
  );
}

function PickerFrame({
  title,
  description,
  onClose,
  onAdd,
  canAdd,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  onAdd: () => void;
  canAdd: boolean;
  children: ReactNode;
}) {
  const choosing = title === TITLES.note; // a note is added by choosing it
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        choosing ? (
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onAdd} disabled={!canAdd} data-hub="noora-add-context-confirm">
              Add
            </Button>
          </>
        )
      }
    >
      <div className="np-pick">{children}</div>
    </Modal>
  );
}

export interface AddContextProps {
  added: Added;
  onChange: (next: Added) => void;
  year: number | null;
  /** the box gets the keyboard back once a dialog closes */
  onDone: () => void;
}

/** The composer's "Add" button: what can be added, then a small dialog to choose it. */
export function AddContext({ added, onChange, year, onDone }: AddContextProps) {
  const { featureOn, me } = useAuth();
  const [kind, setKind] = useState<Kind | null>(null);
  const close = () => {
    setKind(null);
    onDone();
  };
  const entry = (id: Kind, label: string, icon: Glyph, disabled = false) => ({
    id,
    label,
    icon,
    disabled,
    onSelect: () => setKind(id),
  });
  const items = [
    entry('module', 'A module', glyph.gridView),
    entry('lesson', 'A lesson', glyph.book),
    ...(featureOn('library') && featureOn('library.questions')
      ? [entry('paper', 'A past paper question', glyph.exam)]
      : []),
    ...(featureOn('notes') && me ? [entry('note', 'One of your notes', glyph.notepad)] : []),
  ];
  const setSubject = (subject: Subject) => {
    onChange({ ...added, subject });
    close();
  };
  return (
    <>
      <Menu
        side="top"
        label="Add context"
        trigger={
          <button
            type="button"
            className={cx('nc-tool', 'nc-toggle', 'np-add')}
            aria-haspopup="menu"
            data-hub="noora-add-context"
          >
            <Icon glyph={glyph.plus} aria-hidden="true" />
            <span>Add context</span>
          </button>
        }
        items={[{ heading: 'Noora reads it with every question', id: 'h' }, ...items]}
      />
      {kind === 'module' ? <ModulePicker year={year} onAdd={setSubject} onClose={close} /> : null}
      {kind === 'lesson' ? <LessonPicker year={year} onAdd={setSubject} onClose={close} /> : null}
      {kind === 'paper' ? (
        <PaperPicker
          year={year}
          onAdd={(paper) => {
            onChange({ ...added, paper });
            close();
          }}
          onClose={close}
        />
      ) : null}
      {kind === 'note' ? (
        <NotePicker
          onAdd={(note) => {
            onChange({ ...added, note });
            close();
          }}
          onClose={close}
        />
      ) : null}
    </>
  );
}
