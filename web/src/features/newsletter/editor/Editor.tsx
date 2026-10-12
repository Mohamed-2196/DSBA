// The issue editor (decision D5): the issue's details, its cover and its sections as forms, with a live preview.
// Saving sends PATCH /newsletter/issues/{id}. Problems are checked against the API's own limits as the rep goes
// (after the first try to save), and a 422 from the API lands on the field that caused it. Unsaved edits are
// guarded against leaving the page and kept on this device until they are saved (UX-3).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowCounterClockwise, ArrowSquareOut, CalendarCheck, ChatsCircle, Books, Eye, FloppyDisk, NotePencil, PencilSimple, Plus, WarningCircle } from '@phosphor-icons/react';
import type { IssueDetail } from '../../../api/types';
import { errorMessage, isApiError } from '../../../api/errors';
import { formatDay } from '../../../lib/dates';
import { useDocumentTitle, useMediaQuery, useToast } from '../../../state';
import { Badge, Button, ConfirmDialog, Menu, Page, PageHeader, SegmentedControl, cx } from '../../../ui';
import { useUpdateIssue } from '../api';
import { DeleteIssueButton, PublishButton } from '../components/IssueActions';
import {
  addSection,
  controlId,
  draftFrom,
  fieldPath,
  mapApiErrors,
  markSaved,
  moveSection,
  removeSection,
  renameSection,
  sameContent,
  sectionOfPath,
  toUpdate,
  updateSection,
  validate,
  type FieldErrors,
  type IssueDraft,
  type NewSection,
  type SectionDraft,
} from '../lib/draft';
import { issueNo, plainText } from '../lib/text';
import { CoverEditor } from './CoverEditor';
import { DetailsEditor } from './DetailsEditor';
import { Preview } from './Preview';
import { SectionCard } from './SectionCard';
import { useDraftCopy } from './useDraftCopy';
import { useLeaveGuard } from './useLeaveGuard';

const NO_ERRORS: FieldErrors = {};
/** Below this width the form and the preview take turns (Edit / Preview). */
const SIDE_BY_SIDE = '(min-width: 1100px)';

const ADD: { kind: NewSection; label: string; icon: typeof NotePencil }[] = [
  { kind: 'story', label: 'A story', icon: NotePencil },
  { kind: 'deadlines', label: 'Deadlines from the calendar', icon: CalendarCheck },
  { kind: 'forum', label: 'Hot threads from the forum', icon: ChatsCircle },
  { kind: 'library', label: 'New files in the library', icon: Books },
];

