// Adding or editing one item, with its game's own fields. The API checks the game's rules and answers on the field;
// a save someone else made first asks to open the item again. An answer word is checked against the guess list as it
// is typed, and a secret word against the vocabulary.
//
// An item today's puzzle uses (and someone has opened) can fix today's puzzle too: the dialog then shows today's
// puzzle with the fix, what changes and who it reaches, before the fix is applied.
import { useId, useState, type ReactNode } from 'react';
import { errorMessage, isApiError } from '../../../api/errors';
import type { ItemOut, QuizData, ThemeOut, TodayFixOut } from '../../../api/types';
import { useToast, useUnsavedChanges } from '../../../state';
import { useModules } from '../../../state/modules';
import { Button, glyph, Icon, IconButton, Modal, Select, Switch, TextArea, TextField } from '../../../ui';
import {
  useAddGuesses,
  useCreateItem,
  useFixToday,
  useGuessList,
  useSaveItem,
  useTodayPuzzles,
  useVocabulary,
} from './api';
import { FixCheck } from './FixCheck';
import {
  LEVELS,
  blankData,
  fieldError,
  gameInfo,
  otherErrors,
  parseWords,
  titleOf,
  type ContentGame,
  type ItemData,
} from './lib/items';

const SHOWN = [
  'theme',
  'data.word',
  'data.label',
  'data.level',
  'data.words',
  'data.question',
  'data.options',
  'data.answer',
  'data.explanation',
  'data.moduleId',
];
const MAX_OPTIONS = 6;
const MIN_OPTIONS = 2;

interface ItemDialogProps {
  game: ContentGame;
  item: ItemOut | null;
  themes: ThemeOut[];
  defaultTheme: string;
  /** opened to fix today's puzzle: the fix starts switched on */
  fixToday?: boolean;
  onClose: () => void;
}

