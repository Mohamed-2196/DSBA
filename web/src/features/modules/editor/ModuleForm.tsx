// One module in the editor: its details, its picture, and its chapters and lessons, saved together. A save someone
// else made first (module_changed) offers to load theirs; removing something students' notes, cards, files or threads
// refer to (content_in_use) says so and suggests hiding it instead.
import { ArrowLeft, ArrowSquareOut, EyeSlash, Trash } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Location } from 'react-router-dom';
import { errorMessage, isApiError } from '../../../api/errors';
import type { ModuleEdit } from '../../../api/types';
import { useToast, useUnsavedChanges, YEARS } from '../../../state';
import { Badge, Button, ConfirmDialog, Panel, QueryError, Select, Skeleton, Switch, TextField } from '../../../ui';
import { MarkdownEditor } from '../../forum/public';
import { useDeleteModule, useModuleForEditing, useReloadModule, useSaveModule } from './api';
import { ArtField } from './ArtField';
import { ChaptersEditor } from './ChaptersEditor';
import { draftProblems, isDirty, toDraft, toSave, type Draft } from './draft';

interface Props {
  id: string;
  onClose: () => void;
}

export function ModuleForm({ id, onClose }: Props) {
  const query = useModuleForEditing(id);
  // Once loaded, the editor keeps its own copy: a refetch in the background never replaces the draft.
  if (query.data) return <Editor first={query.data} onClose={onClose} />;
  if (query.isError) {
    return (
      <div className="medit">
        <BackButton onClose={onClose} />
        <QueryError
          error={query.error}
          title="This module didn’t load"
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          size="sm"
        />
      </div>
    );
  }
  return (
    <div className="medit">
      <BackButton onClose={onClose} />
      <Panel padding="md">
        <Skeleton lines={8} />
      </Panel>
    </div>
  );
}

function BackButton({ onClose }: { onClose: () => void }) {
  return (
    <Button variant="ghost" leadingIcon={ArrowLeft} onClick={onClose} className="medit__back">
      All modules
    </Button>
  );
}

type Problem = { kind: 'changed' } | { kind: 'in-use'; message: string } | { kind: 'other'; message: string };

