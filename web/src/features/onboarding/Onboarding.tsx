// First-visit onboarding (v1's "Select your year" popup, redesigned): choose your cohort, then an optional
// three-step "what's new" tour. Mounted by the shell; shows whenever no year is chosen. The year is saved the
// moment a cohort is chosen (in this browser, and on the account of a signed-in student without one), so
// closing the tab mid-tour loses nothing.
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { ArrowFatUp, ArrowSquareOut, ChatsCircle, MagnifyingGlass } from '@phosphor-icons/react';
import { useAuth } from '../../auth';
import { errorMessage } from '../../api/errors';
import type { CohortYear } from '../../lib/modules';
import { COHORTS, YEARS, useToast, useYear } from '../../state';
import { useModules } from '../../state/modules';
import { Button, Highlight, HubLogo, Kbd, Modal, ModuleIcon, cx, modKeyLabel } from '../../ui';
import { formatMonthShort, useCalendarEvents, type CalendarEvent } from '../calendar/public';
import { useSaveCohort } from './api';
import './Onboarding.css';

const dayOf = (iso: string): Date => {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const todayKey = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** The year's next exams, for its card ('6 exams from 19 Oct'). */
function sessionLine(exams: readonly CalendarEvent[], year: CohortYear): string | null {
  const mine = exams.filter((e) => e.year === year && !e.sample);
  const firstExam = mine[0];
  if (!firstExam) return null;
  const first = dayOf(firstExam.date);
  const within = mine.filter((e) => (dayOf(e.date).getTime() - first.getTime()) / 86400000 <= 21);
  const d = `${first.getDate()} ${formatMonthShort(first)}`;
  return within.length > 1 ? `${within.length} exams from ${d}` : `Exam on ${d}`;
}

function CohortCard({ year, line, onChoose, busy }: { year: CohortYear; line: string | null; onChoose: (y: CohortYear) => void; busy: boolean }) {
  const { getModulesForYear } = useModules();
  const c = COHORTS[year];
  const modules = getModulesForYear(year);
  return (
    <button type="button" className={cx('onb-card', `onb-card--y${year}`)} onClick={() => onChoose(year)} disabled={busy} data-hub={`onboarding-y${year}`}>
      <span className="onb-card__top">
        <span className="onb-card__num u-code" aria-hidden="true">
          {year}
        </span>
        <span className="onb-card__label">
          <span className="onb-card__year">{c.label}</span>
          <span className="onb-card__line">{line ?? `${modules.length} modules`}</span>
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

function LibraryArt() {
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

function ForumArt() {
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

interface TourStep {
  id: string;
  title: string;
  body: ReactNode;
  Art: ComponentType;
}

const TOUR: TourStep[] = [
  {
    id: 'search',
    title: 'Search everything',
    body: (
      <>
        Press <Kbd>{modKeyLabel()}</Kbd>
        <Kbd>K</Kbd> or <Kbd>/</Kbd> from any page to find a module, a past paper, a thread or an exam date.
      </>
    ),
    Art: SearchArt,
  },
  {
    id: 'library',
    title: 'Files open right here',
    body: 'Notes, past papers and study guides open in the library’s reader, and download in one click. Share yours, too: a student rep checks each one first.',
    Art: LibraryArt,
  },
  {
    id: 'forum',
    title: 'Ask your cohort',
    body: 'The forum is for questions, answers and study groups. When there is news from the programme, you will find it in The DSBA Newsletter.',
    Art: ForumArt,
  },
];

export function Onboarding() {
  const { year, setYear } = useYear();
  const { me, status } = useAuth();
  const { push } = useToast();
  const save = useSaveCohort();
  // step: 0 = choose your year, 1..3 = tour. `touring` keeps the dialog open after a year is chosen.
  const [step, setStep] = useState(0);
  const [touring, setTouring] = useState(false);
  const nextRef = useRef<HTMLElement>(null);
  // Wait for the account: a signed-in student's cohort is their year, so the picker isn't needed.
  const open = status !== 'loading' && (year == null || touring);
  const exams = useCalendarEvents({ from: todayKey(), type: 'exam' }, { enabled: open && !touring });
  const lines = useMemo(() => new Map(YEARS.map((y) => [y, sessionLine(exams.data ?? [], y)])), [exams.data]);

  // Tell Home (and anyone else) whether onboarding is up, so its load animation can wait.
  useEffect(() => {
    const root = document.documentElement;
    if (open) root.dataset.onboarding = 'open';
    else delete root.dataset.onboarding;
    window.dispatchEvent(new CustomEvent('hub:onboarding', { detail: { open } }));
  }, [open]);
  useEffect(
    () => () => {
      delete document.documentElement.dataset.onboarding;
    },
    [],
  );

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

  const choose = (y: CohortYear) => {
    setYear(y);
    setTouring(true);
    setStep(1);
    // A signed-in student without a cohort keeps it on their account.
    if (status === 'signed-in' && me && !me.needsProfile && me.year !== y) {
      save.mutate(y, {
        onError: (e) =>
          push({
            tone: 'alert',
            title: 'Your year wasn’t saved to your account',
            body: `${errorMessage(e, 'It’s set on this device.')} You can change it in your account settings.`,
          }),
      });
    }
  };
  const finish = () => {
    setTouring(false);
    setStep(0);
  };
  // Esc / scrim: nothing to do until a year is chosen (v1 required a choice too); during the tour it ends the tour.
  const onClose = () => {
    if (touring) finish();
  };

  const tour = step > 0 ? TOUR[step - 1] : undefined;
  const signedIn = status === 'signed-in' && !!me;
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
            <HubLogo variant="tile" size={44} optional decorative className="onb-head__mark" />
            <h2 className="onb-head__title">{signedIn && me.displayName ? `Welcome, ${me.displayName.split(' ')[0]}` : 'Welcome to DSBA Hub'}</h2>
            <p className="onb-head__desc">
              {signedIn
                ? 'Choose your year and we’ll put your modules, exams and classmates first. It’s saved on your account.'
                : 'Everything for DSBA students in one place. Choose your year and we’ll put your modules, exams and classmates first.'}
            </p>
          </header>
          <div className="onb-cards" role="group" aria-label="Choose your year">
            {YEARS.map((y) => (
              <CohortCard key={y} year={y} line={lines.get(y) ?? null} onChoose={choose} busy={save.isPending} />
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
                <span className={cx('onb-tour__year', year && `onb-tour__year--y${year}`)}>{year ? `${COHORTS[year].label} is set` : 'Your year is set'}</span>
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
