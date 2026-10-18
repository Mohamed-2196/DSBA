// Manage → Forum (forum.moderate): the categories and tags, where a thread goes when no year fits it, and the forum's
// guidelines and tips, edited as one draft and saved together. A category or tag that threads use can't be removed:
// it is retired instead (no longer offered; its threads keep it). A save someone else made first (forum_changed)
// offers to load theirs. Every save goes to the activity log with what changed, before and after.
import { useMemo, useState } from 'react';
import { errorMessage, isApiError } from '../../../api/errors';
import type { ForumSettings, ForumSettingsEditable } from '../../../api/types';
import { useToast } from '../../../state';
import { Badge, Chip, DocFrame, Drawer, ListEditor, Panel, QueryError, Select, Skeleton, Switch, TextArea, TextField, cx, docErrors, focusDocStatus, hasErrorUnder, newItemId, type DocProblem } from '../../../ui';
import { FORUM_ICONS } from '../components/forumIcons';
import { CategoryMark } from '../components/ForumSidebar';
import type { ForumCategory, ForumGuideline, ForumIcon, ForumTag, ForumTip } from '../types';
import { useForumSettings, useReloadForumSettings, useSaveForumSettings } from './api';
import { withSavedIds } from './ids';
import '../components/forum.css';
import '../ForumPage.css';
import '../NewThreadPage.css';
import './ForumSettings.css';

type Section = 'categories' | 'tags' | 'guidelines' | 'tips';

const SECTIONS: { id: Section; label: string; about: string; parts: string[] }[] = [
  {
    id: 'categories',
    label: 'Categories',
    about: 'Where threads live: the forum’s tabs and sidebar, and “Post in” when writing one. A category for a year shows that year’s threads to its students first.',
    parts: ['categories', 'defaultCategory'],
  },
  { id: 'tags', label: 'Tags', about: 'Up to three on each thread, so people can find it later. The most used show above the list.', parts: ['tags'] },
  { id: 'guidelines', label: 'Guidelines', about: 'In the forum’s sidebar, each with a picture beside it.', parts: ['guidelines'] },
  { id: 'tips', label: 'Posting tips', about: 'Beside the form for a new thread.', parts: ['tips'] },
];

const YEARS = [
  { value: '', label: 'Every year' },
  { value: '1', label: 'Year 1' },
  { value: '2', label: 'Year 2' },
  { value: '3', label: 'Year 3' },
];
const ICONS = (Object.keys(FORUM_ICONS) as ForumIcon[]).map((value) => ({ value, label: FORUM_ICONS[value].label }));

const threads = (n: number) => `${n} ${n === 1 ? 'thread' : 'threads'}`;

export function ForumSettingsEditor() {
  const query = useForumSettings();
  // Kept here, so loading someone else's save stays on the same part.
  const [section, setSection] = useState<Section>('categories');
  if (query.isError) return <QueryError error={query.error} title="The forum’s settings didn’t load" onRetry={() => void query.refetch()} retrying={query.isFetching} size="sm" />;
  if (query.isPending) {
    return (
      <Panel padding="md">
        <Skeleton lines={8} />
      </Panel>
    );
  }
  // A new version (saved here, or loaded again) starts a new draft.
  return <Editor key={query.data.version} loaded={query.data} section={section} setSection={setSection} />;
}