function Editor({ first, onClose }: { first: ModuleEdit; onClose: () => void }) {
  // The version the draft is edited from: the one first loaded, then each one a save returns or "Load it again" loads.
  const [loaded, setLoaded] = useState(first);
  const [draft, setDraft] = useState<Draft>(() => toDraft(first));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<Problem | null>(null);
  const [removing, setRemoving] = useState(false);
  const save = useSaveModule(loaded.id);
  const reload = useReloadModule(loaded.id);
  const remove = useDeleteModule();
  const { push: toast } = useToast();
  const dirty = isDirty(draft, loaded);
  const heading = useRef<HTMLHeadingElement>(null);
  const status = useRef<HTMLSpanElement>(null);
  // The form is on screen while the address names this module.
  const keeps = useCallback((to: Location) => new URLSearchParams(to.search).get('module') === loaded.id, [loaded.id]);
  const bypass = useUnsavedChanges(dirty, loaded.name, keeps);

  // Opening a module moves focus to its name, so a screen reader starts there and Tab goes on into the form.
  useEffect(() => {
    heading.current?.focus();
  }, [loaded.id]);

  // A new version starts a new draft.
  const start = (next: ModuleEdit) => {
    setLoaded(next);
    setDraft(toDraft(next));
    setFields({});
    setProblem(null);
  };
  const loadAgain = () =>
    reload().then(start, (e: unknown) =>
      setProblem({ kind: 'other', message: `Their version didn’t load. ${errorMessage(e)}` }),
    );

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const submit = () => {
    const found = draftProblems(draft);
    setFields(found);
    setProblem(null);
    if (Object.keys(found).length) {
      setProblem({ kind: 'other', message: 'Some fields need a look before saving.' });
      return;
    }
    save.mutate(toSave(draft, loaded.version), {
      onSuccess: (out) => {
        start(out);
        // The Save button that had the focus is disabled now: the focus goes to the line saying it saved.
        status.current?.focus({ preventScroll: true });
        toast({ title: 'Saved. Students see the changes now.', tone: 'success' });
      },
      onError: (e) => {
        if (isApiError(e) && e.code === 'module_changed') setProblem({ kind: 'changed' });
        else if (isApiError(e) && e.code === 'content_in_use') setProblem({ kind: 'in-use', message: e.message });
        else {
          setFields(isApiError(e) ? e.fields : {});
          setProblem({ kind: 'other', message: errorMessage(e) });
        }
      },
    });
  };
  const confirmRemove = () =>
    remove.mutate(
      { id: loaded.id, version: loaded.version },
      {
        onSuccess: () => {
          toast({ title: `${loaded.name} was removed.`, tone: 'success' });
          bypass(onClose);
        },
      },
    );
  const inUse = isApiError(remove.error) && remove.error.code === 'content_in_use';

  return (
    <div className="medit">
      <div className="medit__head">
        <BackButton onClose={onClose} />
        <div className="medit__title-row">
          <h3 className="medit__title" ref={heading} tabIndex={-1}>
            {loaded.unitCode ? `${loaded.unitCode} ${loaded.name}` : loaded.name}
          </h3>
          {loaded.hidden ? (
            <Badge tone="neutral" icon={EyeSlash} size="sm">
              Hidden
            </Badge>
          ) : null}
        </div>
        {!loaded.hidden ? (
          <div className="medit__actions">
            <Button
              variant="ghost"
              to={`/modules/${loaded.id}`}
              target="_blank"
              rel="noopener"
              trailingIcon={ArrowSquareOut}
            >
              Open the module<span className="visually-hidden"> (opens in a new tab)</span>
            </Button>
          </div>
        ) : null}
      </div>

      {problem ? <ProblemBanner problem={problem} onReload={() => void loadAgain()} /> : null}

      <Panel padding="md" className="medit__panel">
        <h4 className="medit__section">Details</h4>
        <div className="medit-form__grid">
          <TextField
            label="Name"
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            error={fields.name}
            required
            maxLength={120}
          />
          <TextField
            label="Short name"
            hint="On cards and in menus."
            value={draft.shortName}
            onChange={(e) => set({ shortName: e.target.value })}
            error={fields.shortName}
            required
            maxLength={60}
          />
          <TextField
            label="Unit code"
            hint="Like ST2133. Leave it empty if there is none."
            value={draft.unitCode}
            onChange={(e) => set({ unitCode: e.target.value.toUpperCase() })}
            error={fields.unitCode}
            maxLength={6}
          />
          <Select
            label="Year"
            value={draft.year}
            onChange={(e) => set({ year: Number(e.target.value) as 1 | 2 | 3 })}
            options={YEARS.map((y) => ({ value: y, label: `Year ${y}` }))}
          />
        </div>
        <ArtField
          art={draft.art}
          icon={draft.icon}
          unitCode={draft.unitCode}
          onArt={(art) => set({ art })}
          onIcon={(icon) => set({ icon })}
          error={fields.art}
        />
        <MarkdownEditor
          label="Description"
          hint="Markdown works: **bold**, *italic*, lists, links and $formulas$."
          value={draft.description}
          onChange={(description) => set({ description })}
          error={fields.description}
          rows={4}
          preview
        />
        <Switch
          checked={draft.hidden}
          onChange={(hidden) => set({ hidden })}
          label="Hide from students"
          description="A hidden module leaves the catalogue, search and its page. Its lessons, files and threads stay."
        />
      </Panel>

      <ChaptersEditor draft={draft} setDraft={setDraft} errors={fields} />

      {/* In reach while the chapters scroll by: sticks to the bottom of the screen once there is something to save. */}
      <div className={dirty ? 'medit__savebar is-active' : 'medit__savebar'}>
        <span className="medit__savebar-status" role="status" tabIndex={-1} ref={status}>
          {dirty ? 'Unsaved changes' : 'No unsaved changes'}
        </span>
        <div className="medit__actions">
          <Button variant="secondary" disabled={!dirty || save.isPending} onClick={() => setDraft(toDraft(loaded))}>
            Undo changes
          </Button>
          <Button onClick={submit} loading={save.isPending} disabled={!dirty}>
            Save
          </Button>
        </div>
      </div>

      <div className="medit__foot">
        <Button variant="ghost" leadingIcon={Trash} onClick={() => setRemoving(true)} className="medit__remove">
          Remove this module
        </Button>
      </div>

      <ConfirmDialog
        open={removing}
        title={`Remove ${loaded.name}?`}
        body="Only a module nothing refers to can be removed. Hiding it keeps everything, out of students’ sight."
        confirmLabel={inUse ? 'Hide it instead' : 'Remove'}
        tone={inUse ? 'primary' : 'danger'}
        busy={remove.isPending || save.isPending}
        error={remove.error ? errorMessage(remove.error) : null}
        onConfirm={() => {
          if (!inUse) return confirmRemove();
          save.mutate(toSave({ ...draft, hidden: true }, loaded.version), {
            onSuccess: (out) => {
              start(out);
              setRemoving(false);
              remove.reset();
              toast({ title: `${loaded.name} is hidden from students.`, tone: 'success' });
            },
            onError: (e) => {
              setRemoving(false);
              setProblem(
                isApiError(e) && e.code === 'module_changed'
                  ? { kind: 'changed' }
                  : { kind: 'other', message: errorMessage(e) },
              );
            },
          });
        }}
        onClose={() => {
          setRemoving(false);
          remove.reset();
        }}
      />
    </div>
  );
}

function ProblemBanner({ problem, onReload }: { problem: Problem; onReload: () => void }) {
  if (problem.kind === 'changed') {
    return (
      <div className="medit__banner" role="alert">
        <p>Someone else saved this module while you were editing. Load their version, then make your changes again.</p>
        <Button size="sm" onClick={onReload}>
          Load it again
        </Button>
      </div>
    );
  }
  return (
    <div className="medit__banner" role="alert">
      <p>{problem.message}</p>
    </div>
  );
}
