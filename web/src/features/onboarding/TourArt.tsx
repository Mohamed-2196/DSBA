// The tour's three pictures, built from the real UI vocabulary rather than images. Split out of Onboarding
// (code quality review CQ-17).
import { ArrowFatUp, ArrowSquareOut, ChatsCircle, MagnifyingGlass } from '@phosphor-icons/react';
import { useModules } from '../../state/modules';
import { Highlight, ModuleIcon } from '../../ui';

export function SearchArt() {
  const { getModule } = useModules();
  const m = getModule('econometrics');
  return (
    <div className="onb-art onb-art--search" aria-hidden="true">
      <div className="onb-mini">
        <div className="onb-mini__field">
          <MagnifyingGlass />
          <span>econometrics</span>
          <span className="onb-mini__caret" />
        </div>
        <div className="onb-mini__row is-active">
          <span className="onb-mini__tile onb-mini__tile--y2">
            <ModuleIcon moduleId="econometrics" />
          </span>
          <span className="onb-mini__text">
            <span className="onb-mini__title">
              Elements of <Highlight as="span">Econometrics</Highlight>
            </span>
            <span className="onb-mini__sub">Year 2 module{m?.lessonCount ? `, ${m.lessonCount} lessons` : ''}</span>
          </span>
          <span className="onb-mini__code u-code">{m?.unitCode ?? 'EC2020'}</span>
        </div>
        <div className="onb-mini__row">
          <span className="onb-mini__doc" />
          <span className="onb-mini__text">
            <span className="onb-mini__title">Past paper with examiners’ commentary</span>
            <span className="onb-mini__sub">{m?.unitCode ?? 'EC2020'}, Past paper</span>
          </span>
        </div>
        <div className="onb-mini__row">
          <span className="onb-mini__date">
            <b>Nov</b>3
          </span>
          <span className="onb-mini__text">
            <span className="onb-mini__title">{m?.unitCode ?? 'EC2020'} October exam</span>
            <span className="onb-mini__sub">Exam, Year 2</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function LibraryArt() {
  return (
    <div className="onb-art onb-art--library" aria-hidden="true">
      <div className="onb-page onb-page--back" />
      <div className="onb-page">
        <span className="onb-page__code u-code">ST2133</span>
        <span className="onb-page__h">Past paper with examiner’s commentary</span>
        <span className="onb-page__lines" />
        <span className="onb-page__lines onb-page__lines--short" />
        <span className="onb-page__formula">
          f(x) = λe<sup>−λx</sup>
        </span>
        <span className="onb-page__lines" />
      </div>
      <span className="onb-art__chip">
        <ArrowSquareOut weight="bold" /> Download
      </span>
    </div>
  );
}

export function ForumArt() {
  const rows = [
    { votes: 24, title: 'How do you pick between fixed and random effects?', replies: 9, code: 'EC2020' },
    { votes: 17, title: 'Past paper, question 4: where does the 1/n come from?', replies: 6, code: 'ST2133' },
    { votes: 11, title: 'Study group for Programming, Thursdays?', replies: 14, code: 'ST2195' },
  ];
  return (
    <div className="onb-art onb-art--forum" aria-hidden="true">
      {rows.map((r) => (
        <div key={r.title} className="onb-thread">
          <span className="onb-thread__votes">
            <ArrowFatUp weight="fill" />
            {r.votes}
          </span>
          <span className="onb-thread__text">
            <span className="onb-thread__title">{r.title}</span>
            <span className="onb-thread__meta">
              <b className="u-code">{r.code}</b> {r.replies} replies
            </span>
          </span>
        </div>
      ))}
      <span className="onb-art__badge">
        <ChatsCircle weight="duotone" /> Forum <span className="onb-art__new">New</span>
      </span>
    </div>
  );
}