function Editor({ loaded, section, setSection }: { loaded: ForumSettingsEditable; section: Section; setSection: (s: Section) => void }) {
  const saved = loaded.data;
  const [doc, setDoc] = useState<ForumSettings>(saved);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<DocProblem | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const save = useSaveForumSettings();
  const reload = useReloadForumSettings();
  const { push: toast } = useToast();
  const dirty = useMemo(() => JSON.stringify(doc) !== JSON.stringify(saved), [doc, saved]);
  const savedCategories = useMemo(() => new Set(saved.categories.map((c) => c.id)), [saved]);
  const savedTags = useMemo(() => new Set(saved.tags.map((t) => t.id)), [saved]);
  const savedIds = useMemo(() => new Set([...savedCategories, ...savedTags, ...saved.guidelines.map((g) => g.id), ...saved.tips.map((t) => t.id)]), [saved, savedCategories, savedTags]);
  const set = (patch: Partial<ForumSettings>) => setDoc((d) => ({ ...d, ...patch }));
  const err = (path: string) => fields[path];
  const usedBy = (id: string) => loaded.threadsByCategory[id] ?? 0;
  const taggedBy = (id: string) => loaded.threadsByTag[id] ?? 0;

  const submit = () => {
    setProblem(null);
    // A new category or tag gets its lasting id from its label now; the draft's was a stand-in.
    const categories = withSavedIds(doc.categories, savedCategories, (c) => c.label, 'category');
    const tags = withSavedIds(doc.tags, savedTags, (t) => t.label, 'tag');
    const defaultCategory = categories[doc.categories.findIndex((c) => c.id === doc.defaultCategory)]?.id ?? doc.defaultCategory;
    save.mutate(
      { version: loaded.version, data: { ...doc, categories, tags, defaultCategory } },
      {
        onSuccess: () => {
          setFields({});
          toast({ title: 'Saved. The forum shows the changes now.', tone: 'success' });
          focusDocStatus();
        },
        onError: (e) => {
          if (isApiError(e) && e.code === 'forum_changed') return setProblem({ kind: 'changed', what: 'the forum’s settings' });
          const found = docErrors(isApiError(e) ? e.fields : {}, ['categories', 'tags', 'guidelines', 'tips']);
          setFields(found.fields);
          const marked = Object.keys(found.fields).length ? ['Some fields need a look before saving. They’re marked below.'] : [];
          const messages = [...found.general, ...marked];
          setProblem({ kind: 'other', messages: messages.length ? messages : [errorMessage(e)] });
          const first = SECTIONS.find((s) => s.parts.some((p) => hasErrorUnder(found.fields, p)));
          if (first) setSection(first.id);
        },
      },
    );
  };

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const everyYear = doc.categories.filter((c) => c.year == null && !c.retired);
  return (
    <>
      <DocFrame
        title="the forum’s settings"
        savedAt={loaded.updatedAt}
        savedBy={loaded.updatedBy?.displayName ?? null}
        dirty={dirty}
        saving={save.isPending}
        pageTo="/forum"
        onPreview={() => setPreviewing(true)}
        onUndo={() => {
          setDoc(saved);
          setFields({});
          setProblem(null);
        }}
        onSave={submit}
        problem={problem}
        onReload={() => void reload()}
        section={{ title: current.label, about: current.about }}
        nav={SECTIONS.map((s) => (
          <Chip key={s.id} selected={s.id === section} onChange={() => setSection(s.id)} className={cx(s.parts.some((p) => hasErrorUnder(fields, p)) && 'dedit__nav-error')}>
            {s.label}
          </Chip>
        ))}
      >
        {section === 'categories' ? (
          <>
            <Select
              label="Threads that fit no year go to"
              hint="A thread without a module, from someone without a year. Only a category for every year can take them."
              value={doc.defaultCategory}
              onChange={(e) => set({ defaultCategory: e.target.value })}
              options={everyYear.map((c) => ({ value: c.id, label: c.label || 'New category' }))}
              error={err('defaultCategory')}
            />
            <ListEditor<ForumCategory>
              items={doc.categories}
              noun="category"
              titleOf={(c) => c.label}
              metaOf={(c) => <CategoryMeta category={c} threads={usedBy(c.id)} />}
              savedIds={savedIds}
              keepReason={(c) => (usedBy(c.id) ? `${c.label} has ${threads(usedBy(c.id))}: retire it instead` : c.id === doc.defaultCategory ? 'Threads that fit no year go here: choose another first' : null)}
              onChange={(categories) => set({ categories })}
              make={() => ({ id: newItemId('category', doc.categories.map((c) => c.id)), label: '', short: '', year: null, blurb: '', icon: 'chat', retired: false })}
              hasError={(i) => hasErrorUnder(fields, `categories.${i}`)}
              min={1}
              max={20}
            >
              {(c, i, change) => (
                <div className="dedit-grid">
                  <TextField label="Name" hint="On the forum’s tabs and in its sidebar." value={c.label} onChange={(e) => change({ label: e.target.value })} error={err(`categories.${i}.label`)} maxLength={40} required />
                  <TextField label="Short name" hint="On a thread’s row, like Study group." value={c.short} onChange={(e) => change({ short: e.target.value })} error={err(`categories.${i}.short`)} maxLength={20} required />
                  <Select
                    label="For"
                    hint="A year’s category shows its number; its threads are that year’s."
                    value={c.year == null ? '' : String(c.year)}
                    onChange={(e) => change({ year: e.target.value ? (Number(e.target.value) as 1 | 2 | 3) : null })}
                    options={YEARS}
                    error={err(`categories.${i}.year`)}
                  />
                  {c.year == null ? (
                    <Select label="Picture" hint="Beside the name in the sidebar." value={c.icon ?? 'chat'} onChange={(e) => change({ icon: e.target.value as ForumIcon })} options={ICONS} error={err(`categories.${i}.icon`)} />
                  ) : null}
                  <TextField className="dedit-grid__wide" label="Under the name" hint="One line in the sidebar. A year’s category lists its modules there instead." value={c.blurb} onChange={(e) => change({ blurb: e.target.value })} error={err(`categories.${i}.blurb`)} maxLength={120} required />
                  <Switch
                    className="dedit-grid__wide"
                    label="Retired"
                    description={usedBy(c.id) ? `No longer offered. Its ${threads(usedBy(c.id))} stay in it.` : 'No longer offered for new threads.'}
                    checked={c.retired}
                    disabled={!c.retired && c.id === doc.defaultCategory}
                    onChange={(retired) => change({ retired })}
                  />
                </div>
              )}
            </ListEditor>
          </>
        ) : null}

        {section === 'tags' ? (
          <ListEditor<ForumTag>
            items={doc.tags}
            noun="tag"
            titleOf={(t) => t.label}
            metaOf={(t) => (t.retired ? `Retired · ${threads(taggedBy(t.id))}` : threads(taggedBy(t.id)))}
            savedIds={savedIds}
            keepReason={(t) => (taggedBy(t.id) ? `${t.label} is on ${threads(taggedBy(t.id))}: retire it instead` : null)}
            onChange={(tags) => set({ tags })}
            make={() => ({ id: newItemId('tag', doc.tags.map((t) => t.id)), label: '', retired: false })}
            hasError={(i) => hasErrorUnder(fields, `tags.${i}`)}
            max={40}
          >
            {(t, i, change) => (
              <div className="dedit-grid">
                <TextField label="Name" value={t.label} onChange={(e) => change({ label: e.target.value })} error={err(`tags.${i}.label`)} maxLength={40} required />
                <Switch
                  className="dedit-grid__wide"
                  label="Retired"
                  description={taggedBy(t.id) ? `No longer offered. The ${threads(taggedBy(t.id))} that have it keep it.` : 'No longer offered for new threads.'}
                  checked={t.retired}
                  onChange={(retired) => change({ retired })}
                />
              </div>
            )}
          </ListEditor>
        ) : null}

        {section === 'guidelines' ? (
          <ListEditor<ForumGuideline>
            items={doc.guidelines}
            noun="guideline"
            titleOf={(g) => g.text}
            metaOf={(g) => <GuidelineIcon icon={g.icon} />}
            savedIds={savedIds}
            onChange={(guidelines) => set({ guidelines })}
            make={() => ({ id: newItemId('guideline', doc.guidelines.map((g) => g.id)), icon: 'info', text: '' })}
            hasError={(i) => hasErrorUnder(fields, `guidelines.${i}`)}
            min={1}
            max={8}
          >
            {(g, i, change) => (
              <div className="dedit-grid">
                <TextArea className="dedit-grid__wide" label="Guideline" value={g.text} onChange={(e) => change({ text: e.target.value })} error={err(`guidelines.${i}.text`)} rows={2} maxLength={200} required />
                <Select label="Picture" value={g.icon} onChange={(e) => change({ icon: e.target.value as ForumIcon })} options={ICONS} error={err(`guidelines.${i}.icon`)} />
              </div>
            )}
          </ListEditor>
        ) : null}

        {section === 'tips' ? (
          <ListEditor<ForumTip>
            items={doc.tips}
            noun="tip"
            titleOf={(t) => t.text}
            savedIds={savedIds}
            onChange={(tips) => set({ tips })}
            make={() => ({ id: newItemId('tip', doc.tips.map((t) => t.id)), text: '' })}
            hasError={(i) => hasErrorUnder(fields, `tips.${i}`)}
            min={1}
            max={8}
          >
            {(t, i, change) => (
              <TextArea label="Tip" hint="Words between `backticks` show as code." value={t.text} onChange={(e) => change({ text: e.target.value })} error={err(`tips.${i}.text`)} rows={2} maxLength={200} required />
            )}
          </ListEditor>
        ) : null}
      </DocFrame>

      <Drawer open={previewing} onClose={() => setPreviewing(false)} title="Preview" description="The forum’s categories, guidelines and tips with your changes, as everyone will see them once you save." width="min(720px, 100vw)">
        {previewing ? <ForumPreview doc={doc} /> : null}
      </Drawer>
    </>
  );
}

