import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../auth';
import { BREAKPOINTS, useLocalStorage, useMediaQuery, useQueryParam, useToast } from '../../state';
import { useModules } from '../../state/modules';
import {
  Button,
  cx,
  glyph,
  Icon,
  Menu,
  Page,
  PageHeader,
  PageSection,
  QueryError,
  SectionHeader,
  Skeleton,
} from '../../ui';
import { httpsHref, useSite } from '../site/public';
import { useGradeRules } from './api';
import { bandsOf, CLASS_NAME, CLASS_SHORT } from './bands';
import { classify, type ChoiceSlot, type Classification, type Picks, type Rules } from './classify';
import { emptyRecord, EXAMPLES, exampleRecord } from './examples';
import { usePapers } from '../papers/public';
import { MarksSheet } from './MarksSheet';
import { EMPTY_STORED, readRecord, STORAGE_KEY, storedRecord, type GradesRecord } from './record';
import { countsSummary, listed } from './rulesText';
import { subjectDisplay, withPaperPicks } from './subjects';
import { ResultHero } from './ResultHero';
import { blankIndexes, improvementPlan } from './whatif';
import './GradesPage.css';
import { scrollMotion } from '../../lib/motion';

const hasMarks = (rec: GradesRecord): boolean => rec.marks.some((m) => m !== '');

const TITLE = 'Grades';
const DESCRIPTION = 'Work out your degree classification from your module marks.';

/** The calculator waits for its rules (GET /grades/rules): admins keep them in Manage → Grades calculator. */
export default function GradesPage() {
  const rules = useGradeRules();
  if (rules.data) return <Calculator rules={rules.data} />;
  return (
    <Page className="grades-page">
      <PageHeader section="tools" title={TITLE} description={DESCRIPTION} />
      {rules.isError ? (
        <QueryError
          error={rules.error}
          title="The calculator’s rules didn’t load"
          onRetry={() => void rules.refetch()}
          retrying={rules.isFetching}
        />
      ) : (
        <div aria-busy="true">
          <span className="visually-hidden">Loading the grades calculator</span>
          <Skeleton height={260} radius={16} />
        </div>
      )}
    </Page>
  );
}

