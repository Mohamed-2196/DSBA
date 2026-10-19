// Manage → Career Navigator (holders of career.edit): every part of the page, edited as one draft and saved together.
// A save someone else made first (career_changed) offers to load theirs. Hidden items stay here and leave the page.
// Every save goes to the activity log with what changed, before and after.
import { ArrowSquareOut, DotsThree, Eye } from '@phosphor-icons/react';
import { useMemo, useState, type ReactNode } from 'react';
import { errorMessage, isApiError } from '../../../api/errors';
import type { CareerDoc, CareerEditable } from '../../../api/types';
import { BREAKPOINTS, useMediaQuery, useToast, useUnsavedChanges } from '../../../state';
import { Button, Chip, Drawer, EmptyState, IconButton, Menu, Panel, QueryError, Skeleton, timeAgo } from '../../../ui';
import { docErrors } from '../../../ui/docEditor';
import { CareerBody } from '../CareerPage';
import { useCareerForEditing, useReloadCareer, useSaveCareer } from './api';
import { CAREER_SHAPE, SECTIONS, errorPlace, publicDoc, savedIdsOf, type EditorSection } from './doc';
import { EditorContext, keepRowKey, openKey, rowKeyOf, type EditorState, type RowKeys } from './state';
import { EmployersSection } from './sections/Employers';
import {
  CertsSection,
  ChecklistSection,
  FeaturedSection,
  FurtherStudySection,
  PageTextSection,
} from './sections/Others';
import { RolesSection } from './sections/Roles';
import { ElectivesSection, SkillsSection } from './sections/Skills';
import { TracksSection } from './sections/Tracks';
import './Editor.css';

const LABELS: Record<EditorSection, string> = {
  employers: 'Employers',
  tracks: 'Tracks',
  roles: 'Roles',
  skills: 'Skills',
  electives: 'Electives',
  certs: 'Certificates',
  featured: 'Featured',
  checklist: 'Checklist',
  furtherStudy: 'Further study',
  text: 'Page text',
};

const ABOUT: Record<EditorSection, string> = {
  employers:
    'Real employers in Bahrain: what they offer, the tracks they suit, their own page, their logo and their application dates.',
  tracks: 'The filters above the employers, each with its closest modules.',
  roles: 'The jobs in “Build the skills”: what each is, its tools and the skills it needs.',
  skills: 'Which modules teach each skill and how far, and the step to take when they don’t go far enough.',
  electives: 'Which modules a student chooses. The electives guide is built from this, the skills and the roles.',
  certs: 'Certificates worth taking, how heavy they are and the roles they help with.',
  featured: 'One competition beside the page title.',
  checklist: '“Ready to apply?”: what to have before sending an application.',
  furtherStudy: 'The line at the end of the page for students heading to an MSc.',
  text: 'The page’s own words: labels, the line for each year, and the day links were checked.',
};

const BODIES: Record<EditorSection, () => ReactNode> = {
  employers: () => <EmployersSection />,
  tracks: () => <TracksSection />,
  roles: () => <RolesSection />,
  skills: () => <SkillsSection />,
  electives: () => <ElectivesSection />,
  certs: () => <CertsSection />,
  featured: () => <FeaturedSection />,
  checklist: () => <ChecklistSection />,
  furtherStudy: () => <FurtherStudySection />,
  text: () => <PageTextSection />,
};

/** How many items a section holds, for its chip (null: not a list). */
function countOf(doc: CareerDoc, section: EditorSection): number | null {
  switch (section) {
    case 'employers':
      return doc.employers.length;
    case 'tracks':
      return doc.tracks.length;
    case 'roles':
      return doc.roles.length;
    case 'skills':
      return Object.keys(doc.skills).length;
    case 'electives':
      return Object.values(doc.chosen).filter((c) => c === 'elective').length;
    case 'certs':
      return doc.certs.length;
    case 'checklist':
      return doc.checklist.length;
    default:
      return null;
  }
}

