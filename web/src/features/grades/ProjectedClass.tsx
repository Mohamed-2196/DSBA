// "On your marks so far": the calculator's marks from this browser, read and classified here. Nothing is sent.
import { ArrowRight, ArrowSquareOut } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { useModulesOptional } from '../../state/modules';
import { cx } from '../../ui';
import { httpsHref, useSite } from '../site/public';
import { CLASS_NAME, CLASS_SHORT } from './bands';
import { SUBJECTS } from './classify';
import { projectClass, type Projection } from './projection';
import { useCalculatorRecord } from './record';
import { subjectDisplay } from './subjects';
import './ProjectedClass.css';

const named = (kind: keyof typeof CLASS_NAME): string => `${CLASS_NAME[kind]} (${CLASS_SHORT[kind]})`;

function NextLine({ p }: { p: Extract<Projection, { state: 'partial' }> }) {
  if (!p.next) return null;
  const { kind, mark, blanks } = p.next;
  const modules = blanks === 1 ? 'the module' : `each of the ${blanks} modules`;
  return (
    <p className="projected__more">
      {mark === null
        ? `${CLASS_NAME[kind]} is out of reach on these marks.`
        : `${CLASS_NAME[kind]} needs about ${mark} in ${modules} still to come.`}
    </p>
  );
}

export interface ProjectedClassProps {
  /** a link to the calculator under the projection; off where the page already has one */
  calculatorLink?: boolean;
  className?: string;
}

/** The class the calculator's marks point to, with the University's rules and the line that it isn't official. */
export function ProjectedClass({ calculatorLink = true, className }: ProjectedClassProps) {
  const { marks, picks } = useCalculatorRecord();
  const catalogue = useModulesOptional();
  const site = useSite().data;
  const regulations = httpsHref(site?.links.regulations.url);
  const p = projectClass(marks);
  const nameOf = (i: number): string => {
    const subject = SUBJECTS[i];
    if (!subject) return '';
    return catalogue ? subjectDisplay(subject, picks, catalogue.getModule).name : subject.name;
  };

  let body;
  switch (p.state) {
    case 'empty':
      body = <p className="projected__line">No marks in the grades calculator on this browser yet. Enter yours to see where they point.</p>;
      break;
    case 'fail':
      body = (
        <>
          <p className="projected__line">
            <span className="projected__label">In your calculator</span>{' '}
            <strong>
              {p.failing.length === 1 ? '1 mark is' : `${p.failing.length} marks are`} under 40
            </strong>
          </p>
          <p className="projected__more">
            {p.failing.map(nameOf).join(', ')}. Under 40 is a fail: you resit it before the degree can be classified.
          </p>
        </>
      );
      break;
    case 'complete':
      body = (
        <p className="projected__line">
          <span className="projected__label">On your marks</span> <strong>{named(p.kind)}</strong>, average {p.average.toFixed(1)}
        </p>
      );
      break;
    case 'partial':
      body = (
        <>
          <p className="projected__line">
            <span className="projected__label">On your marks so far</span> <strong>{named(p.kind)}</strong>
          </p>
          <p className="projected__more">
            If you keep your average of {p.average.toFixed(1)} across the {13 - p.entered} modules still to come.
          </p>
          <NextLine p={p} />
        </>
      );
      break;
  }

  return (
    <div className={cx('projected', className)} data-hub="projected-class" data-state={p.state}>
      {body}
      {site ? (
        <p className="projected__check">
          {site.gradesNote}{' '}
          {regulations ? (
            <a href={regulations} target="_blank" rel="noopener noreferrer" className="projected__link">
              {site.links.regulations.label}
              <ArrowSquareOut weight="bold" aria-hidden="true" />
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          ) : null}
        </p>
      ) : null}
      {calculatorLink ? (
        <Link to="/grades" className="projected__link">
          {p.state === 'empty' ? 'Enter your marks' : 'Open the grades calculator'}
          <ArrowRight weight="bold" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