export function ItemDialog({ game, item, themes, defaultTheme, fixToday = false, onClose }: ItemDialogProps) {
  const info = gameInfo(game);
  const [theme, setTheme] = useState(item?.theme ?? (defaultTheme || themes[0]?.id || ''));
  const [data, setData] = useState<ItemData>(item?.data ?? blankData(game));
  const [opened] = useState(() => JSON.stringify({ theme, data }));
  useUnsavedChanges(JSON.stringify({ theme, data }) !== opened, `the ${info.noun}`);
  const create = useCreateItem();
  const save = useSaveItem();
  const fixer = useFixToday();
  const { push: toast } = useToast();
  // Today's puzzle, out already, uses the item: it can be fixed today as well as from tomorrow.
  const inToday = Boolean(item?.inToday);
  const [fix, setFix] = useState(inToday && fixToday);
  const today = useTodayPuzzles(inToday);
  const todayGame = today.data?.games.find((g) => g.game === game);
  const fixing = inToday && fix;
  const themeTitle = themes.find((t) => t.id === theme)?.title ?? theme;
  const [check, setCheck] = useState<TodayFixOut | null>(null);
  const pending = create.isPending || save.isPending || fixer.isPending;
  const error = fixing ? fixer.error : item ? save.error : create.error;
  const fields = isApiError(error) ? error.fields : {};
  const changed = isApiError(error) && error.code === 'puzzle_changed';
  const general = error && !changed && !Object.keys(fields).length ? errorMessage(error) : null;
  const err = (name: string) => fieldError(fields, name);

  const fixBody = () =>
    item && today.data && todayGame
      ? { id: item.id, day: today.data.day, revision: todayGame.revision, version: item.version, data }
      : null;

  const submit = () => {
    if (fixing) {
      const body = fixBody();
      if (body) fixer.mutate({ ...body, dryRun: true }, { onSuccess: setCheck });
      return;
    }
    const done = () => {
      toast({
        title: item ? 'Saved. The days to come use it.' : `“${titleOf(data).trim()}” is added.`,
        tone: 'success',
      });
      onClose();
    };
    if (item) save.mutate({ id: item.id, theme, data, version: item.version }, { onSuccess: done });
    else create.mutate({ theme, data }, { onSuccess: done });
  };

  const apply = () => {
    const body = fixBody();
    if (!body) return;
    fixer.mutate(
      { ...body, dryRun: false },
      {
        onSuccess: (out) => {
          toast(
            out.changes.length
              ? {
                  title: 'Fixed for today and the days to come.',
                  body: out.playing ? 'Students partway through start again.' : undefined,
                  tone: 'success',
                }
              : { title: 'Saved. Today’s puzzle stays as it is; the days to come use it.', tone: 'success' },
          );
          onClose();
        },
        // A field to change goes back to the form, where it shows.
        onError: (e) => {
          if (isApiError(e) && Object.keys(e.fields).length) setCheck(null);
        },
      },
    );
  };

  if (check) {
    const applies = check.changes.length > 0;
    return (
      <Modal
        open
        onClose={pending ? () => undefined : onClose}
        size="lg"
        title="Check today’s puzzle"
        description={applies ? 'Nothing changes until you apply it.' : undefined}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                fixer.reset();
                setCheck(null);
              }}
              disabled={pending}
            >
              Back
            </Button>
            <Button variant="primary" loading={pending} disabled={changed} onClick={apply}>
              {applies ? 'Apply to today' : 'Save'}
            </Button>
          </>
        }
      >
        {error ? (
          <p className="dcms__banner" role="alert">
            {errorMessage(error)}
          </p>
        ) : null}
        <FixCheck check={check} />
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={pending ? () => undefined : onClose}
      size={game === 'quiz' ? 'lg' : 'md'}
      title={
        fixing
          ? `Fix today’s ${info.noun}`
          : item
            ? `Edit the ${info.noun}`
            : `Add ${/^[aeiou]/i.test(info.noun) ? 'an' : 'a'} ${info.noun}`
      }
      description={
        fixing
          ? 'Your fix reaches today’s puzzle and the days to come. You’ll see today’s puzzle with it before it’s applied.'
          : item && item.uses > 0
            ? `It ran on ${item.uses === 1 ? '1 day, which keeps' : `${item.uses} days, which keep`} it as it was. Your changes reach the days to come.`
            : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" loading={pending} disabled={changed || (fixing && !todayGame)} onClick={submit}>
            {fixing ? 'Preview today' : item ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <form
        className="dcms-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {changed ? (
          <p className="dcms__banner" role="alert">
            {fixing
              ? errorMessage(error)
              : 'Someone saved this after you opened it. Close it and open it again to see their version, then make your change.'}
          </p>
        ) : null}
        {inToday ? (
          <Switch
            checked={fix}
            onChange={(on) => {
              setFix(on);
              fixer.reset();
            }}
            label="Fix today’s puzzle too"
            description={
              fix
                ? 'Today’s puzzle uses this. Finished games keep their results; games partway through start again.'
                : 'Today’s puzzle uses this, and stays as it is. Your change reaches the days to come.'
            }
          />
        ) : null}
        {fixing ? (
          <p className="dcms__note">
            {data.game === 'groups'
              ? `In ${themeTitle}, at level ${data.level}. A fix keeps both: today’s board has one group a level.`
              : `In ${themeTitle}. A fix keeps it there.`}
          </p>
        ) : (
          <Select
            label="Theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            options={themes.map((t) => ({ value: t.id, label: t.title }))}
            error={err('theme')}
          />
        )}
        {data.game === 'word' ? (
          <AnswerField word={data.word} error={err('data.word')} onChange={(word) => setData({ game: 'word', word })} />
        ) : data.game === 'search' ? (
          <TextField
            label="Word"
            value={data.word}
            maxLength={10}
            autoComplete="off"
            spellCheck={false}
            className="dcms-form__word"
            onChange={(e) => setData({ game: 'search', word: e.target.value.toUpperCase().replace(/\s/g, '') })}
            error={err('data.word')}
            hint="4 to 10 letters, A to Z. It hides in the grid across, down, diagonally or backwards."
            data-autofocus
          />
        ) : data.game === 'nearest' ? (
          <SecretField
            word={data.word}
            error={err('data.word')}
            onChange={(word) => setData({ game: 'nearest', word })}
          />
        ) : data.game === 'groups' ? (
          <GroupFields data={data} err={err} onChange={setData} fixing={fixing} />
        ) : (
          <QuizFields data={data} err={err} onChange={setData} />
        )}
        {[...otherErrors(fields, SHOWN), ...(general ? [general] : [])].map((m) => (
          <p key={m} className="dcms__error" role="alert">
            {m}
          </p>
        ))}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

