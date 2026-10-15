// Manage's Gaps screen: what's missing, by module, for the people who fill it. Each part shows for the box
// that fixes it (the API sends null for the others), and each line links to where it's fixed.
import { CheckCircle } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { formatDay } from '../../lib/dates';
import { Panel, QueryError, Skeleton } from '../../ui';
import { askedBy, requestPath } from '../requests/public';
import { useGaps } from './api';
import { eventMissing, eventPath, lessonLine, moduleEditor, moduleFiles, moduleName, scanLine, sittingMissing, sittingName } from './gapLabels';

interface Line {
  key: string;
  to: string;
  title: string;
  meta: string;
}

function GapList({ id, title, note, lines, done }: { id: string; title: string; note: string; lines: Line[]; done: string }) {
  const headId = `gaps-${id}`;
  return (
    <section className="gaps-list" aria-labelledby={headId} data-hub={`gaps-${id}`}>
      <div className="gaps-list__head">
        <h3 id={headId} className="gaps-list__title">
          {title}
          {lines.length ? <span className="gaps-list__count u-tabular">{lines.length}</span> : null}
        </h3>
        <p className="gaps-list__note">{note}</p>
      </div>
      {lines.length ? (
        <ul role="list" className="gaps-rows">
          {lines.map((l) => (
            <li key={l.key}>
              <Link to={l.to} className="gaps-row">
                <span className="gaps-row__title" dir="auto">
                  {l.title}
                </span>
                <span className="gaps-row__meta">{l.meta}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="gaps-none">
          <CheckCircle weight="fill" aria-hidden="true" />
          {done}
        </p>
      )}
    </section>
  );
}

const day = (key: string) => formatDay(key, { weekday: 'short', month: 'short', year: false });

export function Gaps() {
  const q = useGaps();
  if (q.isError) return <QueryError error={q.error} title="The gaps didn’t load" onRetry={() => void q.refetch()} retrying={q.isFetching} size="sm" />;
  if (q.isPending) return <Skeleton lines={6} />;
  const { library, lessons, calendar, requests } = q.data;
  return (
    <div className="gaps">
      <p className="gaps-intro">What students would find missing, the most useful first. Each line opens where you fix it.</p>
      {requests ? (
        <Panel className="gaps-part" aria-label="Requests">
          <GapList
            id="requests"
            title="Most wanted requests"
            note="Open requests with the most “me too”."
            done="No open requests."
            lines={requests.map((r) => ({ key: r.id, to: requestPath(r.id), title: r.title, meta: [r.moduleTitle, askedBy(r.meTooCount)].filter(Boolean).join(' · ') }))}
          />
        </Panel>
      ) : null}
      {library ? (
        <Panel className="gaps-part" aria-label="Library">
          <GapList
            id="sittings"
            title="Sittings missing a file"
            note="A past paper without its examiners’ report, or a report without its paper."
            done="Every sitting has its paper and report."
            lines={library.sittings.map((s) => ({
              key: `${s.module.id}-${s.examYear}-${s.session ?? ''}`,
              to: moduleFiles(s.module),
              title: `${moduleName(s.module)}: ${sittingName(s)}`,
              meta: sittingMissing(s),
            }))}
          />
          <GapList
            id="scans"
            title="Papers with no text"
            note="Search and Mini Noora can’t read these. A typed or clearer copy fixes it."
            done="Every paper has its text."
            lines={library.scans.map((s) => ({ key: s.id, to: `/library/${encodeURIComponent(s.slug)}`, title: s.title, meta: [s.module ? moduleName(s.module) : null, scanLine(s)].filter(Boolean).join(' · ') }))}
          />
          <GapList
            id="cheat-sheets"
            title="Modules with no cheat sheet"
            note="A student’s summary notes could fill these. Ask in the module’s group."
            done="Every module has a cheat sheet."
            lines={library.noCheatSheet.map((m) => ({ key: m.id, to: moduleFiles(m), title: moduleName(m), meta: `Year ${m.year}` }))}
          />
        </Panel>
      ) : null}
      {lessons ? (
        <Panel className="gaps-part" aria-label="Lessons">
          <GapList
            id="lessons"
            title="Modules missing lessons"
            note="Chapters with no video, and videos gone from YouTube."
            done="Every chapter has its lessons."
            lines={lessons.map((g) => ({ key: g.module.id, to: moduleEditor(g.module), title: moduleName(g.module), meta: lessonLine(g) }))}
          />
        </Panel>
      ) : null}
      {calendar ? (
        <Panel className="gaps-part" aria-label="Calendar">
          <GapList
            id="unconfirmed"
            title="Dates not confirmed"
            note="In the next 30 days. Students see “Not confirmed” on these."
            done="Every date in the next 30 days is confirmed."
            lines={calendar.unconfirmed.map((e) => ({ key: e.id, to: eventPath(e), title: e.title, meta: day(e.date) }))}
          />
          <GapList
            id="exam-details"
            title="Exams without a time or place"
            note="In the next 90 days."
            done="Every exam has its time and place."
            lines={calendar.examDetails.map((e) => ({ key: e.id, to: eventPath(e), title: e.title, meta: `${day(e.date)} · ${eventMissing(e)}` }))}
          />
        </Panel>
      ) : null}
      {!requests && !library && !lessons && !calendar ? <p className="gaps-intro">The parts of the hub you look after are switched off right now.</p> : null}
    </div>
  );
}
