// Manage → Site settings (admins): the hub's own words and links, edited as one draft and saved together. A save
// someone else made first (site_changed) offers to load theirs. Every save goes to the activity log with what changed,
// before and after.
import { X } from '@phosphor-icons/react';
import { useMemo, useState, type ReactNode } from 'react';
import { errorMessage, isApiError } from '../../api/errors';
import type { NoteCredit, SiteContributor, SiteDoc, SiteEditable, SiteLink } from '../../api/types';
import { moduleLabel } from '../../lib/modules';
import { useToast } from '../../state';
import { useModules } from '../../state/modules';
import { Chip, Drawer, IconButton, Panel, QueryError, Select, Skeleton, TextArea, TextField, cx } from '../../ui';
import { MarkdownEditor } from '../forum/public';
import { useReloadSite, useSaveSite, useSiteForEditing } from './api';
import { HOME_BLOCKS } from '../home/public';
import { TourStepCard } from '../onboarding/public';
import { AboutMain } from './AboutPage';
import { HomeTourSection, SearchSection } from './HomeAndSearch';
import { docErrors, hasErrorUnder } from './editor/errors';
import { focusDocStatus, newItemId } from './editor/doc';
import { DocFrame, ListEditor, type DocProblem } from './editor/kit';
import { contributorLine, copyrightYears, type SiteLinkKey } from './lib/site';
import './Site.css';

type Section = 'links' | 'about' | 'people' | 'notes' | 'footer' | 'home' | 'search';

const SECTIONS: { id: Section; label: string; about: string; parts: string[] }[] = [
  { id: 'links', label: 'Links', about: 'The sites the hub sends students to. The sidebar shows MyClass’s and the University’s logos beside the first two.', parts: ['links'] },
  { id: 'about', label: 'About', about: 'The About page’s words. The hub’s own numbers (modules, lessons, files, dates) follow them.', parts: ['aboutIntro', 'about'] },
  { id: 'people', label: 'Contributors', about: 'The people who built the hub and supplied its materials, in the footer and on About, in this order.', parts: ['contributors'] },
  { id: 'notes', label: 'Students who shared notes', about: 'Credited by name on About; each module links to its notes in the library.', parts: ['noteCredits'] },
  { id: 'footer', label: 'Footer and notes', about: 'The footer’s words, and the note under every class the grades calculator works out.', parts: ['tagline', 'disclaimer', 'copyrightHolder', 'launchYear', 'gradesNote'] },
  { id: 'home', label: 'Home and the tour', about: 'Home for a student who hasn’t arranged their own, and the steps of the tour a new student may take.', parts: ['homeBlocks', 'tour'] },
  { id: 'search', label: 'Search', about: 'Other words students type for modules, and what search suggests before anything is typed.', parts: ['searchNicknames', 'searchSuggestions'] },
];

const LINKS: { key: SiteLinkKey; title: string }[] = [
  { key: 'myclass', title: 'BIBF MyClass' },
  { key: 'uolPortal', title: 'The UoL student portal' },
  { key: 'regulations', title: 'The programme regulations' },
  { key: 'results', title: 'Exam entry and results' },
];

