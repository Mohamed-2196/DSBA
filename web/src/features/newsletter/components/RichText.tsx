import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Highlight } from '../../../ui';
import { safeHref } from '../lib/links';
import { INLINE_RE, LINK_RE } from '../lib/text';

/**
 * Renders the issue copy's inline markup: **bold**, *italic*, ==highlight==, [label](href). Text is never
 * parsed as HTML; a link that is not an app path or an http(s)/mailto address shows as its label only.
 */
export function RichText({ text }: { text: string | null | undefined }) {
  const parts = String(text ?? '').split(INLINE_RE);
  const out: ReactNode[] = parts.map((p, i) => {
    if (!p) return null;
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('==') && p.endsWith('==') && p.length > 4) return <Highlight key={i}>{p.slice(2, -2)}</Highlight>;
    if (p.startsWith('[')) {
      const m = LINK_RE.exec(p);
      if (m) {
        const label = m[1] ?? '';
        const target = safeHref(m[2] ?? '');
        if (!target) return label;
        if (target.kind === 'internal') {
          return (
            <Link key={i} to={target.to}>
              {label}
            </Link>
          );
        }
        // An email address opens the mail app; a web page opens in a new tab.
        return target.href.startsWith('mailto:') ? (
          <a key={i} href={target.href}>
            {label}
          </a>
        ) : (
          <a key={i} href={target.href} target="_blank" rel="noopener noreferrer">
            {label}
            <span className="visually-hidden"> (opens in a new tab)</span>
          </a>
        );
      }
    }
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
    return p;
  });
  return <>{out}</>;
}
