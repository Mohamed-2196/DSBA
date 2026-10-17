// Site settings' parts for Home, the tour and search: the blocks a new student's Home shows, in order; the steps of
// the tour; the other words students type for modules; and what search suggests before anything is typed.
import { useState } from 'react';
import type { SearchNickname, SiteDoc, TourStep } from '../../api/types';
import { ArrowDown, ArrowUp, Trash } from '@phosphor-icons/react';
import { IconButton, Select, TextArea, TextField } from '../../ui';
import { ALL_HOME_BLOCKS, HOME_BLOCKS, type HomeBlock } from '../home/public';
import { TOUR_ARTS } from '../onboarding/public';
import { hasErrorUnder } from './editor/errors';
import { newItemId } from './editor/doc';
import { ListEditor, RowsEditor } from './editor/kit';

type Set = (patch: Partial<SiteDoc>) => void;
type Err = (path: string) => string | undefined;

const ARTS = (Object.keys(TOUR_ARTS) as TourStep['art'][]).map((value) => ({ value, label: TOUR_ARTS[value].label }));

export function HomeTourSection({ doc, set, err, fields, savedIds }: { doc: SiteDoc; set: Set; err: Err; fields: Record<string, string>; savedIds: ReadonlySet<string> }) {
  return (
    <>
      <HomeBlocks blocks={doc.homeBlocks} onChange={(homeBlocks) => set({ homeBlocks })} error={err('homeBlocks')} />
      <fieldset className="dedit-group">
        <legend className="dedit-group__legend">The tour</legend>
        <p className="dedit__note">A new student can take it from the year prompt (“Take the tour”). Each step has an illustration beside it.</p>
        <ListEditor<TourStep>
          items={doc.tour}
          noun="step"
          titleOf={(t) => t.title}
          metaOf={(t) => TOUR_ARTS[t.art].label}
          savedIds={savedIds}
          onChange={(tour) => set({ tour })}
          make={() => ({ id: newItemId('step', doc.tour.map((t) => t.id)), art: 'search', title: '', body: '' })}
          hasError={(i) => hasErrorUnder(fields, `tour.${i}`)}
          min={1}
          max={5}
        >
          {(t, i, change) => (
            <div className="dedit-grid">
              <TextField label="Title" value={t.title} onChange={(e) => change({ title: e.target.value })} error={err(`tour.${i}.title`)} maxLength={60} required />
              <Select label="Illustration" value={t.art} onChange={(e) => change({ art: e.target.value as TourStep['art'] })} options={ARTS} error={err(`tour.${i}.art`)} />
              <TextArea
                className="dedit-grid__wide"
                label="Words"
                hint="Put a key between `backticks` to show it as a key. {mod} is ⌘ on a Mac and Ctrl elsewhere: `{mod}``K` shows ⌘ K."
                value={t.body}
                onChange={(e) => change({ body: e.target.value })}
                error={err(`tour.${i}.body`)}
                rows={3}
                maxLength={300}
                required
              />
            </div>
          )}
        </ListEditor>
      </fieldset>
    </>
  );
}

