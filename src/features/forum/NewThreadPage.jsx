import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CaretRight, CheckCircle, ImageSquare, PaperPlaneRight, X } from '@phosphor-icons/react';
import { YEARS, getModule, getModuleByUnitCode, getModulesForYear, moduleLabel } from '../../data/modules.js';
import { Button, Chip, IconButton, Kbd, Page, PageHeader, Select, TextField, cx, modKeyLabel } from '../../ui';
import { useLocalStorage, useToast, useYear } from '../../state';
import { CATEGORIES, MAX_TAGS, TAGS, categoryForYear, getCategory } from './data/taxonomy.js';
import { SAMPLE_ATTACHMENT, attachmentMarkdown, attachmentSize, getAttachment } from './data/attachments.js';
import { getAuthor, ME_ID } from './data/authors.js';
import { imageUrl } from './lib/images.js';
import { searchIn } from './lib/model.js';
import { DRAFT_KEY } from './lib/store.js';
import { ForumProvider } from './state/ForumProvider.jsx';
import { useForum } from './state/context.js';
import { AuthorAvatar } from './components/AuthorAvatar.jsx';
import { MarkdownEditor } from './components/MarkdownEditor.jsx';
import { ModuleTag, ReplyCount } from './components/ThreadBits.jsx';
import './components/forum.css';
import './ForumPage.css';
import './NewThreadPage.css';

/**
 * Start a thread: #/forum/new. Presets in the URL (all optional, they can be combined):
 *   ?category=year-1       where to post it (a category id: year-1, year-2, year-3, study-groups, general)
 *   ?module=mathematics    the module, by id (or by unit code: ?module=MT1186); a year category that disagrees with the
 *                          module's year follows the module
 *   ?title=...             the title
 *   ?attach=reduction-formula   the attached picture (see data/attachments.js)
 */
export default function NewThreadPage() {
  const [params] = useSearchParams();
  // A new preset on the same route starts a fresh composer.
  const presetKey = ['category', 'module', 'title', 'attach'].map((k) => params.get(k) || '').join('|');
  return (
    <ForumProvider>
      <Composer key={presetKey} />
    </ForumProvider>
  );
}

const TITLE_MAX = 120;
const TITLE_MIN = 8;

const TIPS = [
  'Ask one clear question in the title.',
  "Say what you've tried so far and where you got stuck.",
  'Pick the module so the right cohort sees it.',
  'Use `backticks` for formulas and code.',
];

/** The module for ?module=: an id ('mathematics') or a unit code ('MT1186', any case). */
function presetModuleFor(value) {
  if (!value) return null;
  return getModule(value) || getModuleByUnitCode(String(value).toUpperCase());
}

/** `attachment` is the id of the attached picture (see data/attachments.js) or null. */
function initialForm({ presetCategory, presetModule, presetTitle, presetAttach, draft, year }) {
  const mod = presetModuleFor(presetModule);
  const cat = getCategory(presetCategory);
  const attached = getAttachment(presetAttach);
  if (cat || mod || presetTitle || attached) {
    // The category you asked for, unless it is a year that disagrees with the module (the module is the more specific
    // choice, so the category follows its year). Without one: the module's year, then the year you are browsing.
    const category = cat && !(cat.year && mod && cat.year !== mod.year) ? cat.id : categoryForYear(mod?.year ?? year) || 'general';
    return {
      title: presetTitle || '',
      body: '',
      moduleId: mod ? mod.id : '',
      category,
      tags: [],
      attachment: attached ? attached.id : null,
    };
  }
  if (draft && typeof draft === 'object' && (draft.title || draft.body || draft.attachment)) {
    return {
      title: String(draft.title || ''),
      body: String(draft.body || ''),
      moduleId: getModule(draft.moduleId) ? draft.moduleId : '',
      category: getCategory(draft.category) ? draft.category : categoryForYear(year) || 'general',
      tags: Array.isArray(draft.tags) ? draft.tags.filter((t) => TAGS.some((x) => x.id === t)).slice(0, MAX_TAGS) : [],
      attachment: getAttachment(draft.attachment)?.id || null,
      restored: true,
    };
  }
  return { title: '', body: '', moduleId: '', category: categoryForYear(year) || 'general', tags: [], attachment: null };
}

