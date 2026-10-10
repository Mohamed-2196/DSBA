import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CaretRight, CheckCircle, ImageSquare, PaperPlaneRight } from '@phosphor-icons/react';
import type { ThreadSummary } from '../../api/types';
import { ApiError, errorMessage } from '../../api/errors';
import { useAuth } from '../../auth';
import { Button, Kbd, Page, PageHeader, Skeleton, TextField, cx, modKeyLabel } from '../../ui';
import { useLocalStorage, useToast, useYear } from '../../state';
import { useModules } from '../../state/modules';
import { useCreateThread, useForumViewerSync, useSimilarThreads } from './api';
import { imageMarkdown, insertBlock, removeImageLines } from './lib/editing';
import { DRAFT_KEY } from './lib/legacy';
import { rankSimilar } from './lib/search';
import { categoryForYear, isCategoryId, useTaxonomy } from './lib/taxonomy';
import { useDebouncedValue } from './lib/useDebouncedValue';
import { MAX_IMAGE_MB, useImageUploads } from './lib/uploads';
import type { CategoryId } from './types';
import { AuthorAvatar } from './components/AuthorAvatar';
import { AttachmentList } from './components/ImageAttachments';
import { useImagePicker } from './lib/useImagePicker';
import { MarkdownEditor } from './components/MarkdownEditor';
import { ModuleTag, ReplyCount } from './components/ThreadBits';
import { AuthorFlair } from './components/ThreadBits';
import { CategorySelect, ModuleSelect, TagPicker } from './components/ThreadFields';
import { usePlacementRules } from './lib/placement';
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
 * An unfinished thread is kept as a draft on this device (localStorage) until it is posted or discarded.
 */
export default function NewThreadPage() {
  useForumViewerSync();
  const { status } = useAuth();
  const [params] = useSearchParams();
  // A new preset on the same route starts a fresh composer.
  const presetKey = ['category', 'module', 'title'].map((k) => params.get(k) || '').join('|');
  // Whose draft to restore depends on who is signed in, so the composer waits for that (usually already known).
  if (status === 'loading') return <ComposerPlaceholder />;
  return <Composer key={presetKey} />;
}

