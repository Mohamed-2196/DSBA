import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDots } from '@phosphor-icons/react';
import type { CohortYear } from '../../lib/modules';
import { cohortLabel } from '../../state';
import { Button, Highlight, HubMark, ModuleIcon, Skeleton, cx } from '../../ui';
import { buildTrace, traceLabel, type ExamSession, type SessionEvent } from './session';
import { inDays, longDay, numberWord } from './time';
import './ExamTimeline.css';

// The HubMark sits at the start of the trace; its end dot is "today".
const MARK = 32;
const DOT_X = (44.6 / 48) * MARK * 2; // 59.5
const DOT_Y = (12.9 / 24) * MARK; // 17.2
// Choreography (ms). The HubMark draws in 900ms; the trace leaves its dot, runs to the next exam (highlights
// swipe in on arrival), then finishes the session.
const HEAD_DELAY = 620;
const SPEED = 1.15; // px per ms
const NONE: SessionEvent[] = [];

function useWidth(ref: RefObject<HTMLElement>): number {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setW(Math.round(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

// Week ticks carry their weekday ('Sun 11 Oct'), built by hand so no locale adds a comma or 'Sept'.
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const weekLabel = (date: Date): string => `${WEEKDAYS[date.getDay()] ?? ''} ${date.getDate()} ${MONTHS[date.getMonth()] ?? ''}`;
const WEEK_LABEL_W = 72; // room one 'Sun 11 Oct' needs

const examName = (e: SessionEvent): string => (e.module ? e.module.name : e.title);

/** What follows the next exam or mock: 'five more exams', 'six exams', 'one more mock', 'one mock and six exams'. */
function restPhrase(next: SessionEvent, rest: SessionEvent[]): string {
  const count = (type: string, one: string, many: string) => {
    const n = rest.filter((e) => e.type === type).length;
    return n ? `${numberWord(n)} ${next.type === type ? 'more ' : ''}${n === 1 ? one : many}` : null;
  };
  return [count('mock', 'mock', 'mocks'), count('exam', 'exam', 'exams')].filter(Boolean).join(' and ');
}

/** The trace: HubMark (now) → one spike per exam, annotated with unit codes. */
function Trace({ session, intro, today }: { session: ExamSession | null; intro: boolean; today: Date }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref);
  const compact = width > 0 && width < 560;
  const empty = !session;
  const H = empty ? 96 : compact ? 132 : 176;
  const y0 = empty ? 40 : compact ? 84 : 112;
  const spike = compact ? 46 : 62;
  const exams = session ? session.exams : NONE;
  // A mock for a module whose exam is on the same trace is labelled "Mock": two identical codes read as a mistake.
  const labelOf = useMemo(() => {
    const examLabels = new Set(exams.filter((e) => e.type === 'exam').map(traceLabel));
    return (e: SessionEvent) => (e.type === 'mock' && examLabels.has(traceLabel(e)) ? 'Mock' : traceLabel(e));
  }, [exams]);
  // Room a label needs: a unit code fits in 66px, a module name (Year 3 has no unit codes) needs more.
  const labelW = useMemo(() => Math.max(66, ...exams.map((e) => labelOf(e).length * 8.4 + 14)), [exams, labelOf]);
  const last = exams[exams.length - 1]?.days ?? 0;
  const span = Math.max(21, last + Math.max(3, Math.ceil(last * 0.1)));

  const trace = useMemo(() => {
    if (!width) return null;
    return buildTrace({ width, x0: DOT_X, y0, spike, span, exams, labelW, compress: compact ? 0.34 : 0.42, secondaryLabels: !compact, wiggle: compact ? 1.8 : 2.2 });
  }, [width, y0, spike, span, exams, compact, labelW]);

  // Week ticks: Sundays (the Bahraini week starts on Sunday), away from the "Today" label. Every tick is
  // labelled with its weekday; narrow traces label every second (or third…) week.
  const weeks = useMemo(() => {
    if (!trace) return [];
    const out: { d: number; x: number; label: string | null }[] = [];
    const every = Math.max(1, Math.ceil(WEEK_LABEL_W / (7 * trace.dayW)));
    for (let d = 1; d <= span; d++) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + d);
      if (date.getDay() !== 0) continue;
      const x = trace.dayX(d);
      if (x < DOT_X + 60 || x > trace.right - 32) continue;
      out.push({ d, x, label: out.length % every === 0 ? weekLabel(date) : null });
    }
    return out;
  }, [trace, span, today]);

  const headLen = trace ? Math.max(1, trace.headEnd - DOT_X) : 1;
  const headDur = Math.round(headLen / SPEED);
  const arrive = HEAD_DELAY + headDur;
  const tailDur = trace ? Math.round(Math.max(1, trace.right - trace.headEnd) / SPEED) : 0;
  const style = { height: H, '--head-delay': `${HEAD_DELAY}ms`, '--head-dur': `${headDur}ms`, '--tail-delay': `${arrive}ms`, '--tail-dur': `${tailDur}ms` } as CSSProperties;

  return (
    <div ref={ref} className={cx('home-trace', intro && 'is-intro', compact && 'is-compact')} style={style}>
      {trace ? (
        <>
          <svg className="home-trace__svg" width={width} height={H} viewBox={`0 0 ${width} ${H}`} aria-hidden="true" focusable="false">
            {weeks.map((w) => (
              <line key={w.d} className="home-trace__week" x1={w.x} x2={w.x} y1={8} y2={H - 22} />
            ))}
            {trace.beats.map((b) =>
              b.showLabel && b.level > 0 ? (
                <line
                  key={`c${b.exam.id}`}
                  className="home-trace__connector"
                  x1={b.x}
                  x2={b.x}
                  y1={b.top - 30}
                  y2={b.top - 6}
                  style={intro ? { animationDelay: `${arrive + Math.round((b.x - trace.headEnd) / SPEED)}ms` } : undefined}
                />
              ) : null,
            )}
            {trace.tail ? <path className="home-trace__tail" d={trace.tail} pathLength="1" /> : null}
            <path className="home-trace__head" d={trace.head} pathLength="1" />
          </svg>
          <HubMark size={MARK} animate={intro ? 'draw' : false} className="home-trace__mark" style={{ top: y0 - DOT_Y }} />
          <span className="home-trace__now" style={{ left: DOT_X, top: y0 }} aria-hidden="true" />
          <span className="home-trace__today" style={{ left: DOT_X, top: y0 + 16 }}>
            Today
          </span>
          {weeks.map((w) =>
            w.label ? (
              <span key={w.d} className="home-trace__date u-tabular" style={{ left: w.x, bottom: 0 }}>
                {w.label}
              </span>
            ) : null,
          )}
          {trace.beats.map((b) => {
            if (!b.showLabel) return null;
            const e = b.exam;
            const lift = b.level > 0 ? 34 : 10;
            const delay = b.isNext ? arrive - 120 : arrive + Math.round((b.x - trace.headEnd) / SPEED);
            const label = labelOf(e);
            const to = e.moduleId ? `/modules/${e.moduleId}` : `/calendar?event=${encodeURIComponent(e.id)}`;
            return (
              <Link
                key={e.id}
                to={to}
                className={cx('home-trace__label', 'u-code', b.isNext && 'is-next')}
                style={{ left: b.x, bottom: H - (b.top - lift), ...(intro && !b.isNext ? { animationDelay: `${delay}ms` } : null) }}
                aria-label={`${examName(e)}, ${e.type === 'mock' ? 'mock exam' : e.type === 'exam' ? 'exam' : e.title} on ${longDay(e.when)}, ${inDays(e.days)}`}
              >
                {b.isNext ? (
                  <Highlight as="span" className="home-hl" animate={intro} delay={delay}>
                    {label}
                  </Highlight>
                ) : (
                  label
                )}
              </Link>
            );
          })}
        </>
      ) : null}
    </div>
  );
}

