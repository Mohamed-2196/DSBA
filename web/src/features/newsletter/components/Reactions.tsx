import { useState } from 'react';
import type { ReactionCounts } from '../../../api/types';
import { errorMessage } from '../../../api/errors';
import { useAuth } from '../../../auth';
import { useToast } from '../../../state';
import { Count, Tooltip, cx, glyph, Icon, type Glyph } from '../../../ui';
import { useReact } from '../api';
import type { Reaction } from '../types';
import './Reactions.css';

const KINDS: { id: Reaction; label: string; icon: Glyph }[] = [
  { id: 'useful', label: 'Useful', icon: glyph.bulb },
  { id: 'love', label: 'Love this', icon: glyph.heart },
  { id: 'laugh', label: 'Made me laugh', icon: glyph.smiley },
];

export interface ReactionsProps {
  issueId: string;
  issueSlug: string;
  sectionId: string;
  counts: ReactionCounts | undefined;
  /** The section's label, for the group's accessible name. */
  label?: string;
  /** Show the counts without buttons (a draft, the editor's preview). */
  readOnly?: boolean;
}

/**
 * Per-section reactions, saved on the account (signed in) and counted for everyone. A guest who presses one
 * is asked to sign in first; the reaction is added once they have. An account without the newsletter.react box sees
 * the counts with the buttons disabled.
 */
export function Reactions({ issueId, issueSlug, sectionId, counts, label, readOnly = false }: ReactionsProps) {
  const { requireAuth, mayTry } = useAuth();
  const reacts = mayTry('newsletter.react');
  const pressable = !readOnly && reacts;
  const { push } = useToast();
  const react = useReact();
  const [popped, setPopped] = useState<Reaction | null>(null);
  const mine = counts?.mine ?? [];

  const send = (id: Reaction, on: boolean) =>
    react.mutate(
      { issueId, slug: issueSlug, sectionId, reaction: id, on },
      {
        onError: (e) =>
          push({ tone: 'alert', title: 'Your reaction wasn’t saved', body: errorMessage(e, 'Try again in a moment.') }),
      },
    );

  const toggle = (id: Reaction) => {
    const on = !mine.includes(id);
    if (!requireAuth('Sign in to react', () => send(id, true))) return;
    setPopped(on ? id : null);
    send(id, on);
  };

  return (
    <div
      className="nl-reactions"
      role="group"
      aria-label={label ? `React to ${label}` : 'Reactions'}
      data-hub="reactions"
    >
      {KINDS.map(({ id, label: name, icon }) => {
        const on = mine.includes(id);
        const count = counts?.[id] ?? 0;
        return (
          <Tooltip
            key={id}
            label={readOnly || reacts ? name : `${name}. Reacting isn’t on your account`}
            describe={false}
          >
            <button
              type="button"
              className={cx('nl-reaction', `nl-reaction--${id}`, on && 'is-on', popped === id && 'is-popping')}
              aria-pressed={on}
              aria-label={
                readOnly || reacts ? `${name}, ${count}` : `${name}, ${count}. Reacting isn’t on your account`
              }
              disabled={!pressable}
              onClick={() => toggle(id)}
              onAnimationEnd={() => setPopped(null)}
            >
              <Icon glyph={icon} className="nl-reaction__icon" active={on} />
              <span className="nl-reaction__count">
                <Count value={count} />
              </span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
