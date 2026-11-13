import { useEffect, useMemo, useState } from 'react';
import type { CareerCert, ModuleSummary } from '../../api/types';
import { useDebouncedValue, useQueryParam, useSetQueryParams } from '../../state';
import { useModules } from '../../state/modules';
import { Button, EmptyState, glyph, Icon, PageSection, Panel, Select, cx } from '../../ui';
import { BoardFilters, type FacetGroup } from './BoardFilters';
import { useCareerData } from './context';
import { listParam, parseList, resultsLine } from './lib/board';
import {
  certCounts,
  certsFiltered,
  fieldsOf,
  filterCerts,
  isCertFacet,
  parseCertSort,
  sortCerts,
  type CertFilters,
} from './lib/certs';
import { SHOW_CERT_EVENT, jumpTo } from './lib/jump';
import { libraryLink, webUrl } from './lib/links';
import { hostOf } from '../../lib/share';
import { LogoSlot } from './LogoSlot';
import { ModuleLink } from './ModuleLink';
import './Opportunities.css';
import './Certificates.css';

const NOUN = { one: 'certificate', many: 'certificates' };
const EFFORTS = ['1', '2', '3'] as const;
/** How many certificates show before "Show all", while no search or filter narrows the list. */
const FIRST = 12;

/** Three pips for how heavy the study load is. Light, medium or heavy: a rough guide, not a promise. */
function Effort({ level }: { level: CareerCert['effort'] }) {
  const { effortLabel } = useCareerData();
  const label = effortLabel[String(level)] ?? '';
  return (
    <span className="career-effort" role="img" aria-label={`${label} effort, ${level} of 3`}>
      <span className="career-effort__pips" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} className={cx('career-effort__pip', i <= level && 'is-on')} />
        ))}
      </span>
      <span className="career-effort__label" aria-hidden="true">
        {label}
      </span>
    </span>
  );
}

/**
 * One certificate in the results, laid out like an employer: its logo tile, its name and issuer, a line of its effort,
 * the time it takes and the roles it helps, what it is good for, the DSBA modules that already cover part of it, and
 * one button to its official page (or, for self-study, to its file in the library).
 */
export function CertCard({ cert }: { cert: CareerCert }) {
  const { roles } = useCareerData();
  const { getModule } = useModules();
  const modules = cert.covers.map((id) => getModule(id)).filter((m): m is ModuleSummary => m !== null);
  const roleTitles = cert.roles.map((id) => roles.find((r) => r.id === id)?.title).filter((t): t is string => !!t);
  const url = webUrl(cert.url);
  const host = hostOf(url);
  return (
    <li id={`career-cert-${cert.id}`} className="career-emp career-cert" data-hub="career-cert" data-cert-id={cert.id}>
      {url ? (
        <LogoSlot kind="cert" id={cert.id} logo={cert.logo} mono={cert.mono ?? ''} />
      ) : (
        // Self-study has no issuer and so no logo: a generic icon keeps the same box.
        <span className="career-cert__icon" aria-hidden="true">
          <Icon glyph={glyph.database} />
        </span>
      )}

      <div className="career-emp__main">
        <h3 className="career-emp__name">{cert.name}</h3>
        <p className="career-emp__programme">{cert.issuer}</p>
        <p className="career-emp__meta">
          <span>
            <Effort level={cert.effort} />
          </span>
          <span>{cert.effortNote}</span>
          {roleTitles.length ? <span>{roleTitles.join(', ')}</span> : null}
        </p>
        <p className="career-emp__why">{cert.goodFor}</p>
        {modules.length || cert.coversNote ? (
          <div className="career-cert__covers">
            <span className="career-cert__label">Already in DSBA</span>
            {modules.map((m) => (
              <ModuleLink key={m.id} module={m} />
            ))}
            {cert.coversNote ? <span className="career-cert__covers-note">{cert.coversNote}</span> : null}
          </div>
        ) : null}
      </div>

      {url ? (
        <Button
          variant="secondary"
          size="sm"
          href={url}
          trailingIcon={<Icon glyph={glyph.external} />}
          className="career-emp__cta"
        >
          Official page
          <span className="visually-hidden">{` for ${cert.name}, opens ${host} in a new tab`}</span>
        </Button>
      ) : cert.file ? (
        <Button
          variant="secondary"
          size="sm"
          to={libraryLink(cert.file.module)}
          leadingIcon={<Icon glyph={glyph.page} />}
          className="career-emp__cta"
        >
          Find it in the library
        </Button>
      ) : null}
    </li>
  );
}

/**
 * Certificates and courses students ask about, laid out like the vacancies: a search and filters (field, effort, and
 * the roles each one helps) down the side, the results beside them with how many match and a sort, one per row, the
 * first FIRST until "Show all". The URL holds the state: ?cq= the search, ?cfield=, ?ceffort= and ?crole= comma lists,
 * ?csort=name or effort, ?call=1 every certificate.
 */
