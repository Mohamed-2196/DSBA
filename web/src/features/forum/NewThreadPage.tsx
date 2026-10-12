import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CaretRight, ImageSquare, PaperPlaneRight } from '@phosphor-icons/react';
import { ApiError, errorMessage } from '../../api/errors';
import type { UserPublic } from '../../api/types';
import { useAuth } from '../../auth';
import { Button, Kbd, Page, PageHeader, Skeleton, TextField, cx, modKeyLabel } from '../../ui';
import { useDebouncedValue, useToast, useYear } from '../../state';
import { useModules } from '../../state/modules';
import { useCreateThread, useSimilarThreads } from './api';
import { usePlacementRules } from './lib/placement';
import { rankSimilar } from './lib/search';
import { categoryForYear, isCategoryId, useTaxonomy } from './lib/taxonomy';
import { TITLE_MAX, restoreDraft, type ThreadForm } from './lib/threadDraft';
import { MAX_IMAGE_MB } from './lib/uploads';
import { useAccountKey } from './lib/useAccountKey';
import { useAttachImages } from './lib/useAttachImages';
import { useThreadDraft } from './lib/useThreadDraft';
import type { CategoryId } from './types';
import { AuthorAvatar } from './components/AuthorAvatar';
import { ComposerAside, SimilarInline, type SimilarState } from './components/ComposerAside';
import { AttachmentList } from './components/ImageAttachments';
import { MarkdownEditor } from './components/MarkdownEditor';
import { AuthorFlair } from './components/ThreadBits';
import { CategorySelect, ModuleSelect, TagPicker } from './components/ThreadFields';
import './components/forum.css';
import './components/dialogs.css';
import './ForumPage.css';
import './NewThreadPage.css';

/**
 * Start a thread: /forum/new. Presets in the URL (all optional, they can be combined):
 *   ?category=year-1       where to post it (a category id: year-1, year-2, year-3, study-groups, general)
 *   ?module=mathematics    the module, by id (or by unit code: ?module=MT1186); a year category that disagrees with the
 *                          module's year follows the module
 *   ?title=...             the title
 * An unfinished thread is kept as a draft on this device (lib/threadDraft.ts) until it is posted or discarded.
 */
