// Themes and the weeks to come. The rotation's themes take turns in order (move them with the arrows); a theme out of
// it runs only on weeks it is given. A theme joins the rotation once every game has what it needs, and a week that
// has started keeps its theme.
import { ArrowDown, ArrowUp, PencilSimple, Plus, Trash, WarningCircle } from '@phosphor-icons/react';
import { useState, type ReactNode } from 'react';
import { errorMessage, isApiError } from '../../../api/errors';
import type { DailyContentOverview, ThemeOut, WeekOut } from '../../../api/types';
import { formatDay } from '../../../lib/dates';
import { useToast, useUnsavedChanges } from '../../../state';
import {
  Badge,
  Button,
  ConfirmDialog,
  IconButton,
  Modal,
  Panel,
  Select,
  Switch,
  TextArea,
  TextField,
} from '../../../ui';
import { useCreateTheme, useDeleteTheme, useOrderThemes, useSaveTheme, useSetWeek } from './api';
import { countsLine, themeIdFrom } from './lib/items';
import { weekRange, weeksAway } from './lib/weeks';

const hasItems = (t: ThemeOut) => Object.values(t.counts).some((n) => n > 0);

export function ThemesPart({ overview }: { overview: DailyContentOverview }) {
  const [editing, setEditing] = useState<ThemeOut | 'new' | null>(null);
  const [removing, setRemoving] = useState<ThemeOut | null>(null);
  const order = useOrderThemes();
  const remove = useDeleteTheme();
  const { push: toast } = useToast();
  const rotation = overview.themes.filter((t) => t.inRotation);
  const others = overview.themes.filter((t) => !t.inRotation);

  const move = (from: number, by: -1 | 1) => {
    const ids = rotation.map((t) => t.id);
    const [id] = ids.splice(from, 1);
    if (id === undefined) return;
    ids.splice(from + by, 0, id);
    order.mutate(
      { ids },
      { onError: (e) => toast({ title: 'The new order wasn’t saved', body: errorMessage(e), tone: 'alert' }) },
    );
  };

  return (
    <div className="dcms__stack">
      <Panel as="section" padding="md" className="dcms-part" aria-labelledby="dcms-themes-title">
        <div className="dcms-part__head">
          <div className="dcms-part__intro">
            <h3 id="dcms-themes-title" className="dcms-part__title">
              Themes
            </h3>
            <p className="dcms__note">
              Each week runs one theme, from Sunday. The themes in the rotation take turns in this order; a theme out of
              the rotation runs only on the weeks you give it below.
            </p>
          </div>
          <Button leadingIcon={Plus} onClick={() => setEditing('new')}>
            Add a theme
          </Button>
        </div>
        <ol className="dcms-themes" aria-label="The rotation" aria-busy={order.isPending || undefined}>
          {rotation.map((t, i) => (
            <ThemeRow key={t.id} theme={t} onEdit={() => setEditing(t)} onRemove={() => setRemoving(t)}>
              <IconButton
                size="sm"
                icon={ArrowUp}
                label={`Move ${t.title} earlier`}
                disabled={i === 0 || order.isPending}
                onClick={() => move(i, -1)}
              />
              <IconButton
                size="sm"
                icon={ArrowDown}
                label={`Move ${t.title} later`}
                disabled={i === rotation.length - 1 || order.isPending}
                onClick={() => move(i, 1)}
              />
            </ThemeRow>
          ))}
        </ol>
        {others.length ? (
          <>
            <h4 className="dcms-part__sub">Out of the rotation</h4>
            <ul className="dcms-themes" aria-label="Themes out of the rotation">
              {others.map((t) => (
                <ThemeRow key={t.id} theme={t} onEdit={() => setEditing(t)} onRemove={() => setRemoving(t)} />
              ))}
            </ul>
          </>
        ) : null}
      </Panel>

      <WeeksPanel overview={overview} />

      {editing ? (
        <ThemeDialog
          key={editing === 'new' ? 'new' : editing.id}
          theme={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={`Delete ${removing?.title ?? 'this theme'}?`}
        body="It has no puzzles and has never run. Deleting it can’t be undone."
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
                toast({ title: `${removing.title} is deleted.`, tone: 'success' });
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

function ThemeRow({
  theme: t,
  onEdit,
  onRemove,
  children,
}: {
  theme: ThemeOut;
  onEdit: () => void;
  onRemove: () => void;
  children?: ReactNode;
}) {
  const removable = !t.used && !t.inRotation && !hasItems(t);
  return (
    <li className="dcms-theme">
      <div className="dcms-theme__main">
        <p className="dcms-theme__title">
          <span>{t.title}</span>
          {t.problems.length === 0 ? null : (
            <Badge tone="alert" size="sm" icon={WarningCircle}>
              Not ready
            </Badge>
          )}
        </p>
        {t.blurb ? <p className="dcms-theme__blurb">{t.blurb}</p> : null}
        <p className="dcms-theme__counts">{countsLine(t.counts)}</p>
        {t.problems.length ? (
          <ul className="dcms-theme__problems" aria-label={`What ${t.title} needs`}>
            {t.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="dcms-theme__tools">
        {children}
        <IconButton size="sm" icon={PencilSimple} label={`Edit ${t.title}`} tooltip onClick={onEdit} />
        {removable ? (
          <IconButton size="sm" icon={Trash} label={`Delete ${t.title}`} tooltip onClick={onRemove} />
        ) : null}
      </div>
    </li>
  );
}

function ThemeDialog({ theme, onClose }: { theme: ThemeOut | null; onClose: () => void }) {
  const create = useCreateTheme();
  const save = useSaveTheme();
  const { push: toast } = useToast();
  const [title, setTitle] = useState(theme?.title ?? '');
  const [blurb, setBlurb] = useState(theme?.blurb ?? '');
  const [id, setId] = useState('');
  const [idTouched, setIdTouched] = useState(false);
  const [inRotation, setInRotation] = useState(theme?.inRotation ?? false);
  const [opened] = useState(() => JSON.stringify({ title, blurb, inRotation }));
  useUnsavedChanges(idTouched || JSON.stringify({ title, blurb, inRotation }) !== opened, 'the theme');
  const pending = create.isPending || save.isPending;
  const error = create.error ?? save.error;
  const fields = isApiError(error) ? error.fields : {};
  const shownId = idTouched ? id : themeIdFrom(title);
  const general = error && !Object.keys(fields).length ? errorMessage(error) : null;

  const submit = () => {
    const done = (message: string) => {
      toast({ title: message, tone: 'success' });
      onClose();
    };
    if (theme) {
      save.mutate(
        { id: theme.id, title, blurb, inRotation, version: theme.version },
        { onSuccess: () => done('Theme saved.') },
      );
    } else {
      create.mutate(
        { id: shownId, title, blurb },
        { onSuccess: () => done(`${title.trim() || 'The theme'} is added, out of the rotation for now.`) },
      );
    }
  };

  return (
    <Modal
      open
      onClose={pending ? () => undefined : onClose}
      title={theme ? `Edit ${theme.title}` : 'Add a theme'}
      description={
        theme
          ? undefined
          : 'A new theme starts out of the rotation. Give it puzzles for every game, then add it to the rotation.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" loading={pending} onClick={submit}>
            {theme ? 'Save' : 'Add the theme'}
          </Button>
        </>
      }
    >
      <form
        className="dcms-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField
          label="Title"
          value={title}
          maxLength={60}
          required
          onChange={(e) => setTitle(e.target.value)}
          error={fields.title}
          data-autofocus
          hint="As the hub shows it: “Statistics week”."
        />
        <TextArea
          label="A line under the title"
          value={blurb}
          maxLength={200}
          rows={2}
          onChange={(e) => setBlurb(e.target.value)}
          error={fields.blurb}
          hint="What the week is about, in a few words."
        />
        {theme ? (
          <>
            <Switch
              checked={inRotation}
              onChange={setInRotation}
              label="In the rotation"
              description={
                theme.problems.length && !theme.inRotation
                  ? `Not ready yet: ${theme.problems[0]}`
                  : 'Themes in the rotation take turns, a week each.'
              }
            />
            {fields.inRotation ? <p className="dcms__error">{fields.inRotation}</p> : null}
          </>
        ) : (
          <TextField
            label="Id"
            value={shownId}
            maxLength={32}
            onChange={(e) => {
              setIdTouched(true);
              setId(e.target.value);
            }}
            error={fields.id}
            hint="Lower-case letters, digits and hyphens. It never changes, so keep it short."
          />
        )}
        {general ? (
          <p className="dcms__error" role="alert">
            {general}
          </p>
        ) : null}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function WeeksPanel({ overview }: { overview: DailyContentOverview }) {
  const setWeek = useSetWeek();
  const { push: toast } = useToast();
  const titles = new Map(overview.themes.map((t) => [t.id, t.title]));
  const titleOf = (id: string) => titles.get(id) ?? id;

  const choose = (week: WeekOut, theme: string) => {
    setWeek.mutate(
      { weekStart: week.weekStart, theme: theme || null },
      { onError: (e) => toast({ title: 'The week wasn’t changed', body: errorMessage(e), tone: 'alert' }) },
    );
  };

  return (
    <Panel as="section" padding="md" className="dcms-part" aria-labelledby="dcms-weeks-title">
      <div className="dcms-part__intro">
        <h3 id="dcms-weeks-title" className="dcms-part__title">
          The weeks to come
        </h3>
        <p className="dcms__note">
          A week follows the rotation unless you give it a theme, and the rotation carries on after it. A week that has
          started keeps its theme.
        </p>
      </div>
      <ol className="dcms-weeks" aria-busy={setWeek.isPending || undefined}>
        {overview.weeks.map((w, n) => (
          <li key={w.weekStart} className="dcms-week">
            <span className="dcms-week__when">
              <span className="dcms-week__label">{weekRange(w.weekStart)}</span>
              <span className="dcms-week__dates">{weeksAway(n)}</span>
            </span>
            {w.started ? (
              <span className="dcms-week__theme">{titleOf(w.theme)}</span>
            ) : (
              <Select
                className="dcms-week__select"
                label={`Theme for the week of ${formatDay(w.weekStart, { month: 'long', year: false })}`}
                hideLabel
                value={w.pinned ? w.theme : ''}
                disabled={setWeek.isPending}
                onChange={(e) => choose(w, e.target.value)}
                options={[
                  { value: '', label: w.pinned ? 'Back to the rotation' : `${titleOf(w.theme)}, by rotation` },
                  ...overview.themes.map((t) => ({
                    value: t.id,
                    label: t.problems.length ? `${t.title} (not ready)` : t.title,
                    disabled: t.problems.length > 0,
                  })),
                ]}
              />
            )}
            {w.pinned ? (
              <Badge tone="cobalt" size="sm">
                Chosen
              </Badge>
            ) : null}
          </li>
        ))}
      </ol>
    </Panel>
  );
}
