import { Link } from 'react-router-dom';
import { ArrowFatUp, Books, ChatCircle, ChatsCircle, FileText, Plus } from '@phosphor-icons/react';
import type { LibraryItem, ThreadSummary } from '../../../../api/types';
import { libraryItemPath } from '../../../library/public';
import { useModules } from '../../../../state/modules';
import { Badge, Button, CohortBadge, Skeleton } from '../../../../ui';
import { RichText } from '../RichText';

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const NEW_DAYS = 14;

/** Rows standing in for a live list while it loads. */
export function LiveSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="nl-live" aria-busy="true">
      <span className="visually-hidden">Loading</span>
      <ul role="list" className="nl-rows" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="nl-row nl-row--loading">
            <Skeleton width={36} height={36} radius={10} />
            <span className="nl-row__main">
              <Skeleton width="72%" height={16} />
              <Skeleton width="40%" height={12} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** From the forum: the hottest threads, or an invitation when there are none. */
export function ForumList({ threads, fallback }: { threads: ThreadSummary[]; fallback?: { title: string; text: string } }) {
  const { getModule } = useModules();
  if (!threads.length) {
    return (
      <div className="nl-live nl-live--empty">
        {fallback ? (
          <p className="nl-p">
            <RichText text={fallback.text} />
          </p>
        ) : null}
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
          const m = getModule(t.moduleId);
          const tag = m ? (m.unitCode ?? m.shortName) : null;
          return (
            <li key={t.id}>
              <Link to={`/forum/${encodeURIComponent(t.slug || t.id)}`} className="nl-row">
                <span className="nl-row__votes" aria-label={plural(t.voteCount, 'vote')}>
                  <ArrowFatUp weight="fill" aria-hidden="true" />
                  <span className="u-tabular">{t.voteCount}</span>
                </span>
                <span className="nl-row__main">
                  <span className="nl-row__title">{t.title}</span>
                  <span className="nl-row__meta">
                    {tag ? <span className="nl-row__code">{tag}</span> : null}
                    {t.year ? <CohortBadge year={t.year} variant="dot" size="sm" /> : null}
                    <span className="nl-row__stat">
                      <ChatCircle aria-hidden="true" />
                      {plural(t.replyCount, 'reply', 'replies')}
                    </span>
                    {t.author ? <span>{t.author.displayName}</span> : null}
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

const FORMAT_LABEL: Record<string, string> = { pdf: 'PDF', docx: 'Word', doc: 'Word', xlsx: 'Excel', pptx: 'Slides', ipynb: 'Notebook', r: 'R script' };

const isRecent = (iso: string | null, now = Date.now()): boolean => !!iso && now - new Date(iso).getTime() < NEW_DAYS * 86400000;

/** New in the library: the newest files, or an invitation to the library when there are none. */
export function LibraryList({ files, fallback }: { files: LibraryItem[]; fallback?: { title: string; text: string } }) {
  const { getModule } = useModules();
  if (!files.length) {
    return (
      <div className="nl-live nl-live--empty">
        {fallback ? (
          <p className="nl-p">
            <RichText text={fallback.text} />
          </p>
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
          const m = getModule(f.moduleId);
          const tag = m ? (m.unitCode ?? m.shortName) : null;
          const key = (f.format ?? '').toLowerCase();
          const format = f.source === 'link' ? 'Link' : (FORMAT_LABEL[key] ?? f.format);
          const author = f.authorName ?? f.uploadedBy?.displayName ?? null;
          return (
            <li key={f.id}>
              <Link to={libraryItemPath(f)} className="nl-row">
                <span className="nl-row__doc" aria-hidden="true">
                  <FileText weight="duotone" />
                </span>
                <span className="nl-row__main">
                  <span className="nl-row__title">
                    {f.title}
                    {isRecent(f.publishedAt) ? (
                      <Badge tone="highlight" size="sm" className="nl-row__new">
                        New
                      </Badge>
                    ) : null}
                  </span>
                  <span className="nl-row__meta">
                    {tag ? <span className="nl-row__code">{tag}</span> : null}
                    {format ? <span>{format}</span> : null}
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
