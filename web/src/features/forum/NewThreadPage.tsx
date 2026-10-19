import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CaretRight } from '@phosphor-icons/react';
import { errorMessage } from '../../api/errors';
import type { UserPublic } from '../../api/types';
import { badgeOf, useAuth } from '../../auth';
import { Page, PageHeader, QueryError, Skeleton, Switch, TextField, cx } from '../../ui';
import { useSingleFlight, useToast, useYear } from '../../state';
import { useModules } from '../../state/modules';
import { useAskedSenior, useCreateThread, useForumMeta } from './api';
import { composerPresets } from './lib/composerPresets';
import { usePlacementRules } from './lib/placement';
import { useTaxonomy } from './lib/taxonomy';
import { restoreDraft, type ThreadForm } from './lib/threadDraft';
import { BODY_MAX, TITLE_MAX, threadFieldErrors, titleProblem, type ThreadErrors } from './lib/threadForm';
import { useAccountKey } from './lib/useAccountKey';
import { useAttachImages } from './lib/useAttachImages';
import { useSimilar } from './lib/useSimilar';
import { useThreadDraft } from './lib/useThreadDraft';
import type { CategoryId } from './types';
import { AttachRow } from './components/AttachRow';
import { ComposerAside, SimilarInline } from './components/ComposerAside';
import { ComposerFooter } from './components/ComposerFooter';
import { MarkdownEditor } from './components/MarkdownEditor';
import { CantPostNote } from './components/ThreadNotices';
import { CategorySelect, ModuleFromTitle, ModuleSelect, TagPicker } from './components/ThreadFields';
import './components/forum.css';
import './components/dialogs.css';
import './ForumPage.css';
import './NewThreadPage.css';

/**
 * Start a thread: /forum/new. Presets in the URL (all optional, they can be combined):
 *   ?category=year-1       where to post it (a category's id, as GET /forum/meta lists them)
 *   ?module=mathematics    the module, by id (or by unit code: ?module=MT1186); a year category that disagrees with the
 *                          module's year follows the module
 *   ?title=...             the title
 *   ?body=...              the details (Markdown)
 *   ?senior=<user id>      a senior asked from Career Navigator (career.seniors): they are told when it is posted
 * An unfinished thread is kept as a draft on this device (lib/threadDraft.ts) until it is posted or discarded. An
 * account without the forum.post box gets a note in place of the composer.
 */
export default function NewThreadPage() {
  const { status, offer } = useAuth();
  const [params] = useSearchParams();
  // A new preset on the same route starts a fresh composer, and so does another person (lib/useAccountKey.ts).
  const presetKey = ['category', 'module', 'title', 'body', 'senior'].map((k) => params.get(k) || '').join('|');
  const accountKey = useAccountKey();
  const meta = useForumMeta();
  if (meta.isError) {
    return (
      <Page className="forum-page forum-new">
        <Crumbs />
        <PageHeader {...HEADER} />
        <QueryError
          error={meta.error}
          title="The forum’s categories didn’t load"
          onRetry={() => void meta.refetch()}
          retrying={meta.isFetching}
        />
      </Page>
    );
  }
  // Whose draft to restore depends on who is signed in, and where it goes on the categories: the composer waits for
  // both (usually already known).
  if (status === 'loading' || meta.isPending) return <ComposerPlaceholder />;
  const posting = offer('forum.post');
  if (posting === 'suspended' || posting === 'no') {
    return (
      <Page className="forum-page forum-new">
        <Crumbs />
        <PageHeader {...HEADER} />
        <CantPostNote suspended={posting === 'suspended'} />
      </Page>
    );
  }
  return <Composer key={`${presetKey}#${accountKey}`} />;
}

function Crumbs() {
  return (
    <nav className="forum-crumbs" aria-label="Breadcrumb">
      <Link to="/forum">Forum</Link>
      <CaretRight aria-hidden="true" weight="bold" />
      <span aria-current="page">Start a thread</span>
    </nav>
  );
}

const HEADER = {
  title: 'Start a thread',
  description: 'Ask your cohort a question, or share something that helped you.',
};