const ANSWER = /^[A-Z]{5}$/;

/** An answer word, and whether the guess list has it (one tap adds it). */
function AnswerField({ word, error, onChange }: { word: string; error?: string; onChange: (word: string) => void }) {
  const complete = ANSWER.test(word);
  const guesses = useGuessList(word, complete);
  const add = useAddGuesses();
  const known = complete && guesses.data?.words.includes(word);
  let hint: ReactNode = 'Five letters, A to Z, in the guess list so players can type it.';
  if (complete && guesses.data && !guesses.isPlaceholderData) {
    hint = known ? (
      <span className="dcms-check is-ok">
        <Icon glyph={glyph.check} /> In the guess list.
      </span>
    ) : (
      <span className="dcms-check">
        <Icon glyph={glyph.error} /> Not in the guess list yet.{' '}
        <Button
          size="sm"
          variant="ghost"
          loading={add.isPending}
          onClick={() => add.mutate({ text: word, dryRun: false })}
        >
          Add it to the guess list
        </Button>
      </span>
    );
  }
  return (
    <TextField
      label="Answer word"
      value={word}
      maxLength={5}
      autoComplete="off"
      spellCheck={false}
      className="dcms-form__word"
      onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
      error={error}
      hint={hint}
      data-autofocus
    />
  );
}

/** A secret word, and whether the vocabulary has it. */
function SecretField({ word, error, onChange }: { word: string; error?: string; onChange: (word: string) => void }) {
  const complete = /^[a-z]{2,24}$/.test(word);
  const found = useVocabulary(word, complete);
  const known = found.data?.pages[0]?.items.some((w) => w.word === word);
  let hint: ReactNode = 'A word from the vocabulary, a to z. Its closeness to every other word comes from their tags.';
  if (complete && found.data && !found.isPlaceholderData) {
    hint = known ? (
      <span className="dcms-check is-ok">
        <Icon glyph={glyph.check} /> In the vocabulary.
      </span>
    ) : (
      <span className="dcms-check">
        <Icon glyph={glyph.error} /> Not in the vocabulary yet. Add it under Vocabulary, with its tags, first.
      </span>
    );
  }
  return (
    <TextField
      label="Secret word"
      value={word}
      maxLength={24}
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => onChange(e.target.value.toLowerCase().replace(/[^a-z]/g, ''))}
      error={error}
      hint={hint}
      data-autofocus
    />
  );
}

type Err = (name: string) => string | undefined;

function GroupFields({
  data,
  err,
  onChange,
  fixing,
}: {
  data: Extract<ItemData, { game: 'groups' }>;
  err: Err;
  onChange: (data: ItemData) => void;
  /** fixing today's puzzle, whose board has one group a level: the level stays */
  fixing: boolean;
}) {
  const [text, setText] = useState(data.words.join('\n'));
  const n = data.words.length;
  return (
    <>
      <TextField
        label="What the words share"
        value={data.label}
        maxLength={60}
        onChange={(e) => onChange({ ...data, label: e.target.value })}
        error={err('data.label')}
        hint="Shown once the group is found: “Measures of centre”."
        data-autofocus
      />
      {fixing ? null : (
        <Select
          label="Level"
          value={data.level}
          onChange={(e) => onChange({ ...data, level: Number(e.target.value) })}
          options={LEVELS.map((l) => ({ value: l.level, label: l.label }))}
          error={err('data.level')}
          hint="Each day has one group at each level."
        />
      )}
      <TextArea
        label="Words"
        value={text}
        rows={5}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          onChange({ ...data, words: parseWords(e.target.value) });
        }}
        error={err('data.words')}
        hint={`${n} ${n === 1 ? 'word' : 'words'}. Give 4 to 8, one per line or separated by commas. A day shows four of them, different ones on different days, and never a word that another of its groups has.`}
      />
    </>
  );
}