function SimilarList({ threads }) {
  return (
    <ul role="list" className="forum-related">
      {threads.map((t) => (
        <li key={t.id} className="forum-related__item forum-new__match">
          <Link to={`/forum/${t.id}`} className="forum-related__link" dir="auto">
            {t.title}
          </Link>
          <span className="forum-related__meta">
            <ReplyCount count={t.replyCount} answered={t.answered} />
            {t.module ? <ModuleTag module={t.module} showName={false} /> : null}
            <span className="u-tabular">{t.votes} votes</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Composer() {
  const forum = useForum();
  const { year } = useYear();
  const { push } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [draft, setDraft] = useLocalStorage(DRAFT_KEY, null);
  const [form, setForm] = useState(() =>
    initialForm({
      presetCategory: params.get('category'),
      presetModule: params.get('module'),
      presetTitle: params.get('title'),
      presetAttach: params.get('attach'),
      draft,
      year,
    }),
  );
  const [errors, setErrors] = useState({});
  const [restored, setRestored] = useState(Boolean(form.restored));
  const titleRef = useRef(null);
  const attachRef = useRef(null);
  const removeRef = useRef(null);
  const posted = useRef(false);

  // Keep a draft so nothing is lost if you navigate away (cleared on post or discard).
  useEffect(() => {
    if (posted.current) return;
    const { title, body, moduleId, category, tags, attachment } = form;
    if (title.trim() || body.trim() || attachment) setDraft({ title, body, moduleId, category, tags, attachment });
    else setDraft(undefined);
  }, [form, setDraft]);

  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    if (Object.keys(patch).some((k) => errors[k])) setErrors((e) => ({ ...e, ...Object.fromEntries(Object.keys(patch).map((k) => [k, null])) }));
  };

  const mod = form.moduleId ? getModule(form.moduleId) : null;
  const category = getCategory(form.category);

  const onModule = (id) => {
    const next = getModule(id);
    // A module from another year moves a year-category thread to that year.
    if (next && category?.year && category.year !== next.year) set({ moduleId: id, category: categoryForYear(next.year) });
    else set({ moduleId: id });
  };
  const onCategory = (id) => {
    const cat = getCategory(id);
    if (cat?.year && mod && mod.year !== cat.year) set({ category: id, moduleId: '' });
    else set({ category: id });
  };
  const toggleTag = (id) => {
    set({ tags: form.tags.includes(id) ? form.tags.filter((t) => t !== id) : [...form.tags, id].slice(0, MAX_TAGS) });
  };
  // The button swaps for the preview (and back), so keyboard focus goes to whichever control replaces it.
  const attach = () => {
    set({ attachment: SAMPLE_ATTACHMENT.id });
    requestAnimationFrame(() => removeRef.current?.focus());
  };
  const detach = () => {
    set({ attachment: null });
    requestAnimationFrame(() => attachRef.current?.focus());
  };
  const attachment = getAttachment(form.attachment);

  const deferredTitle = useDeferredValue(form.title);
  const similar = useMemo(() => {
    if (deferredTitle.trim().length < 6) return [];
    return searchIn(forum.threads, deferredTitle, { mode: 'any', minScore: 6, limit: 4 });
  }, [forum.threads, deferredTitle]);

  const submit = (e) => {
    e?.preventDefault();
    const title = form.title.trim();
    const next = {};
    if (title.length < TITLE_MIN) {
      next.title = title ? `Make the title a little longer (at least ${TITLE_MIN} characters) so classmates know what you're asking.` : 'Add a title so classmates know what you’re asking.';
    }
    if (!getCategory(form.category)) next.category = 'Choose where to post this thread.';
    if (Object.values(next).some(Boolean)) {
      setErrors(next);
      if (next.title) titleRef.current?.focus();
      return;
    }
    // The picture goes at the top of the post, then whatever the student wrote.
    const body = [attachment ? attachmentMarkdown(attachment) : '', form.body.trim()].filter(Boolean).join('\n\n');
    const thread = forum.postThread({ title, body, category: form.category, moduleId: form.moduleId || null, tags: form.tags, year });
    posted.current = true;
    setDraft(undefined);
    navigate('/forum', { state: { posted: thread.id } });
    push({
      title: 'Thread posted',
      body: 'Your cohort can see it now.',
      tone: 'success',
      action: { label: 'View thread', onClick: () => navigate(`/forum/${thread.id}`) },
    });
  };

  const discard = () => {
    posted.current = true;
    setDraft(undefined);
    navigate('/forum');
  };

  const me = getAuthor(ME_ID);
  const tagLimit = form.tags.length >= MAX_TAGS;

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
          {restored ? (
            <div className="forum-composer__restored" role="status">
              <span>We kept the draft you started earlier.</span>
              <button
                type="button"
                className="forum-composer__link"
                onClick={() => {
                  setForm(initialForm({ year }));
                  setRestored(false);
                  setErrors({});
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
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(e);
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
            <Select
              label="Post in"
              value={form.category}
              error={errors.category}
              onChange={(e) => onCategory(e.target.value)}
              options={CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
              data-hub="composer-category"
            />
            <Select label="Module" value={form.moduleId} onChange={(e) => onModule(e.target.value)} hint="Optional" data-hub="composer-module">
              <option value="">No specific module</option>
              {YEARS.map((y) => (
                <optgroup key={y} label={`Year ${y}`}>
                  {getModulesForYear(y).map((m) => (
                    <option key={m.id} value={m.id}>
                      {moduleLabel(m)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>

          <fieldset className="forum-composer__tags">
            <legend className="forum-composer__legend">
              Tags <span className="forum-composer__legend-hint">Up to {MAX_TAGS}, so people can find it later</span>
            </legend>
            <div className="forum-composer__chips">
              {TAGS.map((t) => {
                const on = form.tags.includes(t.id);
                return (
                  <Chip key={t.id} size="sm" selected={on} disabled={!on && tagLimit} onChange={() => toggleTag(t.id)}>
                    {t.label}
                  </Chip>
                );
              })}
            </div>
          </fieldset>

          <MarkdownEditor
            label="Details"
            hint="Optional, but threads with details get better answers."
            value={form.body}
            onChange={(v) => set({ body: v })}
            placeholder="What have you tried so far? Where exactly do you get stuck?"
            rows={9}
            onSubmit={submit}
            textareaProps={{ 'data-hub': 'composer-body', dir: 'auto' }}
          />

          <div className="forum-composer__attach">
            {attachment ? (
              <figure className="forum-attachment" data-hub="composer-attachment">
                <img className="forum-attachment__img" src={imageUrl(attachment.src)} alt={attachment.alt} />
                <figcaption className="forum-attachment__bar">
                  <ImageSquare aria-hidden="true" weight="duotone" className="forum-attachment__icon" />
                  <span className="forum-attachment__name">{attachment.name}</span>
                  <span className="forum-attachment__meta u-tabular">
                    {attachment.width} × {attachment.height} · {attachmentSize(attachment)}
                  </span>
                  <IconButton ref={removeRef} size="sm" icon={X} label="Remove image" tooltip tooltipSide="top" onClick={detach} className="forum-attachment__remove" />
                </figcaption>
              </figure>
            ) : (
              <>
                <Button ref={attachRef} size="sm" leadingIcon={ImageSquare} onClick={attach} data-hub="attach-image">
                  Attach image
                </Button>
                <span className="forum-composer__attach-note">A photo of the question or your working. It goes at the top of your post.</span>
              </>
            )}
          </div>

          <div className="forum-composer__footer">
            <span className="forum-composer__as">
              <AuthorAvatar author={me} size="sm" />
              <span>
                Posting as <strong>{me.name}</strong>
                {me.flair ? `, ${me.flair}` : ''}
              </span>
            </span>
            <span className="forum-composer__kbd" aria-hidden="true">
              <Kbd>{modKeyLabel()}</Kbd>
              <Kbd>Enter</Kbd>
            </span>
            <Button variant="ghost" onClick={discard}>
              Discard
            </Button>
            <Button type="submit" variant="primary" leadingIcon={PaperPlaneRight} data-hub="post-button">
              Post thread
            </Button>
          </div>
        </form>

        <aside className="forum-new__side" aria-label="Before you post">
          <section className="forum-new__block forum-new__block--similar" aria-live="polite" aria-labelledby="forum-new-similar">
            <h2 id="forum-new-similar" className="forum-side__title">Similar threads</h2>
            {similar.length ? (
              <>
                <p className="forum-new__note">Your question may already have an answer.</p>
                <SimilarList threads={similar} />
              </>
            ) : (
              <p className="forum-new__note">
                {form.title.trim().length >= 6 ? 'Nothing similar yet. Looks like a fresh question.' : 'Start typing a title and matching threads will show up here.'}
              </p>
            )}
          </section>

          <section className="forum-new__block" aria-labelledby="forum-new-tips">
            <h2 id="forum-new-tips" className="forum-side__title">Tips for a good thread</h2>
            <ul role="list" className="forum-tips">
              {TIPS.map((tip) => (
                <li key={tip}>{tip.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))}</li>
              ))}
            </ul>
          </section>

          {mod ? (
            <section className="forum-new__block" aria-labelledby="forum-new-module">
              <h2 id="forum-new-module" className="forum-side__title">Posting about</h2>
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