function ComposerPlaceholder() {
  return (
    <Page className="forum-page forum-new" aria-busy="true">
      <Crumbs />
      <PageHeader {...HEADER} />
      <div className="forum-new__layout">
        <div className="forum-composer">
          <Skeleton width="30%" height="1em" />
          <Skeleton height="48px" radius="var(--r-control)" />
          <Skeleton lines={5} />
        </div>
      </div>
    </Page>
  );
}

function Composer() {
  const { me, status: authStatus, requireAuth, featureOn } = useAuth();
  const { year } = useYear();
  const { push } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { getModule, getModuleByUnitCode } = useModules();
  const { getCategory, categoryForYear, defaultCategory: everyYear, tags: knownTags, maxTags } = useTaxonomy();
  const rules = usePlacementRules();
  const create = useCreateThread();
  const post = useSingleFlight(create);
  const viewer = me?.id ?? null;
  const ownYear = me?.year ?? year;
  // The categories have loaded (NewThreadPage waits for them).
  const fallback: CategoryId = everyYear ?? '';
  const defaultCategory = (): CategoryId => categoryForYear(ownYear) ?? fallback;
  /** A category new threads may go to: retired ones aren't offered. */
  const offered = (id: string) => {
    const c = getCategory(id);
    return c && !c.retired ? c : null;
  };

  // What the link asks for (?category, ?module, ?title): it wins over a stored draft.
  const [presets] = useState<ThreadForm | null>(() =>
    composerPresets(
      params,
      { getModule, getModuleByUnitCode, getCategory: offered, categoryForYear, defaultCategory: fallback },
      ownYear,
    ),
  );
  const { form, setForm, restored, startOver, finish } = useThreadDraft({
    viewer,
    presets,
    restore: (raw, who) =>
      restoreDraft(raw, who, {
        knownModule: (id) => !!getModule(id),
        offeredCategory: (id) => !!offered(id),
        fallbackCategory: defaultCategory(),
        maxTags,
      }),
    empty: () => ({ title: '', body: '', moduleId: '', category: defaultCategory(), tags: [] }),
  });
  const [errors, setErrors] = useState<ThreadErrors>({});
  const [anonymous, setAnonymous] = useState(false);
  const mayGoUnnamed = featureOn('forum.anonymous');
  const senior = useAskedSenior(params.get('senior'));
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Tags the server doesn't know (a stored draft can hold any) are dropped once the list has loaded.
  useEffect(() => {
    if (!knownTags.length) return;
    setForm((f) => {
      const tags = f.tags.filter((t) => knownTags.some((k) => k.id === t)).slice(0, maxTags);
      return tags.length === f.tags.length ? f : { ...f, tags };
    });
  }, [knownTags, maxTags, setForm]);

  const set = (patch: Partial<ThreadForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    const touched = Object.keys(patch) as (keyof ThreadErrors)[];
    if (touched.some((k) => errors[k]))
      setErrors((e) => ({ ...e, ...Object.fromEntries(touched.map((k) => [k, undefined])) }));
  };

  const images = useAttachImages({
    text: form.body,
    setText: (update) => setForm((f) => ({ ...f, body: update(f.body) })),
    textareaRef: bodyRef,
    gate: () => requireAuth('Sign in to attach images'),
  });

  const similar = useSimilar(form.title);

  const send = () => {
    const title = form.title.trim();
    const next: ThreadErrors = {};
    const problem = titleProblem(title);
    if (problem) next.title = problem;
    if (!offered(form.category)) next.category = 'Choose where to post this thread.';
    if (Object.values(next).some(Boolean)) {
      setErrors(next);
      if (next.title) titleRef.current?.focus();
      return;
    }
    if (images.busy) {
      push({ title: 'Your image is still uploading', body: 'Post the thread once it has finished.', tone: 'info' });
      return;
    }
    if (!requireAuth('Sign in to post your thread', () => sendRef.current())) return;
    post(
      {
        title,
        body: form.body.trim(),
        category: form.category,
        moduleId: form.moduleId || null,
        tags: form.tags,
        anonymous: mayGoUnnamed && anonymous,
        seniorId: senior?.user.id ?? null,
      },
      {
        onSuccess: (thread) => {
          finish();
          images.reset();
          // Straight to the new thread: to check it, share its link or follow it (UX-75).
          navigate(`/forum/${thread.slug}`);
          push({ title: 'Thread posted', body: 'Your cohort can see it now.', tone: 'success' });
        },
        onError: (e) => {
          // A field the API turned down ("Pick a module from the list.", too many tags…) says so under that field.
          const fields = threadFieldErrors(e);
          if (fields) {
            setErrors(fields);
            if (fields.title) titleRef.current?.focus();
            return;
          }
          // Anything else (too many threads in an hour, the server down): the API's words, and the draft is kept.
          push({
            title: "Your thread wasn't posted",
            body: errorMessage(e, 'Try again in a moment. Your draft is saved.'),
            tone: 'alert',
          });
        },
      },
    );
  };
  // After signing in, post the thread as it is now.
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    send();
  };

  const discard = () => {
    finish();
    images.reset();
    navigate('/forum');
  };

  const author: UserPublic | null =
    me && !me.needsProfile ? { id: me.id, displayName: me.displayName ?? '', year: me.year, badge: badgeOf(me) } : null;

  return (
    <Page className="forum-page forum-new">
      <Crumbs />
      <PageHeader {...HEADER} />

      <div className="forum-new__layout">
        <form className="forum-composer" data-hub="composer" onSubmit={submit} noValidate>
          {restored ? (
            <div className="forum-composer__restored" role="status">
              <span>We kept the draft you started earlier.</span>
              <button
                type="button"
                className="forum-composer__link"
                onClick={() => {
                  startOver();
                  setErrors({});
                  images.reset();
                }}
              >
                Start over
              </button>
            </div>
          ) : null}

          <TextField
            ref={titleRef}
            label="Title"
            size="lg"
            required
            value={form.title}
            maxLength={TITLE_MAX}
            placeholder="What’s your question?"
            hint="One clear question. Mention the module code if there is one."
            error={errors.title}
            autoFocus
            dir="auto"
            onChange={(e) => set({ title: e.target.value })}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
            }}
            trailing={
              <span
                className={cx('forum-composer__count', form.title.length > TITLE_MAX - 15 && 'is-near')}
                aria-hidden="true"
              >
                {form.title.length}/{TITLE_MAX}
              </span>
            }
            data-hub="composer-title"
          />

          <SimilarInline similar={similar} />

          <div className="forum-composer__row">
            <CategorySelect
              value={form.category}
              error={errors.category}
              onChange={(id) => setForm((f) => ({ ...f, ...rules.withCategory(f, id) }))}
            />
            <ModuleSelect
              value={form.moduleId}
              category={form.category}
              error={errors.moduleId}
              onChange={(id) => {
                setForm((f) => ({ ...f, ...rules.withModule(f, id) }));
                if (errors.moduleId) setErrors((e) => ({ ...e, moduleId: undefined }));
              }}
            />
          </div>

          <ModuleFromTitle
            title={form.title}
            moduleId={form.moduleId}
            onPick={(id) => setForm((f) => ({ ...f, ...rules.withModule(f, id) }))}
          />

          <TagPicker value={form.tags} error={errors.tags} onChange={(tags) => set({ tags })} />

          <input {...images.fileInput} />
          <MarkdownEditor
            label="Details"
            hint="Optional, but threads with details get better answers."
            value={form.body}
            error={errors.body}
            onChange={(v) => set({ body: v })}
            placeholder="What have you tried so far? Where exactly do you get stuck?"
            rows={9}
            onSubmit={submit}
            textareaRef={bodyRef}
            onImageFiles={images.addFiles}
            textareaProps={{ 'data-hub': 'composer-body', dir: 'auto', maxLength: BODY_MAX }}
          />

          <AttachRow images={images} />

          {senior ? (
            <p className="forum-composer__senior" role="status" data-hub="composer-senior">
              Asking {senior.user.displayName}. They’ll be told when you post, and anyone can still answer.
            </p>
          ) : null}
          {mayGoUnnamed ? (
            <Switch
              label="Post without my name"
              description={`Classmates see “${ownYear ? `A Year ${ownYear} student` : 'A student'}”. The student reps can still see it’s you, and reports work as usual.`}
              checked={anonymous}
              onChange={setAnonymous}
              data-hub="composer-anonymous"
            />
          ) : null}

          <ComposerFooter
            author={author}
            checking={authStatus === 'loading'}
            posting={create.isPending}
            onDiscard={discard}
          />
        </form>

        <ComposerAside similar={similar} module={getModule(form.moduleId)} />
      </div>
    </Page>
  );
}
