// /newsletter/:slug/edit — moderators edit an issue: its details as fields, its cover and sections as JSON
// (the block format the reader renders), with a live preview. Saving sends PATCH /newsletter/issues/{id}.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowSquareOut, Eye, FloppyDisk, MagicWand, PencilSimple, WarningCircle } from '@phosphor-icons/react';
import type { IssueDetail } from '../../api/types';
import { errorMessage, isApiError } from '../../api/errors';
import { useAuth } from '../../auth';
import { BREAKPOINTS, useDocumentTitle, useMediaQuery, useToast } from '../../state';
import { Badge, Button, EmptyState, Page, PageHeader, Panel, SegmentedControl, Skeleton, TextArea, TextField, cx } from '../../ui';
import { useIssueDetail, useUpdateIssue } from './api';
import { DeleteIssueButton, PublishButton } from './components/IssueActions';
import { IssueCover } from './components/IssueCover';
import { IssueSection } from './components/IssueSection';
import { markupLinkProblems, readCover, readSections, strayCoverLines } from './lib/schema';
import { issueNo, listNames, readMinutes } from './lib/text';
import type { Problem } from './types';
import './IssuePage.css';
import './IssueEditorPage.css';

interface Draft {
  title: string;
  number: string;
  date: string;
  slug: string;
  dek: string;
  summary: string;
  editors: string;
  cover: string;
  sections: string;
}

const pretty = (v: unknown): string => JSON.stringify(v, null, 2);

const fromDetail = (d: IssueDetail): Draft => ({
  title: d.title,
  number: String(d.number),
  date: d.date,
  slug: d.slug,
  dek: d.dek,
  summary: d.summary,
  editors: d.editors.join(', '),
  cover: pretty(d.cover ?? {}),
  sections: pretty(d.sections ?? []),
});

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const STARTER = [
  {
    id: 'editors-note',
    label: 'Editor’s note',
    icon: 'NotePencil',
    title: 'A headline for the first story',
    blocks: [
      { type: 'p', lead: true, text: 'The opening paragraph, set larger. Use **bold**, *italic*, ==a highlight== and [links](/calendar).' },
      { type: 'p', text: 'Another paragraph.' },
      { type: 'signoff', text: 'The editors' },
    ],
  },
  {
    id: 'deadlines',
    label: 'Deadlines and dates',
    icon: 'CalendarCheck',
    kind: 'deadlines',
    title: 'What’s coming up',
    window: { from: '2026-10-01', to: '2026-11-30' },
    blocks: [{ type: 'p', text: 'The exams between these dates come from the calendar by themselves.' }],
  },
];

