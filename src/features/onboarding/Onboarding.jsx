// First-visit onboarding (v1's "Select your year" popup, redesigned): choose your cohort, then an
// optional three-step "what's new" tour. Mounted by the shell; shows whenever no year is selected.
// The year is saved the moment a cohort is chosen, so closing the tab mid-tour loses nothing.
import { useEffect, useRef, useState } from 'react';
import { ArrowFatUp, ArrowSquareOut, ChatsCircle, MagnifyingGlass } from '@phosphor-icons/react';
import { COHORTS, YEARS, useYear } from '../../state';
import { getModule, getModulesForYear } from '../../data/modules.js';
import { EVENTS, eventDate } from '../../data/calendar.js';
import { Button, Highlight, Kbd, Modal, ModuleIcon, HubMark, cx, modKeyLabel } from '../../ui';
import './Onboarding.css';

/** First upcoming exam for a year (for the cohort cards). */
function sessionLine(year) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exams = EVENTS.filter((e) => e.type === 'exam' && e.year === year && eventDate(e) >= today);
  if (!exams.length) return null;
  const first = eventDate(exams[0]);
  const within = exams.filter((e) => (eventDate(e) - first) / 86400000 <= 21);
  const d = first.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return within.length > 1 ? `${within.length} exams from ${d}` : `Exam on ${d}`;
}

function CohortCard({ year, onChoose }) {
  const c = COHORTS[year];
  const modules = getModulesForYear(year);
  const line = sessionLine(year);
  return (
    <button type="button" className={cx('onb-card', `onb-card--y${year}`)} onClick={() => onChoose(year)} data-hub={`onboarding-y${year}`}>
      <span className="onb-card__top">
        <span className="onb-card__num u-code" aria-hidden="true">{year}</span>
        <span className="onb-card__label">
          <span className="onb-card__year">{c.label}</span>
          <span className="onb-card__line">{line || `${modules.length} modules`}</span>
        </span>
      </span>
      <span className="onb-card__mods">
        {modules.map((m) => (
          <span key={m.id} className="onb-card__mod">
            {m.unitCode ? <span className="onb-card__code u-code">{m.unitCode}</span> : <ModuleIcon moduleId={m.id} className="onb-card__icon" />}
            <span className="onb-card__name">{m.name}</span>
          </span>
        ))}
      </span>
      <span className="onb-card__cta" aria-hidden="true">
        Choose {c.label}
      </span>
    </button>
  );
}

