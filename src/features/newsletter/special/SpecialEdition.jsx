// The hidden special edition (/newsletter/thank-you-tutors). NOT linked from anywhere, not in the
// archive, search or "latest". Loaded as its own chunk. Shared with the tutors after the reveal.
import { Link } from 'react-router-dom';
import { CohortBadge, Page, PulseMark } from '../../../ui';
import { useDocumentTitle } from '../../../state';
import { PulsePlate } from '../components/Nameplate.jsx';
import { ShareActions } from '../components/ShareActions.jsx';
import { longDate } from '../lib/text.js';
import { cardLine, getRidgelines } from './ridgeline.js';
import { SPECIAL, TUTORS } from './tutors.js';
import './SpecialEdition.css';

function Ridgeline() {
  const { width, height, lines } = getRidgelines();
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="nl-sp-ridge" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMax meet">
      {lines.map((l, i) => (
        <g key={i}>
          <path d={l.fill} className="nl-sp-ridge__fill" />
          <path d={l.d} className="nl-sp-ridge__line" />
        </g>
      ))}
    </svg>
  );
}

function TutorCard({ tutor, index }) {
  const line = cardLine(index);
  return (
    <li className="nl-sp-card" data-pulse="tutor-card">
      <svg viewBox={line.viewBox} className="nl-sp-card__line" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMax meet">
        <path d={line.d} />
      </svg>
      <h3 className="nl-sp-card__name">{tutor.name}</h3>
      <p className="nl-sp-card__module">{tutor.module}</p>
      <blockquote className="nl-sp-card__message">
        <p>{tutor.message}</p>
      </blockquote>
      <p className="nl-sp-card__from">{tutor.from}</p>
    </li>
  );
}

export default function SpecialEdition() {
  useDocumentTitle('To the 17 people who taught us, The Pulse');
  const { letter } = SPECIAL;
  const route = `/newsletter/${SPECIAL.slug}`;

  return (
    <Page className="nl-sp">
      <div className="nl-runhead">
        <Link to="/newsletter" className="nl-runhead__name">
          The Pulse
          <PulseMark size={11} className="nl-runhead__mark" />
        </Link>
        <p className="nl-runhead__meta">
          <span>Special edition</span>
          <span className="u-tabular">{longDate(SPECIAL.date)}</span>
        </p>
        <ShareActions route={route} title={SPECIAL.heading} className="nl-runhead__share" />
      </div>

      <header className="nl-sp-hero" data-pulse="special-cover">
        <Ridgeline />
        <div className="nl-sp-hero__text">
          <p className="nl-sp-hero__kicker">A special edition</p>
          <h1 className="nl-sp-hero__title">{SPECIAL.heading}</h1>
          <p className="nl-sp-hero__dek">{SPECIAL.dek}</p>
        </div>
      </header>

      <article className="nl-sp-letter" aria-label="An open letter" data-pulse="special-letter">
        <p className="nl-sp-letter__salutation">{letter.salutation}</p>
        {letter.paragraphs.map((p, i) => (
          <p key={i} className={i === 1 ? 'nl-sp-letter__p nl-sp-letter__p--turn' : 'nl-sp-letter__p'}>
            {p}
          </p>
        ))}
        <p className="nl-sp-letter__signoff">{letter.signoff}</p>
        <p className="nl-sp-letter__signature">{letter.signature}</p>
        <p className="nl-sp-letter__cohorts">
          <CohortBadge year={1} />
          <CohortBadge year={2} />
          <CohortBadge year={3} />
        </p>
      </article>

      <section className="nl-sp-notes" aria-labelledby="nl-sp-notes-title">
        <div className="nl-sp-notes__head">
          <h2 id="nl-sp-notes-title" className="nl-sp-notes__title">
            Seventeen notes
          </h2>
          <p className="nl-sp-notes__desc">One for each of you. Every line on the cover is one of these.</p>
        </div>
        <ol role="list" className="nl-sp-cards">
          {TUTORS.map((t, i) => (
            <TutorCard key={`${t.name}-${i}`} tutor={t} index={i} />
          ))}
        </ol>
      </section>

      <section className="nl-sp-thanks" aria-label="Thank you" data-pulse="special-thanks">
        <PulsePlate text="Thank you." fontSize={160} textWidth={810} tone="inverse" skipInk />
        <p className="nl-sp-thanks__line">Happy Teachers’ Day, from the students of DSBA.</p>
      </section>

      <footer className="nl-sp-foot">
        <p>This edition isn’t listed anywhere on DSBA Pulse. If you’re reading it, someone wanted you to.</p>
        <ShareActions route={route} title={SPECIAL.heading} />
      </footer>
    </Page>
  );
}
