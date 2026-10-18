// Manage → Grades calculator (admins): the subjects in the calculator's order and what each counts, the mark bands,
// what each class needs, and the modules a student picks between. Saved together from the version loaded
// (grades_changed when someone else saved first); every save goes to the activity log, before and after. The worked
// example under the form runs the calculator's own classification on an example record with the draft, beside the
// saved rules, so a change shows what it does before it's saved. Students' marks never reach the server.
import { useMemo, useState, type ComponentProps } from 'react';
import { errorMessage, isApiError } from '../../../api/errors';
import type { GradeBand, GradeOption, GradeRules, GradeRulesEditable, GradeSubject } from '../../../api/types';
import { moduleLabel } from '../../../lib/modules';
import { useToast } from '../../../state';
import { useModules } from '../../../state/modules';
import {
  Badge,
  Chip,
  DocFrame,
  ListEditor,
  Panel,
  QueryError,
  Select,
  Skeleton,
  TextField,
  cx,
  docErrors,
  hasErrorUnder,
  newItemId,
  type DocProblem,
} from '../../../ui';
import { useGradeRulesForEditing, useReloadGradeRules, useSaveGradeRules } from '../api';
import { bandsOf, CLASS_NAME } from '../bands';
import { classify, subjectsOf, totalMarks, type ChoiceSlot } from '../classify';
import { EXAMPLES, exampleRecord } from '../examples';
import { countsSentence, countsSummary } from '../rulesText';
import { subjectDisplay } from '../subjects';
import './GradeRulesEditor.css';

type Section = 'subjects' | 'classes' | 'choices';
type Err = (path: string) => string | undefined;

const SECTIONS: { id: Section; label: string; about: string; parts: string[] }[] = [
  {
    id: 'subjects',
    label: 'Subjects',
    about: 'The calculator’s rows, in order, and what each counts in the classification.',
    parts: ['subjects', 'averageCounts'],
  },
  {
    id: 'classes',
    label: 'Bands and classes',
    about: 'Where each band starts, and what each class needs.',
    parts: ['bands', 'needed', 'fewer', 'averages', 'thirdRule', 'regulations'],
  },
  {
    id: 'choices',
    label: 'Choices',
    about: 'The modules a student picks for their Year 2 option and their two electives.',
    parts: ['year2Options', 'electives'],
  },
];

const COUNTS = [
  { value: 'average', label: 'Averaged with the others marked so' },
  { value: '1', label: '1 classification mark' },
  { value: '2', label: '2 classification marks' },
  { value: '3', label: '3 classification marks' },
];
const KINDS: { value: '' | ChoiceSlot; label: string }[] = [
  { value: '', label: 'A module' },
  { value: 'year2Option', label: 'The Year 2 option the student picks' },
  { value: 'elective1', label: 'The first elective the student picks' },
  { value: 'elective2', label: 'The second elective the student picks' },
];
const YEARS = [1, 2, 3].map((y) => ({ value: String(y), label: `Year ${y}` }));
const BAND_KEYS = ['first', 'upper', 'lower', 'third'] as const;

const countsOf = (v: string): GradeSubject['counts'] => (v === '1' ? 1 : v === '2' ? 2 : v === '3' ? 3 : 'average');

type WholeFieldProps = Omit<ComponentProps<typeof TextField>, 'value' | 'onChange' | 'type' | 'min' | 'max'> & {
  value: number;
  min: number;
  max: number;
  onValue: (n: number) => void;
};

/** A whole number from `min` to `max`. It can be cleared and retyped: the rules take each whole number typed (kept in
 *  range), and the field shows the rules' number again when it loses focus. */
function WholeField({ value, min, max, onValue, onBlur, ...rest }: WholeFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <TextField
      {...rest}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft ?? String(value)}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const n = Number(text);
        if (text.trim() !== '' && Number.isInteger(n)) onValue(Math.max(min, Math.min(max, n)));
      }}
      onBlur={(e) => {
        setDraft(null);
        onBlur?.(e);
      }}
    />
  );
}

