// Manage → Guides (guides.edit): Start here, Results day and Choosing your Year 3 electives, edited as one draft and
// saved together. A save someone else made first (guides_changed) offers to load theirs. Every save goes to the
// activity log with what changed, before and after.
import { Info } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { errorMessage, isApiError } from '../../../api/errors';
import type { Electives, GuidePlace, GuidesDoc, GuidesEditable, GuideStep, ResultsDay, StartHere } from '../../../api/types';
import { FEATURE_KEYS } from '../../../auth';
import { useToast } from '../../../state';
import { Chip, DocFrame, Drawer, ListEditor, PageHeader, Panel, QueryError, RowsEditor, Select, Skeleton, TextArea, TextField, cx, docErrors, focusDocStatus, hasErrorUnder, newItemId, type DocProblem } from '../../../ui';
import { useSite, type SiteLinkKey } from '../../site/public';
import { useGuidesForEditing, useReloadGuides, useSaveGuides } from '../api';
import { ResultsDayBody } from '../ResultsDayPage';
import { StartHereBody } from '../StartHerePage';
import { LINK_KINDS, linkOfKind, type GuideLink, type LinkKind } from './links';
import './GuidesEditor.css';

type Section = 'startHere' | 'resultsDay' | 'electives';
type Err = (path: string) => string | undefined;