/** The keys of `next` whose sections had an open card in `prev` (matched by link name: keys change on a reload). */
function reopen(open: ReadonlySet<string>, prev: IssueDraft, next: IssueDraft): Set<string> {
  const ids = new Set(prev.sections.filter((s) => open.has(s.key)).map((s) => s.id));
  return new Set(next.sections.filter((s) => ids.has(s.id)).map((s) => s.key));
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** 'Mon 12 Oct, 21:40' for when a copy was kept. */
function keptAt(ms: number): string {
  const d = new Date(ms);
  return `${formatDay(d, { weekday: 'short', month: 'short', year: false })}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function Editor({ detail }: { detail: IssueDetail }) {
  const navigate = useNavigate();
  const { push } = useToast();
  const update = useUpdateIssue();
  const sideBySide = useMediaQuery(SIDE_BY_SIDE);
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [pane, setPane] = useState<'edit' | 'preview'>('edit');
  const [baseline, setBaseline] = useState(() => draftFrom(detail));
  const [draft, setDraftState] = useState(baseline);
  const [open, setOpen] = useState<Set<string>>(() => new Set(baseline.sections.length === 1 ? baseline.sections.map((s) => s.key) : []));
  const [showErrors, setShowErrors] = useState(false);
  const [apiErrors, setApiErrors] = useState<FieldErrors>(NO_ERRORS);
  const [formError, setFormError] = useState<string | null>(null);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [revealTick, setRevealTick] = useState(0);
  const [discarding, setDiscarding] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const no = issueNo(detail.number);
  const published = detail.status === 'published';
  useDocumentTitle(`Edit issue ${no}`);

  const dirty = useMemo(() => !sameContent(draft, baseline), [draft, baseline]);
  const copy = useDraftCopy(detail, draft, dirty);
  const guard = useLeaveGuard(dirty);

  // Any change takes away the API's last word (the form checks itself again as it goes).
  const setDraft = useCallback((fn: (d: IssueDraft) => IssueDraft) => {
    setDraftState(fn);
    setApiErrors((e) => (e === NO_ERRORS ? e : NO_ERRORS));
  }, []);

  // A new version of the issue (saved here, or read again in the background) becomes the starting point. It replaces
  // the form only when the form has nothing unsaved; saved edits stay as they are (no reload of every field).
  const lastDetail = useRef(detail);
  const justSaved = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (lastDetail.current === detail) return;
    lastDetail.current = detail;
    const next = draftFrom(detail);
    setBaseline(next);
    const current = draftRef.current;
    if ((justSaved.current || !dirtyRef.current) && !sameContent(current, next)) {
      setDraftState(next);
      setOpen((o) => reopen(o, current, next));
    }
    justSaved.current = false;
  }, [detail]);

  const clientErrors = useMemo(() => (showErrors ? validate(draft) : NO_ERRORS), [showErrors, draft]);
  const errors = useMemo(() => (apiErrors === NO_ERRORS ? clientErrors : { ...apiErrors, ...clientErrors }), [apiErrors, clientErrors]);
  const problems = Object.keys(errors).length;

  // Focus a field that was just added, and the first problem after a failed save.
  useEffect(() => {
    if (!focusPath) return;
    document.getElementById(controlId(focusPath))?.focus();
    setFocusPath(null);
  }, [focusPath]);
  useEffect(() => {
    if (!revealTick) return;
    const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], .nl-ed-error');
    first?.focus({ preventScroll: true });
    first?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  }, [revealTick, reduced]);

  /** Open the sections with problems and take the rep to the first one. */
  const reveal = (found: FieldErrors) => {
    const keys = Object.keys(found)
      .map(sectionOfPath)
      .filter((k): k is string => k !== null);
    if (keys.length) setOpen((o) => new Set([...o, ...keys]));
    setPane('edit');
    setRevealTick((t) => t + 1);
  };

  const save = (then?: 'open') => {
    const found = validate(draft);
    setShowErrors(true);
    setApiErrors(NO_ERRORS);
    setFormError(null);
    const n = Object.keys(found).length;
    if (n) {
      setFormError(n === 1 ? 'One field needs fixing before the issue can be saved.' : `${n} fields need fixing before the issue can be saved.`);
      reveal(found);
      return;
    }
    const sent = draft;
    update.mutate(
      { id: detail.id, slug: detail.slug, patch: toUpdate(sent) },
      {
        onSuccess: (saved) => {
          justSaved.current = true;
          setDraftState(markSaved);
          setShowErrors(false);
          copy.clear();
          push({ tone: 'success', title: 'Saved', body: saved.status === 'published' ? 'Readers see the new version now.' : 'The draft is up to date.' });
          if (then === 'open') navigate(`/newsletter/${saved.slug}`);
          else if (saved.slug !== detail.slug) navigate(`/newsletter/${saved.slug}/edit`, { replace: true });
        },
        onError: (err) => {
          if (isApiError(err) && err.code === 'slug_taken') {
            const placed = { slug: 'Another issue already uses this address. Choose another.' };
            setApiErrors(placed);
            setFormError('The issue wasn’t saved: its address is taken.');
            reveal(placed);
          } else if (isApiError(err) && Object.keys(err.fields).length) {
            const { placed, other } = mapApiErrors(err.fields, sent);
            if (Object.keys(placed).length) setApiErrors(placed);
            setFormError(other[0] ?? 'The issue wasn’t saved. Fix what’s marked below, then save again.');
            reveal(placed);
          } else {
            setFormError(errorMessage(err, 'The issue wasn’t saved. Try again.'));
          }
        },
      },
    );
  };

  // ── Section operations (stable, so a section card redraws only when it changes) ──────────────
  const onSection = useCallback((key: string, fn: (s: SectionDraft) => SectionDraft) => setDraft((d) => updateSection(d, key, fn)), [setDraft]);
  const onRename = useCallback((key: string, id: string) => setDraft((d) => renameSection(d, key, id)), [setDraft]);
  const onMove = useCallback((key: string, dir: -1 | 1) => setDraft((d) => moveSection(d, key, dir)), [setDraft]);
  const onToggle = useCallback((key: string) => setOpen((o) => (o.has(key) ? new Set([...o].filter((k) => k !== key)) : new Set([...o, key]))), []);
  const onFocus = useCallback((path: string) => setFocusPath(path), []);
  const onRemove = useCallback(
    (key: string) => {
      const before = draftRef.current;
      const index = before.sections.findIndex((s) => s.key === key);
      const gone = before.sections[index];
      if (!gone) return;
      const lines = before.cover.lines.filter((l) => l.section === gone.id);
      setDraft((d) => removeSection(d, key));
      const neighbour = before.sections[index + 1] ?? before.sections[index - 1];
      setFocusPath(neighbour ? `toggle:${neighbour.key}` : 'add-section');
      push({
        tone: 'info',
        title: 'Section removed',
        body: `“${plainText(gone.title.trim() || gone.label.trim()) || 'Untitled section'}” comes out of the issue when you save.`,
        duration: 8000,
        action: {
          label: 'Undo',
          onClick: () =>
            setDraft((d) => {
              if (d.sections.some((s) => s.key === key)) return d;
              const sections = [...d.sections];
              sections.splice(Math.min(index, sections.length), 0, gone);
              return { ...d, sections, cover: { ...d.cover, lines: [...d.cover.lines, ...lines] } };
            }),
        },
      });
    },
    [setDraft, push],
  );
  const add = (kind: NewSection) => {
    const { draft: next, key } = addSection(draftRef.current, kind);
    setDraft(() => next);
    setOpen((o) => new Set([...o, key]));
    setFocusPath(fieldPath.section(key, 'title'));
  };

  const discard = () => {
    setDraftState(baseline);
    setApiErrors(NO_ERRORS);
    setShowErrors(false);
    setFormError(null);
    copy.clear();
    setDiscarding(false);
  };

  const restore = () => {
    const earlier = copy.restore();
    if (earlier) {
      setDraft(() => earlier);
      setOpen(new Set());
    }
  };

  const issueDate = draft.date;
  const form = (
    <form ref={formRef} className="nl-editor__form" onSubmit={(e) => e.preventDefault()} noValidate aria-label={`Issue ${no}`}>
      {copy.earlier ? (
        <div className="nl-ed-restore" role="status">
          <p className="nl-ed-restore__text">
            <ArrowCounterClockwise weight="bold" aria-hidden="true" />
            You have changes from {keptAt(copy.earlier.savedAt)} that weren’t saved.
          </p>
          <div className="nl-ed-restore__actions">
            <Button size="sm" variant="primary" onClick={restore} data-hub="editor-restore">
              Restore them
            </Button>
            <Button size="sm" variant="ghost" onClick={copy.discard}>
              Discard
            </Button>
          </div>
        </div>
      ) : null}

      <section className="nl-ed-group" aria-labelledby="nl-ed-details">
        <h2 id="nl-ed-details" className="nl-ed-group__title">
          Details
        </h2>
        <DetailsEditor draft={draft} errors={errors} published={published} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
      </section>

      <section className="nl-ed-group" aria-labelledby="nl-ed-cover">
        <h2 id="nl-ed-cover" className="nl-ed-group__title">
          Cover
        </h2>
        <CoverEditor draft={draft} errors={errors} onChange={(fn) => setDraft((d) => ({ ...d, cover: fn(d.cover) }))} onFocus={onFocus} />
      </section>

      <section className="nl-ed-group nl-ed-group--sections" aria-labelledby="nl-ed-sections">
        <div className="nl-ed-group__head">
          <h2 id="nl-ed-sections" className="nl-ed-group__title">
            Sections
          </h2>
          <p className="nl-ed-group__meta">{draft.sections.length ? plural(draft.sections.length, 'section', 'sections') : 'None yet'}</p>
        </div>
        {draft.sections.length ? (
          <ol className="nl-ed-sections">
            {draft.sections.map((s, i) => (
              <SectionCard
                key={s.key}
                section={s}
                index={i}
                count={draft.sections.length}
                issueDate={issueDate}
                published={published}
                errors={errors}
                open={open.has(s.key)}
                onToggle={onToggle}
                onChange={onSection}
                onRename={onRename}
                onMove={onMove}
                onRemove={onRemove}
                onFocus={onFocus}
              />
            ))}
          </ol>
        ) : (
          <p className="nl-ed-note">An issue is a list of sections: stories, and live lists of deadlines, forum threads or library files. Add the first one.</p>
        )}
        {errors.sections ? (
          <p className="nl-ed-error" tabIndex={-1}>
            {errors.sections}
          </p>
        ) : null}
        <Menu
          label="Add a section"
          trigger={
            <Button leadingIcon={Plus} id={controlId('add-section')} data-hub="editor-add-section">
              Add a section
            </Button>
          }
          items={ADD.map((a) => ({ id: a.kind, label: a.label, icon: a.icon, onSelect: () => add(a.kind) }))}
        />
      </section>

      <div className={cx('nl-ed-bar', (dirty || problems > 0 || formError) && 'is-active')} data-hub="editor-bar">
        <p className={cx('nl-ed-bar__status', (problems > 0 || formError) && 'is-alert')} role="status">
          {formError ? (
            <>
              <WarningCircle weight="fill" aria-hidden="true" />
              {formError}
            </>
          ) : problems ? (
            <>
              <WarningCircle weight="fill" aria-hidden="true" />
              {plural(problems, 'problem', 'problems')} to fix
            </>
          ) : dirty ? (
            'Unsaved changes'
          ) : (
            'Everything is saved'
          )}
        </p>
        <div className="nl-ed-bar__actions">
          {dirty ? (
            <Button variant="ghost" onClick={() => setDiscarding(true)}>
              Discard changes
            </Button>
          ) : null}
          <Button variant="primary" leadingIcon={FloppyDisk} onClick={() => save()} loading={update.isPending} disabled={!dirty} data-hub="issue-save-bar">
            Save
          </Button>
        </div>
      </div>
    </form>
  );

  return (
    <Page width="wide" className="nl-editor">
      <PageHeader
        title={`Edit issue ${no}`}
        description={published ? 'Published: what you save shows to readers straight away.' : 'A draft: only student reps see it until it’s published.'}
        meta={
          <>
            <Badge tone={published ? 'signal' : 'highlight'}>{published ? 'Published' : 'Draft'}</Badge>
            {dirty ? <Badge tone="outline">Unsaved changes</Badge> : null}
          </>
        }
        actions={
          <>
            {dirty ? (
              <Button leadingIcon={ArrowSquareOut} onClick={() => save('open')} loading={update.isPending} data-hub="issue-save-open">
                Save and open
              </Button>
            ) : (
              <Button leadingIcon={ArrowSquareOut} to={`/newsletter/${detail.slug}`} data-hub="issue-open">
                Open the issue
              </Button>
            )}
            <DeleteIssueButton
              issue={detail}
              onDeleted={() => {
                copy.clear();
                navigate('/newsletter', { replace: true });
              }}
            />
            {!published && !dirty ? <PublishButton issue={detail} /> : null}
            <Button variant={dirty ? 'primary' : 'secondary'} leadingIcon={FloppyDisk} onClick={() => save()} loading={update.isPending} disabled={!dirty} data-hub="issue-save">
              Save
            </Button>
          </>
        }
      />
      {sideBySide ? null : (
        <SegmentedControl
          label="Edit or preview"
          size="sm"
          className="nl-editor__panes"
          value={pane}
          onChange={(v) => setPane(v === 'preview' ? 'preview' : 'edit')}
          options={[
            { value: 'edit', label: 'Edit', icon: PencilSimple },
            { value: 'preview', label: 'Preview', icon: Eye },
          ]}
        />
      )}
      <div className="nl-editor__layout">
        {sideBySide || pane === 'edit' ? form : null}
        {sideBySide || pane === 'preview' ? (
          <div className="nl-editor__side">
            <Preview draft={draft} detail={detail} />
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={guard.pending !== null}
        title="Leave without saving?"
        body={<p>Your changes to issue {no} aren’t saved. This device keeps a copy, so you can restore them the next time you open the editor.</p>}
        confirmLabel="Leave without saving"
        tone="danger"
        onConfirm={guard.leave}
        onClose={guard.stay}
      />
      <ConfirmDialog
        open={discarding}
        title="Discard your changes?"
        body={<p>The form goes back to issue {no} as it was last saved. This can’t be undone.</p>}
        confirmLabel="Discard changes"
        tone="danger"
        onConfirm={discard}
        onClose={() => setDiscarding(false)}
      />
    </Page>
  );
}