function Calculator({ rules }: { rules: Rules }) {
  const [stored, setStored] = useLocalStorage<unknown>(STORAGE_KEY, EMPTY_STORED);
  const record = useMemo(() => readRecord(stored, rules), [stored, rules]);
  const { push } = useToast();
  const { status } = useAuth();
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  const [exampleParam, setExampleParam] = useQueryParam('example');

  const marks = record.marks;
  const { picks: paperPicks } = usePapers();
  const picks = useMemo(() => withPaperPicks(record.picks, paperPicks, rules), [record.picks, paperPicks, rules]);
  const result = useMemo(() => classify(marks, rules), [marks, rules]);
  const plan = useMemo(
    () =>
      blankIndexes(marks, rules).length === 0 && !result.failed && result.kind !== 'first'
        ? improvementPlan(marks, rules)
        : null,
    [marks, result, rules],
  );
  const aims = useMemo(() => new Map((plan?.changes ?? []).map((c) => [c.index, c.to])), [plan]);

  const storedRef = useRef(stored);
  useEffect(() => {
    storedRef.current = stored;
  }, [stored]);

  /** Changes the record as stored now (another tab may have written since this one last read it). */
  const change = useCallback(
    (edit: (rec: GradesRecord) => GradesRecord) =>
      setStored((prev: unknown) => storedRecord(edit(readRecord(prev, rules)), rules, prev)),
    [setStored, rules],
  );
  const setMark = useCallback(
    (i: number, v: string) =>
      change((rec) => {
        const next = rec.marks.slice();
        next[i] = v;
        return { marks: next, picks: rec.picks };
      }),
    [change],
  );
  const setPick = useCallback(
    (choice: ChoiceSlot, value: string | undefined) =>
      change((rec) => {
        const nextPicks: Picks = { ...rec.picks };
        if (value) nextPicks[choice] = value;
        else delete nextPicks[choice];
        return { marks: rec.marks, picks: nextPicks };
      }),
    [change],
  );

  const replaceWith = useCallback(
    (next: GradesRecord, { title, body }: { title: string; body: string }) => {
      const prev = storedRef.current;
      setStored(storedRecord(next, rules));
      if (hasMarks(readRecord(prev, rules))) {
        push({ tone: 'info', title, body, duration: 8000, action: { label: 'Undo', onClick: () => setStored(prev) } });
      }
    },
    [push, setStored, rules],
  );

  const loadExample = useCallback(
    (id: string) => {
      const ex = exampleRecord(id, rules);
      if (!ex) return;
      replaceWith(ex, { title: 'Example loaded', body: 'It replaced the marks you had entered.' });
    },
    [replaceWith, rules],
  );

  // ?example=first|upper|resit|partial (shareable demo links) — load once, then drop the param.
  useEffect(() => {
    if (!exampleParam) return;
    loadExample(exampleParam);
    setExampleParam(null, { replace: true });
  }, [exampleParam, loadExample, setExampleParam]);

  const reset = () => {
    const prev = storedRef.current;
    setStored(storedRecord({ ...emptyRecord(rules), picks: record.picks }, rules));
    push({
      tone: 'info',
      title: 'Marks cleared',
      duration: 8000,
      action: { label: 'Undo', onClick: () => setStored(prev) },
    });
  };

  const actions = (
    <div className="grades-actions">
      <Menu
        label="Examples"
        align="end"
        trigger={<Button trailingIcon={<Icon glyph={glyph.chevronDown} />}>Try an example</Button>}
        items={Object.entries(EXAMPLES).map(([id, ex]) => ({ id, label: ex.label, onSelect: () => loadExample(id) }))}
      />
      <Button variant="ghost" leadingIcon={<Icon glyph={glyph.undo} />} onClick={reset} disabled={!hasMarks(record)}>
        Reset
      </Button>
    </div>
  );

  return (
    <Page className="grades-page">
      <PageHeader
        section="tools"
        title={TITLE}
        description={DESCRIPTION}
        actions={actions}
        meta={
          <p className="grades-privacy" data-hub="grades-privacy">
            <Icon glyph={glyph.lock} size={16} className="grades-privacy__icon" />
            Your marks stay in this browser and are never sent to the Hub’s server.
            {status === 'signed-in' ? ' Signing out clears them from this browser.' : null}
          </p>
        }
      />

      <PageSection aria-label="Your classification" className="grades-sec--hero">
        <ResultHero marks={marks} picks={picks} result={result} rules={rules} />
      </PageSection>

      <PageSection aria-label="Module marks" className="grades-sec--sheet">
        <MarksSheet
          marks={marks}
          picks={picks}
          groupAverage={result.groupAverage}
          aims={aims}
          onMark={setMark}
          onPick={setPick}
          rules={rules}
        />
      </PageSection>

      <PageSection aria-labelledby="grades-how">
        <SectionHeader
          id="grades-how"
          title="How the classification works"
          description="The rules this calculator applies, step by step."
        />
        <RulesExplained rules={rules} />
      </PageSection>

      {isMobile ? <StickyResult marks={marks} result={result} rules={rules} /> : null}
    </Page>
  );
}

/** Where the rules come from: Site settings' note on the calculator and its link to the programme regulations. */
function SourceNote({ rules }: { rules: Rules }) {
  const site = useSite().data;
  if (!site) return null;
  const regulations = httpsHref(site.links.regulations.url);
  return (
    <p className="grades-how__note" data-hub="grades-source">
      {site.gradesNote} The rules are in {rules.regulations} of the{' '}
      {regulations ? (
        <a href={regulations} target="_blank" rel="noopener noreferrer">
          {site.links.regulations.label}
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      ) : (
        site.links.regulations.label
      )}
      .
    </p>
  );
}

const CLASS_ROWS: { kind: 'first' | 'upper' | 'lower'; band: string }[] = [
  { kind: 'first', band: 'first-class' },
  { kind: 'upper', band: 'upper second-class' },
  { kind: 'lower', band: 'lower second-class' },
];

