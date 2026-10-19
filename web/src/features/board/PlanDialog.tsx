// "Plan my revision" on a module: past papers (one every few days, and one a day in the last week) and the lessons not
// watched yet, as many as fit the days left to the exam, as cards on the board. When not every lesson fits, the
// chapters the student finds hard come first. No reminders: the plan only lives on the board.
import { CalendarCheck } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage, isApiError } from '../../api/errors';
import { useAuth } from '../../auth';
import { addDaysToKey, isDayKey, todayKey, type DayKey } from '../../lib/dates';
import { useToast } from '../../state';
import { Button, Chip, Modal, Select, TextField, type ButtonSize } from '../../ui';
import { moduleDetailQuery } from '../modules/public';
import { useBoards, useMakePlan } from './api';
import './BoardDialog.css';

const PAPER_EVERY = [2, 3, 4, 5, 7] as const;

export interface PlanRevisionProps {
  moduleId: string;
  /** 'EC1002' or the module's name, for the dialog's title */
  moduleName: string;
  /** the module's next exam on the calendar, to start from */
  examDate: DayKey | null;
  size?: ButtonSize;
  /** 'Plan' (named 'Plan my revision') and 'Update plan', for a phone's row of actions */
  short?: boolean;
  className?: string;
}

/** "Plan my revision" (or "Update revision plan" once there is one) and its dialog. Guests sign in first. The
 *  caller gates it with featureOn('board'). */
export function PlanRevision({
  moduleId,
  moduleName,
  examDate,
  size = 'md',
  short = false,
  className,
}: PlanRevisionProps) {
  const { status, requireAuth } = useAuth();
  const boards = useBoards({ enabled: status === 'signed-in' });
  const [open, setOpen] = useState(false);
  const planned = boards.data?.plans.find((p) => p.moduleId === moduleId) ?? null;
  const show = () => setOpen(true);
  const label = planned ? 'Update revision plan' : 'Plan my revision';
  return (
    <>
      <Button
        size={size}
        leadingIcon={CalendarCheck}
        className={className}
        data-hub="board-plan"
        aria-label={short && !planned ? label : undefined}
        onClick={() => {
          if (requireAuth('Sign in to plan your revision on a board', show)) show();
        }}
      >
        {short ? (planned ? 'Update plan' : 'Plan') : label}
      </Button>
      {open ? (
        <PlanDialog
          moduleId={moduleId}
          moduleName={moduleName}
          examDate={planned?.examDate ?? examDate}
          paperEvery={planned?.paperEvery ?? 3}
          boardId={planned?.boardId ?? boards.data?.boards.find((b) => !b.archived)?.id}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/** What the toast says under "Added 12 cards": the lessons that didn't fit, or that nothing was left to add. */
function planNote(added: number, leftOut: number): string | undefined {
  const out = leftOut
    ? `${leftOut} lesson${leftOut === 1 ? '' : 's'} didn’t fit before the exam: past papers come first now.`
    : undefined;
  if (added) return out;
  return out ?? 'Everything left is already on your board.';
}

interface PlanDialogProps {
  moduleId: string;
  moduleName: string;
  examDate: DayKey | null;
  paperEvery: number;
  boardId?: string;
  onClose: () => void;
}

function PlanDialog({ moduleId, moduleName, examDate, paperEvery, boardId: initialBoardId, onClose }: PlanDialogProps) {
  const uid = useId().replace(/:/g, '');
  const make = useMakePlan();
  const toast = useToast();
  const navigate = useNavigate();
  const boards = useBoards();
  const activeBoards = boards.data?.boards.filter((b) => !b.archived) ?? [];
  const today = todayKey();
  const [date, setDate] = useState(examDate && examDate > today ? examDate : '');
  const [every, setEvery] = useState(String(paperEvery));
  const [boardId, setBoardId] = useState(initialBoardId ?? activeBoards[0]?.id ?? '');
  const [error, setError] = useState<string | undefined>();
  const chapters = useQuery(moduleDetailQuery(moduleId)).data?.chapters ?? [];
  const [hard, setHard] = useState<ReadonlySet<string>>(new Set());
  const toggleHard = (id: string, on: boolean) =>
    setHard((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!isDayKey(date) || date <= today) {
      setError('Pick the exam date, after today.');
      return;
    }
    setError(undefined);
    make.mutate(
      {
        moduleId,
        examDate: date,
        paperEvery: Number(every),
        boardId: boardId || undefined,
        focusChapters: [...hard],
      },
      {
        onSuccess: ({ added, plan, leftOut }) => {
          toast.push({
            tone: 'success',
            mate: 'blink',
            title: added ? `Added ${added} card${added === 1 ? '' : 's'} to your board` : 'Your plan is up to date',
            body: planNote(added, leftOut),
            action: { label: 'Open board', onClick: () => void navigate(`/board?board=${plan.boardId}`) },
          });
          onClose();
        },
        onError: (err) => {
          if (isApiError(err) && err.fields.examDate) setError(err.fields.examDate);
          else toast.push({ tone: 'alert', title: 'The plan wasn’t made', body: errorMessage(err) });
        },
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Plan your ${moduleName} revision`}
      description="Past papers and the lessons you haven’t watched go on your board, as much as fits the days to the exam: a paper a day in the last week, and a few hours’ work a day at most. Fall behind and the rest spread again."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form={`board-plan-${uid}`}
            loading={make.isPending}
            data-hub="board-plan-save"
          >
            Make the plan
          </Button>
        </>
      }
    >
      <form id={`board-plan-${uid}`} className="board-form" onSubmit={submit} noValidate>
        {activeBoards.length > 1 ? (
          <Select
            label="Board"
            value={boardId}
            onChange={(e) => setBoardId(e.target.value)}
            options={activeBoards.map((b) => ({ value: b.id, label: `${b.emoji ? `${b.emoji} ` : ''}${b.name}` }))}
          />
        ) : null}
        <TextField
          label="Exam date"
          type="date"
          required
          value={date}
          min={addDaysToKey(today, 1)}
          onChange={(e) => setDate(e.target.value)}
          error={error}
          data-autofocus
        />
        <Select
          label="A past paper every"
          value={every}
          onChange={(e) => setEvery(e.target.value)}
          options={PAPER_EVERY.map((n) => ({ value: String(n), label: `${n} days` }))}
          hint="In the last week before the exam, it’s a paper a day. Papers you’ve scored are left out."
        />
        {chapters.length > 1 ? (
          <fieldset className="board-form__chips">
            <legend className="board-form__legend">Chapters you find hard</legend>
            <p className="board-form__hint" id={`board-plan-hard-${uid}`}>
              Optional. Their lessons come first when not every lesson fits before the exam.
            </p>
            <div className="board-form__chiprow" aria-describedby={`board-plan-hard-${uid}`}>
              {chapters.map((c) => (
                <Chip key={c.id} size="sm" selected={hard.has(c.id)} onChange={(on) => toggleHard(c.id, on)}>
                  {c.title}
                </Chip>
              ))}
            </div>
          </fieldset>
        ) : null}
      </form>
    </Modal>
  );
}
