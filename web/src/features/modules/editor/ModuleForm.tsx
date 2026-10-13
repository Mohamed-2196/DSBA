// One module in the editor: its details, its shared folders, and its chapters and lessons, saved together. A save
// someone else made first (module_changed) offers to load theirs; removing something students' notes, cards, files
// or threads refer to (content_in_use) says so and suggests hiding it instead.
import { ArrowLeft, EyeSlash, Trash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { errorMessage, isApiError } from "../../../api/errors";
import type { ModuleEdit } from "../../../api/types";
import { useToast, YEARS } from "../../../state";
import {
  Badge,
  Button,
  ConfirmDialog,
  Panel,
  QueryError,
  Select,
  Skeleton,
  Switch,
  TextField,
} from "../../../ui";
import { MarkdownEditor } from "../../forum/public";
import {
  useDeleteModule,
  useModuleForEditing,
  useReloadModule,
  useSaveModule,
} from "./api";
import { ChaptersEditor } from "./ChaptersEditor";
import {
  MODULE_ICONS,
  RESOURCE_FIELDS,
  draftProblems,
  isDirty,
  toDraft,
  toSave,
  type Draft,
} from "./draft";

interface Props {
  id: string;
  onClose: () => void;
}

export function ModuleForm({ id, onClose }: Props) {
  const query = useModuleForEditing(id);
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
  if (query.isPending) {
    return (
      <div className="medit">
        <BackButton onClose={onClose} />
        <Panel padding="md">
          <Skeleton lines={8} />
        </Panel>
      </div>
    );
  }
  // A new version (saved here, or loaded again) starts a new draft.
  return (
    <Editor
      key={`${query.data.id}@${query.data.version}`}
      loaded={query.data}
      onClose={onClose}
    />
  );
}

function BackButton({ onClose }: { onClose: () => void }) {
  return (
    <Button
      variant="ghost"
      leadingIcon={ArrowLeft}
      onClick={onClose}
      className="medit__back"
    >
      All modules
    </Button>
  );
}

type Problem =
  | { kind: "changed" }
  | { kind: "in-use"; message: string }
  | { kind: "other"; message: string };

function Editor({
  loaded,
  onClose,
}: {
  loaded: ModuleEdit;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(loaded));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<Problem | null>(null);
  const [removing, setRemoving] = useState(false);
  const save = useSaveModule(loaded.id);
  const reload = useReloadModule(loaded.id);
  const remove = useDeleteModule();
  const { push: toast } = useToast();
  const dirty = isDirty(draft, loaded);

  // Leaving the page with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const submit = () => {
    const found = draftProblems(draft);
    setFields(found);
    setProblem(null);
    if (Object.keys(found).length) {
      setProblem({
        kind: "other",
        message: "Some fields need a look before saving.",
      });
      return;
    }
    save.mutate(toSave(draft, loaded.version), {
      onSuccess: () =>
        toast({
          title: "Saved. Students see the changes now.",
          tone: "success",
        }),
      onError: (e) => {
        if (isApiError(e) && e.code === "module_changed")
          setProblem({ kind: "changed" });
        else if (isApiError(e) && e.code === "content_in_use")
          setProblem({ kind: "in-use", message: e.message });
        else {
          setFields(isApiError(e) ? e.fields : {});
          setProblem({ kind: "other", message: errorMessage(e) });
        }
      },
    });
  };
  const confirmRemove = () =>
    remove.mutate(
      { id: loaded.id, version: loaded.version },
      {
        onSuccess: () => {
          toast({ title: `${loaded.name} was removed.`, tone: "success" });
          onClose();
        },
      },
    );
  const inUse =
    isApiError(remove.error) && remove.error.code === "content_in_use";

  return (
    <div className="medit">
      <div className="medit__head">
        <BackButton onClose={onClose} />
        <div className="medit__title-row">
          <h3 className="medit__title">
            {loaded.unitCode
              ? `${loaded.unitCode} ${loaded.name}`
              : loaded.name}
          </h3>
          {loaded.hidden ? (
            <Badge tone="neutral" icon={EyeSlash} size="sm">
              Hidden
            </Badge>
          ) : null}
        </div>
        <div className="medit__actions">
          {!loaded.hidden ? (
            <Button variant="ghost" to={`/modules/${loaded.id}`}>
              Open the module
            </Button>
          ) : null}
          <Button
            variant="secondary"
            disabled={!dirty || save.isPending}
            onClick={() => setDraft(toDraft(loaded))}
          >
            Undo changes
          </Button>
          <Button onClick={submit} loading={save.isPending} disabled={!dirty}>
            Save
          </Button>
        </div>
      </div>

      {problem ? (
        <ProblemBanner problem={problem} onReload={() => void reload()} />
      ) : null}

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
          <Select
            label="Icon"
            value={draft.icon}
            onChange={(e) => set({ icon: e.target.value })}
            placeholder="The book (default)"
            options={MODULE_ICONS.map((icon) => ({
              value: icon,
              label: icon.replace(/([a-z])([A-Z])/g, "$1 $2"),
            }))}
          />
        </div>
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

      <Panel padding="md" className="medit__panel">
        <h4 className="medit__section">Shared folders</h4>
        <div className="medit-form__grid">
          {RESOURCE_FIELDS.map(([key, label]) => (
            <TextField
              key={key}
              label={label}
              type="url"
              inputMode="url"
              placeholder="https://"
              value={draft.resources[key]}
              onChange={(e) =>
                set({
                  resources: { ...draft.resources, [key]: e.target.value },
                })
              }
              error={fields[`resources.${key}`]}
              maxLength={500}
            />
          ))}
          <TextField
            label="About the exercises"
            value={draft.resources.exercisesNote}
            onChange={(e) =>
              set({
                resources: {
                  ...draft.resources,
                  exercisesNote: e.target.value,
                },
              })
            }
            maxLength={300}
          />
        </div>
      </Panel>

      <ChaptersEditor draft={draft} setDraft={setDraft} errors={fields} />

      <div className="medit__foot">
        <Button
          variant="ghost"
          leadingIcon={Trash}
          onClick={() => setRemoving(true)}
          className="medit__remove"
        >
          Remove this module
        </Button>
        <Button onClick={submit} loading={save.isPending} disabled={!dirty}>
          Save
        </Button>
      </div>

      <ConfirmDialog
        open={removing}
        title={`Remove ${loaded.name}?`}
        body="Only a module nothing refers to can be removed. Hiding it keeps everything, out of students’ sight."
        confirmLabel={inUse ? "Hide it instead" : "Remove"}
        tone={inUse ? "primary" : "danger"}
        busy={remove.isPending || save.isPending}
        error={remove.error ? errorMessage(remove.error) : null}
        onConfirm={() => {
          if (!inUse) return confirmRemove();
          save.mutate(toSave({ ...draft, hidden: true }, loaded.version), {
            onSuccess: () => {
              setRemoving(false);
              remove.reset();
              toast({
                title: `${loaded.name} is hidden from students.`,
                tone: "success",
              });
            },
            onError: (e) => {
              setRemoving(false);
              setProblem(
                isApiError(e) && e.code === "module_changed"
                  ? { kind: "changed" }
                  : { kind: "other", message: errorMessage(e) },
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

function ProblemBanner({
  problem,
  onReload,
}: {
  problem: Problem;
  onReload: () => void;
}) {
  if (problem.kind === "changed") {
    return (
      <div className="medit__banner" role="alert">
        <p>
          Someone else saved this module while you were editing. Load their
          version, then make your changes again.
        </p>
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
