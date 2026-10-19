// Manage → Mini Noora (admins): her instructions and the programme facts her AI reads first, and her script: what
// she says without her AI, the questions she offers on each page and the cards of her full page. Edited as one draft
// and saved together. The rules that always follow her instructions are shown, never edited. A save someone else made
// first (noora_changed) offers to load theirs. Every save goes to the activity log with what changed, before and after.
import { Lock } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { errorMessage, isApiError } from '../../../api/errors';
import type {
  NooraChip,
  NooraDoc,
  NooraEditable,
  NooraFact,
  NooraPageChips,
  NooraScript,
  NooraStarter,
} from '../../../api/types';
import { useAuth } from '../../../auth';
import { useToast } from '../../../state';
import { useModules } from '../../../state/modules';
import { Button, Chip, Drawer, Panel, QueryError, Select, Skeleton, TextArea, TextField, cx } from '../../../ui';
import {
  DocFrame,
  ListEditor,
  RowsEditor,
  docErrors,
  hasErrorUnder,
  newItemId,
  type DocProblem,
} from '../../../ui/docEditor';
import { STARTER_ICONS } from '../page/starterIcons';
import { starters } from '../page/starters';
import { Welcome } from '../page/Welcome';
import { chipText, type NooraPage } from '../suggestions';
import { useNooraSettings, usePromptPreview, useReloadNooraSettings, useSaveNooraSettings } from './api';
import '../page/NooraPage.css';
import './NooraEditor.css';

type Section = 'prompt' | 'facts' | 'script' | 'pages' | 'cards';
type Err = (path: string) => string | undefined;

const SECTIONS: { id: Section; label: string; about: string; parts: string[] }[] = [
  {
    id: 'prompt',
    label: 'Instructions',
    about: 'What her AI reads first: who she is, what she helps with and how she answers.',
    parts: ['prompt.instructions'],
  },
  {
    id: 'facts',
    label: 'Programme facts',
    about:
      'What her AI may tell students about the programme as fact. Anything else about dates, rules or fees she says she doesn’t know.',
    parts: ['prompt.facts', 'prompt'],
  },
  {
    id: 'script',
    label: 'Her script',
    about: 'What she says when she answers without her AI: for guests, and when her AI is off or paused.',
    parts: [
      'script.greeting',
      'script.greetingChips',
      'script.who',
      'script.thanks',
      'script.refusal',
      'script.notFound',
      'script.tryInstead',
      'script.noPhotos',
      'script.photoAsk',
      'script.fileGuess',
      'script.fileUnknown',
      'script.welcome',
    ],
  },
  {
    id: 'pages',
    label: 'Questions on each page',
    about: 'The questions she offers when her chat opens, three or four for the page the student is on.',
    parts: ['script.pageChips'],
  },
  {
    id: 'cards',
    label: 'Starter cards',
    about:
      'The cards on her full page, one for each kind of help: four or eight, so they fill whole rows. A card fills the question box.',
    parts: ['script.starters'],
  },
];

const PAGES: { page: NooraPage; label: string }[] = [
  { page: 'home', label: 'Home' },
  { page: 'modules', label: 'Modules' },
  { page: 'module', label: 'A module’s page' },
  { page: 'library', label: 'The library' },
  { page: 'calendar', label: 'The calendar' },
  { page: 'forum', label: 'The forum' },
  { page: 'notes', label: 'Notes' },
  { page: 'grades', label: 'The grades calculator' },
  { page: 'other', label: 'Every other page' },
];
const NEEDS = [
  { value: '', label: 'Always' },
  { value: 'calendar', label: 'While the calendar is on' },
  { value: 'library', label: 'While the library is on' },
];
const ICONS = (Object.keys(STARTER_ICONS) as NooraStarter['icon'][]).map((value) => ({
  value,
  label: STARTER_ICONS[value].label,
}));