export interface ExamTimelineProps {
  session: ExamSession | null;
  year: CohortYear;
  /** Play the one-time load choreography. */
  intro: boolean;
  today: Date;
  /** The calendar is still loading: no claim about exams yet. */
  loading?: boolean;
}

/** Home hero: the next exam as a big unit code + countdown sentence, over the session's trace. */
export function ExamTimeline({ session, year, intro, today, loading = false }: ExamTimelineProps) {
  const next = session?.next;
  const isExam = session?.kind === 'exams';
  const more = isExam ? session.exams.length - 1 : 0;
  const lastExam = isExam ? session.exams[session.exams.length - 1] : undefined;
  const headDelay = HEAD_DELAY + 500;

  let code: string | null = null;
  let title: ReactNode;
  let detail: ReactNode;
  if (loading) {
    title = <Skeleton width="62%" height={40} />;
    detail = <Skeleton width="44%" height={18} />;
  } else if (!next) {
    title = `No ${cohortLabel(year)} exams on the calendar yet`;
    detail = 'When the next exam session is announced, your countdown starts here.';
  } else if (isExam) {
    code = next.unitCode || null;
    const what = next.module ? `${next.module.shortName} ${next.type === 'mock' ? 'mock exam' : 'exam'}` : next.title;
    title = (
      <>
        {what}{' '}
        <Highlight className="home-hl" animate={intro} delay={headDelay}>
          {inDays(next.days)}
        </Highlight>
      </>
    );
    detail =
      more > 0 && lastExam
        ? `${longDay(next.when)}, then ${restPhrase(next, session.exams.slice(1))} by ${longDay(lastExam.when)}.`
        : `${longDay(next.when)}. It's the only ${next.type === 'mock' ? 'mock' : 'exam'} on your calendar for now.`;
  } else {
    title = (
      <>
        {next.title}{' '}
        <Highlight className="home-hl" animate={intro} delay={headDelay}>
          {inDays(next.days)}
        </Highlight>
      </>
    );
    detail = `${longDay(next.when)}. No exams on your ${cohortLabel(year)} calendar in the next few months.`;
  }

  const modulePath = next?.moduleId ? `/modules/${next.moduleId}` : null;
  const titleId = 'home-hero-title';
  return (
    <section className={cx('home-hero', `home-hero--y${year}`)} aria-labelledby={titleId} data-hub="home-hero" aria-busy={loading || undefined}>
      <div className="home-hero__top">
        <div className="home-hero__text">
          {code ? (
            <p className="home-hero__code u-code" aria-hidden="true">
              {code}
            </p>
          ) : null}
          <h2 id={titleId} className="home-hero__title">
            {code ? <span className="visually-hidden">{code} </span> : null}
            {loading ? <span className="visually-hidden">Loading your exams</span> : null}
            {title}
          </h2>
          <p className="home-hero__detail">{detail}</p>
        </div>
        <div className="home-hero__actions">
          {modulePath && next ? (
            <Button variant="primary" to={modulePath} leadingIcon={<ModuleIcon moduleId={next.moduleId} />}>
              Open {next.unitCode || next.module?.shortName || 'module'}
            </Button>
          ) : null}
          <Button variant={modulePath ? 'ghost' : 'secondary'} to="/calendar" leadingIcon={CalendarDots}>
            Open calendar
          </Button>
        </div>
      </div>
      <Trace session={loading ? null : session} intro={intro && !loading} today={today} />
    </section>
  );
}
