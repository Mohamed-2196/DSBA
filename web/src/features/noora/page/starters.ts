// The full page's starter cards, from her script (GET /mini-noora/script, edited in Manage → Mini Noora): one per kind
// of help, so a student sees at a glance that Noora answers anything they study, as well as where things are in the
// Hub. Four or eight (the API checks), so they fill rows of four or of two. A card fills the text box with a question
// to finish: the part in [square brackets] is selected, so typing replaces it. {module} in a card is a module of the
// student's year. Pure: no React.
import type { ModuleSummary, NooraStarter } from '../../../api/types';

export type Starter = NooraStarter;

/** The cards, with {module} as a module of the student's year when there is one. */
export function starters(cards: readonly NooraStarter[], modules: readonly ModuleSummary[], year: number | null): Starter[] {
  const mine = modules.find((m) => year == null || m.year === year);
  const code = mine ? (mine.unitCode ?? mine.shortName) : 'my next exam';
  const fillIn = (text: string) => text.replaceAll('{module}', code);
  return cards.map((card) => ({ ...card, example: fillIn(card.example), template: fillIn(card.template) }));
}

/** A template as the box takes it: the text without the first pair of brackets, and the part to select. */
export function fill(template: string): { text: string; select: [number, number] } {
  const open = template.indexOf('[');
  const close = open < 0 ? -1 : template.indexOf(']', open);
  if (open < 0 || close < 0) return { text: template, select: [template.length, template.length] };
  const text = template.slice(0, open) + template.slice(open + 1, close) + template.slice(close + 1);
  return { text, select: [open, close - 1] };
}
