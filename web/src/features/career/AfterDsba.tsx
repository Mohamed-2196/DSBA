import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, GraduationCap } from '@phosphor-icons/react';
import { useLocalStorage } from '../../state';
import { Badge, Button, PageSection, Panel, SectionHeader, cx } from '../../ui';
import { useModuleDetail } from './api';
import { useCareerData } from './context';
import { jumpTo } from './lib/jump';
import { lessonPath } from './lib/links';
import { Seniors } from './Seniors';
import type { ChecklistItem } from './types';
import './AfterDsba.css';

/** Ticks are kept in this browser as a JSON array of checklist ids, e.g. ["cv","linkedin"]. */
const CHECKLIST_KEY = 'hub.career.checklist';

/** What was stored, kept only if it is a list of ids (stored JSON is never trusted). */
const idsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function LessonRowLink({ moduleId, chapter, children }: { moduleId: string; chapter: string; children: ReactNode }) {
  const detail = useModuleDetail(moduleId);
  return (
    <Link to={lessonPath(moduleId, chapter, detail.data)} className="career-ready__link">
      {children}
    </Link>
  );
}

/** The small link at the end of a checklist row: a lesson, a card further up the page or the forum. */
function RowLink({ link }: { link: ChecklistItem['link'] }) {
  if (!link) return null;
  const body = (
    <>
      {link.label}
      <ArrowRight weight="bold" aria-hidden="true" />
    </>
  );
  switch (link.kind) {
    case 'cert':
      return (
        <button type="button" className="career-ready__link" onClick={() => jumpTo(`career-cert-${link.cert}`, { flash: true, block: 'center' })}>
          {body}
        </button>
      );
    case 'lesson':
      return (
        <LessonRowLink moduleId={link.module} chapter={link.chapter}>
          {body}
        </LessonRowLink>
      );
    case 'forum':
      return (
        <Link to={link.to} className="career-ready__link">
          {body}
        </Link>
      );
  }
}

/** Things to have before applying. The ticks stay in this browser. */
function Checklist() {
  const { checklist } = useCareerData();
  const [stored, setStored] = useLocalStorage<string[]>(CHECKLIST_KEY, []);
  const done = useMemo(() => new Set(idsOf(stored).filter((id) => checklist.some((c) => c.id === id))), [stored, checklist]);
  const n = done.size;
  const total = checklist.length;
  const toggle = (id: string) =>
    setStored((prev) => {
      const list = idsOf(prev);
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
        <span className="career-ready__fill" style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
      </div>
      <ul role="list" className="career-ready__list">
        {checklist.map((c) => (
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
      {total > 0 && n === total ? <p className="career-ready__done">All done. Time to apply.</p> : null}
    </Panel>
  );
}

/** What to have ready, who to ask, and one line for those heading to further study instead. */
export function AfterDsba() {
  const { checklist, seniors, furtherStudy: study } = useCareerData();
  if (!checklist.length && !seniors.length && !study) return null;
  const description = seniors.length ? 'Things to have ready, and people who can tell you how it went for them.' : 'Things to have ready before you send an application.';
  return (
    <PageSection id="career-after" aria-labelledby="career-after-title" data-hub="career-after">
      <SectionHeader id="career-after-title" title="Before you apply" description={description} />
      <div className="career-after">
        <div className={cx('career-after__grid', !seniors.length && 'career-after__grid--single')}>
          {checklist.length ? <Checklist /> : null}
          <Seniors />
        </div>
        {study ? (
          <Panel tone="inset" padding="none" className="career-study" data-hub="career-study">
            <GraduationCap className="career-study__icon" weight="duotone" aria-hidden="true" />
            <p className="career-study__text">
              <strong>{study.title}</strong> {study.body}
            </p>
            <Button variant="secondary" size="sm" to={study.action.to} trailingIcon={ArrowRight}>
              {study.action.label}
            </Button>
          </Panel>
        ) : null}
      </div>
    </PageSection>
  );
}