export function Certificates() {
  const { certs, roles, effortLabel } = useCareerData();
  const setParams = useSetQueryParams();
  const [qParam] = useQueryParam('cq', '');
  const [fieldParam] = useQueryParam('cfield');
  const [effortParam] = useQueryParam('ceffort');
  const [roleParam] = useQueryParam('crole');
  const [sortParam, setSort] = useQueryParam('csort');
  const [allParam, setAll] = useQueryParam('call');
  const fields = useMemo(() => fieldsOf(certs), [certs]);

  // The roles any certificate helps, in the roles' own order.
  const helped = useMemo(() => roles.filter((r) => certs.some((c) => c.roles.includes(r.id))), [roles, certs]);
  const filters: CertFilters = useMemo(
    () => ({
      q: qParam,
      field: parseList(fieldParam, new Set(fields)),
      effort: parseList(effortParam, new Set(EFFORTS)),
      role: parseList(roleParam, new Set(helped.map((r) => r.id))),
    }),
    [qParam, fieldParam, effortParam, roleParam, helped, fields],
  );
  const sort = parseCertSort(sortParam);

  // The box answers every key; the URL (and so the list) follows once typing settles.
  const [search, setSearch] = useState(qParam);
  const settled = useDebouncedValue(search, 250);
  useEffect(() => {
    if (settled.trim() !== qParam) setParams({ cq: settled.trim() || null }, { replace: true });
    // Only typing writes the URL; a URL change (Reset, back) is mirrored into the box below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);
  useEffect(() => {
    if (qParam !== settled.trim()) setSearch(qParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qParam]);

  const reset = () => {
    setSearch('');
    setParams({ cq: null, cfield: null, ceffort: null, crole: null }, { replace: true });
  };

  // A skill row asked for a certificate the filters hide: show them all, then show it.
  const [asked, setAsked] = useState<string | null>(null);
  useEffect(() => {
    const onAsk = (e: Event) => {
      if (!(e instanceof CustomEvent) || typeof e.detail !== 'string') return;
      setSearch('');
      setParams({ cq: null, cfield: null, ceffort: null, crole: null }, { replace: true });
      setAll('1', { replace: true });
      setAsked(e.detail);
    };
    window.addEventListener(SHOW_CERT_EVENT, onAsk);
    return () => window.removeEventListener(SHOW_CERT_EVENT, onAsk);
  }, [setParams, setAll]);
  useEffect(() => {
    if (!asked) return;
    jumpTo(`career-cert-${asked}`, { flash: true, block: 'center' });
    setAsked(null);
  }, [asked]);

  const matches = useMemo(() => sortCerts(filterCerts(certs, filters), sort), [certs, filters, sort]);
  if (!certs.length) return null;
  const foldable = !certsFiltered(filters) && matches.length > FIRST;
  const folded = foldable && allParam !== '1';
  const shown = folded ? matches.slice(0, FIRST) : matches;

  const groups: FacetGroup[] = [
    ...(fields.length
      ? [
          {
            facet: 'field',
            title: 'Field',
            options: fields.map((f) => ({ id: f, label: f })),
            counts: certCounts(certs, filters, 'field'),
            picked: filters.field,
          },
        ]
      : []),
    {
      facet: 'effort',
      title: 'Effort',
      options: EFFORTS.map((id) => ({ id, label: effortLabel[id] ?? id })),
      counts: certCounts(certs, filters, 'effort'),
      picked: filters.effort,
    },
    {
      facet: 'role',
      title: 'Helps with',
      options: helped.map((r) => ({ id: r.id, label: r.title })),
      counts: certCounts(certs, filters, 'role'),
      picked: filters.role,
    },
  ];
  const toggle = (facet: string, id: string, on: boolean) => {
    if (!isCertFacet(facet)) return;
    const next = on ? [...filters[facet], id] : filters[facet].filter((v) => v !== id);
    setParams({ [`c${facet}`]: listParam(next) }, { replace: true });
  };

  return (
    <PageSection
      id="career-certificates"
      className="career-opps career-certs"
      aria-labelledby="career-certs-title"
      data-hub="career-certs"
    >
      <h2 id="career-certs-title" className="visually-hidden">
        Certificates and courses
      </h2>

      <div className="career-board">
        <BoardFilters
          label="Search certificates and courses"
          placeholder="Search certificates"
          noun={NOUN}
          search={search}
          searching={filters.q.trim() !== ''}
          onSearch={setSearch}
          groups={groups}
          onToggle={toggle}
          onReset={reset}
        />

        <div className="career-results">
          <div className="career-results__bar">
            <p className="career-results__count" aria-live="polite" data-hub="career-cert-count">
              {resultsLine(shown.length, matches.length, NOUN)}
            </p>
            <div className="career-results__sort">
              <span className="career-results__sort-label" aria-hidden="true">
                Sort by:
              </span>
              <Select
                label="Sort by"
                hideLabel
                options={[
                  { value: 'suggested', label: 'Suggested' },
                  { value: 'name', label: 'Name, A to Z' },
                  { value: 'effort', label: 'Lightest first' },
                ]}
                value={sort}
                onChange={(e) =>
                  setSort(e.currentTarget.value === 'suggested' ? null : e.currentTarget.value, { replace: true })
                }
                data-hub="career-cert-sort"
              />
            </div>
          </div>

          {matches.length ? (
            <ul role="list" className="career-emps" aria-label={resultsLine(matches.length, matches.length, NOUN)}>
              {shown.map((c) => (
                <CertCard key={c.id} cert={c} />
              ))}
            </ul>
          ) : (
            <Panel padding="none" className="career-opps__empty">
              <EmptyState
                mate="loupe"
                title="No certificate matches"
                body="Try other words, or take a filter off."
                action={
                  certsFiltered(filters) ? (
                    <Button variant="secondary" size="sm" onClick={reset}>
                      Show all certificates
                    </Button>
                  ) : null
                }
              />
            </Panel>
          )}

          {foldable ? (
            <div className="career-opps__more">
              <Button
                variant="secondary"
                trailingIcon={<Icon glyph={folded ? glyph.chevronDown : glyph.chevronUp} />}
                aria-expanded={!folded}
                onClick={() => setAll(folded ? '1' : null, { replace: true })}
                data-hub="career-cert-show-all"
              >
                {folded ? `Show all ${matches.length} certificates` : 'Show fewer'}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </PageSection>
  );
}
