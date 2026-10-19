// Nearest neighbour's vocabulary: every word a guess may be, with the tags that decide what's close and a few words
// listed as very close. Any change ranks the secret words again; the days that are out keep their rankings.
import { PencilSimple, Plus, Trash, X } from '@phosphor-icons/react';
import { useId, useState, type KeyboardEvent } from 'react';
import { errorMessage, isApiError, placeFieldErrors, unplacedMessage } from '../../../api/errors';
import type { VocabularyOut } from '../../../api/types';
import { useDebouncedValue, useToast, useUnsavedChanges } from '../../../state';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Modal,
  Panel,
  QueryError,
  SearchField,
  Skeleton,
  TextField,
  formatCount,
} from '../../../ui';
import { useAddVocabulary, useDeleteVocabulary, useSaveVocabulary, useVocabulary } from './api';

export function Vocabulary({ tags }: { tags: string[] }) {
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim().toLowerCase(), 250);
  const list = useVocabulary(q);
  const [editing, setEditing] = useState<VocabularyOut | 'new' | null>(null);
  const [removing, setRemoving] = useState<VocabularyOut | null>(null);
  const remove = useDeleteVocabulary();
  const { push: toast } = useToast();
  const words = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;

  return (
    <Panel as="section" padding="md" className="dcms-part" aria-labelledby="dcms-vocabulary-title">
      <div className="dcms-part__head">
        <div className="dcms-part__intro">
          <h3 id="dcms-vocabulary-title" className="dcms-part__title">
            Vocabulary
          </h3>
          <p className="dcms__note">
            Every word a player may guess. Words that share tags count as close, and the words listed as close to each
            other count as closer still. Secret words are ranked again after every change.
          </p>
        </div>
        <Button leadingIcon={Plus} onClick={() => setEditing('new')}>
          Add a word
        </Button>
      </div>
      <SearchField
        className="dcms-guesses__search"
        label="Find words in the vocabulary"
        placeholder="A word, or a tag"
        value={query}
        onValueChange={setQuery}
        onClear={() => setQuery('')}
      />
      {list.isError ? (
        <QueryError
          error={list.error}
          title="The vocabulary didn’t load"
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
          size="sm"
        />
      ) : list.isPending ? (
        <Skeleton lines={4} />
      ) : words.length === 0 ? (
        <EmptyState
          size="sm"
          title={q ? 'No word or tag matches' : 'The vocabulary is empty'}
          body={q ? 'Try the start of another word, or a tag.' : 'Add the words players may guess, with their tags.'}
        />
      ) : (
        <>
          <p className="dcms__count" aria-live="polite">
            {words.length < total
              ? `${formatCount(words.length)} of ${formatCount(total)} words`
              : `${formatCount(total)} ${total === 1 ? 'word' : 'words'}`}
          </p>
          <ul className="dcms-items">
            {words.map((w) => (
              <li key={w.word} className="dcms-item">
                <button type="button" className="dcms-item__open" onClick={() => setEditing(w)}>
                  <span className="dcms-item__title">
                    <span className="dcms-item__text">{w.word}</span>
                    {w.secretIn ? (
                      <Badge tone="cobalt" size="sm">
                        Secret word
                      </Badge>
                    ) : null}
                  </span>
                  <span className="dcms-item__detail">Tags: {w.tags.join(', ')}</span>
                  {w.near.length ? <span className="dcms-item__meta">Close to {w.near.join(', ')}</span> : null}
                </button>
                <span className="dcms-item__tools">
                  <IconButton
                    size="sm"
                    icon={PencilSimple}
                    label={`Edit ${w.word}`}
                    tooltip
                    onClick={() => setEditing(w)}
                  />
                  {w.secretIn ? null : (
                    <IconButton
                      size="sm"
                      icon={Trash}
                      label={`Delete ${w.word}`}
                      tooltip
                      onClick={() => setRemoving(w)}
                    />
                  )}
                </span>
              </li>
            ))}
          </ul>
          {list.hasNextPage ? (
            <Button className="dcms__more" onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage}>
              Show more
            </Button>
          ) : null}
        </>
      )}
      {editing ? (
        <WordDialog
          key={editing === 'new' ? 'new' : editing.word}
          word={editing === 'new' ? null : editing}
          tags={tags}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={`Delete “${removing?.word ?? ''}”?`}
        body="Players can no longer guess it, and it comes off other words’ close words. The days that are out keep their rankings."
        confirmLabel="Delete"
        tone="danger"
        busy={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : null}
        onConfirm={() => {
          if (!removing) return;
          remove.mutate(
            { word: removing.word, version: removing.version },
            {
              onSuccess: () => {
                toast({ title: `“${removing.word}” is deleted.`, tone: 'success' });
                setRemoving(null);
              },
            },
          );
        }}
        onClose={() => {
          remove.reset();
          setRemoving(null);
        }}
      />
    </Panel>
  );
}

