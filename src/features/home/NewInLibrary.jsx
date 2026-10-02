import { Link } from 'react-router-dom';
import { Books } from '@phosphor-icons/react';
import { getModule } from '../../data/modules.js';
import { Badge, Button, EmptyState, Panel, timeAgo } from '../../ui';
import { getRecentFiles } from '../library/public.js';

const KIND_LABELS = {
  'past-paper': 'Past paper',
  'examiners-report': 'Examiners’ report',
  'subject-guide': 'Subject guide',
  reading: 'Essential reading',
  'study-guide': 'Study guide',
  exercises: 'Exercise set',
  notes: 'Students’ notes',
  'cheat-sheet': 'Cheat sheet',
};

/** 'past-paper' → 'Past paper' (known kinds get their proper label). */
function kindLabel(kind) {
  if (!kind) return 'File';
  if (KIND_LABELS[kind]) return KIND_LABELS[kind];
  const s = String(kind).replace(/[-_]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function safeRecent(n, year) {
  try {
    const files = getRecentFiles(n, { year });
    return Array.isArray(files) ? files.filter(Boolean) : [];
  } catch (err) {
    console.error('[DSBA Hub] getRecentFiles failed:', err);
    return [];
  }
}

/** A small document glyph: page with a folded corner and its format, e.g. PDF. */
function DocGlyph({ format }) {
  const f = String(format || 'doc').toUpperCase().slice(0, 4);
  return (
    <span className="home-doc" aria-hidden="true">
      <span className="home-doc__lines" />
      <span className="home-doc__fmt">{f}</span>
    </span>
  );
}

/** "New in the library": newest files for the year from the library feature. */
export function NewInLibrary({ year, n = 5 }) {
  const files = safeRecent(n, year);
  if (!files.length) {
    return (
      <Panel padding="none">
        <EmptyState
          size="sm"
          icon={Books}
          title="Nothing new in the library yet"
          body="Notes, past papers and study guides your classmates add will show here first."
          action={<Button to="/library" size="sm">Open the library</Button>}
        />
      </Panel>
    );
  }
  return (
    <Panel padding="none" className="home-files">
      <ul role="list">
        {files.map((f) => {
          const m = getModule(f.moduleId);
          const code = f.moduleCode || m?.unitCode || m?.shortName || null;
          return (
            <li key={f.id}>
              <Link to={`/library/${f.id}`} className="home-files__row">
                <DocGlyph format={f.format} />
                <span className="home-files__text">
                  <span className="home-files__title">{f.title}</span>
                  <span className="home-files__meta">
                    {code ? <span className="home-files__code u-code">{code}</span> : null}
                    <span>
                      {f.kindLabel || kindLabel(f.kind)}
                      {f.pages ? <>, <span className="u-tabular">{f.pages}</span> {f.pages === 1 ? 'page' : 'pages'}</> : null}
                    </span>
                  </span>
                </span>
                <span className="home-files__side">
                  {f.isNew ? <Badge tone="highlight" size="sm">New</Badge> : null}
                  {f.addedAt ? <span className="home-files__when">{timeAgo(f.addedAt)}</span> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
