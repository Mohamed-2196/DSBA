import { Link } from 'react-router-dom';
import { ArrowSquareOut, GoogleDriveLogo } from '@phosphor-icons/react';
import { Button, CohortBadge, Kbd, Sparkline, cx, timeAgo } from '../../../ui';
import { cohortTextColor } from '../../../state';
import { getModule } from '../../../data/modules.js';
import { FORMATS, formatSize, pageNoun } from '../data/kinds.js';
import { pagesLabel } from '../data/display.js';
import { FileThumb } from '../components/FileThumb.jsx';

function Row({ label, children }) {
  return (
    <div className="lib-meta__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** The viewer's details column: module, file facts, the original on Drive, related files. */
export function MetaPanel({ file, related, linkState, className, id }) {
  const m = getModule(file.moduleId);
  const nounPlural = pageNoun(file.format, 2);
  return (
    <aside id={id} className={cx('lib-meta', className)} data-hub="file-meta" aria-label="File details">
      <section className="lib-meta__module">
        <Link to={`/modules/${m.id}?tab=files`} className="lib-meta__module-link">
          {m.unitCode ? (
            <span className="lib-meta__code u-code" style={{ color: cohortTextColor(m.year) }}>{m.unitCode}</span>
          ) : null}
          <span className="lib-meta__module-name">{m.name}</span>
        </Link>
        <CohortBadge year={m.year} size="sm" />
      </section>

      <dl className="lib-meta__list">
        <Row label="Type">{file.kindLabel}</Row>
        {file.examYear ? <Row label="Exam">{file.examYear}{file.zone ? `, Zone ${file.zone}` : ''}</Row> : null}
        {file.unit ? <Row label={file.unit.noun}>{file.unit.no}, {file.unit.title}</Row> : null}
        <Row label="Author">{file.author}</Row>
        <Row label="Added">
          {timeAgo(file.addedAt)}
          <span className="lib-meta__sub">by {file.addedBy}</span>
        </Row>
        <Row label="Format">{FORMATS[file.format].name}</Row>
        <Row label="Size">{formatSize(file.sizeKB)}</Row>
        <Row label={nounPlural[0].toUpperCase() + nounPlural.slice(1)}>{file.pages}</Row>
        <Row label="Downloads">
          <span className="lib-meta__downloads">
            <span className="u-tabular">{file.downloads.toLocaleString('en-GB')}</span>
            <Sparkline data={file.trend} width={92} height={24} area label="Downloads per week over the last 12 weeks" />
          </span>
        </Row>
      </dl>

      <section className="lib-meta__source" aria-labelledby="lib-meta-source">
        <h2 id="lib-meta-source" className="lib-meta__h">
          <GoogleDriveLogo aria-hidden="true" weight="duotone" />
          Original on Google Drive
        </h2>
        <p>The file stays in its course folder on Drive, exactly as it was linked before.</p>
        <Button href={file.sourceUrl} trailingIcon={ArrowSquareOut} fullWidth>Open original</Button>
      </section>

      {related.length ? (
        <section className="lib-meta__related" aria-labelledby="lib-meta-related">
          <h2 id="lib-meta-related" className="lib-meta__h">Related files</h2>
          <ul role="list">
            {related.map((f) => (
              <li key={f.id}>
                <Link to={f.url} state={linkState} className="lib-related">
                  <FileThumb file={f} size="related" hook={false} />
                  <span className="lib-related__text">
                    <span className="lib-related__title">{f.title}</span>
                    <span className="lib-related__meta">{f.kindLabel}, {pagesLabel(f)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="lib-meta__keys" aria-label="Keyboard shortcuts">
        <p><span className="lib-meta__keycaps"><Kbd>←</Kbd><Kbd>→</Kbd></span> Turn pages</p>
        <p><span className="lib-meta__keycaps"><Kbd>+</Kbd><Kbd>−</Kbd></span> Zoom</p>
        <p><span className="lib-meta__keycaps"><Kbd>Esc</Kbd></span> Back to the library</p>
      </section>
    </aside>
  );
}
