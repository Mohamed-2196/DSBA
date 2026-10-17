// The word game's guess list: every five-letter word a guess may be. Find words by how they start, add words in bulk,
// or take one off (unless it's an answer word, or a kept play guessed it: that play would no longer replay).
import { Plus, X } from '@phosphor-icons/react';
import { useState } from 'react';
import { errorMessage } from '../../../api/errors';
import type { GuessAddReport } from '../../../api/types';
import { useDebouncedValue, useToast } from '../../../state';
import { Button, IconButton, Modal, Panel, QueryError, SearchField, Skeleton, TextArea, formatCount } from '../../../ui';
import { useAddGuesses, useGuessList, useRemoveGuess } from './api';

export function GuessList() {
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 5), 250);
  const list = useGuessList(q);
  const [adding, setAdding] = useState(false);
  const remove = useRemoveGuess();
  const add = useAddGuesses();
  const { push: toast } = useToast();

  const takeOff = (word: string) =>
    remove.mutate(word, {
      onSuccess: () =>
        toast({
          title: `“${word}” is off the guess list.`,
          tone: 'success',
          action: { label: 'Put it back', onClick: () => add.mutate({ text: word, dryRun: false }) },
        }),
      onError: (e) => toast({ title: `“${word}” stays in the guess list`, body: errorMessage(e), tone: 'alert' }),
    });

  return (
    <Panel as="section" padding="md" className="dcms-part" aria-labelledby="dcms-guesses-title">
      <div className="dcms-part__head">
        <div className="dcms-part__intro">
          <h3 id="dcms-guesses-title" className="dcms-part__title">
            Guess list
          </h3>
          <p className="dcms__note">
            {list.data ? `${formatCount(list.data.total)} five-letter words players may type.` : 'The five-letter words players may type.'} Every answer word must be in it.
          </p>
        </div>
        <Button leadingIcon={Plus} onClick={() => setAdding(true)}>
          Add words
        </Button>
      </div>
      <SearchField className="dcms-guesses__search" label="Find words in the guess list" placeholder="How the word starts" value={query} onValueChange={setQuery} onClear={() => setQuery('')} />
      {!q ? (
        <p className="dcms__note">Type how a word starts to see the words in the list.</p>
      ) : list.isError ? (
        <QueryError error={list.error} title="The guess list didn’t load" onRetry={() => void list.refetch()} retrying={list.isFetching} size="sm" />
      ) : list.isPending ? (
        <Skeleton lines={2} />
      ) : list.data.words.length === 0 ? (
        <p className="dcms__note">{`No word in the list starts with ${q}.`}</p>
      ) : (
        <>
          <ul className="dcms-words" aria-label={`Words starting with ${q}`}>
            {list.data.words.map((word) => (
              <li key={word} className="dcms-word">
                <span className="dcms-word__text">{word}</span>
                <IconButton size="sm" icon={X} label={`Take ${word} off the guess list`} disabled={remove.isPending && remove.variables === word} onClick={() => takeOff(word)} />
              </li>
            ))}
          </ul>
          {list.data.more ? <p className="dcms__note">More words start with {q}: type more of the word.</p> : null}
        </>
      )}
      {adding ? <AddGuesses onClose={() => setAdding(false)} /> : null}
    </Panel>
  );
}

function AddGuesses({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const check = useAddGuesses();
  const add = useAddGuesses();
  const { push: toast } = useToast();
  const report: GuessAddReport | undefined = check.data;
  const busy = check.isPending || add.isPending;
  const error = check.error ?? add.error;
  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title="Add words to the guess list"
      description="Five-letter words, A to Z, separated by new lines, commas or spaces."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={check.isPending} disabled={!text.trim() || add.isPending} onClick={() => check.mutate({ text, dryRun: true })}>
            Check
          </Button>
          <Button
            variant="primary"
            loading={add.isPending}
            disabled={!report?.new.length || check.isPending}
            onClick={() =>
              add.mutate(
                { text, dryRun: false },
                {
                  onSuccess: (done) => {
                    toast({ title: `Added ${formatCount(done.new.length)} ${done.new.length === 1 ? 'word' : 'words'} to the guess list.`, tone: 'success' });
                    onClose();
                  },
                },
              )
            }
          >
            {report?.new.length ? `Add ${formatCount(report.new.length)}` : 'Add'}
          </Button>
        </>
      }
    >
      <div className="dcms-form">
        <TextArea
          label="Words"
          value={text}
          rows={6}
          spellCheck={false}
          placeholder={'CRANE\nSLATE, TREND'}
          onChange={(e) => {
            setText(e.target.value);
            check.reset();
            add.reset();
          }}
          data-autofocus
        />
        {error ? (
          <p className="dcms__error" role="alert">
            {errorMessage(error)}
          </p>
        ) : null}
        {report ? (
          <div className="dcms-report" aria-live="polite">
            <p className="dcms-report__title">
              {formatCount(report.new.length)} new, {formatCount(report.known.length)} in the list already
              {report.refused.length ? `, ${formatCount(report.refused.length)} not five letters A to Z` : ''}.
            </p>
            {report.refused.length ? <p className="dcms__note">Left out: {report.refused.slice(0, 30).join(', ')}</p> : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