function CategoryMeta({ category, threads: n }: { category: ForumCategory; threads: number }) {
  return (
    <span className="forum-set__meta">
      {category.retired ? (
        <Badge tone="neutral" size="sm">
          Retired
        </Badge>
      ) : null}
      <span>
        {category.year ? `For Year ${category.year}` : 'For every year'} · {threads(n)}
      </span>
    </span>
  );
}

function GuidelineIcon({ icon }: { icon: ForumIcon }) {
  const Icon = FORUM_ICONS[icon].icon;
  return (
    <span className="forum-set__meta">
      <Icon aria-hidden="true" /> {FORUM_ICONS[icon].label}
    </span>
  );
}

/** The sidebar's categories and guidelines, and the composer's tips, from the draft. */
function ForumPreview({ doc }: { doc: ForumSettings }) {
  const shown = doc.categories.filter((c) => !c.retired);
  return (
    <div className="dedit-preview forum-set__preview">
      <p className="dedit-preview__label">The forum’s sidebar</p>
      <aside className="forum-side" aria-label="Preview of the forum’s sidebar">
        <section className="forum-side__block">
          <h2 className="forum-side__title">Categories</h2>
          <ul role="list" className="forum-cats">
            {shown.map((c) => (
              <li key={c.id}>
                <span className="forum-cat">
                  <CategoryMark category={c} />
                  <span className="forum-cat__text">
                    <span className="forum-cat__label">{c.label || 'New category'}</span>
                    <span className="forum-cat__blurb">{c.blurb}</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="forum-side__block">
          <h2 className="forum-side__title">Guidelines</h2>
          <ul role="list" className="forum-rules">
            {doc.guidelines.map((g) => {
              const Icon = FORUM_ICONS[g.icon].icon;
              return (
                <li key={g.id}>
                  <Icon aria-hidden="true" />
                  <span>{g.text}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </aside>
      <p className="dedit-preview__label">Beside a new thread</p>
      <section className="forum-new__block">
        <h2 className="forum-side__title">Tips for a good thread</h2>
        <ul role="list" className="forum-tips">
          {doc.tips.map((tip) => (
            <li key={tip.id}>{tip.text.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))}</li>
          ))}
        </ul>
      </section>
      <p className="dedit-preview__label">Tags offered</p>
      <p className="forum-set__tags">
        {doc.tags
          .filter((t) => !t.retired)
          .map((t) => (
            <Badge key={t.id} tone="neutral">
              {t.label || 'New tag'}
            </Badge>
          ))}
      </p>
    </div>
  );
}