type Line =
  | 'greeting'
  | 'who'
  | 'thanks'
  | 'refusal'
  | 'notFound'
  | 'noPhotos'
  | 'photoAsk'
  | 'fileGuess'
  | 'fileUnknown';
const LINES: { key: Line; label: string; hint: string }[] = [
  { key: 'greeting', label: 'When her chat opens', hint: 'After “Hi Sara!”. Also how she answers hello.' },
  { key: 'who', label: 'Asked who she is', hint: 'Or what she can do.' },
  { key: 'thanks', label: 'Thanked', hint: '' },
  {
    key: 'refusal',
    label: 'Asked to do someone’s coursework or exam',
    hint: 'She shows where the topic is taught after it.',
  },
  { key: 'notFound', label: 'Nothing in the material matches', hint: '' },
  { key: 'noPhotos', label: 'Sent a photo', hint: 'Her script can’t read pictures: she says so before her answer.' },
  { key: 'photoAsk', label: 'Then, when the words with the photo found nothing', hint: '' },
  { key: 'fileGuess', label: 'Sent a file whose name says what it’s about', hint: 'She shows where to look after it.' },
  { key: 'fileUnknown', label: 'Sent a file whose name says nothing', hint: '' },
];

export function NooraEditor() {
  const query = useNooraSettings();
  // Once loaded, the editor keeps its own copy: a refetch in the background never replaces the draft.
  if (query.data) return <Editor first={query.data} />;
  if (query.isError)
    return (
      <QueryError
        error={query.error}
        title="Mini Noora’s settings didn’t load"
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

function Editor({ first }: { first: NooraEditable }) {
  // The version the draft is edited from: the one first loaded, then each one a save returns or "Load it again" loads.
  const [loaded, setLoaded] = useState(first);
  const saved = loaded.data;
  const [doc, setDoc] = useState<NooraDoc>(saved);
  const [section, setSection] = useState<Section>('prompt');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<DocProblem | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const save = useSaveNooraSettings();
  const reload = useReloadNooraSettings();
  const { push: toast } = useToast();
  const dirty = useMemo(() => JSON.stringify(doc) !== JSON.stringify(saved), [doc, saved]);
  const savedIds = useMemo(
    () => new Set([...saved.prompt.facts.map((f) => f.id), ...saved.script.starters.map((s) => s.id)]),
    [saved],
  );
  const setScript = (patch: Partial<NooraScript>) => setDoc((d) => ({ ...d, script: { ...d.script, ...patch } }));
  const err: Err = (path) => fields[path];
  // A new version (as the API keeps it, so even a save that changed nothing leaves nothing unsaved) starts a new draft.
  const start = (next: NooraEditable) => {
    setLoaded(next);
    setDoc(next.data);
    setFields({});
    setProblem(null);
  };

  const submit = () => {
    setProblem(null);
    save.mutate(
      { version: loaded.version, data: doc },
      {
        onSuccess: (out) => {
          start(out);
          toast({ title: 'Saved. Mini Noora uses the changes from now on.', tone: 'success' });
        },
        onError: (e) => {
          if (isApiError(e) && e.code === 'noora_changed')
            return setProblem({ kind: 'changed', what: 'Mini Noora’s settings' });
          const found = docErrors(isApiError(e) ? e.fields : {}, {
            wholes: ['prompt', 'prompt.facts', 'script', 'script.pageChips', 'script.starters'],
          });
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
    <>
      <DocFrame
        title="Mini Noora"
        savedAt={loaded.updatedAt}
        savedBy={loaded.updatedBy?.displayName ?? null}
        dirty={dirty}
        saving={save.isPending}
        pageTo="/noora"
        onPreview={() => setPreviewing(true)}
        onUndo={() => {
          setDoc(saved);
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
        {section === 'prompt' ? (
          <>
            <TextArea
              label="Her instructions"
              hint="Plain words, as you’d brief a tutor. Leave out <hub_data> and <student_note>: she reads what’s inside them as data."
              value={doc.prompt.instructions}
              onChange={(e) => setDoc((d) => ({ ...d, prompt: { ...d.prompt, instructions: e.target.value } }))}
              error={err('prompt.instructions')}
              rows={16}
              maxLength={8000}
              required
            />
            <FixedRules rules={loaded.fixedRules} onPreview={() => setPreviewing(true)} />
          </>
        ) : null}

        {section === 'facts' ? (
          <ListEditor<NooraFact>
            items={doc.prompt.facts}
            noun="fact"
            titleOf={(f) => f.text}
            savedIds={savedIds}
            onChange={(facts) => setDoc((d) => ({ ...d, prompt: { ...d.prompt, facts } }))}
            make={() => ({
              id: newItemId(
                'fact',
                doc.prompt.facts.map((f) => f.id),
              ),
              text: '',
            })}
            hasError={(i) => hasErrorUnder(fields, `prompt.facts.${i}`)}
            max={40}
          >
            {(f, i, change) => (
              <TextArea
                label="Fact"
                hint="One fact, as you’d tell a new student. She may quote it."
                value={f.text}
                onChange={(e) => change({ text: e.target.value })}
                error={err(`prompt.facts.${i}.text`)}
                rows={3}
                maxLength={400}
                required
              />
            )}
          </ListEditor>
        ) : null}

        {section === 'script' ? <ScriptLines script={doc.script} set={setScript} err={err} /> : null}
        {section === 'pages' ? (
          <PageQuestions pages={doc.script.pageChips} onChange={(pageChips) => setScript({ pageChips })} err={err} />
        ) : null}

        {section === 'cards' ? (
          <ListEditor<NooraStarter>
            items={doc.script.starters}
            noun="card"
            titleOf={(s) => s.title}
            metaOf={(s) => s.example}
            savedIds={savedIds}
            onChange={(cards) => setScript({ starters: cards })}
            make={() => ({
              id: newItemId(
                'card',
                doc.script.starters.map((s) => s.id),
              ),
              icon: 'lightbulb',
              title: '',
              example: '',
              template: '',
            })}
            hasError={(i) => hasErrorUnder(fields, `script.starters.${i}`)}
            min={4}
            max={8}
          >
            {(s, i, change) => (
              <div className="dedit-grid">
                <TextField
                  label="Title"
                  value={s.title}
                  onChange={(e) => change({ title: e.target.value })}
                  error={err(`script.starters.${i}.title`)}
                  maxLength={40}
                  required
                />
                <Select
                  label="Picture"
                  value={s.icon}
                  onChange={(e) => change({ icon: e.target.value as NooraStarter['icon'] })}
                  options={ICONS}
                  error={err(`script.starters.${i}.icon`)}
                />
                <TextField
                  className="dedit-grid__wide"
                  label="Line under the title"
                  hint="{module} is a module of the student’s year."
                  value={s.example}
                  onChange={(e) => change({ example: e.target.value })}
                  error={err(`script.starters.${i}.example`)}
                  maxLength={80}
                  required
                />
                <TextArea
                  className="dedit-grid__wide"
                  label="What it puts in the question box"
                  hint="Put the part to fill in between [square brackets]: it’s selected, so typing replaces it. {module} is a module of the student’s year."
                  value={s.template}
                  onChange={(e) => change({ template: e.target.value })}
                  error={err(`script.starters.${i}.template`)}
                  rows={2}
                  maxLength={300}
                  required
                />
              </div>
            )}
          </ListEditor>
        ) : null}
      </DocFrame>

      <Drawer
        open={previewing}
        onClose={() => setPreviewing(false)}
        title="Preview"
        description="Mini Noora with your changes, as students will meet her once you save."
        width="min(1100px, 100vw)"
      >
        {previewing ? <NooraPreview doc={doc} /> : null}
      </Drawer>
    </>
  );
}

/** The rules that always follow her instructions: shown so admins know they're there, never edited. */
function FixedRules({ rules, onPreview }: { rules: string; onPreview: () => void }) {
  return (
    <section className="noora-set__fixed" aria-labelledby="noora-set-fixed">
      <h5 id="noora-set-fixed" className="noora-set__fixed-title">
        <Lock aria-hidden="true" weight="bold" /> Rules that always follow her instructions
      </h5>
      <p className="dedit__note">
        These come after your instructions and the facts in every question, whatever the instructions say. They keep her
        answers honest, keep her links inside the hub, stop her doing live coursework or exams, and keep students’ notes
        and the hub’s data from being read as orders. They can’t be edited here.
      </p>
      <pre className="noora-set__text">{rules}</pre>
      <Button size="sm" variant="secondary" onClick={onPreview}>
        See the whole prompt
      </Button>
    </section>
  );
}

function line(key: Line, value: string): Partial<NooraScript> {
  const patch: Partial<NooraScript> = {};
  patch[key] = value;
  return patch;
}

function ScriptLines({
  script,
  set,
  err,
}: {
  script: NooraScript;
  set: (patch: Partial<NooraScript>) => void;
  err: Err;
}) {
  return (
    <>
      <div className="dedit-grid">
        {LINES.map(({ key, label, hint }) => (
          <TextArea
            key={key}
            label={label}
            hint={hint || undefined}
            value={script[key]}
            onChange={(e) => set(line(key, e.target.value))}
            error={err(`script.${key}`)}
            rows={2}
            maxLength={300}
            required
          />
        ))}
        <TextArea
          className="dedit-grid__wide"
          label="Her full page, under “What can I help with?”"
          value={script.welcome}
          onChange={(e) => set({ welcome: e.target.value })}
          error={err('script.welcome')}
          rows={3}
          maxLength={400}
          required
        />
      </div>
      <QuestionList
        legend="Questions she offers after hello, or after saying who she is"
        items={script.greetingChips}
        onChange={(greetingChips) => set({ greetingChips })}
        path="script.greetingChips"
        err={err}
      />
      <QuestionList
        legend="Questions she offers when nothing matches"
        items={script.tryInstead}
        onChange={(tryInstead) => set({ tryInstead })}
        path="script.tryInstead"
        err={err}
      />
    </>
  );
}

function QuestionList({
  legend,
  items,
  onChange,
  path,
  err,
}: {
  legend: string;
  items: readonly string[];
  onChange: (next: string[]) => void;
  path: string;
  err: Err;
}) {
  return (
    <fieldset className="dedit-group">
      <legend className="dedit-group__legend">{legend}</legend>
      {err(path) ? <p className="dedit__error">{err(path)}</p> : null}
      <RowsEditor<string> items={items} noun="question" onChange={onChange} make={() => ''} min={1} max={4}>
        {(q, i, change) => (
          <TextField
            label={`Question ${i + 1}`}
            hideLabel
            value={q}
            onChange={(e) => change(e.target.value)}
            error={err(`${path}.${i}`)}
            maxLength={80}
            required
          />
        )}
      </RowsEditor>
    </fieldset>
  );
}

/** Each page's questions; a page without its own uses those for every other page. */
function PageQuestions({
  pages,
  onChange,
  err,
}: {
  pages: readonly NooraPageChips[];
  onChange: (next: NooraPageChips[]) => void;
  err: Err;
}) {
  const setPage = (page: NooraPage, chips: NooraChip[]) => {
    const rest = pages.filter((p) => p.page !== page);
    // A page left without questions uses those for every other page.
    onChange(
      chips.length || page === 'other'
        ? pages.some((p) => p.page === page)
          ? pages.map((p) => (p.page === page ? { page, chips } : p))
          : [...rest, { page, chips }]
        : rest,
    );
  };
  return (
    <>
      <p className="dedit__note">
        In a question, {'{module}'} is the module of the page (or the first module of the student’s year) and{' '}
        {'{module2}'} the second module of their year, each by its unit code. A question that needs the calendar or the
        library is left out while it’s off.
      </p>
      {PAGES.map(({ page, label }) => {
        const at = pages.findIndex((p) => p.page === page);
        const chips = at >= 0 ? (pages[at]?.chips ?? []) : [];
        return (
          <fieldset key={page} className="dedit-group" data-page={page}>
            <legend className="dedit-group__legend">{label}</legend>
            {at < 0 ? (
              <div className="noora-set__unset">
                <p className="dedit__note">Uses the questions for every other page.</p>
                <Button size="sm" variant="secondary" onClick={() => setPage(page, [{ text: '', needs: null }])}>
                  Give it questions of its own
                </Button>
              </div>
            ) : (
              <RowsEditor<NooraChip>
                items={chips}
                noun="question"
                onChange={(next) => setPage(page, next)}
                make={() => ({ text: '', needs: null })}
                min={page === 'other' ? 1 : 0}
                max={6}
              >
                {(c, i, change) => (
                  <div className="dedit-grid">
                    <TextField
                      label="Question"
                      value={c.text}
                      onChange={(e) => change({ ...c, text: e.target.value })}
                      error={err(`script.pageChips.${at}.chips.${i}.text`)}
                      maxLength={80}
                      required
                    />
                    <Select
                      label="Shown"
                      value={c.needs ?? ''}
                      onChange={(e) =>
                        change({
                          ...c,
                          needs: e.target.value === 'calendar' || e.target.value === 'library' ? e.target.value : null,
                        })
                      }
                      options={NEEDS}
                    />
                  </div>
                )}
              </RowsEditor>
            )}
          </fieldset>
        );
      })}
    </>
  );
}

/** Her prompt as her AI would read it (from the API), her greeting with each page's questions, and her full page's
 *  cards, all from the draft. */
function NooraPreview({ doc }: { doc: NooraDoc }) {
  const { me, featureOn } = useAuth();
  const { modules } = useModules();
  const preview = usePromptPreview(doc.prompt);
  const year = me?.year ?? 2;
  const [first, second] = modules.filter((m) => m.year === year);
  const name = (me?.displayName ?? '').trim().split(/\s+/)[0] || 'Sara';
  return (
    <div className="dedit-preview">
      <p className="dedit-preview__label">Her chat, opening</p>
      <div className="noora-set__hello">
        <p className="noora-set__greeting">{`Hi ${name}! ${doc.script.greeting}`}</p>
        <dl className="noora-set__pages">
          {PAGES.map(({ page, label }) => {
            const own = doc.script.pageChips.find((p) => p.page === page);
            const chips = (own?.chips ?? [])
              .map((c) => chipText(c, featureOn, first, second))
              .filter((t): t is string => !!t);
            return (
              <div key={page}>
                <dt>{label}</dt>
                <dd>{own ? chips.join(' · ') || 'None shown now' : 'The questions for every other page'}</dd>
              </div>
            );
          })}
        </dl>
      </div>
      <p className="dedit-preview__label">Her full page</p>
      <Welcome
        name={name}
        lead={doc.script.welcome}
        starters={starters(doc.script.starters, modules, year)}
        onStart={() => undefined}
        questions={null}
        onAsk={() => undefined}
        paused={null}
        onSignIn={null}
      />
      <p className="dedit-preview__label">What her AI reads before a question</p>
      {preview.isPending ? <Skeleton lines={10} /> : null}
      {preview.isError ? (
        <QueryError
          error={preview.error}
          title="The prompt didn’t load"
          onRetry={() => void preview.refetch()}
          retrying={preview.isFetching}
          size="sm"
        />
      ) : null}
      {preview.data ? (
        <>
          <p className="dedit__note">{`About ${preview.data.tokens.toLocaleString('en-GB')} tokens. The first part is the same for every question; the second is an example: a Year 2 student on Home today.`}</p>
          <pre className="noora-set__text">{preview.data.stable}</pre>
          <pre className="noora-set__text">{preview.data.screen}</pre>
        </>
      ) : null}
    </div>
  );
}