// ── Tour illustrations (built from the real UI vocabulary, not images) ──────
function SearchArt() {
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
          <span className="onb-mini__tile onb-mini__tile--y2"><ModuleIcon moduleId="econometrics" /></span>
          <span className="onb-mini__text">
            <span className="onb-mini__title">Elements of <Highlight as="span">Econometrics</Highlight></span>
            <span className="onb-mini__sub">Year 2 module</span>
          </span>
          <span className="onb-mini__code u-code">{m?.unitCode}</span>
        </div>
        <div className="onb-mini__row">
          <span className="onb-mini__tile onb-mini__tile--lesson">▶</span>
          <span className="onb-mini__text">
            <span className="onb-mini__title">{m?.chapters[1]?.title || 'The Simple Regression Model'}</span>
            <span className="onb-mini__sub">Chapter 2 of {m?.chapters.length || 8}</span>
          </span>
        </div>
        <div className="onb-mini__row">
          <span className="onb-mini__date"><b>Nov</b>3</span>
          <span className="onb-mini__text">
            <span className="onb-mini__title">EC2020 October exam</span>
            <span className="onb-mini__sub">Tuesday 3 November</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function LibraryArt() {
  return (
    <div className="onb-art onb-art--library" aria-hidden="true">
      <div className="onb-page onb-page--back" />
      <div className="onb-page">
        <span className="onb-page__code u-code">ST2133</span>
        <span className="onb-page__h">Past paper with examiner’s commentary</span>
        <span className="onb-page__lines" />
        <span className="onb-page__lines onb-page__lines--short" />
        <span className="onb-page__formula">f(x) = λe<sup>−λx</sup></span>
        <span className="onb-page__lines" />
      </div>
      <span className="onb-art__chip"><ArrowSquareOut weight="bold" /> Open original</span>
    </div>
  );
}

function ForumArt() {
  const rows = [
    { votes: 24, title: 'How do you pick between fixed and random effects?', who: 'Ali H.', replies: 9, code: 'EC2020' },
    { votes: 17, title: 'Past paper, question 4: where does the 1/n come from?', who: 'Zainab K.', replies: 6, code: 'ST2133' },
    { votes: 11, title: 'Study group for Programming, Thursdays?', who: 'Noor E.', replies: 14, code: 'ST2195' },
  ];
  return (
    <div className="onb-art onb-art--forum" aria-hidden="true">
      {rows.map((r) => (
        <div key={r.title} className="onb-thread">
          <span className="onb-thread__votes"><ArrowFatUp weight="fill" />{r.votes}</span>
          <span className="onb-thread__text">
            <span className="onb-thread__title">{r.title}</span>
            <span className="onb-thread__meta"><b className="u-code">{r.code}</b> {r.who}, {r.replies} replies</span>
          </span>
        </div>
      ))}
      <span className="onb-art__badge"><ChatsCircle weight="duotone" /> Forum <span className="onb-art__new">New</span></span>
    </div>
  );
}

const TOUR = [
  {
    id: 'search',
    title: 'Search everything',
    body: (
      <>
        Press <Kbd>{modKeyLabel()}</Kbd><Kbd>K</Kbd> or <Kbd>/</Kbd> from any page to find a module, a chapter, a past paper, a thread or an exam date.
      </>
    ),
    Art: SearchArt,
  },
  {
    id: 'library',
    title: 'Files open right here',
    body: 'Notes, past papers and study guides open in the library’s reader. The original Google Drive link is always one click away.',
    Art: LibraryArt,
  },
  {
    id: 'forum',
    title: 'Ask your cohort',
    body: 'The new forum is for questions, answers and study groups. When there is news from the programme, you will find it in The DSBA Newsletter.',
    Art: ForumArt,
  },
];

export function Onboarding() {
  const { year, setYear } = useYear();
  // step: 0 = choose your year, 1..3 = tour. `touring` keeps the dialog open after a year is chosen.
  const [step, setStep] = useState(0);
  const [touring, setTouring] = useState(false);
  const nextRef = useRef(null);
  const open = year == null || touring;

  // Tell Home (and anyone else) whether onboarding is up, so its load animation can wait.
  useEffect(() => {
    const root = document.documentElement;
    if (open) root.dataset.onboarding = 'open';
    else delete root.dataset.onboarding;
    window.dispatchEvent(new CustomEvent('hub:onboarding', { detail: { open } }));
  }, [open]);
  useEffect(() => () => {
    delete document.documentElement.dataset.onboarding;
  }, []);

  // Coming back to the dialog (e.g. "Show welcome again") always starts at the year picker.
  useEffect(() => {
    if (year == null) {
      setStep(0);
      setTouring(false);
    }
  }, [year]);

  // Each tour step hands focus to its primary button (the control that opened it is gone).
  useEffect(() => {
    if (step > 0) requestAnimationFrame(() => nextRef.current?.focus({ preventScroll: true }));
  }, [step]);

  const choose = (y) => {
    setYear(y);
    setTouring(true);
    setStep(1);
  };
  const finish = () => {
    setTouring(false);
    setStep(0);
  };
  // Esc / scrim: nothing to do until a year is chosen (v1 required a choice too); during the tour it ends the tour.
  const onClose = () => {
    if (touring) finish();
  };

  const tour = step > 0 ? TOUR[step - 1] : null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tour ? `What’s new: ${tour.title}` : 'Welcome to DSBA Hub'}
      hideHeader
      size="xl"
      className={cx('onb', tour && 'onb--tour')}
      bodyClassName="onb-body"
      data-hub="onboarding"
    >
      {!tour ? (
        <div className="onb-step onb-step--year" key="year">
          <header className="onb-head">
            <HubMark tile size={44} className="onb-head__mark" />
            <h2 className="onb-head__title">Welcome to DSBA Hub</h2>
            <p className="onb-head__desc">The DSBA resource hub, rebuilt. Choose your year and we’ll put your modules, exams and classmates first.</p>
          </header>
          <div className="onb-cards" role="group" aria-label="Choose your year">
            {YEARS.map((y) => (
              <CohortCard key={y} year={y} onChoose={choose} />
            ))}
          </div>
          <p className="onb-foot">You can switch years any time from the sidebar.</p>
        </div>
      ) : (
        <div className="onb-step onb-step--tour" key={tour.id}>
          <div className="onb-tour">
            <div className="onb-tour__art">
              <tour.Art />
            </div>
            <div className="onb-tour__text">
              <p className="onb-tour__kicker">
                <span className={cx('onb-tour__year', `onb-tour__year--y${year}`)}>{COHORTS[year]?.label} is set</span>
                <span className="onb-tour__progress u-tabular" aria-label={`Step ${step} of ${TOUR.length}`}>
                  {TOUR.map((t, i) => (
                    <span key={t.id} className={cx('onb-dot', i + 1 === step && 'is-on', i + 1 < step && 'is-done')} />
                  ))}
                </span>
              </p>
              <h2 className="onb-tour__title">{tour.title}</h2>
              <p className="onb-tour__body">{tour.body}</p>
              <div className="onb-tour__actions">
                {step < TOUR.length ? (
                  <Button variant="ghost" onClick={finish}>
                    Skip the tour
                  </Button>
                ) : (
                  <span />
                )}
                <span className="onb-tour__nav">
                  {step > 1 ? <Button onClick={() => setStep(step - 1)}>Back</Button> : null}
                  {step < TOUR.length ? (
                    <Button ref={nextRef} variant="primary" onClick={() => setStep(step + 1)}>
                      Next
                    </Button>
                  ) : (
                    <Button ref={nextRef} variant="primary" onClick={finish}>
                      Go to my dashboard
                    </Button>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
