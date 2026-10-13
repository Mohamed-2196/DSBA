// Her AI answers as the chat shows them. Claude writes links into the Hub as Markdown, [text](/path); here they
// become plain words in the answer and "Where to look" cards under it. Only paths inside the Hub become cards.
// Pure: no React, no network.
import type { ModuleSummary } from '../../api/types';
import { refKind, type RefKind } from './refs';
import type { Ref, Reply } from './types';

const LINK = /\[([^\]\n]{1,120})\]\(([^)\s]{1,300})\)/g;
/** A link still being written at the end of a streaming answer: hidden until it is whole. */
const OPEN_LINK = /\[[^\]\n]{0,120}(\]\(?[^)\s]{0,300})?$/;
const MAX_REFS = 4;

const CODE: Record<RefKind, string> = { lesson: 'Lesson', files: 'Files', module: 'Module', calendar: 'Calendar', library: 'Library', page: 'Hub' };

/** A path inside the Hub ('/modules/x?tab=lessons'), or null for anything else (another site, '//host', 'javascript:'). */
function hubPath(target: string): string | null {
  if (!target.startsWith('/') || target.startsWith('//')) return null;
  return target;
}

/** What a card shows above its label: the module's unit code for a module's pages, else the kind of page. */
function codeFor(to: string, modules: readonly ModuleSummary[]): string {
  const kind = refKind(to);
  if (kind === 'lesson' || kind === 'files' || kind === 'module') {
    const id = decodeURIComponent(to.split('?')[0]?.split('/')[2] ?? '');
    const module = modules.find((m) => m.id === id);
    if (module) return module.unitCode ?? module.shortName;
  }
  return CODE[kind];
}

/** The answer so far, as it should read while it streams in: links as their words, a half-written one hidden. */
export function visibleText(partial: string): string {
  return partial.replace(LINK, '$1').replace(OPEN_LINK, '');
}

/** Her finished answer: the words (links as plain text), and a card for each place in the Hub it links to. */
export function replyFromAnswer(answer: string, modules: readonly ModuleSummary[]): Reply {
  const refs: Ref[] = [];
  for (const [, label = '', target = ''] of answer.matchAll(LINK)) {
    const to = hubPath(target);
    if (!to || refs.some((r) => r.to === to) || refs.length >= MAX_REFS) continue;
    refs.push({ code: codeFor(to, modules), label: label.trim(), to });
  }
  const text = answer.replace(LINK, '$1').trim();
  return { mood: refs.length ? 'happy' : 'neutral', text, refs };
}
