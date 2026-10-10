import { Link } from 'react-router-dom';
import { ArrowFatUp, Books, ChatCircle, ChatsCircle, FileText, Plus } from '@phosphor-icons/react';
import { Badge, Button, CohortBadge } from '../../../../ui';
import { getModule } from '../../../../data/modules';
import { personName } from '../../lib/live';
import { RichText } from '../RichText';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const moduleTag = (moduleId) => {
  const m = moduleId ? getModule(moduleId) : null;
  return m ? m.unitCode || m.shortName : null;
};

/** From the forum: the hottest threads (forum public API), or an invitation when there are none. */
export function ForumList({ threads, fallback }) {
  if (!threads.length) {
    return (
      <div className="nl-live nl-live--empty">
        <p className="nl-p">
          <RichText text={fallback.text} />
        </p>
        <p className="nl-cta">
          <Button variant="primary" leadingIcon={Plus} to="/forum/new">
            Start a thread
          </Button>
          <Button variant="ghost" leadingIcon={ChatsCircle} to="/forum">
            Browse the forum
          </Button>
        </p>
      </div>
    );
  }
  return (
    <div className="nl-live">
      <ol role="list" className="nl-rows">
        {threads.map((t) => {
          const tag = moduleTag(t.moduleId);
          const votes = Number(t.votes) || 0;
          const replies = Number(t.replies) || 0;
          const author = personName(t.author);
          return (
            <li key={t.id}>
              <Link to={`/forum/${t.id}`} className="nl-row">
                <span className="nl-row__votes" aria-label={plural(votes, 'vote')}>
                  <ArrowFatUp weight="fill" aria-hidden="true" />
                  <span className="u-tabular">{votes}</span>
                </span>
                <span className="nl-row__main">
                  <span className="nl-row__title">{t.title}</span>
                  <span className="nl-row__meta">
                    {tag ? <span className="nl-row__code">{tag}</span> : null}
                    {t.year ? <CohortBadge year={t.year} variant="dot" size="sm" /> : null}
                    <span className="nl-row__stat">
                      <ChatCircle aria-hidden="true" />
                      {plural(replies, 'reply', 'replies')}
                    </span>
                    {author ? <span>{author}</span> : null}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="nl-cta">
        <Button leadingIcon={ChatsCircle} to="/forum">
          Join the conversation
        </Button>
      </p>
    </div>
  );
}

const FORMAT_LABEL = { pdf: 'PDF', docx: 'Word', doc: 'Word', xlsx: 'Excel', pptx: 'Slides', ipynb: 'Notebook', r: 'R script' };
const PAGE_NOUN = { pptx: 'slide', xlsx: 'sheet' };

/** New in the library: recent files (library public API), or the students' notes already shared. */
export function LibraryList({ files, notes, fallback }) {
  if (!files.length) {
    return (
      <div className="nl-live nl-live--empty">
        <p className="nl-p">
          <RichText text={fallback.text} />
        </p>
        {notes.length ? (
          <ul role="list" className="nl-rows">
            {notes.map((n) => (
              <li key={`${n.moduleId}-${n.name}`}>
                <Link to={`/modules/${n.moduleId}?tab=files`} className="nl-row">
                  <span className="nl-row__doc" aria-hidden="true">
                    <FileText weight="duotone" />
                  </span>
                  <span className="nl-row__main">
                    <span className="nl-row__title">{n.author && n.name === n.author ? `${n.author}’s notes` : n.name}</span>
                    <span className="nl-row__meta">
                      <span className="nl-row__code">{n.unitCode || n.moduleName}</span>
                      <CohortBadge year={n.year} variant="dot" size="sm" />
                      {n.author && n.name !== n.author ? <span>by {n.author}</span> : null}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="nl-cta">
          <Button leadingIcon={Books} to="/library">
            Open the library
          </Button>
        </p>
      </div>
    );
  }
  return (
    <div className="nl-live">
      <ol role="list" className="nl-rows">
        {files.map((f) => {
          const tag = moduleTag(f.moduleId);
          const key = String(f.format || '').toLowerCase();
          const fmt = FORMAT_LABEL[key] || (f.format ? String(f.format).toUpperCase() : null);
          const author = personName(f.author);
          return (
            <li key={f.id}>
              <Link to={`/library/${f.id}`} className="nl-row">
                <span className="nl-row__doc" aria-hidden="true">
                  <FileText weight="duotone" />
                </span>
                <span className="nl-row__main">
                  <span className="nl-row__title">
                    {f.title}
                    {f.isNew ? (
                      <Badge tone="highlight" size="sm" className="nl-row__new">
                        New
                      </Badge>
                    ) : null}
                  </span>
                  <span className="nl-row__meta">
                    {tag ? <span className="nl-row__code">{tag}</span> : null}
                    {fmt ? <span>{f.pages ? `${fmt}, ${plural(Number(f.pages), PAGE_NOUN[key] || 'page')}` : fmt}</span> : null}
                    {author ? <span>{author}</span> : null}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="nl-cta">
        <Button leadingIcon={Books} to="/library">
          Open the library
        </Button>
      </p>
    </div>
  );
}