function QuizFields({ data, err, onChange }: { data: QuizData; err: Err; onChange: (data: ItemData) => void }) {
  const { modules } = useModules();
  const legend = useId();
  const optionsError = err('data.options') ?? err('data.answer');
  const setOption = (i: number, value: string) =>
    onChange({ ...data, options: data.options.map((o, j) => (j === i ? value : o)) });
  const removeOption = (i: number) => {
    const options = data.options.filter((_, j) => j !== i);
    const answer = data.answer === i ? 0 : data.answer > i ? data.answer - 1 : data.answer;
    onChange({ ...data, options, answer });
  };
  return (
    <>
      <TextArea
        label="Question"
        value={data.question}
        rows={2}
        maxLength={200}
        onChange={(e) => onChange({ ...data, question: e.target.value })}
        error={err('data.question')}
        data-autofocus
      />
      <fieldset className="dcms-options" aria-describedby={optionsError ? `${legend}-err` : undefined}>
        <legend className="dcms-options__legend">Options</legend>
        <p className="dcms__note">Pick the right one. Players see them in a different order each day.</p>
        <ol className="dcms-options__list">
          {data.options.map((option, i) => (
            <li key={i} className="dcms-option">
              <label className="dcms-option__right">
                <input
                  type="radio"
                  name={`${legend}-right`}
                  checked={data.answer === i}
                  onChange={() => onChange({ ...data, answer: i })}
                />
                <span className="visually-hidden">{`Option ${i + 1} is the right answer`}</span>
              </label>
              <TextField
                label={`Option ${i + 1}`}
                hideLabel
                value={option}
                maxLength={80}
                placeholder={i === data.answer ? 'The right answer' : 'A wrong answer'}
                onChange={(e) => setOption(i, e.target.value)}
                className="dcms-option__text"
              />
              {data.options.length > MIN_OPTIONS ? (
                <IconButton
                  size="sm"
                  icon={<Icon glyph={glyph.close} />}
                  label={`Remove option ${i + 1}`}
                  onClick={() => removeOption(i)}
                />
              ) : null}
            </li>
          ))}
        </ol>
        {data.options.length < MAX_OPTIONS ? (
          <Button
            size="sm"
            leadingIcon={<Icon glyph={glyph.plus} />}
            className="dcms-options__add"
            onClick={() => onChange({ ...data, options: [...data.options, ''] })}
          >
            Add an option
          </Button>
        ) : null}
        {optionsError ? (
          <p id={`${legend}-err`} className="dcms__error">
            {optionsError}
          </p>
        ) : null}
      </fieldset>
      <TextArea
        label="Explanation"
        value={data.explanation}
        rows={2}
        maxLength={300}
        onChange={(e) => onChange({ ...data, explanation: e.target.value })}
        error={err('data.explanation')}
        hint="Shown after the player answers: why the right answer is right."
      />
      <Select
        label="Module it comes from"
        value={data.moduleId ?? ''}
        onChange={(e) => onChange({ ...data, moduleId: e.target.value || null })}
        options={[
          { value: '', label: 'None' },
          ...modules.map((m) => ({ value: m.id, label: m.unitCode ? `${m.unitCode} ${m.name}` : m.name })),
        ]}
        error={err('data.moduleId')}
        hint="Optional. Players see it beside the question."
      />
    </>
  );
}
