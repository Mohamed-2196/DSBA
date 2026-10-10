import { Link } from 'react-router-dom';
import { Highlight } from '../../../ui';
import { INLINE_RE, LINK_RE } from '../lib/text';

/** Renders the issue copy's inline markup: **bold**, *italic*, ==highlight==, [label](href). */
export function RichText({ text }) {
  const parts = String(text ?? '').split(INLINE_RE);
  return parts.map((p, i) => {
    if (!p) return null;
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('==') && p.endsWith('==') && p.length > 4) return <Highlight key={i}>{p.slice(2, -2)}</Highlight>;
    if (p.startsWith('[')) {
      const m = LINK_RE.exec(p);
      if (m) {
        const [, label, href] = m;
        return href.startsWith('/') ? (
          <Link key={i} to={href}>{label}</Link>
        ) : (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer">
            {label}
            <span className="visually-hidden"> (opens in a new tab)</span>
          </a>
        );
      }
    }
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
    return p;
  });
}