export function SiteEditor() {
  const query = useSiteForEditing();
  // Kept here, so loading someone else's save stays on the same part.
  const [section, setSection] = useState<Section>('links');
  if (query.isError) return <QueryError error={query.error} title="Site settings didn’t load" onRetry={() => void query.refetch()} retrying={query.isFetching} size="sm" />;
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

function Editor({ loaded, section, setSection }: { loaded: SiteEditable; section: Section; setSection: (s: Section) => void }) {
  const saved = loaded.data;
  const [doc, setDoc] = useState<SiteDoc>(saved);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<DocProblem | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const save = useSaveSite();
  const reload = useReloadSite();
  const { push: toast } = useToast();
  const dirty = useMemo(() => JSON.stringify(doc) !== JSON.stringify(saved), [doc, saved]);
  const savedIds = useMemo(
    () => new Set([...saved.contributors.map((c) => c.id), ...saved.noteCredits.map((n) => n.id), ...saved.tour.map((t) => t.id), ...saved.searchNicknames.map((n) => n.id)]),
    [saved],
  );
  const set = (patch: Partial<SiteDoc>) => setDoc((d) => ({ ...d, ...patch }));
  const err = (path: string) => fields[path];

  const submit = () => {
    setProblem(null);
    save.mutate(
      { version: loaded.version, data: doc },
      {
        onSuccess: () => {
          setFields({});
          toast({ title: 'Saved. Everyone sees the changes now.', tone: 'success' });
          focusDocStatus();
        },
        onError: (e) => {
          if (isApiError(e) && e.code === 'site_changed') return setProblem({ kind: 'changed', what: 'the site settings' });
          const found = docErrors(isApiError(e) ? e.fields : {}, ['contributors', 'noteCredits', 'tour', 'searchNicknames']);
          setFields(found.fields);
          const marked = Object.keys(found.fields).length ? ['Some fields need a look before saving. They’re marked below.'] : [];
          setProblem({ kind: 'other', messages: [...found.general, ...marked].length ? [...found.general, ...marked] : [errorMessage(e)] });
          const first = SECTIONS.find((s) => s.parts.some((p) => hasErrorUnder(found.fields, p)));
          if (first) setSection(first.id);
        },
      },
    );
  };

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  return (
    <>
      <DocFrame
        title="Site settings"
        savedAt={loaded.updatedAt}
        savedBy={loaded.updatedBy?.displayName ?? null}
        dirty={dirty}
        saving={save.isPending}
        pageTo="/about"
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
        {section === 'links' ? <LinksSection doc={doc} set={set} err={err} /> : null}
        {section === 'about' ? (
          <>
            <TextArea label="Under the title" value={doc.aboutIntro} onChange={(e) => set({ aboutIntro: e.target.value })} error={err('aboutIntro')} rows={2} maxLength={300} required />
            <MarkdownEditor label="What it is" hint="Markdown works: **bold**, *italic*, lists and links." value={doc.about} onChange={(about) => set({ about })} error={err('about')} rows={10} preview />
          </>
        ) : null}
        {section === 'people' ? (
          <ListEditor<SiteContributor>
            items={doc.contributors}
            noun="contributor"
            titleOf={(c) => c.name}
            metaOf={(c) => contributorLine(c) ?? 'No role yet'}
            savedIds={savedIds}
            onChange={(contributors) => set({ contributors })}
            make={() => ({ id: newItemId('person', doc.contributors.map((c) => c.id)), name: '', role: null, affiliation: null, url: null })}
            hasError={(i) => hasErrorUnder(fields, `contributors.${i}`)}
            max={30}
          >
            {(c, i, change) => (
              <div className="dedit-grid">
                <TextField label="Name" value={c.name} onChange={(e) => change({ name: e.target.value })} error={err(`contributors.${i}.name`)} maxLength={80} required />
                <TextField label="Role" hint="What they contributed. Leave it empty until it’s agreed." value={c.role ?? ''} onChange={(e) => change({ role: e.target.value || null })} error={err(`contributors.${i}.role`)} maxLength={120} />
                <TextField label="Affiliation" hint="Optional, like BIBF faculty." value={c.affiliation ?? ''} onChange={(e) => change({ affiliation: e.target.value || null })} error={err(`contributors.${i}.affiliation`)} maxLength={120} />
                <TextField label="Their page" hint="Optional: an https:// link." value={c.url ?? ''} onChange={(e) => change({ url: e.target.value.trim() || null })} error={err(`contributors.${i}.url`)} maxLength={2000} inputMode="url" />
              </div>
            )}
          </ListEditor>
        ) : null}
        {section === 'notes' ? <NotesSection doc={doc} set={set} fields={fields} savedIds={savedIds} /> : null}
        {section === 'home' ? <HomeTourSection doc={doc} set={set} err={err} fields={fields} savedIds={savedIds} /> : null}
        {section === 'search' ? <SearchSection doc={doc} set={set} err={err} fields={fields} savedIds={savedIds} /> : null}
        {section === 'footer' ? (
          <div className="dedit-grid">
            <TextArea className="dedit-grid__wide" label="Who makes the hub" hint="The footer’s line under the logo." value={doc.tagline} onChange={(e) => set({ tagline: e.target.value })} error={err('tagline')} rows={2} maxLength={300} required />
            <TextArea className="dedit-grid__wide" label="Disclaimer" hint="In the footer and on About." value={doc.disclaimer} onChange={(e) => set({ disclaimer: e.target.value })} error={err('disclaimer')} rows={3} maxLength={300} required />
            <TextField label="Copyright holder" value={doc.copyrightHolder} onChange={(e) => set({ copyrightHolder: e.target.value })} error={err('copyrightHolder')} maxLength={80} required />
            <TextField
              label="Launch year"
              hint={`The footer reads © ${copyrightYears(doc.launchYear)}.`}
              type="number"
              inputMode="numeric"
              min={2000}
              max={2100}
              value={doc.launchYear}
              onChange={(e) => set({ launchYear: Number(e.target.value) })}
              error={err('launchYear')}
              required
            />
            <TextArea className="dedit-grid__wide" label="Under the grades calculator’s class" hint="That the calculator isn’t the official result." value={doc.gradesNote} onChange={(e) => set({ gradesNote: e.target.value })} error={err('gradesNote')} rows={2} maxLength={300} required />
          </div>
        ) : null}
      </DocFrame>

      <Drawer open={previewing} onClose={() => setPreviewing(false)} title="Preview" description="The site settings with your changes, as everyone will see them once you save." width="min(1100px, 100vw)">
        {previewing ? (
          <div className="dedit-preview">
            {section === 'home' ? (
              <>
                <p className="dedit-preview__label">Home for a new student, in order</p>
                <ol className="site-preview__blocks">
                  {doc.homeBlocks.map((b) => (
                    <li key={b}>{HOME_BLOCKS[b].title}</li>
                  ))}
                </ol>
                <p className="dedit-preview__label">The tour</p>
                {doc.tour.map((step, i) => (
                  <TourStepCard key={step.id} step={step} n={i + 1} of={doc.tour.length} />
                ))}
              </>
            ) : section === 'search' ? (
              <>
                <p className="dedit-preview__label">Try searching for</p>
                <ul role="list" className="site-preview__chips">
                  {doc.searchSuggestions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
                <p className="dedit-preview__label">Other words for modules</p>
                <ul className="site-preview__blocks">
                  {doc.searchNicknames.map((n) => (
                    <li key={n.id}>{`${n.word}: modules named “${n.finds}…”`}</li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p className="dedit-preview__label">About</p>
                <AboutMain site={doc} numbers={false} />
                <p className="dedit-preview__label">Footer</p>
                <FooterPreview site={doc} />
              </>
            )}
          </div>
        ) : null}
      </Drawer>
    </>
  );
}

function LinkFields({ title, link, onChange, path, err }: { title: string; link: SiteLink; onChange: (next: SiteLink) => void; path: string; err: (path: string) => string | undefined }) {
  return (
    <fieldset className="dedit-group">
      <legend className="dedit-group__legend">{title}</legend>
      <div className="dedit-grid">
        <TextField label="Label" value={link.label} onChange={(e) => onChange({ ...link, label: e.target.value })} error={err(`${path}.label`)} maxLength={60} required />
        <TextField label="Address" hint="An https:// link." value={link.url} onChange={(e) => onChange({ ...link, url: e.target.value.trim() })} error={err(`${path}.url`)} maxLength={2000} inputMode="url" required />
        <TextField className="dedit-grid__wide" label="What it’s for" hint="One line under the label on About." value={link.note} onChange={(e) => onChange({ ...link, note: e.target.value })} error={err(`${path}.note`)} maxLength={120} required />
      </div>
    </fieldset>
  );
}

function LinksSection({ doc, set, err }: { doc: SiteDoc; set: (patch: Partial<SiteDoc>) => void; err: (path: string) => string | undefined }) {
  return (
    <>
      {LINKS.map(({ key, title }) => (
        <LinkFields key={key} title={title} link={doc.links[key]} path={`links.${key}`} err={err} onChange={(next) => set({ links: { ...doc.links, [key]: next } })} />
      ))}
    </>
  );
}

function NotesSection({ doc, set, fields, savedIds }: { doc: SiteDoc; set: (patch: Partial<SiteDoc>) => void; fields: Record<string, string>; savedIds: ReadonlySet<string> }) {
  const { modules, getModule } = useModules();
  const options = useMemo(() => modules.map((m) => ({ value: m.id, label: moduleLabel(m) })), [modules]);
  return (
    <ListEditor<NoteCredit>
      items={doc.noteCredits}
      noun="student"
      titleOf={(n) => n.name}
      metaOf={(n) => n.modules.map((id) => getModule(id)?.shortName ?? id).join(', ') || 'No modules yet'}
      savedIds={savedIds}
      onChange={(noteCredits) => set({ noteCredits })}
      make={() => ({ id: newItemId('student', doc.noteCredits.map((n) => n.id)), name: '', modules: [] })}
      hasError={(i) => hasErrorUnder(fields, `noteCredits.${i}`)}
    >
      {(n, i, change) => (
        <div className="dedit-grid">
          <TextField label="Name" hint="As they want to be credited." value={n.name} onChange={(e) => change({ name: e.target.value })} error={fields[`noteCredits.${i}.name`]} maxLength={80} required />
          <div className="dedit-grid__wide">
            <ModulesPick value={n.modules} options={options} onChange={(next) => change({ modules: next })} error={fields[`noteCredits.${i}.modules`]} />
          </div>
        </div>
      )}
    </ListEditor>
  );
}

/** The modules a student's notes are for: chips to remove, a select to add one. */
function ModulesPick({ value, options, onChange, error }: { value: readonly string[]; options: { value: string; label: string }[]; onChange: (next: string[]) => void; error?: string }) {
  const labelOf = new Map(options.map((o) => [o.value, o.label]));
  const left = options.filter((o) => !value.includes(o.value));
  return (
    <fieldset className="dedit-group site-pick">
      <legend className="dedit-group__legend">Modules</legend>
      {value.length ? (
        <ul role="list" className="site-pick__chips">
          {value.map((id) => (
            <li key={id} className="site-pick__chip">
              <span className="site-pick__text">{labelOf.get(id) ?? id}</span>
              <IconButton size="sm" icon={X} label={`Remove ${labelOf.get(id) ?? id}`} onClick={() => onChange(value.filter((x) => x !== id))} />
            </li>
          ))}
        </ul>
      ) : null}
      <Select label="Add a module" hideLabel value="" placeholder="Add a module" options={left} onChange={(e) => e.target.value && onChange([...value, e.target.value])} error={error} />
    </fieldset>
  );
}

function FooterPreview({ site }: { site: SiteDoc }): ReactNode {
  return (
    <div className="site-footer-preview">
      <p>{site.tagline}</p>
      <ul role="list" className="site-footer-preview__people">
        {site.contributors.map((c) => (
          <li key={c.id}>
            <strong>{c.name}</strong>
            {contributorLine(c) ? <span>{contributorLine(c)}</span> : null}
          </li>
        ))}
      </ul>
      <p className="site-footer-preview__legal">{site.disclaimer}</p>
      <p className="site-footer-preview__legal">
        © {copyrightYears(site.launchYear)} {site.copyrightHolder}. All rights reserved.
      </p>
    </div>
  );
}
