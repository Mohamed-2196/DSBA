import { useState } from 'react';
import { Heart, Lightbulb, Smiley } from '@phosphor-icons/react';
import { Tooltip, cx } from '../../../ui';
import { useLocalStorage } from '../../../state';
import './Reactions.css';

export const REACTIONS_KEY = 'pulse.newsletter.reactions';

const KINDS = [
  { id: 'useful', label: 'Useful', icon: Lightbulb },
  { id: 'love', label: 'Love this', icon: Heart },
  { id: 'laugh', label: 'Made me laugh', icon: Smiley },
];

/**
 * Per-section reactions. Counts = seeded count + your own reaction (toggle), kept in localStorage
 * under REACTIONS_KEY as { "<issue>/<section>": ["useful", …] }.
 */
export function Reactions({ issueSlug, sectionId, seed = {}, label }) {
  const [store, setStore] = useLocalStorage(REACTIONS_KEY, {});
  const [popped, setPopped] = useState(null);
  const key = `${issueSlug}/${sectionId}`;
  const mine = Array.isArray(store?.[key]) ? store[key] : [];

  const toggle = (id) => {
    const on = !mine.includes(id);
    setPopped(on ? id : null);
    setStore((prev) => {
      const cur = new Set(Array.isArray(prev?.[key]) ? prev[key] : []);
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
      return { ...(prev && typeof prev === 'object' ? prev : {}), [key]: [...cur] };
    });
  };

  return (
    <div className="nl-reactions" role="group" aria-label={label ? `React to ${label}` : 'Reactions'} data-pulse="reactions">
      {KINDS.map(({ id, label: name, icon: Icon }) => {
        const on = mine.includes(id);
        const count = (seed[id] || 0) + (on ? 1 : 0);
        return (
          <Tooltip key={id} label={name} describe={false}>
            <button
              type="button"
              className={cx('nl-reaction', `nl-reaction--${id}`, on && 'is-on', popped === id && 'is-popping')}
              aria-pressed={on}
              aria-label={`${name}, ${count}`}
              onClick={() => toggle(id)}
              onAnimationEnd={() => setPopped(null)}
            >
              <Icon className="nl-reaction__icon" weight={on ? 'fill' : 'regular'} aria-hidden="true" />
              <span className="nl-reaction__count u-tabular">{count}</span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