/** The document as the editor has it: one with content. */
type Loaded = CareerEditable & { data: CareerDoc };
const hasContent = (e: CareerEditable): e is Loaded => e.data !== null;

export function CareerEditor() {
  const query = useCareerForEditing();
  // Once loaded, the editor keeps its own copy: a refetch in the background never replaces the draft.
  if (query.data) {
    if (hasContent(query.data)) return <Editor first={query.data} />;
    return (
      <Panel padding="none">
        <EmptyState
          size="sm"
          title="Career Navigator has no content yet"
          body="Its starting content loads when the hub starts. Ask whoever runs the server to load it."
        />
      </Panel>
    );
  }
  if (query.isError)
    return (
      <QueryError
        error={query.error}
        title="Career Navigator didn’t load"
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
        size="sm"
      />
    );
  return (
    <Panel padding="md">
      <Skeleton lines={8} />
    </Panel>
  );
}

type Problem = { kind: 'changed' } | { kind: 'other'; messages: string[] };

function Editor({ first }: { first: Loaded }) {
  // The version the draft is edited from: the one first loaded, then each one a save returns or "Load it again" loads.
  const [loaded, setLoaded] = useState(first);
  const saved = loaded.data;
  const [doc, setDoc] = useState<CareerDoc>(saved);
  const [section, setSection] = useState<EditorSection>('employers');
  const [open, setOpen] = useState<string | null>(null);
  const [rowKeys, setRowKeys] = useState<RowKeys>({});
  const [fields, setFields] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<Problem | null>(null);
  const [reloadFailed, setReloadFailed] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const save = useSaveCareer();
  const reload = useReloadCareer();
  const { push: toast } = useToast();
  const dirty = useMemo(() => JSON.stringify(doc) !== JSON.stringify(saved), [doc, saved]);
  useUnsavedChanges(dirty, 'Career Navigator');
  // On a phone the page and the preview wait in a menu, so the first field comes sooner.
  const phone = useMediaQuery(BREAKPOINTS.mobile);

  // A new version starts a new draft.
  const start = (next: CareerEditable) => {
    if (!hasContent(next)) return;
    setLoaded(next);
    setDoc(next.data);
    setFields({});
    setProblem(null);
    setRowKeys({});
  };
  const loadAgain = () => {
    setReloadFailed(false);
    reload().then(start, () => setReloadFailed(true));
  };

  const state: EditorState = useMemo(
    () => ({
      doc,
      saved,
      update: (change) => setDoc((d) => change(d)),
      err: (path) => fields[path],
      open,
      setOpen,
      rowKey: (section, id) => rowKeyOf(rowKeys, section, id),
      keepRow: (section, id, from) => setRowKeys((keys) => keepRowKey(keys, section, id, from)),
    }),
    [doc, saved, fields, open, rowKeys],
  );

  const submit = () => {
    setProblem(null);
    save.mutate(
      { version: loaded.version, data: doc },
      {
        onSuccess: (out) => {
          start(out);
          toast({ title: 'Saved. Students see the changes now.', tone: 'success' });
        },
        onError: (e) => {
          if (isApiError(e) && e.code === 'career_changed') return setProblem({ kind: 'changed' });
          const found = docErrors(isApiError(e) ? e.fields : {}, CAREER_SHAPE);
          setFields(found.fields);
          const marked = Object.keys(found.fields).length
            ? ['Some fields need a look before saving. They’re marked below.']
            : [];
          const messages = [...found.general, ...marked];
          setProblem({ kind: 'other', messages: messages.length ? messages : [errorMessage(e)] });
          const place = errorPlace(found.fields);
          if (place) {
            setSection(place.section);
            // A list's item is named by its index, a skill by its id.
            const id =
              place.section === 'skills' || place.item === null
                ? place.item
                : (savedIdsOf(doc, place.section)[Number(place.item)] ?? null);
            if (id) setOpen(openKey(place.section, id));
          }
        },
      },
    );
  };

  const savedBy = loaded.updatedBy?.displayName;
  return (
    <EditorContext.Provider value={state}>
      <div className="cedit">
        <div className="cedit__head">
          <div className="cedit__intro">
            <p className="cedit__note">
              {loaded.updatedAt ? `Saved ${timeAgo(loaded.updatedAt)}${savedBy ? ` by ${savedBy}` : ''}. ` : ''}
              {dirty ? 'You have changes that aren’t saved.' : 'No unsaved changes.'}
            </p>
          </div>
          <div className="cedit__actions">
            {phone ? null : (
              <>
                <Button variant="ghost" to="/career" target="_blank" rel="noopener" trailingIcon={ArrowSquareOut}>
                  Open the page<span className="visually-hidden"> (opens in a new tab)</span>
                </Button>
                <Button variant="secondary" leadingIcon={Eye} onClick={() => setPreviewing(true)}>
                  Preview
                </Button>
              </>
            )}
            <Button
              variant="secondary"
              disabled={!dirty || save.isPending}
              onClick={() => {
                setDoc(saved);
                setFields({});
                setProblem(null);
              }}
            >
              Undo changes
            </Button>
            <Button onClick={submit} loading={save.isPending} disabled={!dirty}>
              Save
            </Button>
            {phone ? (
              <Menu
                label="More for Career Navigator"
                align="end"
                items={[
                  { id: 'page', label: 'Open the page', icon: ArrowSquareOut, href: '/career' },
                  { id: 'preview', label: 'Preview', icon: Eye, onSelect: () => setPreviewing(true) },
                ]}
                trigger={<IconButton label="More" icon={DotsThree} variant="secondary" />}
              />
            ) : null}
          </div>
        </div>

        {problem ? (
          <div className="cedit__banner" role="alert">
            {problem.kind === 'changed' ? (
              <>
                <p>
                  Someone else saved Career Navigator while you were editing. Load their version, then make your changes
                  again.
                </p>
                {reloadFailed ? <p>Their version didn’t load. Check your connection, then try again.</p> : null}
                <Button size="sm" onClick={loadAgain}>
                  Load it again
                </Button>
              </>
            ) : (
              problem.messages.map((m) => <p key={m}>{m}</p>)
            )}
          </div>
        ) : null}

        <div className="cedit__parts">
          <nav className="cedit__nav" aria-label="Parts of Career Navigator">
            {SECTIONS.map((s) => {
              const n = countOf(doc, s);
              const hasError = Object.keys(fields).some((k) => errorPlace({ [k]: '' })?.section === s);
              return (
                <Chip
                  key={s}
                  selected={s === section}
                  onChange={() => setSection(s)}
                  count={n}
                  className={hasError ? 'cedit__nav-error' : undefined}
                >
                  {LABELS[s]}
                </Chip>
              );
            })}
          </nav>
          <p className="cedit__note">{ABOUT[section]}</p>
        </div>

        {/* The chip names the part: no heading repeats it. */}
        <Panel as="section" padding="md" className="cedit__panel" aria-label={LABELS[section]}>
          {BODIES[section]()}
        </Panel>

        <div className="cedit__foot">
          <p className="cedit__note">Saving changes the page for everyone at once, and goes to the activity log.</p>
          <Button onClick={submit} loading={save.isPending} disabled={!dirty}>
            Save
          </Button>
        </div>
      </div>

      <Drawer
        open={previewing}
        onClose={() => setPreviewing(false)}
        title="Preview"
        description="Career Navigator with your changes, as students will see it once you save."
        width="min(1280px, 100vw)"
        bodyClassName="cedit-page-preview"
      >
        {previewing ? <CareerBody data={publicDoc(doc)} /> : null}
      </Drawer>
    </EditorContext.Provider>
  );
}
