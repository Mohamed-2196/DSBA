// One skill of a role: the module that teaches it or, for a gap, why it is a gap and the one thing to do about it.
// Split out of RoleFit (code quality review CQ-17).
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Certificate, ChatsCircle, FileText, PlayCircle, Trophy, type Icon } from '@phosphor-icons/react';
import { cx } from '../../ui';
import { useModuleDetail } from './api';
import { useCareerData } from './context';
import type { SkillFit } from './lib/fit';
import { jumpTo } from './lib/jump';
import { appPath, lessonPath, libraryLink, resolveClose, type CloseStep } from './lib/links';
import { ModuleLink } from './ModuleLink';

const CLOSE_ICONS: Record<CloseStep['kind'], Icon> = { lesson: PlayCircle, file: FileText, cert: Certificate, forum: ChatsCircle, opps: Trophy };

function CloseBody({ close }: { close: CloseStep }) {
  const Glyph = CLOSE_ICONS[close.kind];
  return (
    <>
      <Glyph className="career-close__icon" weight="regular" aria-hidden="true" />
      <span className="career-close__text">
        <span className="visually-hidden">Suggested next step: </span>
        {close.text}
      </span>
      <ArrowRight className="career-close__go" weight="bold" aria-hidden="true" />
    </>
  );
}

/** A lesson: the chapter is found by its title in the module's lessons (the module's lessons while they load). */
function LessonLink({ moduleId, chapter, className, children }: { moduleId: string; chapter: string; className: string; children: ReactNode }) {
  const detail = useModuleDetail(moduleId);
  return (
    <Link to={lessonPath(moduleId, chapter, detail.data)} className={className}>
      {children}
    </Link>
  );
}

/** The one thing to do about a gap: a link into the app, or a button that scrolls to the right card. */
function CloseAction({ close }: { close: CloseStep }) {
  switch (close.kind) {
    case 'lesson':
      return (
        <LessonLink moduleId={close.module} chapter={close.chapter} className="career-close">
          <CloseBody close={close} />
        </LessonLink>
      );
    case 'file':
      return (
        <Link to={libraryLink(close.module)} className="career-close">
          <CloseBody close={close} />
        </Link>
      );
    case 'forum': {
      const to = appPath(close.to);
      return to ? (
        <Link to={to} className="career-close">
          <CloseBody close={close} />
        </Link>
      ) : null;
    }
    case 'cert':
      return (
        <button type="button" className="career-close" onClick={() => jumpTo(`career-cert-${close.cert}`, { flash: true, block: 'center' })}>
          <CloseBody close={close} />
        </button>
      );
    case 'opps':
      // The competition beside the page title (the board when it is not on screen).
      return (
        <button
          type="button"
          className="career-close"
          onClick={() => {
            const featured = document.querySelector<HTMLElement>('[data-hub="career-featured"]');
            if (!(featured && jumpTo(featured.id, { flash: true, block: 'center' }))) jumpTo('career-opportunities');
          }}
        >
          <CloseBody close={close} />
        </button>
      );
  }
}

/** One skill: its name and the module that teaches it, or (for a gap) why it is a gap and what to do about it. */
export function SkillRow({ row, roleId }: { row: SkillFit; roleId: string }) {
  const data = useCareerData();
  const close = row.status === 'gap' ? resolveClose(data, row.id, roleId) : null;
  return (
    <li className={cx('career-skill', `is-${row.status}`)} data-hub="career-skill" data-skill-id={row.id} data-skill-status={row.status}>
      <p className="career-skill__name">{row.skill.name}</p>
      {row.status === 'gap' ? (
        <>
          {row.detail ? <p className="career-skill__detail">{row.detail}</p> : null}
          {close ? <CloseAction close={close} /> : null}
        </>
      ) : (
        <div className="career-skill__mods">
          {row.named.slice(0, 1).map((n) => (
            <ModuleLink key={n.module} module={n.mod} />
          ))}
          {row.status === 'later' ? <span className="career-skill__when">{row.label}</span> : null}
        </div>
      )}
    </li>
  );
}