export function GradeRulesEditor() {
  const query = useGradeRulesForEditing();
  // Once loaded, the editor keeps its own copy: a refetch in the background never replaces the draft.
  if (query.data) return <Editor first={query.data} />;
  if (query.isError)
    return (
      <QueryError
        error={query.error}
        title="The calculator’s rules didn’t load"
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

function Editor({ first }: { first: GradeRulesEditable }) {
  // The version the draft is edited from: the one first loaded, then each one a save returns or "Load it again" loads.
  const [loaded, setLoaded] = useState(first);
  const saved = loaded.data;
  const [rules, setRules] = useState<GradeRules>(saved);
  const [section, setSection] = useState<Section>('subjects');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<DocProblem | null>(null);
  const save = useSaveGradeRules();
  const reload = useReloadGradeRules();
  const { push: toast } = useToast();
  const dirty = useMemo(() => JSON.stringify(rules) !== JSON.stringify(saved), [rules, saved]);
  const savedIds = useMemo(
    () =>
      new Set([
        ...saved.subjects.map((s) => s.id),
        ...saved.year2Options.map((o) => o.id),
        ...saved.electives.map((o) => o.id),
      ]),
    [saved],
  );
  const set = (patch: Partial<GradeRules>) => setRules((r) => ({ ...r, ...patch }));
  const err: Err = (path) => fields[path];
  // A new version (as the API keeps it, so even a save that changed nothing leaves nothing unsaved) starts a new draft.
  const start = (next: GradeRulesEditable) => {
    setLoaded(next);
    setRules(next.data);
    setFields({});
    setProblem(null);
  };

  const submit = () => {
    setProblem(null);
    save.mutate(
      { version: loaded.version, data: rules },
      {
        onSuccess: (out) => {
          start(out);
          toast({ title: 'Saved. The calculator uses the new rules now.', tone: 'success' });
        },
        onError: (e) => {
          if (isApiError(e) && e.code === 'grades_changed')
            return setProblem({ kind: 'changed', what: 'the calculator’s rules' });
          const found = docErrors(isApiError(e) ? e.fields : {}, [
            'subjects',
            'year2Options',
            'electives',
            'bands',
            'averages',
          ]);
          setFields(found.fields);
          const marked = Object.keys(found.fields).length
            ? ['Some fields need a look before saving. They’re marked below.']
            : [];
          const messages = [...found.general, ...marked];
          setProblem({ kind: 'other', messages: messages.length ? messages : [errorMessage(e)] });
          const first = SECTIONS.find((s) => s.parts.some((p) => hasErrorUnder(found.fields, p)));
          if (first) setSection(first.id);
        },
      },
    );
  };

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  return (
    <div className="manage-stack">
      <DocFrame
        title="the calculator’s rules"
        savedAt={loaded.updatedAt}
        savedBy={loaded.updatedBy?.displayName ?? null}
        dirty={dirty}
        saving={save.isPending}
        pageTo="/grades"
        onUndo={() => {
          setRules(saved);
          setFields({});
          setProblem(null);
        }}
        onSave={submit}
        problem={problem}
        onReload={() => reload().then(start)}
        section={{ title: current.label, about: current.about }}
        nav={SECTIONS.map((s) => (
          <Chip
            key={s.id}
            selected={s.id === section}
            onChange={() => setSection(s.id)}
            className={cx(s.parts.some((p) => hasErrorUnder(fields, p)) && 'dedit__nav-error')}
          >
            {s.label}
          </Chip>
        ))}
      >
        {section === 'subjects' ? (
          <SubjectsPart rules={rules} set={set} err={err} fields={fields} savedIds={savedIds} />
        ) : null}
        {section === 'classes' ? <ClassesPart rules={rules} set={set} err={err} /> : null}
        {section === 'choices' ? (
          <ChoicesPart rules={rules} set={set} fields={fields} err={err} savedIds={savedIds} />
        ) : null}
      </DocFrame>
      <WorkedExample draft={rules} saved={saved} />
    </div>
  );
}

function SubjectsPart({
  rules,
  set,
  err,
  fields,
  savedIds,
}: {
  rules: GradeRules;
  set: (p: Partial<GradeRules>) => void;
  err: Err;
  fields: Record<string, string>;
  savedIds: ReadonlySet<string>;
}) {
  const { modules, getModule } = useModules();
  const moduleOptions = useMemo(() => modules.map((m) => ({ value: m.id, label: moduleLabel(m) })), [modules]);
  const averaged = rules.subjects.some((s) => s.counts === 'average');
  return (
    <>
      <p className="dedit__note">{`${countsSentence(countsSummary(rules, (s) => subjectDisplay(s, {}, getModule, rules).code ?? s.name))}`}</p>
      <ListEditor<GradeSubject>
        items={rules.subjects}
        noun="subject"
        titleOf={(s) => (s.moduleId ? (getModule(s.moduleId)?.name ?? s.name) : s.name)}
        metaOf={(s) =>
          `Year ${s.year} · ${s.counts === 'average' ? 'averaged' : `${s.counts} ${s.counts === 1 ? 'mark' : 'marks'}`}${s.choice ? ' · picked by the student' : ''}`
        }
        savedIds={savedIds}
        onChange={(subjects) => set({ subjects })}
        make={() => ({
          id: newItemId(
            'subject',
            rules.subjects.map((s) => s.id),
          ),
          name: '',
          year: 3,
          moduleId: null,
          choice: null,
          counts: 2,
        })}
        hasError={(i) => hasErrorUnder(fields, `subjects.${i}`)}
        min={1}
        max={24}
      >
        {(s, i, change) => (
          <div className="dedit-grid">
            <Select
              label="What it is"
              value={s.choice ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                const choice = v === 'year2Option' || v === 'elective1' || v === 'elective2' ? v : null;
                change({ choice, moduleId: choice ? null : s.moduleId });
              }}
              options={KINDS}
              error={err(`subjects.${i}.choice`)}
            />
            {s.choice ? null : (
              <Select
                label="Module"
                hint="Its unit code and name come from the module."
                value={s.moduleId ?? ''}
                placeholder="No module in the hub"
                onChange={(e) => change({ moduleId: e.target.value || null })}
                options={moduleOptions}
                error={err(`subjects.${i}.moduleId`)}
              />
            )}
            <TextField
              label="Name"
              hint={
                s.choice ? 'Shown until the student picks, like Elective 1.' : 'Shown when it has no module in the hub.'
              }
              value={s.name}
              onChange={(e) => change({ name: e.target.value })}
              error={err(`subjects.${i}.name`)}
              maxLength={80}
              required
            />
            <Select
              label="Year"
              value={String(s.year)}
              onChange={(e) => change({ year: Number(e.target.value) as 1 | 2 | 3 })}
              options={YEARS}
              error={err(`subjects.${i}.year`)}
            />
            <Select
              className="dedit-grid__wide"
              label="It counts as"
              value={String(s.counts)}
              onChange={(e) => change({ counts: countsOf(e.target.value) })}
              options={COUNTS}
              error={err(`subjects.${i}.counts`)}
            />
          </div>
        )}
      </ListEditor>
      {averaged ? (
        <WholeField
          label="The averaged subjects’ average counts as"
          hint="Classification marks, like 2 for Year 1."
          min={1}
          max={6}
          value={rules.averageCounts}
          onValue={(averageCounts) => set({ averageCounts })}
          error={err('averageCounts')}
        />
      ) : null}
    </>
  );
}

function ClassesPart({ rules, set, err }: { rules: GradeRules; set: (p: Partial<GradeRules>) => void; err: Err }) {
  const total = totalMarks(rules);
  const band = (key: (typeof BAND_KEYS)[number], patch: Partial<GradeBand>) =>
    set({ bands: { ...rules.bands, [key]: { ...rules.bands[key], ...patch } } });
  return (
    <>
      <fieldset className="dedit-group">
        <legend className="dedit-group__legend">Where each band starts</legend>
        <div className="dedit-grid">
          {BAND_KEYS.map((key) => {
            const meta = bandsOf(rules).find((b) => b.id === key);
            return (
              <div key={key} className="grades-set__band">
                <WholeField
                  label={`${meta?.label ?? key} from`}
                  min={1}
                  max={100}
                  value={rules.bands[key].floor}
                  onValue={(floor) => band(key, { floor })}
                  error={err(`bands.${key}.floor`)}
                />
                <TextField
                  label="US GPA, approx."
                  value={rules.bands[key].gpa}
                  onChange={(e) => band(key, { gpa: e.target.value })}
                  error={err(`bands.${key}.gpa`)}
                  maxLength={20}
                />
              </div>
            );
          })}
        </div>
        <p className="dedit__note">{`Under ${rules.bands.third.floor} is a fail, and any classification mark there means a resit.`}</p>
      </fieldset>
      <fieldset className="dedit-group">
        <legend className="dedit-group__legend">What a class needs</legend>
        <div className="dedit-grid">
          <WholeField
            label="Marks in its band or better"
            hint={`Of the ${total} classification marks.`}
            min={1}
            max={60}
            value={rules.needed}
            onValue={(needed) => set({ needed })}
            error={err('needed')}
          />
          <WholeField
            label="Or this many, with a high enough average"
            min={1}
            max={60}
            value={rules.fewer}
            onValue={(fewer) => set({ fewer })}
            error={err('fewer')}
          />
          {(['first', 'upper', 'lower'] as const).map((k) => (
            <WholeField
              key={k}
              label={`Average for ${CLASS_NAME[k]}`}
              min={1}
              max={100}
              value={rules.averages[k]}
              onValue={(n) => set({ averages: { ...rules.averages, [k]: n } })}
              error={err(`averages.${k}`)}
            />
          ))}
        </div>
      </fieldset>
      <TextField
        label="Third Class Honours, in the regulations’ words"
        hint={`The calculator checks for ${rules.needed} classification marks of ${rules.bands.third.floor} or more.`}
        value={rules.thirdRule}
        onChange={(e) => set({ thirdRule: e.target.value })}
        error={err('thirdRule')}
        maxLength={200}
        required
      />
      <TextField
        label="Where the rules are"
        hint="Before the link to the programme regulations, like regulations 8.7 and 8.8."
        value={rules.regulations}
        onChange={(e) => set({ regulations: e.target.value })}
        error={err('regulations')}
        maxLength={80}
        required
      />
    </>
  );
}

function ChoicesPart({
  rules,
  set,
  fields,
  err,
  savedIds,
}: {
  rules: GradeRules;
  set: (p: Partial<GradeRules>) => void;
  fields: Record<string, string>;
  err: Err;
  savedIds: ReadonlySet<string>;
}) {
  return (
    <>
      <OptionsList
        title="The Year 2 option"
        list="year2Options"
        options={rules.year2Options}
        onChange={(year2Options) => set({ year2Options })}
        fields={fields}
        err={err}
        savedIds={savedIds}
      />
      <OptionsList
        title="The electives"
        list="electives"
        options={rules.electives}
        onChange={(electives) => set({ electives })}
        fields={fields}
        err={err}
        savedIds={savedIds}
      />
    </>
  );
}

function OptionsList({
  title,
  list,
  options,
  onChange,
  fields,
  err,
  savedIds,
}: {
  title: string;
  list: 'year2Options' | 'electives';
  options: GradeOption[];
  onChange: (next: GradeOption[]) => void;
  fields: Record<string, string>;
  err: Err;
  savedIds: ReadonlySet<string>;
}) {
  const { modules, getModule } = useModules();
  const moduleOptions = useMemo(() => modules.map((m) => ({ value: m.id, label: moduleLabel(m) })), [modules]);
  return (
    <fieldset className="dedit-group">
      <legend className="dedit-group__legend">{title}</legend>
      <ListEditor<GradeOption>
        items={options}
        noun="module"
        titleOf={(o) => (o.moduleId ? (getModule(o.moduleId)?.name ?? o.label ?? o.id) : (o.label ?? ''))}
        metaOf={(o) => (o.moduleId ? (getModule(o.moduleId)?.unitCode ?? '') : 'Not a module in the hub')}
        savedIds={savedIds}
        onChange={onChange}
        make={() => ({
          id: newItemId(
            'option',
            options.map((o) => o.id),
          ),
          moduleId: null,
          label: null,
        })}
        hasError={(i) => hasErrorUnder(fields, `${list}.${i}`)}
        max={list === 'electives' ? 24 : 12}
      >
        {(o, i, change) => (
          <div className="dedit-grid">
            <Select
              label="Module"
              value={o.moduleId ?? ''}
              placeholder="Not a module in the hub"
              onChange={(e) => change({ moduleId: e.target.value || null })}
              options={moduleOptions}
              error={err(`${list}.${i}.moduleId`)}
            />
            {o.moduleId ? null : (
              <TextField
                label="Name"
                hint="For a module the hub has no page for."
                value={o.label ?? ''}
                onChange={(e) => change({ label: e.target.value || null })}
                error={err(`${list}.${i}.label`)}
                maxLength={80}
                required
              />
            )}
          </div>
        )}
      </ListEditor>
    </fieldset>
  );
}

/** An example record classified with the draft, and with the saved rules beside it when they differ. */
function WorkedExample({ draft, saved }: { draft: GradeRules; saved: GradeRules }) {
  const { getModule } = useModules();
  const [example, setExample] = useState('upper');
  const record = exampleRecord(example, draft);
  const before = exampleRecord(example, saved);
  if (!record || !before) return null;
  const now = classify(record.marks, draft);
  const then = classify(before.marks, saved);
  const pass = draft.bands.third.floor;
  const subjects = subjectsOf(draft);
  return (
    <Panel padding="md" className="grades-set__example" aria-labelledby="grades-example-title">
      <div className="grades-set__example-head">
        <h3 id="grades-example-title" className="manage-doc__title">
          Worked example
        </h3>
        <Select
          label="Record"
          value={example}
          onChange={(e) => setExample(e.target.value)}
          options={Object.entries(EXAMPLES).map(([id, ex]) => ({ value: id, label: ex.label }))}
        />
      </div>
      <p className="dedit__note">
        The calculator’s own classification, run on an invented record with your changes. Nothing is saved until you
        save.
      </p>
      <div className="grades-set__table-wrap">
        <table className="grades-set__table">
          <caption className="visually-hidden">Each subject’s mark and what it counts</caption>
          <thead>
            <tr>
              <th scope="col">Subject</th>
              <th scope="col">Mark</th>
              <th scope="col">Counts as</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => {
              const d = subjectDisplay(s, record.picks, getModule, draft);
              const mark = record.marks[s.index] ?? '';
              return (
                <tr key={s.id}>
                  <th scope="row">{d.code ? `${d.code} ${d.short}` : d.name}</th>
                  <td className="u-tabular">{mark || '–'}</td>
                  <td>{s.counts === 'average' ? 'the average' : `${s.counts} ${s.counts === 1 ? 'mark' : 'marks'}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <dl className="grades-set__result">
        {now.groupAverage != null ? (
          <div>
            <dt>Average of the averaged subjects</dt>
            <dd>{`${now.groupAverage.toFixed(2)}, counted ${draft.averageCounts === 1 ? 'once' : draft.averageCounts === 2 ? 'twice' : `${draft.averageCounts} times`}`}</dd>
          </div>
        ) : null}
        <div>
          <dt>Classification marks</dt>
          <dd>{`${now.marks.length}: ${now.breakdown.firstClass} first-class, ${now.breakdown.upperSecondClass} upper second, ${now.breakdown.lowerSecondClass} lower second, ${now.breakdown.thirdClass} third${now.failed ? `, and some under ${pass}` : ''}`}</dd>
        </div>
        <div>
          <dt>Average classification mark</dt>
          <dd>{now.average.toFixed(2)}</dd>
        </div>
        <div>
          <dt>The calculator gives</dt>
          <dd>
            <strong>{now.label}</strong>
            {then.kind !== now.kind ? (
              <Badge tone="highlight" size="sm" className="grades-set__changed">
                {`Saved rules: ${then.label}`}
              </Badge>
            ) : null}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