const SECTIONS: { id: Section; label: string; about: string; page: string }[] = [
  { id: 'startHere', label: 'Start here', about: 'Year 1’s first weeks: Home’s card for Year 1 from the first day of term, and the page.', page: '/start-here' },
  { id: 'resultsDay', label: 'Results day', about: 'What results mean and what to do next: Home’s card from each results date on the calendar, and the page.', page: '/results-day' },
  { id: 'electives', label: 'Choosing electives', about: 'The words around the Year 3 electives. What each covers comes from the modules and Career Navigator.', page: '/career/electives' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const featureName = (key: string) => {
  const words = key.replace(/[._-]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export function GuidesEditor() {
  const query = useGuidesForEditing();
  // Kept here, so loading someone else's save stays on the same guide.
  const [section, setSection] = useState<Section>('startHere');
  if (query.isError) return <QueryError error={query.error} title="The guides didn’t load" onRetry={() => void query.refetch()} retrying={query.isFetching} size="sm" />;
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

function Editor({ loaded, section, setSection }: { loaded: GuidesEditable; section: Section; setSection: (s: Section) => void }) {
  const saved = loaded.data;
  const [doc, setDoc] = useState<GuidesDoc>(saved);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<DocProblem | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const save = useSaveGuides();
  const reload = useReloadGuides();
  const { push: toast } = useToast();
  const dirty = useMemo(() => JSON.stringify(doc) !== JSON.stringify(saved), [doc, saved]);
  const err: Err = (path) => fields[path];

  const submit = () => {
    setProblem(null);
    save.mutate(
      { version: loaded.version, data: doc },
      {
        onSuccess: () => {
          setFields({});
          toast({ title: 'Saved. Students see the changes now.', tone: 'success' });
          focusDocStatus();
        },
        onError: (e) => {
          if (isApiError(e) && e.code === 'guides_changed') return setProblem({ kind: 'changed', what: 'the guides' });
          const found = docErrors(isApiError(e) ? e.fields : {}, ['startHere.steps', 'resultsDay.steps', 'startHere.places']);
          setFields(found.fields);
          const marked = Object.keys(found.fields).length ? ['Some fields need a look before saving. They’re marked below.'] : [];
          const messages = [...found.general, ...marked];
          setProblem({ kind: 'other', messages: messages.length ? messages : [errorMessage(e)] });
          const first = SECTIONS.find((s) => hasErrorUnder(found.fields, s.id));
          if (first) setSection(first.id);
        },
      },
    );
  };

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  return (
    <>
      <DocFrame
        title="Guides"
        savedAt={loaded.updatedAt}
        savedBy={loaded.updatedBy?.displayName ?? null}
        dirty={dirty}
        saving={save.isPending}
        pageTo={current.page}
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
          <Chip key={s.id} selected={s.id === section} onChange={() => setSection(s.id)} className={cx(hasErrorUnder(fields, s.id) && 'dedit__nav-error')}>
            {s.label}
          </Chip>
        ))}
      >
        {section === 'startHere' ? <StartHereFields guide={doc.startHere} saved={saved.startHere} onChange={(startHere) => setDoc((d) => ({ ...d, startHere }))} err={err} fields={fields} /> : null}
        {section === 'resultsDay' ? <ResultsDayFields guide={doc.resultsDay} saved={saved.resultsDay} onChange={(resultsDay) => setDoc((d) => ({ ...d, resultsDay }))} err={err} fields={fields} /> : null}
        {section === 'electives' ? <ElectivesFields guide={doc.electives} onChange={(electives) => setDoc((d) => ({ ...d, electives }))} err={err} /> : null}
      </DocFrame>

      <Drawer open={previewing} onClose={() => setPreviewing(false)} title={`Preview: ${current.label}`} description="The page with your changes, as students will see it once you save." width="min(1100px, 100vw)">
        {previewing ? (
          <div className="dedit-preview gedit-preview">
            {section === 'startHere' ? <StartHereBody guide={doc.startHere} /> : null}
            {section === 'resultsDay' ? <ResultsDayBody guide={doc.resultsDay} /> : null}
            {section === 'electives' ? <ElectivesPreview guide={doc.electives} /> : null}
          </div>
        ) : null}
      </Drawer>
    </>
  );
}

function ElectivesPreview({ guide }: { guide: Electives }) {
  return (
    <>
      <PageHeader title={guide.title} description={guide.intro} />
      <Panel tone="inset" padding="none" className="electives__note gedit-note" role="note">
        <Info weight="bold" aria-hidden="true" />
        <p>{guide.disclaimer}</p>
      </Panel>
      <p className="dedit__note">The electives follow, side by side: each with what it covers, the skills it builds and the roles it leads to.</p>
    </>
  );
}

// ── the parts ────────────────────────────────────────────────────────────────────────────────

interface PartProps<T> {
  guide: T;
  saved: T;
  onChange: (next: T) => void;
  err: Err;
  fields: Record<string, string>;
}

function StartHereFields({ guide, saved, onChange, err, fields }: PartProps<StartHere>) {
  const set = (patch: Partial<StartHere>) => onChange({ ...guide, ...patch });
  return (
    <>
      <div className="dedit-grid">
        <TextField label="Title" value={guide.title} onChange={(e) => set({ title: e.target.value })} error={err('startHere.title')} maxLength={60} required />
        <TextArea className="dedit-grid__wide" label="Under the title" value={guide.intro} onChange={(e) => set({ intro: e.target.value })} error={err('startHere.intro')} rows={2} maxLength={300} required />
      </div>
      <fieldset className="dedit-group">
        <legend className="dedit-group__legend">When Home shows it to Year 1</legend>
        <div className="dedit-grid">
          <Select
            label="Term starts in"
            value={guide.termStart.month}
            onChange={(e) => set({ termStart: { ...guide.termStart, month: Number(e.target.value) } })}
            options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))}
            error={err('startHere.termStart.month')}
          />
          <TextField
            label="On day"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={guide.termStart.day}
            onChange={(e) => set({ termStart: { ...guide.termStart, day: Number(e.target.value) } })}
            error={err('startHere.termStart.day')}
            required
          />
          <TextField
            label="For how many weeks"
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            value={guide.weeks}
            onChange={(e) => set({ weeks: Number(e.target.value) })}
            error={err('startHere.weeks')}
            required
          />
        </div>
      </fieldset>
      <StepsField part="startHere" steps={guide.steps} saved={saved.steps} onChange={(steps) => set({ steps })} err={err} fields={fields} />
      <TextField label="Once every step is ticked" value={guide.done} onChange={(e) => set({ done: e.target.value })} error={err('startHere.done')} maxLength={300} required />
      <fieldset className="dedit-group">
        <legend className="dedit-group__legend">Sites told apart</legend>
        <div className="dedit-grid">
          <TextField label="Heading" value={guide.placesTitle} onChange={(e) => set({ placesTitle: e.target.value })} error={err('startHere.placesTitle')} maxLength={60} required />
          <TextField label="Under the heading" value={guide.placesIntro} onChange={(e) => set({ placesIntro: e.target.value })} error={err('startHere.placesIntro')} maxLength={300} required />
        </div>
        <PlacesField places={guide.places} onChange={(places) => set({ places })} err={err} />
      </fieldset>
    </>
  );
}

