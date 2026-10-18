// The full page before anything is asked: Noora greets the student by name and shows, with one card per kind of
// help, that she answers anything they study. A card fills the box with a question to finish (starters.ts).
import { SignIn } from '@phosphor-icons/react';
import { useMediaQuery } from '../../../state';
import { Button } from '../../../ui';
import { Face } from '../Face';
import { STARTER_ICONS } from './starterIcons';
import type { Starter } from './starters';

export interface WelcomeProps {
  /** the student's first name, or null (a guest) */
  name: string | null;
  /** the line under her greeting (her script's welcome) */
  lead: string;
  starters: readonly Starter[];
  onStart: (starter: Starter) => void;
  /** why her AI isn't answering (null: it is) */
  paused: string | null;
  /** a guest: sign in to get her AI answers */
  onSignIn: (() => void) | null;
}

/** A short screen or a phone (NooraPage.css tightens the welcome there too). */
const SHORT = '(max-height: 880px), (max-width: 699px) and (max-height: 960px)';

export function Welcome({ name, lead, starters, onStart, paused, onSignIn }: WelcomeProps) {
  const short = useMediaQuery(SHORT);
  return (
    <div className="np-welcome" data-hub="noora-welcome">
      <Face bust="wave" size={short ? 48 : 64} className="np-welcome__face" />
      <h2 className="np-welcome__title">{name ? `What can I help with, ${name}?` : 'What can I help with?'}</h2>
      <p className="np-welcome__lead">{lead}</p>
      {onSignIn ? (
        <div className="np-welcome__notice">
          <p>Sign in to get full answers from my AI. Until then I answer from my script: modules, lessons, exam dates and where things are.</p>
          <Button size="sm" variant="primary" leadingIcon={SignIn} onClick={onSignIn} data-hub="noora-sign-in">
            Sign in
          </Button>
        </div>
      ) : paused ? (
        <p className="np-welcome__notice" data-hub="noora-ai-paused">
          {paused}
        </p>
      ) : null}
      <ul role="list" className="np-starters" aria-label="Ways to start">
        {starters.map((s) => {
          const StarterIcon = STARTER_ICONS[s.icon].icon;
          return (
            <li key={s.id}>
              <button type="button" className="np-starter" onClick={() => onStart(s)} data-hub="noora-starter" data-starter={s.id}>
                <StarterIcon className="np-starter__icon" aria-hidden="true" weight="duotone" />
                <span className="np-starter__text">
                  <span className="np-starter__title">{s.title}</span>
                  <span className="np-starter__example">{s.example}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