export default function NewThreadPage() {
  const { status } = useAuth();
  const [params] = useSearchParams();
  // A new preset on the same route starts a fresh composer, and so does another person (lib/useAccountKey.ts).
  const presetKey = ['category', 'module', 'title'].map((k) => params.get(k) || '').join('|');
  const accountKey = useAccountKey();
  // Whose draft to restore depends on who is signed in, so the composer waits for that (usually already known).
  if (status === 'loading') return <ComposerPlaceholder />;
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

const HEADER = { title: 'Start a thread', description: 'Ask your cohort a question, or share something that helped you.' };

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

const TITLE_MIN = 8;
const BODY_MAX = 20_000;

type Errors = Partial<Record<'title' | 'body' | 'category' | 'moduleId' | 'tags', string>>;

function Composer() {
  const { me, status: authStatus, requireAuth } = useAuth();
  const { year } = useYear();
  const { push } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { getModule, getModuleByUnitCode } = useModules();
  const { getCategory, tags: knownTags, maxTags } = useTaxonomy();
  const rules = usePlacementRules();
  const create = useCreateThread();
  const viewer = me?.id ?? null;
  const defaultCategory = (): CategoryId => categoryForYear(me?.year ?? year) ?? 'general';

  const [presets] = useState<ThreadForm | null>(() => {
    const presetModule = params.get('module');
    const mod = presetModule ? (getModule(presetModule) ?? getModuleByUnitCode(presetModule.toUpperCase())) : null;
    const presetCategory = params.get('category');
    const cat = isCategoryId(presetCategory) ? getCategory(presetCategory) : null;
    const presetTitle = params.get('title') ?? '';
    if (!cat && !mod && !presetTitle) return null;
    // The category you asked for, unless it is a year that disagrees with the module (the module is the more specific
    // choice, so the category follows its year). Without one: the module's year, then your year.
    const category: CategoryId = cat && !(cat.year && mod && cat.year !== mod.year) ? cat.id : (categoryForYear(mod?.year ?? me?.year ?? year) ?? 'general');
    return { title: presetTitle.slice(0, TITLE_MAX), body: '', category, moduleId: mod?.id ?? '', tags: [] };
  });
  const { form, setForm, restored, startOver, finish } = useThreadDraft({
    viewer,
    presets,
    restore: (raw, who) => restoreDraft(raw, who, { knownModule: (id) => !!getModule(id), fallbackCategory: defaultCategory(), maxTags }),
    empty: () => ({ title: '', body: '', moduleId: '', category: defaultCategory(), tags: [] }),
  });
  const [errors, setErrors] = useState<Errors>({});
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const attachRef = useRef<HTMLElement>(null);

  // Tags the server doesn't know (an old draft) are dropped once the list has loaded.
  useEffect(() => {
    if (!knownTags.length) return;
    setForm((f) => {
      const tags = f.tags.filter((t) => knownTags.some((k) => k.id === t)).slice(0, maxTags);
      return tags.length === f.tags.length ? f : { ...f, tags };
    });
  }, [knownTags, maxTags, setForm]);

  const set = (patch: Partial<ThreadForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    const touched = Object.keys(patch) as (keyof Errors)[];
    if (touched.some((k) => errors[k])) setErrors((e) => ({ ...e, ...Object.fromEntries(touched.map((k) => [k, undefined])) }));
  };

  const images = useAttachImages({
    text: form.body,
    setText: (update) => setForm((f) => ({ ...f, body: update(f.body) })),
    textareaRef: bodyRef,
    gate: () => requireAuth('Sign in to attach images'),
  });

  const mod = getModule(form.moduleId);
  const debouncedTitle = useDebouncedValue(form.title, 350);
  const longEnough = debouncedTitle.trim().length >= 6;
  const similarQuery = useSimilarThreads(longEnough ? debouncedTitle : '');
  const similarThreads = useMemo(() => (longEnough ? rankSimilar(similarQuery.data ?? [], debouncedTitle) : []), [longEnough, similarQuery.data, debouncedTitle]);
  const similar: SimilarState = { threads: similarThreads, searching: longEnough, loading: similarQuery.isFetching };

  const send = () => {
    const title = form.title.trim();
    const next: Errors = {};
    if (title.length < TITLE_MIN) {
      next.title = title
        ? `Make the title a little longer (at least ${TITLE_MIN} characters) so classmates know what you're asking.`
        : 'Add a title so classmates know what you’re asking.';
    }
    if (!getCategory(form.category)) next.category = 'Choose where to post this thread.';
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
    create.mutate(
      { title, body: form.body.trim(), category: form.category, moduleId: form.moduleId || null, tags: form.tags },
      {
        onSuccess: (thread) => {
          finish();
          images.reset();
          navigate('/forum', { state: { posted: { id: thread.id, slug: thread.slug } } });
          push({
            title: 'Thread posted',
            body: 'Your cohort can see it now.',
            tone: 'success',
            action: { label: 'View thread', onClick: () => navigate(`/forum/${thread.slug}`) },
          });
        },
        onError: (e) => {
          // A field the API turned down (an unknown module, too many tags…) says so under that field.
          const f = e instanceof ApiError ? e.fields : {};
          if (f.title || f.body || f.category || f.moduleId || f.tags) {
            setErrors({ title: f.title, body: f.body, category: f.category, moduleId: f.moduleId, tags: f.tags });
            if (f.title) titleRef.current?.focus();
            return;
          }
          // Anything else (too many threads in an hour, the server down): the API's words, and the draft is kept.
          push({ title: "Your thread wasn't posted", body: errorMessage(e, 'Try again in a moment. Your draft is saved.'), tone: 'alert' });
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

  const suspended = me?.status === 'suspended';
  const author: UserPublic | null = me && !me.needsProfile ? { id: me.id, displayName: me.displayName ?? '', year: me.year, role: me.role } : null;

  return (
    <Page className="forum-page forum-new">
      <Crumbs />
      <PageHeader {...HEADER} />

      <div className="forum-new__layout">
        <form className="forum-composer" data-hub="composer" onSubmit={submit} noValidate>
          {suspended ? (
            <p className="forum-form-error" role="alert">
              Your account is suspended, so you can’t post. Contact a student rep if you think this is a mistake.
            </p>
          ) : null}
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
              <span className={cx('forum-composer__count', form.title.length > TITLE_MAX - 15 && 'is-near')} aria-hidden="true">
                {form.title.length}/{TITLE_MAX}
              </span>
            }
            data-hub="composer-title"
          />

          <SimilarInline similar={similar} />

          <div className="forum-composer__row">
            <CategorySelect value={form.category} error={errors.category} onChange={(id) => setForm((f) => ({ ...f, ...rules.withCategory(f, id) }))} />
            <ModuleSelect
              value={form.moduleId}
              error={errors.moduleId}
              onChange={(id) => {
                setForm((f) => ({ ...f, ...rules.withModule(f, id) }));
                if (errors.moduleId) setErrors((e) => ({ ...e, moduleId: undefined }));
              }}
            />
          </div>

          <TagPicker value={form.tags} error={errors.tags} onChange={(tags) => set({ tags })} />

          {images.input}
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

          <div className="forum-composer__attach">
            <AttachmentList
              uploads={images.cards}
              onRetry={images.retry}
              onRemove={(key) => {
                images.remove(key);
                requestAnimationFrame(() => attachRef.current?.focus());
              }}
            />
            <Button ref={attachRef} size="sm" leadingIcon={ImageSquare} onClick={images.pick} data-hub="attach-image">
              {images.cards.length ? 'Attach another image' : 'Attach image'}
            </Button>
            <span className="forum-composer__attach-note">
              A photo of the question or your working. PNG, JPEG, WebP or GIF, up to {MAX_IMAGE_MB} MB. It goes into your post where the cursor is.
            </span>
          </div>

          <ComposerFooter author={author} checking={authStatus === 'loading'} posting={create.isPending} suspended={suspended} onDiscard={discard} />
        </form>

        <ComposerAside similar={similar} module={mod} />
      </div>
    </Page>
  );
}

/** Who posts it (a guest signs in when they post), and Discard / Post thread. */
function ComposerFooter({ author, checking, posting, suspended, onDiscard }: { author: UserPublic | null; checking: boolean; posting: boolean; suspended: boolean; onDiscard: () => void }) {
  return (
    <div className="forum-composer__footer">
      <span className="forum-composer__as">
        <AuthorAvatar author={author} guest={!author} size="sm" />
        {author ? (
          <span>
            Posting as <strong>{author.displayName}</strong>
            <AuthorFlair author={author} className="forum-composer__flair" />
          </span>
        ) : checking ? (
          <span>Checking your account…</span>
        ) : (
          <span>You’ll sign in when you post. Your draft stays on this device.</span>
        )}
      </span>
      <span className="forum-composer__kbd" aria-hidden="true">
        <Kbd>{modKeyLabel()}</Kbd>
        <Kbd>Enter</Kbd>
      </span>
      <span className="forum-composer__buttons">
        <Button variant="ghost" onClick={onDiscard} disabled={posting}>
          Discard
        </Button>
        <Button type="submit" variant="primary" leadingIcon={PaperPlaneRight} loading={posting} disabled={suspended} data-hub="post-button">
          Post thread
        </Button>
      </span>
    </div>
  );
}
