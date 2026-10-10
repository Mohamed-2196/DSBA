import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowCounterClockwise, CaretDown, Flask, LockSimple } from '@phosphor-icons/react';
import { useAuth } from '../../auth';
import { BREAKPOINTS, useLocalStorage, useMediaQuery, useQueryParam, useToast } from '../../state';
import { Button, cx, Menu, Page, PageHeader, PageSection, SectionHeader } from '../../ui';
import { CLASS_NAME, CLASS_SHORT } from './bands';
import { classify, normalizeGrades, type BandId, type ChoiceSlot, type Classification, type Picks } from './classify';
import { EMPTY_RECORD, EXAMPLES, type GradesRecord } from './examples';
import { MarksSheet } from './MarksSheet';
import { ResultHero } from './ResultHero';
import { blankIndexes, improvementPlan } from './whatif';
import './GradesPage.css';

// Marks live only in this browser's localStorage: the calculator never sends them to the server. The key starts
// with 'hub.mine.', so signing out clears them (shared lab computers: security review, finding 23).
const STORAGE_KEY = 'hub.mine.grades';
const LEGACY_KEY = 'hub.grades';

// Marks saved before the move keep working: they go to the new key once.
try {
  const old = window.localStorage.getItem(LEGACY_KEY);
  if (old !== null) {
    if (window.localStorage.getItem(STORAGE_KEY) === null) window.localStorage.setItem(STORAGE_KEY, old);
    window.localStorage.removeItem(LEGACY_KEY);
  }
} catch {
  /* storage unavailable */
}
const SLOTS: readonly ChoiceSlot[] = ['year2Option', 'elective1', 'elective2'];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Whatever is stored, as a record of 13 mark strings and the known picks (stored JSON is never trusted). */
function readRecord(raw: unknown): GradesRecord {
  if (!isObject(raw)) return { marks: normalizeGrades(null), picks: {} };
  const picks: Picks = {};
  const storedPicks = raw.picks;
  if (isObject(storedPicks)) {
    for (const slot of SLOTS) {
      const v = storedPicks[slot];
      if (typeof v === 'string' && v) picks[slot] = v;
    }
  }
  return { marks: normalizeGrades(raw.marks), picks };
}

const hasMarks = (rec: GradesRecord): boolean => rec.marks.some((m) => m !== '');

export default function GradesPage() {
  const [stored, setRecord] = useLocalStorage<unknown>(STORAGE_KEY, EMPTY_RECORD);
  const record = useMemo(() => readRecord(stored), [stored]);
  const { push } = useToast();
  const { status } = useAuth();
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  const [exampleParam, setExampleParam] = useQueryParam('example');

  const marks = record.marks;
  const picks = record.picks;
  const result = useMemo(() => classify(marks), [marks]);
  const plan = useMemo(() => (blankIndexes(marks).length === 0 && !result.failed && result.kind !== 'first' ? improvementPlan(marks) : null), [marks, result]);
  const aims = useMemo(() => new Map((plan?.changes ?? []).map((c) => [c.index, c.to])), [plan]);

  const recordRef = useRef(record);
  useEffect(() => {
    recordRef.current = record;
  }, [record]);

  const setMark = useCallback(
    (i: number, v: string) =>
      setRecord((prev: unknown) => {
        const rec = readRecord(prev);
        const next = rec.marks.slice();
        next[i] = v;
        return { marks: next, picks: rec.picks };
      }),
    [setRecord],
  );
  const setPick = useCallback(
    (choice: ChoiceSlot, value: string | undefined) =>
      setRecord((prev: unknown) => {
        const rec = readRecord(prev);
        const nextPicks: Picks = { ...rec.picks };
        if (value) nextPicks[choice] = value;
        else delete nextPicks[choice];
        return { marks: rec.marks, picks: nextPicks };
      }),
    [setRecord],
  );

  const replaceWith = useCallback(
    (next: GradesRecord, { title, body }: { title: string; body: string }) => {
      const prev = recordRef.current;
      setRecord(next);
      if (hasMarks(prev)) {
        push({ tone: 'info', title, body, duration: 8000, action: { label: 'Undo', onClick: () => setRecord(prev) } });
      }
    },
    [push, setRecord],
  );

  const loadExample = useCallback(
    (id: string) => {
      const ex = EXAMPLES[id];
      if (!ex) return;
      replaceWith({ marks: [...ex.marks], picks: { ...ex.picks } }, { title: 'Example loaded', body: 'It replaced the marks you had entered.' });
    },
    [replaceWith],
  );

  // ?example=first|upper|resit|partial (shareable demo links) — load once, then drop the param.
  useEffect(() => {
    if (!exampleParam) return;
    loadExample(exampleParam);
    setExampleParam(null, { replace: true });
  }, [exampleParam, loadExample, setExampleParam]);

  const reset = () => {
    const prev = recordRef.current;
    setRecord({ marks: normalizeGrades(null), picks: prev.picks });
    push({ tone: 'info', title: 'Marks cleared', duration: 8000, action: { label: 'Undo', onClick: () => setRecord(prev) } });
  };

  const actions = (
    <div className="grades-actions">
      <Menu
        label="Examples"
        align="end"
        trigger={
          <Button leadingIcon={Flask} trailingIcon={<CaretDown weight="bold" />}>
            Try an example
          </Button>
        }
        items={Object.entries(EXAMPLES).map(([id, ex]) => ({ id, label: ex.label, onSelect: () => loadExample(id) }))}
      />
      <Button variant="ghost" leadingIcon={ArrowCounterClockwise} onClick={reset} disabled={!hasMarks(record)}>
        Reset
      </Button>
    </div>
  );

  return (
    <Page className="grades-page">
      <PageHeader
        title="Grades"
        description="Work out your degree classification from your module marks."
        actions={actions}
        meta={
          <p className="grades-privacy" data-hub="grades-privacy">
            <LockSimple className="grades-privacy__icon" weight="bold" aria-hidden="true" />
            Your marks stay in this browser and are never sent to the Hub’s server.
            {status === 'signed-in' ? ' Signing out clears them from this browser.' : null}
          </p>
        }
      />

      <PageSection aria-label="Your classification" className="grades-sec--hero">
        <ResultHero marks={marks} picks={picks} result={result} />
      </PageSection>

      <PageSection aria-label="Module marks" className="grades-sec--sheet">
        <MarksSheet marks={marks} picks={picks} yearOneAverage={result.yearOneAverage} aims={aims} onMark={setMark} onPick={setPick} />
      </PageSection>

      <PageSection aria-labelledby="grades-how">
        <SectionHeader id="grades-how" title="How the classification works" description="The rules this calculator applies, step by step." />
        <Rules />
      </PageSection>

      {isMobile ? <StickyResult marks={marks} result={result} /> : null}
    </Page>
  );
}

