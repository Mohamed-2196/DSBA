// Manage → Career Navigator (holders of career.edit): every part of the page, edited as one draft and saved together.
// A save someone else made first (career_changed) offers to load theirs. Hidden items stay here and leave the page.
// Every save goes to the activity log with what changed, before and after.
import { ArrowSquareOut, Eye } from '@phosphor-icons/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { errorMessage, isApiError } from '../../../api/errors';
import type { CareerDoc, CareerEditable } from '../../../api/types';
import { useToast } from '../../../state';
import { Button, Chip, Drawer, EmptyState, Panel, QueryError, Skeleton, timeAgo } from '../../../ui';
import { CareerBody } from '../CareerPage';
import { useCareerForEditing, useReloadCareer, useSaveCareer } from './api';
import { SECTIONS, errorPlace, generalErrors, publicDoc, type EditorSection } from './doc';
import { EditorContext, openKey, type EditorState } from './state';
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

export function CareerEditor() {
  const query = useCareerForEditing();
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
  if (query.isPending) {
    return (
      <Panel padding="md">
        <Skeleton lines={8} />
      </Panel>
    );
  }
  if (!query.data.data) {
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
  // A new version (saved here, or loaded again) starts a new draft.
  return <Editor key={query.data.version} loaded={query.data} doc={query.data.data} />;
}

type Problem = { kind: 'changed' } | { kind: 'other'; messages: string[] };

function Editor({ loaded, doc: saved }: { loaded: CareerEditable; doc: CareerDoc }) {
  const [doc, setDoc] = useState<CareerDoc>(saved);
  const [section, setSection] = useState<EditorSection>('employers');
  const [open, setOpen] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<Problem | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const save = useSaveCareer();
  const reload = useReloadCareer();
  const { push: toast } = useToast();
  const dirty = useMemo(() => JSON.stringify(doc) !== JSON.stringify(saved), [doc, saved]);

  // Leaving the page with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const state: EditorState = useMemo(
    () => ({
      doc,
      saved,
      update: (change) => setDoc((d) => change(d)),
      err: (path) => fields[`data.${path}`],
      open,
      setOpen,
    }),
    [doc, saved, fields, open],
  );

  const submit = () => {
    setProblem(null);
    save.mutate(
      { version: loaded.version, data: doc },
      {
        onSuccess: () => {
          setFields({});
          toast({ title: 'Saved. Students see the changes now.', tone: 'success' });
        },
        onError: (e) => {
          if (isApiError(e) && e.code === 'career_changed') return setProblem({ kind: 'changed' });
          const found = isApiError(e) ? e.fields : {};
          setFields(found);
          const general = generalErrors(found);
          setProblem({
            kind: 'other',
            messages: general.length
              ? general
              : [
                  Object.keys(found).length
                    ? 'Some fields need a look before saving. They’re marked below.'
                    : errorMessage(e),
                ],
          });
          const place = errorPlace(found);
          if (place) {
            setSection(place.section);
            const list = place.section === 'skills' ? null : (doc as unknown as Record<string, unknown>)[place.section];
            const item =
              Array.isArray(list) && place.item !== null
                ? (list[Number(place.item)] as { id?: string } | undefined)
                : undefined;
            const id = place.section === 'skills' ? place.item : (item?.id ?? null);
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
            <Button variant="ghost" to="/career" trailingIcon={ArrowSquareOut}>
              Open the page
            </Button>
            <Button variant="secondary" leadingIcon={Eye} onClick={() => setPreviewing(true)}>
              Preview
            </Button>
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
                <Button size="sm" onClick={() => void reload()}>
                  Load it again
                </Button>
              </>
            ) : (
              problem.messages.map((m) => <p key={m}>{m}</p>)
            )}
          </div>
        ) : null}

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

        <Panel as="section" padding="md" className="cedit__panel" aria-labelledby="cedit-section-title">
          <div className="cedit__section-head">
            <h4 id="cedit-section-title" className="cedit__section">
              {LABELS[section]}
            </h4>
            <p className="cedit__note">{ABOUT[section]}</p>
          </div>
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
