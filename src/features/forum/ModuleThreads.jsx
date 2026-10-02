import { useMemo } from 'react';
import { ChatsCircle, Plus } from '@phosphor-icons/react';
import { getModule } from '../../data/modules.js';
import { Button, EmptyState, Panel } from '../../ui';
import { sortThreads } from './lib/model.js';
import { ForumProvider } from './state/ForumProvider.jsx';
import { useForum } from './state/context.js';
import { ThreadRow } from './components/ThreadRow.jsx';
import './components/forum.css';
import './HotThreads.css';

/** Module page "Discussion" tab: this module's threads + "Ask about this module". */
export function ModuleThreads({ moduleId }) {
  return (
    <ForumProvider>
      <ModuleThreadsList moduleId={moduleId} />
    </ForumProvider>
  );
}

function ModuleThreadsList({ moduleId }) {
  const { threads, toggleThreadVote } = useForum();
  const mod = getModule(moduleId);
  const list = useMemo(() => (mod ? sortThreads(threads.filter((t) => t.moduleId === mod.id), 'hot') : []), [threads, mod]);
  const name = mod ? mod.unitCode || mod.name : 'this module';
  const askTo = mod ? `/forum/new?module=${mod.id}` : '/forum/new';
  const answered = list.filter((t) => t.answered).length;

  if (!list.length) {
    return (
      <Panel padding="none">
        <EmptyState
          icon={ChatsCircle}
          title={`No threads about ${name} yet`}
          body="Ask the first question and your classmates will see it here and in the forum."
          action={
            <Button variant="primary" leadingIcon={Plus} to={askTo}>
              Ask about this module
            </Button>
          }
        />
      </Panel>
    );
  }

  return (
    <section className="forum-modthreads" aria-labelledby="forum-modthreads-title" data-hub="module-threads">
      <div className="forum-modthreads__head">
        <div>
          <h2 id="forum-modthreads-title" className="forum-modthreads__title">
            <span className="u-tabular">{list.length}</span> {list.length === 1 ? 'thread' : 'threads'} about {name}
          </h2>
          <p className="forum-modthreads__desc">
            {answered ? `${answered} answered. ` : ''}Questions, study groups and tips from students taking it.
          </p>
        </div>
        <Button variant="primary" leadingIcon={Plus} to={askTo}>
          Ask about this module
        </Button>
      </div>
      <Panel as="div" padding="none">
        <ul role="list" className="forum-list">
          {list.map((t) => (
            <ThreadRow key={t.id} thread={t} onVote={toggleThreadVote} showModule={false} />
          ))}
        </ul>
      </Panel>
    </section>
  );
}
