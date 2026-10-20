// /requests: what students asked the reps for, the most wanted first. Filters live in the URL (?kind, ?status,
// ?sort, ?mine). ?new=<kind> opens "New request" with that kind (the library's "Ask for it" links here). "You asked,
// we did" opens the page while no filter is set.
import { useAuth } from '../../auth';
import { useQueryParam, useSetQueryParams } from '../../state';
import {
  Button,
  Chip,
  Count,
  EmptyState,
  glyph,
  Icon,
  Page,
  PageHeader,
  PageSection,
  QueryError,
  SegmentedControl,
  Select,
  Skeleton,
} from '../../ui';
import { useRequests } from './api';
import { DoneLately } from './components/DoneLately';
import { NewRequestDialog } from './components/NewRequestDialog';
import { RequestCard } from './components/RequestCard';
import { KINDS, SORTS, STATUSES, parseKind, parseSort, parseStatus } from './labels';
import type { RequestFilters } from './types';
import { useMayAsk } from './useMayAsk';
import './requests.css';

const ALL = 'all';

export default function RequestsPage() {
  const { me, requireAuth } = useAuth();
  const mayAsk = useMayAsk();
  const [kindParam, setKind] = useQueryParam('kind');
  const [statusParam, setStatus] = useQueryParam('status');
  const [sortParam, setSort] = useQueryParam('sort');
  const [mineParam, setMine] = useQueryParam('mine');
  const [newParam, setNew] = useQueryParam('new');
  const setParams = useSetQueryParams();
  const filters: RequestFilters = {
    kind: parseKind(kindParam),
    status: parseStatus(statusParam),
    sort: parseSort(sortParam),
    mine: !!me && mineParam === '1',
  };
  const list = useRequests(filters);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;
  const anyFilter = !!(filters.kind || filters.status || filters.mine);

  const startRequest = () => {
    const kind = parseKind(newParam) ?? ALL; // keeps the kind a link asked for
    if (!requireAuth('Sign in to ask for something', () => setNew(kind))) return;
    setNew(kind);
  };
  const askButton =
    mayAsk === 'suspended' ? null : (
      <Button variant="primary" leadingIcon={<Icon glyph={glyph.plus} />} onClick={startRequest} data-hub="new-request">
        New request
      </Button>
    );

  let body;
  if (list.isError && !list.data) {
    body = (
      <QueryError
        error={list.error}
        title="Requests didn’t load"
        onRetry={() => void list.refetch()}
        retrying={list.isFetching}
      />
    );
  } else if (list.isPending) {
    body = <Skeleton lines={5} />;
  } else if (!items.length) {
    body = anyFilter ? (
      <EmptyState
        icon={<Icon glyph={glyph.question} />}
        title="No requests match these filters"
        body="Try another kind or status."
        action={<Button onClick={() => setParams({ kind: null, status: null, mine: null })}>Clear filters</Button>}
      />
    ) : (
      <EmptyState
        icon={<Icon glyph={glyph.question} />}
        title="No requests yet"
        body="Need a past paper, a fix or a date the hub doesn’t have? Ask the reps here."
        action={askButton}
      />
    );
  } else {
    body = (
      <>
        <ul role="list" className="req-list" aria-busy={list.isFetching || undefined}>
          {items.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </ul>
        {list.hasNextPage ? (
          <div className="req-more">
            <Button onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage}>
              Show more
            </Button>
            <span>
              Showing <Count value={items.length} /> of <Count value={total} />
            </span>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <Page className="req-page">
      <PageHeader
        section="tools"
        title="Requests"
        description="Ask the reps for a past paper, a fix, a date or a feature. Say “me too” to what you need as well: the most wanted come first."
        actions={askButton}
      />
      {anyFilter ? null : <DoneLately onShowAll={() => setStatus('done', { replace: true })} />}
      <PageSection aria-label="Requests" className="req-browse">
        <div className="req-filters">
          <Select
            label="Kind"
            hideLabel
            value={filters.kind ?? ''}
            onChange={(e) => setKind(e.target.value || null, { replace: true })}
            placeholder="Every kind"
            options={KINDS.map((k) => ({ value: k.value, label: k.label }))}
            className="req-filters__kind"
          />
          <SegmentedControl
            label="Status"
            size="sm"
            options={[{ value: ALL, label: 'All' }, ...STATUSES.map((s) => ({ value: s.value, label: s.label }))]}
            value={filters.status ?? ALL}
            onChange={(v) => setStatus(v === ALL ? null : v, { replace: true })}
            className="req-filters__status"
          />
          <SegmentedControl
            label="Sort"
            size="sm"
            options={SORTS}
            value={filters.sort}
            onChange={(v) => setSort(v === 'me_too' ? null : v, { replace: true })}
          />
          {me ? (
            <Chip selected={filters.mine} onChange={(on) => setMine(on ? '1' : null, { replace: true })}>
              Yours
            </Chip>
          ) : null}
        </div>
        {body}
      </PageSection>
      {newParam !== null && mayAsk === 'yes' ? (
        <NewRequestDialog open onClose={() => setNew(null, { replace: true })} kind={parseKind(newParam)} />
      ) : null}
    </Page>
  );
}
