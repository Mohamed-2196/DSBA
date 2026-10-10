import { useState } from 'react';
import { Heart, Lightbulb, Smiley, type Icon } from '@phosphor-icons/react';
import type { ReactionCounts } from '../../../api/types';
import { errorMessage } from '../../../api/errors';
import { useAuth } from '../../../auth';
import { useToast } from '../../../state';
import { Tooltip, cx } from '../../../ui';
import { useReact } from '../api';
import type { Reaction } from '../types';
import './Reactions.css';

const KINDS: { id: Reaction; label: string; icon: Icon }[] = [
  { id: 'useful', label: 'Useful', icon: Lightbulb },
  { id: 'love', label: 'Love this', icon: Heart },
  { id: 'laugh', label: 'Made me laugh', icon: Smiley },
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
 * is asked to sign in first; the reaction is added once they have.
 */
export function Reactions({ issueId, issueSlug, sectionId, counts, label, readOnly = false }: ReactionsProps) {
  const { requireAuth } = useAuth();
  const { push } = useToast();
  const react = useReact();
  const [popped, setPopped] = useState<Reaction | null>(null);
  const mine = counts?.mine ?? [];

  const send = (id: Reaction, on: boolean) =>
    react.mutate(
      { issueId, slug: issueSlug, sectionId, reaction: id, on },
      { onError: (e) => push({ tone: 'alert', title: 'Your reaction wasn’t saved', body: errorMessage(e, 'Try again in a moment.') }) },
    );

  const toggle = (id: Reaction) => {
    const on = !mine.includes(id);
    if (!requireAuth('Sign in to react', () => send(id, true))) return;
    setPopped(on ? id : null);
    send(id, on);
  };

  return (
    <div className="nl-reactions" role="group" aria-label={label ? `React to ${label}` : 'Reactions'} data-hub="reactions">
      {KINDS.map(({ id, label: name, icon: Glyph }) => {
        const on = mine.includes(id);
        const count = counts?.[id] ?? 0;
        return (
          <Tooltip key={id} label={name} describe={false}>
            <button
              type="button"
              className={cx('nl-reaction', `nl-reaction--${id}`, on && 'is-on', popped === id && 'is-popping')}
              aria-pressed={on}
              aria-label={`${name}, ${count}`}
              disabled={readOnly}
              onClick={() => toggle(id)}
              onAnimationEnd={() => setPopped(null)}
            >
              <Glyph className="nl-reaction__icon" weight={on ? 'fill' : 'regular'} aria-hidden="true" />
              <span className="nl-reaction__count u-tabular">{count}</span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