/** JSON.parse with a message that says where the mistake is. */
function parseJson(text: string): { value: unknown; error: string | null } {
  try {
    return { value: JSON.parse(text), error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'This isn’t valid JSON.';
    const at = /position (\d+)/.exec(message);
    if (at) {
      const pos = Number(at[1]);
      const before = text.slice(0, pos);
      const line = before.split('\n').length;
      const col = pos - before.lastIndexOf('\n');
      return { value: undefined, error: `This isn’t valid JSON: check line ${line}, column ${col} (a missing comma or quote is the usual cause).` };
    }
    return { value: undefined, error: 'This isn’t valid JSON: a missing comma or quote is the usual cause.' };
  }
}

function Problems({ problems, max = 8 }: { problems: Problem[]; max?: number }) {
  if (!problems.length) return null;
  const shown = problems.slice(0, max);
  return (
    <ul role="list" className="nl-editor__problems">
      {shown.map((p, i) => (
        <li key={`${i}-${p.path}`} className={cx('nl-editor__problem', p.warning && 'is-warning')}>
          <code>{p.path}</code> {p.message}
        </li>
      ))}
      {problems.length > shown.length ? <li className="nl-editor__problem is-more">And {problems.length - shown.length} more.</li> : null}
    </ul>
  );
}

function BlockReference() {
  return (
    <details className="nl-editor__help">
      <summary>How an issue is written</summary>
      <div className="nl-editor__help-body">
        <p>
          <b>Sections</b> are a list: <code>{'{ "id", "label", "icon", "title", "blocks": [ … ] }'}</code>. The <code>id</code> is the link to the section
          (<code>?section=id</code>) and keeps its reactions: don’t change it once the issue is out.
        </p>
        <p>
          <b>Blocks:</b> <code>p</code> (<code>text</code>, <code>lead</code>), <code>list</code> (<code>items</code>), <code>steps</code> (<code>items</code> of{' '}
          <code>title</code>/<code>text</code>), <code>qa</code> (<code>items</code> of <code>q</code>/<code>a</code>), <code>signoff</code>, <code>cta</code> (<code>to</code>,{' '}
          <code>label</code>), <code>figure</code> (<code>src</code>, <code>width</code>, <code>height</code>, <code>alt</code>, <code>caption</code>).
        </p>
        <p>
          <b>Beside the copy:</b> <code>figure</code>, or <code>aside</code> of type <code>note</code>, <code>stats</code>, <code>quote</code> or <code>card</code> (
          <code>wide: true</code> for a wider column).
        </p>
        <p>
          <b>Live sections</b> (<code>kind</code>): <code>deadlines</code> lists the exams between <code>window.from</code> and <code>window.to</code>; <code>forum</code> and{' '}
          <code>library</code> list the hottest threads and the newest files, with a <code>fallback</code> (<code>title</code>, <code>text</code>) when there are none.
        </p>
        <p>
          <b>In text:</b> <code>**bold**</code>, <code>*italic*</code>, <code>==highlight==</code>, <code>[label](/calendar)</code> or <code>[label](https://…)</code>. Links go to a
          page of the Hub, an <code>https://</code> address or a <code>mailto:</code> link; <code>http://</code> links aren’t accepted. Pictures are files of the app (
          <code>demo/news/photo.jpg</code>) or images already shared in the forum (<code>/api/v1/media/…</code>).
        </p>
        <p>
          <b>Cover:</b> <code>{'{ "tone": "navy" | "paper", "art": null, "lines": [ { "section", "text" } ] }'}</code>, five lines at most (three with a picture).
        </p>
        <p>
          <b>Limits:</b> 40 sections and 256 KB per issue. Section ids are at most 64 characters.
        </p>
      </div>
    </details>
  );
}

function Editor({ detail }: { detail: IssueDetail }) {
  const navigate = useNavigate();
  const { push } = useToast();
  const update = useUpdateIssue();
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  const [pane, setPane] = useState<'edit' | 'preview'>('edit');
  const baseline = useMemo(() => fromDetail(detail), [detail]);
  const [draft, setDraft] = useState<Draft>(baseline);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const no = issueNo(detail.number);
  useDocumentTitle(`Edit issue ${no}`);

  const dirty = (Object.keys(draft) as (keyof Draft)[]).some((k) => draft[k] !== baseline[k]);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // What was just saved becomes the new starting point. A version that arrives while you are typing (read
  // again in the background) doesn't overwrite your changes: they now count against it.
  const lastSeen = useRef(detail);
  const justSaved = useRef(false);
  useEffect(() => {
    if (lastSeen.current === detail) return;
    lastSeen.current = detail;
    if (justSaved.current || !dirtyRef.current) setDraft(fromDetail(detail));
    justSaved.current = false;
  }, [detail]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const sectionsJson = useMemo(() => parseJson(draft.sections), [draft.sections]);
  const coverJson = useMemo(() => parseJson(draft.cover), [draft.cover]);
  const sectionsRead = useMemo(() => (sectionsJson.error ? null : readSections(sectionsJson.value)), [sectionsJson]);
  const coverRead = useMemo(() => (coverJson.error ? null : readCover(coverJson.value)), [coverJson]);
  const coverProblems = useMemo(
    () => (coverRead ? [...coverRead.problems, ...(sectionsRead ? strayCoverLines(coverRead.cover, sectionsRead.sections) : [])] : []),
    [coverRead, sectionsRead],
  );
  const sectionProblems = sectionsRead?.problems ?? [];
  const blocking = !!sectionsJson.error || !!coverJson.error || sectionProblems.some((p) => !p.warning) || coverProblems.some((p) => !p.warning);
  const editors = draft.editors
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((f) => ({ ...f, [key]: undefined }));
  };

  const save = (e?: FormEvent) => {
    e?.preventDefault();
    const found: Partial<Record<keyof Draft, string>> = {};
    const n = Number(draft.number);
    if (!draft.title.trim()) found.title = 'Give the issue a title.';
    if (!Number.isInteger(n) || n < 0) found.number = 'Use a whole number, like 2.';
    if (!DAY_RE.test(draft.date)) found.date = 'Choose the date it comes out.';
    if (!SLUG_RE.test(draft.slug)) found.slug = 'Use lowercase letters, numbers and hyphens, like launch-edition.';
    for (const key of ['dek', 'summary'] as const) {
      const bad = markupLinkProblems(draft[key])[0];
      if (bad) found[key] = `The link “${bad.href}” ${bad.problem}`;
    }
    setFieldErrors(found);
    setSaveError(null);
    if (Object.keys(found).length) return;
    if (blocking) {
      setSaveError('Fix the problems marked in the cover and sections first.');
      return;
    }
    update.mutate(
      {
        id: detail.id,
        slug: detail.slug,
        patch: {
          title: draft.title.trim(),
          number: n,
          date: draft.date,
          slug: draft.slug,
          dek: draft.dek.trim(),
          summary: draft.summary.trim(),
          editors,
          cover: coverJson.value as Record<string, unknown>,
          sections: sectionsJson.value as Record<string, unknown>[],
        },
      },
      {
        onSuccess: (saved) => {
          justSaved.current = true;
          push({ tone: 'success', title: 'Saved', body: saved.status === 'published' ? 'Readers see the new version now.' : 'The draft is up to date.' });
          if (saved.slug !== detail.slug) navigate(`/newsletter/${saved.slug}/edit`, { replace: true });
        },
        onError: (err) => {
          if (isApiError(err) && err.code === 'slug_taken') setFieldErrors({ slug: 'Another issue already uses this address. Choose another.' });
          else if (isApiError(err) && Object.keys(err.fields).length) {
            const mapped: Partial<Record<keyof Draft, string>> = {};
            for (const [k, msg] of Object.entries(err.fields)) {
              const key = (Object.keys(draft) as (keyof Draft)[]).find((f) => k === f || k.startsWith(`${f}.`) || k.startsWith(`${f}[`));
              if (key) mapped[key] = msg;
            }
            setFieldErrors(mapped);
            if (!Object.keys(mapped).length) setSaveError(err.message);
          } else setSaveError(errorMessage(err, 'The issue wasn’t saved. Try again.'));
        },
      },
    );
  };

  const formatJson = (key: 'cover' | 'sections') => {
    const parsed = key === 'cover' ? coverJson : sectionsJson;
    if (!parsed.error) set(key, pretty(parsed.value));
  };

  const preview = sectionsRead && coverRead ? (
    <div className="nl-editor__preview" aria-label="Preview">
      <div className="nl-editor__preview-hero">
        <div className="nl-editor__preview-cover">
          <IssueCover issue={{ number: Number(draft.number) || 0, title: draft.title || 'Untitled', date: DAY_RE.test(draft.date) ? draft.date : '', cover: coverRead.cover, sections: sectionsRead.sections }} />
        </div>
        <div>
          <p className="nl-editor__preview-kicker">
            Issue {issueNo(Number(draft.number) || 0)}, {readMinutes({ title: draft.title, dek: draft.dek, sections: sectionsRead.sections })} min read
          </p>
          <p className="nl-issue__title nl-editor__preview-title">{draft.title || 'Untitled'}</p>
          {draft.dek ? <p className="nl-issue__dek">{draft.dek}</p> : null}
          {editors.length ? <p className="nl-editor__preview-by">By {listNames(editors)}</p> : null}
        </div>
      </div>
      <div className="nl-article nl-editor__preview-article">
        {sectionsRead.sections.length ? (
          sectionsRead.sections.map((s) => <IssueSection key={s.id} issue={{ id: detail.id, slug: detail.slug, date: DAY_RE.test(draft.date) ? draft.date : detail.date, editors, reactions: detail.reactions }} section={s} readOnly />)
        ) : (
          <p className="nl-editor__preview-empty">The sections show here as you write them.</p>
        )}
      </div>
    </div>
  ) : (
    <Panel padding="none">
      <EmptyState size="sm" icon={WarningCircle} title="The preview is waiting for valid JSON" body="Fix the mistake marked in the cover or the sections." />
    </Panel>
  );

  const form = (
    <form className="nl-editor__form" onSubmit={save} noValidate>
      <div className="nl-editor__grid">
        <TextField label="Title" required value={draft.title} onChange={(e) => set('title', e.target.value)} error={fieldErrors.title} className="nl-editor__wide" />
        <TextField label="Issue number" required inputMode="numeric" value={draft.number} onChange={(e) => set('number', e.target.value)} error={fieldErrors.number} />
        <TextField label="Date" type="date" required value={draft.date} onChange={(e) => set('date', e.target.value)} error={fieldErrors.date} />
        <TextField
          label="Address"
          required
          value={draft.slug}
          onChange={(e) => set('slug', e.target.value.toLowerCase())}
          error={fieldErrors.slug}
          hint={detail.status === 'published' ? 'Changing it breaks links people have shared.' : `/newsletter/${draft.slug || '…'}`}
          className="nl-editor__wide"
        />
        <TextArea label="Standfirst" rows={2} value={draft.dek} onChange={(e) => set('dek', e.target.value)} error={fieldErrors.dek} hint="One sentence under the title." className="nl-editor__wide" />
        <TextArea label="Summary" rows={3} value={draft.summary} onChange={(e) => set('summary', e.target.value)} error={fieldErrors.summary} hint="Shown on the newsletter page and on Home." className="nl-editor__wide" />
        <TextField label="Editors" value={draft.editors} onChange={(e) => set('editors', e.target.value)} error={fieldErrors.editors} hint="Names, separated by commas." className="nl-editor__wide" />
      </div>

      <div className="nl-editor__code">
        <TextArea
          label="Cover (JSON)"
          rows={8}
          spellCheck={false}
          autoComplete="off"
          value={draft.cover}
          onChange={(e) => set('cover', e.target.value)}
          error={coverJson.error ?? fieldErrors.cover}
          data-hub="issue-cover-json"
        />
        <Problems problems={coverProblems} />
        <div className="nl-editor__code-actions">
          <Button size="sm" variant="ghost" leadingIcon={MagicWand} onClick={() => formatJson('cover')} disabled={!!coverJson.error}>
            Tidy the JSON
          </Button>
        </div>
      </div>

      <div className="nl-editor__code">
        <TextArea
          label="Sections (JSON)"
          rows={isMobile ? 18 : 28}
          spellCheck={false}
          autoComplete="off"
          value={draft.sections}
          onChange={(e) => set('sections', e.target.value)}
          error={sectionsJson.error ?? fieldErrors.sections}
          data-hub="issue-sections-json"
        />
        <Problems problems={sectionProblems} />
        <div className="nl-editor__code-actions">
          <Button size="sm" variant="ghost" leadingIcon={MagicWand} onClick={() => formatJson('sections')} disabled={!!sectionsJson.error}>
            Tidy the JSON
          </Button>
          {sectionsRead && !sectionsRead.sections.length ? (
            <Button size="sm" onClick={() => set('sections', pretty(STARTER))}>
              Start from a template
            </Button>
          ) : null}
        </div>
        <BlockReference />
      </div>

      {saveError ? (
        <p className="nl-editor__error" role="alert">
          {saveError}
        </p>
      ) : null}
    </form>
  );

  return (
    <Page width="wide" className="nl-editor">
      <PageHeader
        title={`Edit issue ${no}`}
        description={detail.status === 'draft' ? 'A draft: only student reps see it until it’s published.' : 'Published: what you save shows to readers straight away.'}
        meta={
          <>
            <Badge tone={detail.status === 'draft' ? 'highlight' : 'signal'}>{detail.status === 'draft' ? 'Draft' : 'Published'}</Badge>
            {dirty ? <Badge tone="outline">Unsaved changes</Badge> : null}
          </>
        }
        actions={
          <>
            <Button leadingIcon={ArrowSquareOut} to={`/newsletter/${detail.slug}`}>
              Open the issue
            </Button>
            <DeleteIssueButton issue={detail} onDeleted={() => navigate('/newsletter', { replace: true })} />
            {detail.status === 'draft' && !dirty ? <PublishButton issue={detail} /> : null}
            <Button variant={detail.status === 'draft' && !dirty ? 'secondary' : 'primary'} leadingIcon={FloppyDisk} onClick={() => save()} loading={update.isPending} disabled={!dirty} data-hub="issue-save">
              Save
            </Button>
          </>
        }
      />
      {isMobile ? (
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
      ) : null}
      <div className="nl-editor__layout">
        {!isMobile || pane === 'edit' ? form : null}
        {!isMobile || pane === 'preview' ? <div className="nl-editor__side">{preview}</div> : null}
      </div>
    </Page>
  );
}

function EditorSkeleton() {
  return (
    <Page width="wide" className="nl-editor" aria-busy="true">
      <span className="visually-hidden">Loading the issue</span>
      <div aria-hidden="true">
        <Skeleton width={280} height={40} />
        <Skeleton width="50%" height={18} style={{ marginTop: 12 }} />
        <div className="nl-editor__layout" style={{ marginTop: 32 }}>
          <Skeleton height={520} radius={16} />
          <Skeleton height={520} radius={16} />
        </div>
      </div>
    </Page>
  );
}

export default function IssueEditorPage() {
  const { slug } = useParams();
  const { status, isModerator, openSignIn } = useAuth();
  const q = useIssueDetail(isModerator ? slug : undefined);
  useDocumentTitle('Edit issue');

  if (status === 'loading') return <EditorSkeleton />;
  if (!isModerator) {
    return (
      <Page>
        <h1 className="visually-hidden">Edit issue</h1>
        <Panel padding="none">
          <EmptyState
            icon={PencilSimple}
            title="Only student reps can edit the newsletter"
            body={status === 'guest' ? 'If you’re a student rep, sign in first.' : 'You can read every published issue on the newsletter page.'}
            action={
              status === 'guest' ? (
                <Button variant="primary" onClick={() => openSignIn({ reason: 'Sign in to edit the newsletter' })}>
                  Sign in
                </Button>
              ) : (
                <Button to="/newsletter">Go to the newsletter</Button>
              )
            }
          />
        </Panel>
      </Page>
    );
  }
  if (q.isPending) return <EditorSkeleton />;
  if (q.isError) {
    const missing = isApiError(q.error) && q.error.status === 404;
    return (
      <Page>
        <h1 className="visually-hidden">Edit issue</h1>
        <Panel padding="none">
          <EmptyState
            icon={WarningCircle}
            title={missing ? 'We couldn’t find that issue' : 'The issue didn’t load'}
            body={missing ? 'It may have been deleted, or its address changed.' : 'Check your connection, then try again.'}
            action={
              missing ? (
                <Button to="/newsletter">See all issues</Button>
              ) : (
                <Button onClick={() => void q.refetch()} loading={q.isFetching}>
                  Try again
                </Button>
              )
            }
          />
        </Panel>
      </Page>
    );
  }
  return <Editor key={q.data.id} detail={q.data} />;
}
