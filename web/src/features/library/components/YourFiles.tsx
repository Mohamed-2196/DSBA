// Your files, on the Account page: the uploads a student rep hasn't made public yet (with the rep's note), then the
// files you shared that are public, and the files you starred, newest first, a page at a time. Each module's page lists
// its files; these are the lists that are yours across every module.
import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Icon, Panel, QueryError, Skeleton, formatCount, glyph } from '../../../ui';
import { useLibraryPages } from '../api';
import type { LibraryItem, LibraryQuery, LinkState } from '../types';
import { useStar } from '../useStar';
import { FileRows } from './FileRow';
import { YourUploads } from './YourUploads';
import './YourFiles.css';

const PAGE = 20;

function FileList({
  query,
  title,
  empty,
  linkState,
  hub,
}: {
  query: LibraryQuery;
  title: string;
  empty: string;
  linkState: LinkState;
  hub: string;
}) {
  const toggleStar = useStar();
  const pages = useLibraryPages(query, { pageSize: PAGE });
  const items = useMemo<LibraryItem[]>(() => pages.data?.pages.flatMap((p) => p.items) ?? [], [pages.data]);
  const total = pages.data?.pages[0]?.total ?? null;
  let body;
  if (pages.isPending) body = <Skeleton lines={3} />;
  else if (pages.isError)
    body = (
      <QueryError
        error={pages.error}
        title={`${title} didn’t load`}
        onRetry={() => void pages.refetch()}
        retrying={pages.isFetching}
        size="sm"
      />
    );
  else if (!items.length) body = <p className="lib-files__empty">{empty}</p>;
  else
    body = (
      <>
        <FileRows items={items} sort="new" onToggleStar={toggleStar} linkState={linkState} />
        {pages.hasNextPage ? (
          <Button
            variant="ghost"
            size="sm"
            className="lib-files__more"
            onClick={() => void pages.fetchNextPage()}
            loading={pages.isFetchingNextPage}
          >
            Show more
          </Button>
        ) : null}
      </>
    );
  return (
    <section className="lib-files__part" aria-label={title} data-hub={hub}>
      <h3 className="lib-files__title">
        {title}
        {total ? <span className="lib-files__count u-tabular"> ({formatCount(total)})</span> : null}
      </h3>
      {body}
    </section>
  );
}

/** The signed-in student's own lists: uploads waiting or not published, what they shared, what they starred. */
export default function YourFiles({ onUpload }: { onUpload: (() => void) | null }) {
  const location = useLocation();
  const linkState = useMemo<LinkState>(
    () => ({ from: `${location.pathname}${location.search}#your-files` }),
    [location.pathname, location.search],
  );
  // '#your-files' (after an upload, or deleting one of yours): bring the lists into view.
  const wanted = location.hash === '#your-files';
  useEffect(() => {
    if (wanted) document.getElementById('your-files')?.scrollIntoView({ block: 'start' });
  }, [wanted]);
  return (
    <Panel className="lib-files" data-hub="your-files">
      <YourUploads linkState={linkState} />
      <FileList
        query={{ mine: true, status: 'published' }}
        title="Shared by you"
        empty="Nothing you uploaded is public yet. Each module’s page has Upload a file."
        linkState={linkState}
        hub="your-files-shared"
      />
      <FileList
        query={{ starred: true }}
        title="Starred"
        empty="Star a file to keep it here. Its star is on its page, and in every list of files."
        linkState={linkState}
        hub="your-files-starred"
      />
      {onUpload ? (
        <Button
          variant="secondary"
          leadingIcon={<Icon glyph={glyph.upload} />}
          onClick={onUpload}
          className="lib-files__more"
        >
          Upload a file
        </Button>
      ) : null}
    </Panel>
  );
}