function ComposerPlaceholder() {
  return (
    <Page className="forum-page forum-new" aria-busy="true">
      <nav className="forum-crumbs" aria-label="Breadcrumb">
        <Link to="/forum">Forum</Link>
        <CaretRight aria-hidden="true" weight="bold" />
        <span aria-current="page">Start a thread</span>
      </nav>
      <PageHeader title="Start a thread" description="Ask your cohort a question, or share something that helped you." />
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

const TITLE_MAX = 120;
const TITLE_MIN = 8;
const BODY_MAX = 20_000;

const TIPS = [
  'Ask one clear question in the title.',
  "Say what you've tried so far and where you got stuck.",
  'Pick the module so the right cohort sees it.',
  'Use `backticks` for formulas and code.',
];

interface FormState {
  title: string;
  body: string;
  category: CategoryId;
  /** '' = no specific module */
  moduleId: string;
  tags: string[];
}

interface Draft extends FormState {
  savedAt: number;
  /** who wrote it: an account id, or null for a guest (a shared computer must not show one student's draft to the next) */
  owner?: string | null;
}

type Errors = Partial<Record<'title' | 'body' | 'category' | 'moduleId' | 'tags', string>>;

function isDraft(v: unknown): v is Draft {
  if (!v || typeof v !== 'object') return false;
  const d = v as Record<string, unknown>;
  return typeof d.title === 'string' && typeof d.body === 'string';
}

function SimilarList({ threads }: { threads: ThreadSummary[] }) {
  const { getModule } = useModules();
  return (
    <ul role="list" className="forum-related">
      {threads.map((t) => (
        <li key={t.id} className="forum-related__item forum-new__match">
          <Link to={`/forum/${t.slug}`} className="forum-related__link" dir="auto">
            {t.title}
          </Link>
          <span className="forum-related__meta">
            <ReplyCount count={t.replyCount} answered={t.answered} />
            <ModuleTag module={getModule(t.moduleId)} showName={false} />
            <span className="u-tabular">
              {t.voteCount} {t.voteCount === 1 ? 'vote' : 'votes'}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

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
  const [rawDraft, setDraft] = useLocalStorage<unknown>(DRAFT_KEY, null);

  const [initial] = useState(() => {
    const myYear = me?.year ?? year;
    const presetModule = params.get('module');
    const mod = presetModule ? (getModule(presetModule) ?? getModuleByUnitCode(presetModule.toUpperCase())) : null;
    const presetCategory = params.get('category');
    const cat = isCategoryId(presetCategory) ? getCategory(presetCategory) : null;
    const presetTitle = params.get('title') ?? '';
    if (cat || mod || presetTitle) {
      // The category you asked for, unless it is a year that disagrees with the module (the module is the more
      // specific choice, so the category follows its year). Without one: the module's year, then your year.
      const category: CategoryId =
        cat && !(cat.year && mod && cat.year !== mod.year) ? cat.id : (categoryForYear(mod?.year ?? myYear) ?? 'general');
      return { form: { title: presetTitle.slice(0, TITLE_MAX), body: '', category, moduleId: mod?.id ?? '', tags: [] } as FormState, restored: false };
    }
    // A guest's draft can be picked up by whoever signs in on this device; an account's draft only by that account.
    const mine = isDraft(rawDraft) && (rawDraft.owner == null || rawDraft.owner === (me?.id ?? null));
    if (isDraft(rawDraft) && mine && (rawDraft.title.trim() || rawDraft.body.trim())) {
      const d = rawDraft;
      return {
        form: {
          title: d.title.slice(0, TITLE_MAX),
          body: d.body,
          moduleId: typeof d.moduleId === 'string' && getModule(d.moduleId) ? d.moduleId : '',
          category: isCategoryId(d.category) ? d.category : (categoryForYear(myYear) ?? 'general'),
          tags: Array.isArray(d.tags) ? d.tags.filter((t): t is string => typeof t === 'string').slice(0, 3) : [],
        } as FormState,
        restored: true,
      };
    }
    return { form: { title: '', body: '', moduleId: '', category: categoryForYear(myYear) ?? 'general', tags: [] } as FormState, restored: false };
  });
  const [form, setForm] = useState<FormState>(initial.form);
  const [restored, setRestored] = useState(initial.restored);
  const [errors, setErrors] = useState<Errors>({});
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const attachRef = useRef<HTMLElement>(null);
  const done = useRef(false);
  // Another account's draft on this device stays where it is until this person writes something of their own.
  const othersDraft = useRef(isDraft(rawDraft) && rawDraft.owner != null && rawDraft.owner !== (me?.id ?? null));

  // Keep a draft so nothing is lost if you navigate away or sign in (cleared on post or discard).
  useEffect(() => {
    if (done.current) return;
    if (form.title.trim() || form.body.trim()) setDraft({ ...form, savedAt: Date.now(), owner: me?.id ?? null } satisfies Draft);
    else if (!othersDraft.current) setDraft(undefined);
  }, [form, setDraft, me?.id]);

  // Tags the server doesn't know (an old draft) are dropped once the list has loaded.
  useEffect(() => {
    if (!knownTags.length) return;
    setForm((f) => {
      const tags = f.tags.filter((t) => knownTags.some((k) => k.id === t)).slice(0, maxTags);
      return tags.length === f.tags.length ? f : { ...f, tags };
    });
  }, [knownTags, maxTags]);

  const set = (patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }));
    const touched = Object.keys(patch) as (keyof Errors)[];
    if (touched.some((k) => errors[k])) setErrors((e) => ({ ...e, ...Object.fromEntries(touched.map((k) => [k, undefined])) }));
  };

  const uploads = useImageUploads((img) => {
    setForm((f) => ({ ...f, body: insertBlock(f.body, bodyRef.current ? bodyRef.current.selectionEnd : f.body.length, imageMarkdown(img.alt, img.mediaUrl)).text }));
  });
  const picker = useImagePicker((file) => uploads.start(file));
  const cards = uploads.items.filter((u) => u.phase !== 'done' || (u.mediaUrl && form.body.includes(u.mediaUrl)));
  const attach = () => {
    if (!requireAuth('Sign in to attach images')) return;
    picker.open();
  };

  const mod = getModule(form.moduleId);
  const debouncedTitle = useDebouncedValue(form.title, 350);
  const longEnough = debouncedTitle.trim().length >= 6;
  const similarQuery = useSimilarThreads(longEnough ? debouncedTitle : '');
  const similar = useMemo(() => (longEnough ? rankSimilar(similarQuery.data ?? [], debouncedTitle) : []), [longEnough, similarQuery.data, debouncedTitle]);

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
    if (uploads.busy) {
      push({ title: 'Your image is still uploading', body: 'Post the thread once it has finished.', tone: 'info' });
      return;
    }
    if (!requireAuth('Sign in to post your thread', () => sendRef.current())) return;
    create.mutate(
      { title, body: form.body.trim(), category: form.category, moduleId: form.moduleId || null, tags: form.tags },
      {
        onSuccess: (thread) => {
          done.current = true;
          setDraft(undefined);
          uploads.reset();
          navigate('/forum', { state: { posted: { id: thread.id, slug: thread.slug } } });
          push({
            title: 'Thread posted',
            body: 'Your cohort can see it now.',
            tone: 'success',
            action: { label: 'View thread', onClick: () => navigate(`/forum/${thread.slug}`) },
          });
        },
        onError: (e) => {
          if (e instanceof ApiError && Object.keys(e.fields).length) {
            const f = e.fields;
            setErrors({ title: f.title, body: f.body, category: f.category, moduleId: f.moduleId, tags: f.tags });
            if (f.title) titleRef.current?.focus();
            if (!(f.title || f.body || f.category || f.moduleId || f.tags)) push({ title: "Your thread wasn't posted", body: e.message, tone: 'alert' });
            return;
          }
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
    done.current = true;
    setDraft(undefined);
    uploads.reset();
    navigate('/forum');
  };

  const suspended = me?.status === 'suspended';
  const author = me && !me.needsProfile ? { id: me.id, displayName: me.displayName ?? '', year: me.year, role: me.role } : null;

  return (
    <Page className="forum-page forum-new">
      <nav className="forum-crumbs" aria-label="Breadcrumb">
        <Link to="/forum">Forum</Link>
        <CaretRight aria-hidden="true" weight="bold" />
        <span aria-current="page">Start a thread</span>
      </nav>
      <PageHeader title="Start a thread" description="Ask your cohort a question, or share something that helped you." />

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
                  setForm({ title: '', body: '', moduleId: '', category: categoryForYear(me?.year ?? year) ?? 'general', tags: [] });
                  setRestored(false);
                  setErrors({});
                  uploads.reset();
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

          <div className={cx('forum-composer__similar', !similar.length && 'is-empty')} aria-live="polite">
            {similar.length ? (
              <>
                <p className="forum-composer__similar-title">Similar threads. Your question may already have an answer.</p>
                <SimilarList threads={similar.slice(0, 3)} />
              </>
            ) : null}
          </div>

          <div className="forum-composer__row">
            <CategorySelect value={form.category} error={errors.category} onChange={(id) => setForm((f) => ({ ...f, ...rules.withCategory(f, id) }))} />
            <ModuleSelect value={form.moduleId} error={errors.moduleId} onChange={(id) => setForm((f) => ({ ...f, ...rules.withModule(f, id) }))} />
          </div>

          <TagPicker value={form.tags} error={errors.tags} onChange={(tags) => set({ tags })} />

          {picker.input}
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
            onImageFiles={(files) => {
              if (!requireAuth('Sign in to attach images')) return;
              files.forEach((f) => uploads.start(f));
            }}
            textareaProps={{ 'data-hub': 'composer-body', dir: 'auto', maxLength: BODY_MAX }}
          />

          <div className="forum-composer__attach">
            <AttachmentList
              uploads={cards}
              onRetry={uploads.retry}
              onRemove={(key) => {
                const u = uploads.items.find((x) => x.key === key);
                if (u?.mediaUrl) set({ body: removeImageLines(form.body, u.mediaUrl) });
                uploads.remove(key);
                requestAnimationFrame(() => attachRef.current?.focus());
              }}
            />
            <Button ref={attachRef} size="sm" leadingIcon={ImageSquare} onClick={attach} data-hub="attach-image">
              {cards.length ? 'Attach another image' : 'Attach image'}
            </Button>
            <span className="forum-composer__attach-note">
              A photo of the question or your working. PNG, JPEG, WebP or GIF, up to {MAX_IMAGE_MB} MB. It goes into your post where the cursor is.
            </span>
          </div>

          <div className="forum-composer__footer">
            <span className="forum-composer__as">
              <AuthorAvatar author={author} size="sm" />
              {author ? (
                <span>
                  Posting as <strong>{author.displayName}</strong>
                  <AuthorFlair author={author} className="forum-composer__flair" />
                </span>
              ) : authStatus === 'loading' ? (
                <span>Checking your account…</span>
              ) : (
                <span>You’ll sign in when you post. Your draft stays on this device.</span>
              )}
            </span>
            <span className="forum-composer__kbd" aria-hidden="true">
              <Kbd>{modKeyLabel()}</Kbd>
              <Kbd>Enter</Kbd>
            </span>
            <Button variant="ghost" onClick={discard} disabled={create.isPending}>
              Discard
            </Button>
            <Button type="submit" variant="primary" leadingIcon={PaperPlaneRight} loading={create.isPending} disabled={suspended} data-hub="post-button">
              Post thread
            </Button>
          </div>
        </form>

        <aside className="forum-new__side" aria-label="Before you post">
          <section className="forum-new__block forum-new__block--similar" aria-live="polite" aria-labelledby="forum-new-similar">
            <h2 id="forum-new-similar" className="forum-side__title">
              Similar threads
            </h2>
            {similar.length ? (
              <>
                <p className="forum-new__note">Your question may already have an answer.</p>
                <SimilarList threads={similar} />
              </>
            ) : (
              <p className="forum-new__note">
                {longEnough
                  ? similarQuery.isFetching
                    ? 'Looking for similar threads…'
                    : 'Nothing similar yet. Looks like a fresh question.'
                  : 'Start typing a title and matching threads will show up here.'}
              </p>
            )}
          </section>

          <section className="forum-new__block" aria-labelledby="forum-new-tips">
            <h2 id="forum-new-tips" className="forum-side__title">
              Tips for a good thread
            </h2>
            <ul role="list" className="forum-tips">
              {TIPS.map((tip) => (
                <li key={tip}>{tip.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))}</li>
              ))}
            </ul>
          </section>

          {mod ? (
            <section className="forum-new__block" aria-labelledby="forum-new-module">
              <h2 id="forum-new-module" className="forum-side__title">
                Posting about
              </h2>
              <p className="forum-new__module">
                <ModuleTag module={mod} />
              </p>
              <p className="forum-new__note">
                <CheckCircle aria-hidden="true" weight="fill" className="forum-new__ok" /> It will also show on the module’s Discussion tab.
              </p>
            </section>
          ) : null}
        </aside>
      </div>
    </Page>
  );
}