function ResultsDayFields({ guide, saved, onChange, err, fields }: PartProps<ResultsDay>) {
  const set = (patch: Partial<ResultsDay>) => onChange({ ...guide, ...patch });
  return (
    <>
      <div className="dedit-grid">
        <TextField label="Title" value={guide.title} onChange={(e) => set({ title: e.target.value })} error={err('resultsDay.title')} maxLength={60} required />
        <TextArea className="dedit-grid__wide" label="Under the title" value={guide.intro} onChange={(e) => set({ intro: e.target.value })} error={err('resultsDay.intro')} rows={2} maxLength={300} required />
      </div>
      <fieldset className="dedit-group">
        <legend className="dedit-group__legend">When Home shows it</legend>
        <div className="dedit-grid">
          <TextField
            label="Results dates on the calendar"
            hint="An event whose title contains these words, like UoL results released."
            value={guide.eventTitle}
            onChange={(e) => set({ eventTitle: e.target.value })}
            error={err('resultsDay.eventTitle')}
            maxLength={60}
            required
          />
          <TextField
            label="For how many weeks after"
            type="number"
            inputMode="numeric"
            min={1}
            max={12}
            value={guide.weeks}
            onChange={(e) => set({ weeks: Number(e.target.value) })}
            error={err('resultsDay.weeks')}
            required
          />
        </div>
      </fieldset>
      <StepsField part="resultsDay" steps={guide.steps} saved={saved.steps} onChange={(steps) => set({ steps })} err={err} fields={fields} />
      <TextField
        label="Above the University’s own pages"
        hint="The pages are Site settings’ regulations and results links."
        value={guide.sourcesIntro}
        onChange={(e) => set({ sourcesIntro: e.target.value })}
        error={err('resultsDay.sourcesIntro')}
        maxLength={300}
        required
      />
    </>
  );
}

function ElectivesFields({ guide, onChange, err }: { guide: Electives; onChange: (next: Electives) => void; err: Err }) {
  const set = (patch: Partial<Electives>) => onChange({ ...guide, ...patch });
  return (
    <div className="dedit-grid">
      <TextField className="dedit-grid__wide" label="Title" value={guide.title} onChange={(e) => set({ title: e.target.value })} error={err('electives.title')} maxLength={60} required />
      <TextField
        label="How many a student takes"
        type="number"
        inputMode="numeric"
        min={1}
        max={6}
        value={guide.pick}
        onChange={(e) => set({ pick: Number(e.target.value) })}
        error={err('electives.pick')}
        required
      />
      <TextArea className="dedit-grid__wide" label="Under the title" value={guide.intro} onChange={(e) => set({ intro: e.target.value })} error={err('electives.intro')} rows={2} maxLength={300} required />
      <TextArea className="dedit-grid__wide" label="Note" hint="That the guide isn’t advice from BIBF or the University." value={guide.disclaimer} onChange={(e) => set({ disclaimer: e.target.value })} error={err('electives.disclaimer')} rows={2} maxLength={300} required />
    </div>
  );
}

// ── steps, links and places ──────────────────────────────────────────────────────────────────

function StepsField({ part, steps, saved, onChange, err, fields }: { part: 'startHere' | 'resultsDay'; steps: GuideStep[]; saved: GuideStep[]; onChange: (next: GuideStep[]) => void; err: Err; fields: Record<string, string> }) {
  const savedIds = useMemo(() => new Set(saved.map((s) => s.id)), [saved]);
  return (
    <fieldset className="dedit-group">
      <legend className="dedit-group__legend">Steps</legend>
      <p className="dedit__note">Each step is a tick on the checklist. Ticks stay in each student’s browser, so a step keeps them when you reword it.</p>
      <ListEditor<GuideStep>
        items={steps}
        noun="step"
        titleOf={(s) => s.title}
        metaOf={(s) => (s.links.length ? `${s.links.length} ${s.links.length === 1 ? 'link' : 'links'}` : 'No links')}
        savedIds={savedIds}
        onChange={onChange}
        make={() => ({ id: newItemId('step', steps.map((s) => s.id)), title: '', hint: '', links: [] })}
        hasError={(i) => hasErrorUnder(fields, `${part}.steps.${i}`)}
        min={1}
        max={20}
      >
        {(step, i, change) => {
          const path = `${part}.steps.${i}`;
          return (
            <>
              <TextField label="Step" value={step.title} onChange={(e) => change({ title: e.target.value })} error={err(`${path}.title`)} maxLength={160} required />
              <TextArea label="What it means" hint="On the guide’s page, under the step." value={step.hint} onChange={(e) => change({ hint: e.target.value })} error={err(`${path}.hint`)} rows={3} maxLength={600} />
              <fieldset className="dedit-group">
                <legend className="dedit-group__legend">Links</legend>
                <RowsEditor<GuideLink> items={step.links} noun="link" max={4} onChange={(links) => change({ links })} make={() => linkOfKind('site', null)}>
                  {(link, j, setLink) => <LinkFields link={link} onChange={setLink} path={`${path}.links.${j}`} err={err} />}
                </RowsEditor>
              </fieldset>
            </>
          );
        }}
      </ListEditor>
    </fieldset>
  );
}