/** The rules, in words, from the rules themselves. */
export function RulesExplained({ rules }: { rules: Rules }) {
  const { getModule } = useModules();
  const summary = countsSummary(rules, (s) => {
    const d = subjectDisplay(s, {}, getModule, rules);
    return d.code ?? d.short;
  });
  const pass = rules.bands.third.floor;
  const marks = (n: number) => (n === 1 ? 'mark' : 'marks');
  return (
    <div className="grades-how">
      <div className="grades-how__col">
        <ol className="grades-steps">
          {summary.pooled ? (
            <li>
              <strong>{summary.pooled.label}</strong> is averaged. The average counts as{' '}
              <strong>{summary.pooled.counts}</strong> classification {marks(summary.pooled.counts)}.
            </li>
          ) : null}
          {summary.special.map((s) => (
            <li key={s.counts}>
              <strong>{listed(s.names)}</strong> {s.names.length === 1 ? 'counts' : 'each count'} as{' '}
              <strong>{s.counts}</strong> {marks(s.counts)}.
            </li>
          ))}
          {summary.rest != null ? (
            <li>
              Every <strong>{summary.special.length || summary.pooled ? 'other module' : 'module'}</strong> counts as{' '}
              <strong>{summary.rest}</strong> {marks(summary.rest)}. That makes {summary.total} classification marks.
            </li>
          ) : null}
          <li>
            Any classification mark <strong>under {pass}</strong> means a resit before the degree can be classified.
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
            {CLASS_ROWS.map(({ kind, band }) => (
              <tr key={kind}>
                <th scope="row">{CLASS_NAME[kind]}</th>
                <td>
                  {rules.needed} {band} marks, or {rules.fewer} {band} marks and an average classification mark of at
                  least {rules.averages[kind]}
                </td>
              </tr>
            ))}
            <tr>
              <th scope="row">{CLASS_NAME.third}</th>
              <td>{rules.thirdRule}</td>
            </tr>
          </tbody>
        </table>
        <p className="grades-how__note">
          A mark in a higher band also counts for the classes below it. For Third Class Honours this calculator checks
          for {rules.needed} classification marks of {pass} or more.
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
            {bandsOf(rules).map((b) => (
              <tr key={b.id}>
                <th scope="row">
                  <span className={cx('grades-swatch', `grades-cell--${b.id}`)} aria-hidden="true" />
                  {b.id === 'first'
                    ? `${b.label} (1st)`
                    : b.id === 'upper' || b.id === 'lower'
                      ? `${b.label} (${b.short})`
                      : b.label}
                </th>
                <td>{b.span}</td>
                <td>{b.gpa}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <SourceNote rules={rules} />
      </div>
    </div>
  );
}

/** Mobile: the live result stays in view while you type further down the form. */
function StickyResult({ marks, result, rules }: { marks: string[]; result: Classification; rules: Rules }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const hero = document.querySelector('[data-hub="grades-result"]');
    if (!hero || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setVisible(entry ? !entry.isIntersecting : false), {
      threshold: 0,
    });
    io.observe(hero);
    return () => io.disconnect();
  }, []);
  const blanks = blankIndexes(marks, rules).length;
  const count = rules.subjects.length;
  if (!visible || blanks === count) return null;
  const kind = blanks ? null : result.failed ? 'resit' : result.kind;
  return (
    <button
      type="button"
      className="grades-sticky"
      onClick={() =>
        document
          .querySelector('[data-hub="grades-result"]')
          ?.scrollIntoView({ behavior: scrollMotion(), block: 'start' })
      }
    >
      <span className="grades-sticky__big">{kind ? CLASS_SHORT[kind] : `${count - blanks}/${count}`}</span>
      <span className="grades-sticky__text">
        {kind ? CLASS_NAME[kind] : `${blanks} marks to go`}
        {kind && kind !== 'resit' ? (
          <span className="grades-sticky__avg">Average {result.average.toFixed(2)}</span>
        ) : null}
      </span>
      <span className="visually-hidden">Show the result</span>
    </button>
  );
}
