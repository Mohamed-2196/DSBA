// The hidden special edition (/newsletter/thank-you-teachers): a Teacher’s Day letter from the three
// cohorts. NOT linked from anywhere, not in the archive, search or "latest". Loaded as its own chunk.
import { Link } from 'react-router-dom';
import { CohortBadge, Page } from '../../../ui';
import { useDocumentTitle } from '../../../state';
import { Wordmark } from '../components/Nameplate.jsx';
import { ShareActions } from '../components/ShareActions.jsx';
import { longDate } from '../lib/text.js';
import { SPECIAL } from './letter.js';
import './SpecialEdition.css';

// A quiet drawing of the logo idea: three nodes (the cohorts) joined at one hub, inside two rings.
const C = 130;
const NODES = [
  { deg: -90, color: 'var(--y1)' },
  { deg: 30, color: 'var(--y2)' },
  { deg: 150, color: 'var(--y3)' },
].map((n) => ({ ...n, x: C + 78 * Math.cos((n.deg * Math.PI) / 180), y: C + 78 * Math.sin((n.deg * Math.PI) / 180) }));

function Constellation() {
  return (
    <svg viewBox="0 0 260 260" className="nl-sp-art" aria-hidden="true" focusable="false">
      <circle cx={C} cy={C} r="78" className="nl-sp-art__ring" />
      <circle cx={C} cy={C} r="120" className="nl-sp-art__ring nl-sp-art__ring--outer" />
      <path d={NODES.map((n) => `M${C} ${C}L${n.x.toFixed(1)} ${n.y.toFixed(1)}`).join('')} className="nl-sp-art__spokes" />
      {NODES.map((n) => (
        <circle key={n.deg} cx={n.x} cy={n.y} r="9" fill={n.color} className="nl-sp-art__node" />
      ))}
      <circle cx={C} cy={C} r="10" className="nl-sp-art__hub" />
    </svg>
  );
}

export default function SpecialEdition() {
  useDocumentTitle(`${SPECIAL.heading}, The DSBA Newsletter`);
  const { letter } = SPECIAL;
  const route = `/newsletter/${SPECIAL.slug}`;

  return (
    <Page className="nl-sp">
      <div className="nl-runhead">
        <Link to="/newsletter" className="nl-runhead__name">
          <Wordmark />
        </Link>
        <p className="nl-runhead__meta">
          <span>Special edition</span>
          <span className="u-tabular">{longDate(SPECIAL.date)}</span>
        </p>
        <ShareActions route={route} title={SPECIAL.heading} className="nl-runhead__share" />
      </div>

      <header className="nl-sp-hero" data-theme="dark" data-hub="special-cover">
        <Constellation />
        <div className="nl-sp-hero__text">
          <p className="nl-sp-hero__kicker">{SPECIAL.kicker}</p>
          <h1 className="nl-sp-hero__title">{SPECIAL.heading}</h1>
          <p className="nl-sp-hero__dek">{SPECIAL.dek}</p>
        </div>
      </header>

      <article className="nl-sp-letter" aria-label="A letter to our teachers" data-hub="special-letter">
        <p className="nl-sp-letter__salutation">{letter.salutation}</p>
        {letter.paragraphs.map((p) => (
          <p key={p.text} className={p.turn ? 'nl-sp-letter__p nl-sp-letter__p--turn' : 'nl-sp-letter__p'}>
            {p.text}
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

      <footer className="nl-sp-foot">
        <p>This edition isn’t listed anywhere on DSBA Hub. If you’re reading it, someone wanted you to.</p>
        <ShareActions route={route} title={SPECIAL.heading} />
      </footer>
    </Page>
  );
}