function useSavedLinkOptions(): { value: SiteLinkKey; label: string }[] {
  const site = useSite().data;
  const keys: SiteLinkKey[] = ['myclass', 'uolPortal', 'regulations', 'results'];
  return keys.map((k) => ({ value: k, label: site ? site.links[k].label : k }));
}

function LinkFields({ link, onChange, path, err }: { link: GuideLink; onChange: (next: GuideLink) => void; path: string; err: Err }) {
  const saved = useSavedLinkOptions();
  return (
    <div className="dedit-grid">
      <Select label="Goes to" value={link.kind} onChange={(e) => onChange(linkOfKind(e.target.value as LinkKind, link))} options={LINK_KINDS} />
      {link.kind === 'site' ? (
        <Select label="Link" value={link.link} onChange={(e) => onChange({ ...link, link: e.target.value as SiteLinkKey })} options={saved} hint="Its address is in Site settings." error={err(`${path}.link`)} />
      ) : null}
      {link.kind === 'web' ? <TextField label="Address" hint="An https:// link." value={link.href} onChange={(e) => onChange({ ...link, href: e.target.value.trim() })} error={err(`${path}.href`)} maxLength={2000} inputMode="url" required /> : null}
      {link.kind === 'page' ? (
        <>
          <TextField label="Page of the hub" hint="Starts with /, like /library?type=notes." value={link.to} onChange={(e) => onChange({ ...link, to: e.target.value.trim() })} error={err(`${path}.to`)} maxLength={500} required />
          <Select
            label="Shown"
            value={link.feature ?? ''}
            onChange={(e) => onChange({ ...link, feature: e.target.value ? (e.target.value as NonNullable<typeof link.feature>) : null })}
            options={[{ value: '', label: 'Always' }, ...FEATURE_KEYS.map((f) => ({ value: f, label: `While ${featureName(f)} is on` }))]}
          />
        </>
      ) : null}
      {link.kind === 'date' ? (
        <>
          <TextField label="Calendar title contains" hint="Like UoL application deadline." value={link.title} onChange={(e) => onChange({ ...link, title: e.target.value })} error={err(`${path}.title`)} maxLength={60} required />
          <Select
            label="Type of date"
            value={link.type}
            onChange={(e) => onChange({ ...link, type: e.target.value === 'event' ? 'event' : 'deadline' })}
            options={[
              { value: 'deadline', label: 'A deadline' },
              { value: 'event', label: 'An event' },
            ]}
          />
        </>
      ) : null}
      {link.kind !== 'install' ? (
        <TextField label="Link text" value={link.label} onChange={(e) => onChange({ ...link, label: e.target.value })} error={err(`${path}.label`)} maxLength={60} required />
      ) : (
        <p className="dedit__note gedit-install">Shows “Install the app”, or how to add the hub to an iPhone’s home screen.</p>
      )}
    </div>
  );
}

function PlacesField({ places, onChange, err }: { places: GuidePlace[]; onChange: (next: GuidePlace[]) => void; err: Err }) {
  const saved = useSavedLinkOptions();
  return (
    <RowsEditor<GuidePlace> items={places} noun="site" max={6} onChange={onChange} make={() => ({ name: '', whose: '', what: '', link: null })}>
      {(place, i, setPlace) => (
        <div className="dedit-grid">
          <TextField label="Name" value={place.name} onChange={(e) => setPlace({ ...place, name: e.target.value })} error={err(`startHere.places.${i}.name`)} maxLength={60} required />
          <TextField label="Whose" hint="Like BIBF." value={place.whose} onChange={(e) => setPlace({ ...place, whose: e.target.value })} error={err(`startHere.places.${i}.whose`)} maxLength={60} required />
          <TextField className="dedit-grid__wide" label="What it’s for" value={place.what} onChange={(e) => setPlace({ ...place, what: e.target.value })} error={err(`startHere.places.${i}.what`)} maxLength={300} required />
          <Select
            label="Links to"
            value={place.link ?? ''}
            onChange={(e) => setPlace({ ...place, link: e.target.value ? (e.target.value as SiteLinkKey) : null })}
            options={[{ value: '', label: 'No link' }, ...saved]}
          />
        </div>
      )}
    </RowsEditor>
  );
}