function WordDialog({
  word,
  tags: known,
  onClose,
}: {
  word: VocabularyOut | null;
  tags: string[];
  onClose: () => void;
}) {
  const [text, setText] = useState(word?.word ?? '');
  const [tags, setTags] = useState<string[]>(word?.tags ?? []);
  const [near, setNear] = useState<string[]>(word?.near ?? []);
  const [opened] = useState(() => JSON.stringify({ text, tags, near }));
  useUnsavedChanges(JSON.stringify({ text, tags, near }) !== opened, 'the word');
  const add = useAddVocabulary();
  const save = useSaveVocabulary();
  const { push: toast } = useToast();
  const pending = add.isPending || save.isPending;
  const error = word ? save.error : add.error;
  const placed = placeFieldErrors(isApiError(error) ? error.fields : {}, ['word', 'tags', 'near']);
  const fields = placed.fields;
  const changed = isApiError(error) && error.code === 'puzzle_changed';
  const general = changed ? null : unplacedMessage(error, placed);

  const submit = () => {
    const done = () => {
      toast({
        title: word ? `“${word.word}” is saved. The secret words are ranked again.` : `“${text}” is in the vocabulary.`,
        tone: 'success',
      });
      onClose();
    };
    if (word) save.mutate({ word: word.word, tags, near, version: word.version }, { onSuccess: done });
    else add.mutate({ word: text, tags, near }, { onSuccess: done });
  };

  return (
    <Modal
      open
      onClose={pending ? () => undefined : onClose}
      title={word ? `Edit “${word.word}”` : 'Add a word'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" loading={pending} disabled={changed} onClick={submit}>
            {word ? 'Save' : 'Add'}
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
            Someone saved this word after you opened it. Close it and open it again to see their version.
          </p>
        ) : null}
        {word ? null : (
          <TextField
            label="Word"
            value={text}
            maxLength={24}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setText(e.target.value.toLowerCase().replace(/[^a-z]/g, ''))}
            error={fields.word}
            hint="Lower-case letters, a to z: how players type it. A plural with an s counts as the word."
            data-autofocus
          />
        )}
        <WordChips
          label="Tags"
          values={tags}
          onChange={setTags}
          suggestions={known}
          error={fields.tags}
          hint="3 to 8 short words, such as stats or money. Words that share tags count as close."
        />
        <WordChips
          label="Close words"
          values={near}
          onChange={setNear}
          error={fields.near}
          hint="Up to 6 words from the vocabulary that are very close to it. It works both ways."
        />
        {general ? (
          <p className="dcms__error" role="alert">
            {general}
          </p>
        ) : null}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** Words picked one at a time: type one and press Enter (or a comma); each shows as a chip that can be taken off. */
function WordChips({
  label,
  values,
  onChange,
  suggestions,
  error,
  hint,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  suggestions?: string[];
  error?: string;
  hint: string;
}) {
  const [draft, setDraft] = useState('');
  const listId = useId().replace(/:/g, '');
  const take = (raw: string) => {
    const words = raw
      .toLowerCase()
      .split(/[\s,;]+/)
      .map((w) => w.trim())
      .filter(Boolean);
    const next = [...values, ...words.filter((w) => !values.includes(w))];
    if (next.length !== values.length) onChange(next);
    setDraft('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      take(draft);
    } else if (e.key === 'Backspace' && !draft && values.length) {
      onChange(values.slice(0, -1));
    }
  };
  return (
    <div className="dcms-chips">
      <TextField
        label={label}
        value={draft}
        list={suggestions ? listId : undefined}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          const v = e.target.value;
          if (/[,;]\s*$/.test(v)) take(v);
          else setDraft(v);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => draft.trim() && take(draft)}
        error={error}
        hint={hint}
        trailing={
          <Button size="sm" variant="ghost" disabled={!draft.trim()} onClick={() => take(draft)}>
            Add
          </Button>
        }
      />
      {suggestions ? (
        <datalist id={listId}>
          {suggestions
            .filter((s) => !values.includes(s))
            .map((s) => (
              <option key={s} value={s} />
            ))}
        </datalist>
      ) : null}
      {values.length ? (
        <ul className="dcms-words" aria-label={label}>
          {values.map((v) => (
            <li key={v} className="dcms-word">
              <span className="dcms-word__text">{v}</span>
              <IconButton
                size="sm"
                icon={X}
                label={`Take ${v} off`}
                onClick={() => onChange(values.filter((x) => x !== v))}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
