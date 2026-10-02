import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Briefcase, Certificate, GraduationCap } from '@phosphor-icons/react';
import { useLocalStorage } from '../../state';
import { Badge, Button, PageSection, Panel, SectionHeader } from '../../ui';
import { CHECKLIST, CHECKLIST_KEY, PATHS } from './data/afterDsba.js';
import { jumpTo } from './lib/jump.js';
import { lessonLink } from './lib/links.js';
import './AfterDsba.css';

const PATH_ICONS = { work: Briefcase, study: GraduationCap, exams: Certificate };

function PathAction({ action }) {
  if (action.kind === 'link') {
    return (
      <Button variant="secondary" size="sm" to={action.to} trailingIcon={ArrowRight}>
        {action.label}
      </Button>
    );
  }
  const target = action.kind === 'certs' ? 'career-certificates' : 'career-role-fit';
  return (
    <Button variant="secondary" size="sm" trailingIcon={ArrowRight} onClick={() => jumpTo(target)}>
      {action.label}
    </Button>
  );
}

function Path({ path }) {
  const Icon = PATH_ICONS[path.id];
  return (
    <Panel as="li" padding="none" className="career-path" data-hub="career-path" data-path-id={path.id}>
      <span className="career-path__icon" aria-hidden="true">
        {Icon ? <Icon weight="duotone" /> : null}
      </span>
      <h3 className="career-path__title">{path.title}</h3>
      <p className="career-path__lede">{path.lede}</p>
      <ol className="career-path__steps">
        {path.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <div className="career-path__action">
        <PathAction action={path.action} />
      </div>
    </Panel>
  );
}

/** The small link at the end of a checklist row: a lesson, a card further down the page or the forum. */
function RowLink({ link }) {
  if (!link) return null;
  const body = (
    <>
      {link.label}
      <ArrowRight weight="bold" aria-hidden="true" />
    </>
  );
  if (link.kind === 'cert') {
    return (
      <button type="button" className="career-ready__link" onClick={() => jumpTo(`career-cert-${link.cert}`, { flash: true, block: 'center' })}>
        {body}
      </button>
    );
  }
  const to = link.kind === 'lesson' ? lessonLink(link.module, link.chapter) : link.to;
  return (
    <Link to={to} className="career-ready__link">
      {body}
    </Link>
  );
}

/** Five things to have before applying. Ticks are saved as a JSON array of ids in localStorage['hub.career.checklist']. */
function Checklist() {
  const [stored, setStored] = useLocalStorage(CHECKLIST_KEY, []);
  const done = useMemo(() => new Set(Array.isArray(stored) ? stored.filter((id) => CHECKLIST.some((c) => c.id === id)) : []), [stored]);
  const n = done.size;
  const total = CHECKLIST.length;
  const toggle = (id) =>
    setStored((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    });

  return (
    <Panel as="section" padding="none" className="career-ready" aria-labelledby="career-ready-title" data-hub="career-checklist">
      <div className="career-ready__head">
        <h3 id="career-ready-title" className="career-ready__title">
          Ready to apply?
        </h3>
        <Badge tone={n === total ? 'signal' : 'neutral'} aria-live="polite">{`${n} of ${total} done`}</Badge>
      </div>
      <div className="career-ready__bar" role="progressbar" aria-label="Checklist progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={n}>
        <span className="career-ready__fill" style={{ width: `${(n / total) * 100}%` }} />
      </div>
      <ul role="list" className="career-ready__list">
        {CHECKLIST.map((c) => (
          <li key={c.id} className="career-ready__row" data-check-id={c.id}>
            <label className="career-check">
              <input type="checkbox" className="career-check__box" checked={done.has(c.id)} onChange={() => toggle(c.id)} />
              <span className="career-check__body">
                <span className="career-check__title">{c.title}</span>
                <span className="career-check__hint">{c.hint}</span>
              </span>
            </label>
            <RowLink link={c.link} />
          </li>
        ))}
      </ul>
      {n === total ? <p className="career-ready__done">All five done. Time to apply.</p> : null}
    </Panel>
  );
}

export function AfterDsba() {
  return (
    <PageSection id="career-after" aria-labelledby="career-after-title" data-hub="career-after">
      <SectionHeader
        id="career-after-title"
        title="After DSBA"
        description="Three ways forward, and a checklist to be ready for whichever you pick."
      />
      <div className="career-after">
        <div className="career-after__grid">
          <div className="career-paths-wrap">
            <ul role="list" className="career-paths">
              {PATHS.map((p) => (
                <Path key={p.id} path={p} />
              ))}
            </ul>
          </div>
          <Checklist />
        </div>
      </div>
    </PageSection>
  );
}
