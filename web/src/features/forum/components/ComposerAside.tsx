// The margin of "Start a thread": similar threads, tips for a good thread, and the module it is about.
import { Link } from 'react-router-dom';
import { CheckCircle } from '@phosphor-icons/react';
import type { ModuleSummary, ThreadSummary } from '../../../api/types';
import { useModules } from '../../../state/modules';
import type { SimilarState } from '../lib/useSimilar';
import { ModuleTag, ReplyCount } from './ThreadBits';

const TIPS = [
  'Ask one clear question in the title.',
  "Say what you've tried so far and where you got stuck.",
  'Pick the module so the right cohort sees it.',
  'Use `backticks` for formulas and code.',
];

/** Threads like the one being written: a title, its replies (answered or not), the module and votes. */
export function SimilarList({ threads }: { threads: ThreadSummary[] }) {
  const { getModule } = useModules();
  return (
    <ul role="list" className="forum-related">
      {threads.map((t) => (
        <li key={t.id} className="forum-related__item forum-new__match">
          <Link to={`/forum/${t.slug}`} className="forum-related__link" dir="auto">
            {t.title}
          </Link>
          <span className="forum-related__meta">
            <ReplyCount count={t.replyCount} answered={t.answered} />
            <ModuleTag module={getModule(t.moduleId)} showName={false} />
            {t.voteCount > 0 ? (
              <span className="u-tabular">
                {t.voteCount} {t.voteCount === 1 ? 'vote' : 'votes'}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Under the title on narrow layouts (the margin shows the list on wide ones). */
export function SimilarInline({ similar }: { similar: SimilarState }) {
  return (
    <div className={similar.threads.length ? 'forum-composer__similar' : 'forum-composer__similar is-empty'} aria-live="polite">
      {similar.threads.length ? (
        <>
          <p className="forum-composer__similar-title">Similar threads. Your question may already have an answer.</p>
          <SimilarList threads={similar.threads.slice(0, 3)} />
        </>
      ) : null}
    </div>
  );
}

export function ComposerAside({ similar, module }: { similar: SimilarState; module: ModuleSummary | null }) {
  return (
    <aside className="forum-new__side" aria-label="Before you post">
      <section className="forum-new__block forum-new__block--similar" aria-live="polite" aria-labelledby="forum-new-similar">
        <h2 id="forum-new-similar" className="forum-side__title">
          Similar threads
        </h2>
        {similar.threads.length ? (
          <>
            <p className="forum-new__note">Your question may already have an answer.</p>
            <SimilarList threads={similar.threads} />
          </>
        ) : (
          <p className="forum-new__note">
            {similar.searching
              ? similar.loading
                ? 'Looking for similar threads…'
                : 'Nothing similar yet. Looks like a fresh question.'
              : 'Start typing a title and matching threads will show up here.'}
          </p>
        )}
      </section>

      <section className="forum-new__block" aria-labelledby="forum-new-tips">
        <h2 id="forum-new-tips" className="forum-side__title">
          Tips for a good thread
        </h2>
        <ul role="list" className="forum-tips">
          {TIPS.map((tip) => (
            <li key={tip}>{tip.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))}</li>
          ))}
        </ul>
      </section>

      {module ? (
        <section className="forum-new__block" aria-labelledby="forum-new-module">
          <h2 id="forum-new-module" className="forum-side__title">
            Posting about
          </h2>
          <p className="forum-new__module">
            <ModuleTag module={module} />
          </p>
          <p className="forum-new__note">
            <CheckCircle aria-hidden="true" weight="fill" className="forum-new__ok" /> It will also show on the module’s Discussion tab.
          </p>
        </section>
      ) : null}
    </aside>
  );
}
