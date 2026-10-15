// The full page's starter cards: one per kind of help, so a student sees at a glance that Noora answers anything they
// study, not only questions about the Hub. A card fills the text box with a question to finish: the part in [square
// brackets] is selected, so typing replaces it. Pure: no React.
import type { ModuleSummary } from '../../../api/types';

export type StarterId = 'explain' | 'solve' | 'quiz' | 'plan' | 'summarise' | 'career' | 'write';

export interface Starter {
  id: StarterId;
  title: string;
  /** a line under the title */
  example: string;
  /** what goes in the box; the first [part] is selected and the brackets go */
  template: string;
}

/** The cards, using a module of the student's year in the examples when there is one. */
export function starters(modules: readonly ModuleSummary[], year: number | null): Starter[] {
  const mine = modules.find((m) => year == null || m.year === year);
  const code = mine ? (mine.unitCode ?? mine.shortName) : 'my next exam';
  return [
    { id: 'explain', title: 'Explain a concept', example: 'The central limit theorem, simply', template: 'Explain [the central limit theorem] simply, with a worked example.' },
    { id: 'solve', title: 'Solve step by step', example: 'A past paper question, with each step', template: 'Solve this step by step and explain each step: [paste the question]' },
    { id: 'quiz', title: 'Quiz me', example: 'Five questions, marked as I go', template: 'Quiz me with five questions on [hypothesis testing], one at a time, and mark each answer.' },
    { id: 'plan', title: 'Plan my revision', example: `A plan for ${code} around my exams`, template: `Plan my revision for [${code}] over the next three weeks, around my exam dates.` },
    { id: 'summarise', title: 'Summarise a paper', example: 'An article, a chapter or my notes', template: 'Summarise this in five bullet points, then list the key terms: [paste the text]' },
    { id: 'career', title: 'Career advice', example: 'Skills for a data analyst role', template: 'What should I learn for [a data analyst role], and which modules help?' },
    { id: 'write', title: 'Write or proofread', example: 'Clearer wording for coursework', template: 'Proofread this and suggest clearer wording, keeping my meaning: [paste your text]' },
  ];
}

/** A template as the box takes it: the text without the first pair of brackets, and the part to select. */
export function fill(template: string): { text: string; select: [number, number] } {
  const open = template.indexOf('[');
  const close = open < 0 ? -1 : template.indexOf(']', open);
  if (open < 0 || close < 0) return { text: template, select: [template.length, template.length] };
  const text = template.slice(0, open) + template.slice(open + 1, close) + template.slice(close + 1);
  return { text, select: [open, close - 1] };
}