const BAND_ROWS: [BandId, string, string, string][] = [
  ['first', 'First class (1st)', '70–100', '3.7–4.0'],
  ['upper', 'Upper second (2:1)', '60–69', '3.3–3.6'],
  ['lower', 'Lower second (2:2)', '50–59', '2.7–3.2'],
  ['third', 'Third', '40–49', '2.0–2.6'],
  ['fail', 'Fail', '0–39', '–'],
];

function Rules() {
  return (
    <div className="grades-how">
      <div className="grades-how__col">
        <ol className="grades-steps">
          <li>
            <strong>Year 1</strong> is averaged. The average counts as <strong>2</strong> classification marks.
          </li>
          <li>
            Each <strong>Advanced Statistics</strong> module (ST2133, ST2134) counts as <strong>1</strong> mark.
          </li>
          <li>
            Every <strong>other module</strong> counts as <strong>2</strong> marks. That makes 18 classification marks.
          </li>
          <li>
            Any classification mark <strong>under 40</strong> means a resit before the degree can be classified.
          </li>
        </ol>
        <table className="grades-table">
          <caption>Honours classes</caption>
          <thead>
            <tr>
              <th scope="col">Class</th>
              <th scope="col">Criteria</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">First Class Honours</th>
              <td>Ten first-class marks, or eight first-class marks and an average classification mark of at least 65</td>
            </tr>
            <tr>
              <th scope="row">Upper Second Class Honours</th>
              <td>Ten upper second-class marks, or eight upper second-class marks and an average classification mark of at least 56</td>
            </tr>
            <tr>
              <th scope="row">Lower Second Class Honours</th>
              <td>Ten lower second-class marks, or eight lower second-class marks and an average classification mark of at least 47</td>
            </tr>
            <tr>
              <th scope="row">Third Class Honours</th>
              <td>Passed at least 330 credits and attempted 360 credits</td>
            </tr>
          </tbody>
        </table>
        <p className="grades-how__note">
          A mark in a higher band also counts for the classes below it. For Third Class Honours this calculator
          checks for ten classification marks of 40 or more.
        </p>
      </div>
      <div className="grades-how__col">
        <table className="grades-table grades-table--bands">
          <caption>Mark bands</caption>
          <thead>
            <tr>
              <th scope="col">Band</th>
              <th scope="col">Marks</th>
              <th scope="col">US GPA, approx.</th>
            </tr>
          </thead>
          <tbody>
            {BAND_ROWS.map(([id, label, range, gpa]) => (
              <tr key={id}>
                <th scope="row">
                  <span className={cx('grades-swatch', `grades-cell--${id}`)} aria-hidden="true" />
                  {label}
                </th>
                <td>{range}</td>
                <td>{gpa}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="grades-how__note">
          A study aid built by students, not an official calculation: your classification comes from the
          University of London.
        </p>
      </div>
    </div>
  );
}

/** Mobile: the live result stays in view while you type further down the form. */
function StickyResult({ marks, result }: { marks: string[]; result: Classification }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const hero = document.querySelector('[data-hub="grades-result"]');
    if (!hero || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setVisible(entry ? !entry.isIntersecting : false), { threshold: 0 });
    io.observe(hero);
    return () => io.disconnect();
  }, []);
  const blanks = blankIndexes(marks).length;
  if (!visible || blanks === 13) return null;
  const kind = blanks ? null : result.failed ? 'resit' : result.kind;
  return (
    <button
      type="button"
      className="grades-sticky"
      onClick={() => document.querySelector('[data-hub="grades-result"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
    >
      <span className="grades-sticky__big">{kind ? CLASS_SHORT[kind] : `${13 - blanks}/13`}</span>
      <span className="grades-sticky__text">
        {kind ? CLASS_NAME[kind] : `${blanks} marks to go`}
        {kind && kind !== 'resit' ? <span className="grades-sticky__avg">Average {result.average.toFixed(2)}</span> : null}
      </span>
      <span className="visually-hidden">Show the result</span>
    </button>
  );
}
