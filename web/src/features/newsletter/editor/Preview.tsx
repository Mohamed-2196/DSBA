// The editor's live preview: the reader's own cover and sections, drawn from the draft as it is typed (whatever is
// still missing), so what a rep sees is what readers get.
import { useDeferredValue } from 'react';
import type { IssueDetail } from '../../../api/types';
import { isDayKey } from '../../../lib/dates';
import { IssueCover } from '../components/IssueCover';
import { IssueSection } from '../components/IssueSection';
import { editorNames, previewOf, type IssueDraft } from '../lib/draft';
import { issueNo, listNames, readMinutes } from '../lib/text';

export function Preview({ draft, detail }: { draft: IssueDraft; detail: IssueDetail }) {
  // Typing stays quick: the preview follows a moment behind on a slow phone.
  const d = useDeferredValue(draft);
  const { cover, sections } = previewOf(d);
  const number = Number(d.number) || 0;
  const date = isDayKey(d.date) ? d.date : detail.date;
  const editors = editorNames(d.editors);
  const title = d.title.trim() || 'Untitled';
  return (
    <div className="nl-editor__preview" aria-label="Preview" role="region">
      <div className="nl-editor__preview-hero">
        <div className="nl-editor__preview-cover">
          <IssueCover issue={{ number, title, date, cover, sections }} />
        </div>
        <div>
          <p className="nl-editor__preview-kicker">
            Issue {issueNo(number)}, {readMinutes({ title, dek: d.dek, sections })} min read
          </p>
          <p className="nl-issue__title nl-editor__preview-title">{title}</p>
          {d.dek.trim() ? <p className="nl-issue__dek">{d.dek}</p> : null}
          {editors.length ? <p className="nl-editor__preview-by">By {listNames(editors)}</p> : null}
        </div>
      </div>
      <div className="nl-article nl-editor__preview-article">
        {sections.length ? (
          sections.map((s) => (
            <IssueSection
              key={s.id}
              issue={{ id: detail.id, slug: detail.slug, date, editors, reactions: detail.reactions }}
              section={s}
              readOnly
            />
          ))
        ) : (
          <p className="nl-editor__preview-empty">The sections show here as you write them.</p>
        )}
      </div>
    </div>
  );
}
