import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowCounterClockwise, CaretDown, Flask } from '@phosphor-icons/react';
import { BREAKPOINTS, useLocalStorage, useMediaQuery, useQueryParam, useToast } from '../../state';
import { Button, cx, Menu, Page, PageHeader, PageSection, SectionHeader } from '../../ui';
import { CLASS_NAME, CLASS_SHORT } from './bands';
import { classify, normalizeGrades } from './classify';
import { EMPTY_RECORD, EXAMPLES } from './examples';
import { MarksSheet } from './MarksSheet';
import { ResultHero } from './ResultHero';
import { blankIndexes, improvementPlan } from './whatif';
import './GradesPage.css';

const STORAGE_KEY = 'hub.grades';
const hasMarks = (rec) => Array.isArray(rec?.marks) && rec.marks.some((m) => m !== '' && m != null);

export default function GradesPage() {
  const [record, setRecord] = useLocalStorage(STORAGE_KEY, EMPTY_RECORD);
  const { push } = useToast();
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  const [exampleParam, setExampleParam] = useQueryParam('example', null);

  const marks = useMemo(() => normalizeGrades(record?.marks), [record]);
  const picks = useMemo(() => record?.picks || {}, [record]);
  const result = useMemo(() => classify(marks), [marks]);
  const plan = useMemo(
    () => (blankIndexes(marks).length === 0 && !result.failed && result.kind !== 'first' ? improvementPlan(marks) : null),
    [marks, result],
  );
  const aims = useMemo(() => new Map((plan?.changes || []).map((c) => [c.index, c.to])), [plan]);

  const recordRef = useRef(record);
  useEffect(() => {
    recordRef.current = record;
  }, [record]);

  const setMark = useCallback(
    (i, v) => setRecord((prev) => {
      const next = normalizeGrades(prev?.marks);
      next[i] = v;
      return { marks: next, picks: prev?.picks || {} };
    }),
    [setRecord],
  );
  const setPick = useCallback(
    (choice, value) => setRecord((prev) => ({ marks: normalizeGrades(prev?.marks), picks: { ...(prev?.picks || {}), [choice]: value } })),
    [setRecord],
  );

  const replaceWith = useCallback(
    (next, { title, body }) => {
      const prev = recordRef.current;
      setRecord(next);
      if (hasMarks(prev)) {
        push({ tone: 'info', title, body, duration: 8000, action: { label: 'Undo', onClick: () => setRecord(prev) } });
      }
    },
    [push, setRecord],
  );

  const loadExample = useCallback(
    (id) => {
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
    setRecord({ marks: Array(13).fill(''), picks: prev?.picks || {} });
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
        description="Work out your degree classification from your module marks. Your marks stay in this browser."
        actions={actions}
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
            {[
              ['first', 'First class (1st)', '70–100', '3.7–4.0'],
              ['upper', 'Upper second (2:1)', '60–69', '3.3–3.6'],
              ['lower', 'Lower second (2:2)', '50–59', '2.7–3.2'],
              ['third', 'Third', '40–49', '2.0–2.6'],
              ['fail', 'Fail', '0–39', '–'],
            ].map(([id, label, range, gpa]) => (
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
function StickyResult({ marks, result }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const hero = document.querySelector('[data-hub="grades-result"]');
    if (!hero || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), { threshold: 0 });
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
