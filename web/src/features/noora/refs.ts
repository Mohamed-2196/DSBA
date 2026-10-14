// Her "Where to look" links as the chat shows and copies them. Pure.
import type { NooraMessage, Ref } from './types';

/** What a link opens, for its icon: a lesson, a module's files, a module, the calendar, the library. */
export type RefKind = 'lesson' | 'files' | 'module' | 'calendar' | 'library' | 'page';

export function refKind(to: string): RefKind {
  const [path = '', query = ''] = to.split('?');
  const params = new URLSearchParams(query);
  if (path.startsWith('/calendar')) return 'calendar';
  if (path.startsWith('/library')) return 'library';
  if (path.startsWith('/modules/')) {
    if (params.get('tab') === 'lessons' || /^\/modules\/[^/]+\/lessons\//.test(path)) return 'lesson';
    if (params.get('tab') === 'files') return 'files';
    return 'module';
  }
  return 'page';
}

/** One of her answers as plain text, for the clipboard: what she said, the maths as words, and where to look. */
export function messageAsText(message: Pick<NooraMessage, 'text' | 'formula' | 'steps' | 'refs'>, linkFor: (to: string) => string): string {
  const lines = [message.text];
  if (message.formula) lines.push(message.formula.say);
  for (const step of message.steps ?? []) lines.push(step.say);
  if (message.refs.length) {
    lines.push('', 'Where to look:');
    for (const ref of message.refs) lines.push(`${refLine(ref)}: ${linkFor(ref.to)}`);
  }
  return lines.join('\n');
}

const refLine = (ref: Ref): string => (ref.label.startsWith(ref.code) ? ref.label : `${ref.code} ${ref.label}`);
