// Manage → Modules (content.edit): every module by year, in programme order, hidden ones too. Reorder a year by
// dragging or with the up and down buttons, add a module, or open one in the editor (?module=<id>).
import {
  ArrowDown,
  ArrowUp,
  DotsSixVertical,
  EyeSlash,
  Plus,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";
import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { errorMessage, isApiError } from "../../../api/errors";
import type { ModuleEditSummary } from "../../../api/types";
import { uploadFile } from "../../../api/uploads";
import { useQueryParam, useToast, YEARS } from "../../../state";
import {
  Badge,
  Button,
  IconButton,
  Modal,
  ModuleArt,
  ModuleIcon,
  Panel,
  QueryError,
  Select,
  Skeleton,
  TextField,
  cx,
  moduleArtSrc,
} from "../../../ui";
import {
  useCreateModule,
  useModulesForEditing,
  useReorderModules,
} from "./api";
import { ModuleForm } from "./ModuleForm";
import "./Editor.css";

export function ModulesEditor() {
  const [selected, setSelected] = useQueryParam("module");
  if (selected)
    return (
      <ModuleForm
        key={selected}
        id={selected}
        onClose={() => setSelected(null)}
      />
    );
  return <ModuleList onOpen={(id) => setSelected(id)} />;
}

function ModuleList({ onOpen }: { onOpen: (id: string) => void }) {
  const list = useModulesForEditing();
  const [adding, setAdding] = useState(false);
  if (list.isError)
    return (
      <QueryError
        error={list.error}
        title="The modules didn’t load"
        onRetry={() => void list.refetch()}
        retrying={list.isFetching}
        size="sm"
      />
    );
  return (
    <div className="medit">
      <div className="medit__bar">
        <p className="medit__lede">
          Students see these modules and lessons. Changes show as soon as you
          save.
        </p>
        <Button leadingIcon={Plus} onClick={() => setAdding(true)}>
          Add a module
        </Button>
      </div>
      {list.isPending ? (
        <Panel padding="md">
          <Skeleton lines={6} />
        </Panel>
      ) : (
        YEARS.map((year) => (
          <YearList
            key={year}
            year={year}
            modules={list.data.filter((m) => m.year === year)}
            onOpen={onOpen}
          />
        ))
      )}
      <AddModule
        open={adding}
        onClose={() => setAdding(false)}
        onMade={onOpen}
      />
    </div>
  );
}

function YearList({
  year,
  modules,
  onOpen,
}: {
  year: number;
  modules: ModuleEditSummary[];
  onOpen: (id: string) => void;
}) {
  const reorder = useReorderModules();
  const { push: toast } = useToast();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const order = (ids: string[]) =>
    reorder.mutate(
      { year: year as 1 | 2 | 3, ids },
      {
        onError: (e) =>
          toast({
            title: "The new order wasn’t saved",
            body: errorMessage(e),
            tone: "alert",
          }),
      },
    );
  const step = (index: number, by: -1 | 1) => {
    const ids = modules.map((m) => m.id);
    const [id] = ids.splice(index, 1);
    if (id === undefined) return;
    ids.splice(index + by, 0, id);
    order(ids);
  };
  const drop = (e: DragEvent, target: string) => {
    e.preventDefault();
    setOver(null);
    if (!dragging || dragging === target) return;
    const ids = modules.map((m) => m.id).filter((id) => id !== dragging);
    ids.splice(ids.indexOf(target), 0, dragging);
    setDragging(null);
    order(ids);
  };

  return (
    <section className="medit__year" aria-labelledby={`medit-year-${year}`}>
      <h3 id={`medit-year-${year}`} className="medit__year-title">
        Year {year}
      </h3>
      {modules.length === 0 ? (
        <p className="medit__empty">No modules in Year {year} yet.</p>
      ) : (
        <ol className="medit__list" aria-busy={reorder.isPending || undefined}>
          {modules.map((m, i) => (
            <li
              key={m.id}
              className={cx(
                "medit__row",
                dragging === m.id && "is-dragging",
                over === m.id && dragging !== m.id && "is-drop-before",
              )}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                setDragging(m.id);
              }}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                setOver(m.id);
              }}
              onDrop={(e) => drop(e, m.id)}
            >
              <DotsSixVertical className="medit__grip" aria-hidden="true" />
              {moduleArtSrc(m.id, m.artUrl) ? (
                <ModuleArt moduleId={m.id} artUrl={m.artUrl} className="medit__art" />
              ) : (
                <ModuleIcon name={m.icon} size={22} className="medit__icon" />
              )}
              <button
                type="button"
                className="medit__open"
                onClick={() => onOpen(m.id)}
              >
                <span className="medit__name">
                  {m.unitCode ? `${m.unitCode} ${m.name}` : m.name}
                </span>
                <span className="medit__meta">
                  {m.chapterCount}{" "}
                  {m.chapterCount === 1 ? "chapter" : "chapters"} ·{" "}
                  {m.lessonCount} {m.lessonCount === 1 ? "lesson" : "lessons"}
                </span>
              </button>
              {m.hidden ? (
                <Badge tone="neutral" icon={EyeSlash} size="sm">
                  Hidden
                </Badge>
              ) : null}
              <span className="medit__steps">
                <IconButton
                  icon={ArrowUp}
                  label={`Move ${m.shortName} up`}
                  size="sm"
                  disabled={i === 0 || reorder.isPending}
                  onClick={() => step(i, -1)}
                />
                <IconButton
                  icon={ArrowDown}
                  label={`Move ${m.shortName} down`}
                  size="sm"
                  disabled={i === modules.length - 1 || reorder.isPending}
                  onClick={() => step(i, 1)}
                />
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugOf = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

function AddModule({
  open,
  onClose,
  onMade,
}: {
  open: boolean;
  onClose: () => void;
  onMade: (id: string) => void;
}) {
  const create = useCreateModule();
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [id, setId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [year, setYear] = useState<1 | 2 | 3>(1);
  const [artUrl, setArtUrl] = useState<string | null>(null);
  const [uploadingArt, setUploadingArt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const address = idTouched ? id : slugOf(name);

  const handleArtUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingArt(true);
    try {
      const out = await uploadFile("module_art", file);
      if (out.mediaUrl) {
        setArtUrl(out.mediaUrl);
      }
    } catch (err) {
      setProblems((p) => ({ ...p, other: errorMessage(err) }));
    } finally {
      setUploadingArt(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const close = () => {
    setName("");
    setShortName("");
    setId("");
    setIdTouched(false);
    setArtUrl(null);
    setProblems({});
    create.reset();
    onClose();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (name.trim().length < 3)
      found.name = "Give the module a name of at least 3 characters.";
    if (shortName.trim().length < 2)
      found.shortName = "Give it a short name of at least 2 characters.";
    if (!SLUG.test(address) || address.length < 2)
      found.id = "Use lowercase letters, digits and dashes, like data-ethics.";
    setProblems(found);
    if (Object.keys(found).length) return;
    create.mutate(
      {
        id: address,
        name: name.trim(),
        shortName: shortName.trim(),
        year,
        description: "",
        artUrl: artUrl,
      },
      {
        onSuccess: (m) => {
          close();
          onMade(m.id);
        },
        onError: (err) =>
          setProblems({
            ...(isApiError(err) ? err.fields : {}),
            other: errorMessage(err),
          }),
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add a module"
      description="It starts empty. Add its chapters and lessons next."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="medit-add" loading={create.isPending}>
            Add the module
          </Button>
        </>
      }
    >
      <form
        id="medit-add"
        className="medit-form__grid"
        onSubmit={submit}
        noValidate
      >
        <TextField
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={problems.name}
          required
          maxLength={120}
          data-autofocus
        />
        <TextField
          label="Short name"
          hint="On cards and in menus, like Economics."
          value={shortName}
          onChange={(e) => setShortName(e.target.value)}
          error={problems.shortName}
          required
          maxLength={60}
        />
        <TextField
          label="Address"
          hint={`The page is /modules/${address || "…"}. It can’t change later.`}
          value={address}
          onChange={(e) => {
            setIdTouched(true);
            setId(e.target.value.toLowerCase());
          }}
          error={problems.id}
          required
          maxLength={64}
        />
        <Select
          label="Year"
          value={year}
          onChange={(e) => setYear(Number(e.target.value) as 1 | 2 | 3)}
          options={YEARS.map((y) => ({ value: y, label: `Year ${y}` }))}
        />
        <div className="medit__art-section">
          <label className="ui-field__label">Illustration / Logo (optional)</label>
          <div className="medit__art-control">
            {artUrl ? (
              <div className="medit__art-preview">
                <ModuleArt artUrl={artUrl} className="medit__art-img" />
                <div className="medit__art-actions">
                  <Button
                    size="sm"
                    variant="secondary"
                    leadingIcon={UploadSimple}
                    loading={uploadingArt}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Change
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    leadingIcon={Trash}
                    onClick={() => setArtUrl(null)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="medit__art-empty">
                <Button
                  size="sm"
                  variant="secondary"
                  leadingIcon={UploadSimple}
                  loading={uploadingArt}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload logo
                </Button>
                <span className="medit__art-hint">PNG, JPG or WebP</span>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: "none" }}
              onChange={handleArtUpload}
            />
          </div>
        </div>
        {problems.other ? (
          <p className="medit__error" role="alert">
            {problems.other}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