/** The blocks shown, in order, and a select to add one of the others. */
function HomeBlocks({ blocks, onChange, error }: { blocks: readonly HomeBlock[]; onChange: (next: HomeBlock[]) => void; error?: string }) {
  const [adding, setAdding] = useState('');
  const left = ALL_HOME_BLOCKS.filter((b) => !blocks.includes(b));
  const move = (from: number, by: -1 | 1) => {
    const next = blocks.slice();
    const [b] = next.splice(from, 1);
    if (b === undefined) return;
    next.splice(from + by, 0, b);
    onChange(next);
  };
  return (
    <fieldset className="dedit-group">
      <legend className="dedit-group__legend">Home for a new student</legend>
      <p className="dedit__note">What Home shows, in this order, until a student customizes theirs. A guest’s leaves out what needs an account. A block shows only while its feature is on, and a notice only when it has something to say.</p>
      {error ? <p className="dedit__error">{error}</p> : null}
      <ol role="list" className="dedit-rows__items">
        {blocks.map((b, i) => (
          <li key={b} className="dedit-row">
            <div className="dedit-row__fields site-block">
              <span className="site-block__title">{HOME_BLOCKS[b].title}</span>
              <span className="dedit__note">{HOME_BLOCKS[b].description}</span>
            </div>
            <span className="dedit-row__tools">
              <IconButton size="sm" icon={ArrowUp} label={`Move ${HOME_BLOCKS[b].title} up`} disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton size="sm" icon={ArrowDown} label={`Move ${HOME_BLOCKS[b].title} down`} disabled={i === blocks.length - 1} onClick={() => move(i, 1)} />
              <IconButton size="sm" icon={Trash} label={`Take ${HOME_BLOCKS[b].title} off Home`} disabled={blocks.length <= 1} onClick={() => onChange(blocks.filter((x) => x !== b))} />
            </span>
          </li>
        ))}
      </ol>
      {left.length ? (
        <Select
          label="Add a block"
          value={adding}
          placeholder="Choose a block"
          options={left.map((b) => ({ value: b, label: HOME_BLOCKS[b].title }))}
          onChange={(e) => {
            const b = left.find((x) => x === e.target.value);
            if (b) onChange([...blocks, b]);
            setAdding('');
          }}
        />
      ) : null}
    </fieldset>
  );
}

export function SearchSection({ doc, set, err, fields, savedIds }: { doc: SiteDoc; set: Set; err: Err; fields: Record<string, string>; savedIds: ReadonlySet<string> }) {
  return (
    <>
      <fieldset className="dedit-group">
        <legend className="dedit-group__legend">Other words for modules</legend>
        <p className="dedit__note">What students type for a module that isn’t in its name. Search then also finds the modules with a word of their name starting with what you give, like stats finding every module named “… Statistics …”.</p>
        <ListEditor<SearchNickname>
          items={doc.searchNicknames}
          noun="word"
          titleOf={(n) => n.word}
          metaOf={(n) => (n.finds ? `Finds modules named “${n.finds}…”` : 'Finds nothing yet')}
          savedIds={savedIds}
          onChange={(searchNicknames) => set({ searchNicknames })}
          make={() => ({ id: newItemId('word', doc.searchNicknames.map((n) => n.id)), word: '', finds: '' })}
          hasError={(i) => hasErrorUnder(fields, `searchNicknames.${i}`)}
          max={40}
        >
          {(n, i, change) => (
            <div className="dedit-grid">
              <TextField label="Students type" hint="One word, letters and digits, like stats." value={n.word} onChange={(e) => change({ word: e.target.value })} error={err(`searchNicknames.${i}.word`)} maxLength={20} required />
              <TextField
                label="Finds modules named"
                hint="The start of a word of their names, like statistic. Letters, digits and spaces."
                value={n.finds}
                onChange={(e) => change({ finds: e.target.value })}
                error={err(`searchNicknames.${i}.finds`)}
                maxLength={40}
                required
              />
            </div>
          )}
        </ListEditor>
      </fieldset>
      <fieldset className="dedit-group">
        <legend className="dedit-group__legend">Try searching for</legend>
        <p className="dedit__note">Search suggests these before anything is typed, until a student has searches of their own.</p>
        {err('searchSuggestions') ? <p className="dedit__error">{err('searchSuggestions')}</p> : null}
        <RowsEditor<string> items={doc.searchSuggestions} noun="suggestion" onChange={(searchSuggestions) => set({ searchSuggestions })} make={() => ''} min={1} max={6}>
          {(q, i, change) => <TextField label={`Suggestion ${i + 1}`} hideLabel value={q} onChange={(e) => change(e.target.value)} error={err(`searchSuggestions.${i}`)} maxLength={60} required />}
        </RowsEditor>
      </fieldset>
    </>
  );
}
