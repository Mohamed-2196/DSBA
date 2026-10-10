// Shapes of Mini Noora's conversation.
import type { Attachment } from './files';

/**
 * A run of maths as plain data, set properly by Formula.tsx:
 *   'text'            upright, as written
 *   { v, sub?, sup? } a variable in italics, with a real subscript and/or superscript
 *   { top, bottom }   a stacked fraction
 *   { int: [a, b] }   an integral sign with its limits (lower, upper)
 *   { big: '[' }      a tall bracket
 */
export interface MathVar {
  v: string;
  sub?: MathPart[];
  sup?: MathPart[];
}
export interface MathFrac {
  top: MathPart[];
  bottom: MathPart[];
}
export interface MathInt {
  int: [string, string];
}
export interface MathBig {
  big: string;
}
export type MathPart = string | MathVar | MathFrac | MathInt | MathBig;

/** A formula; `say` is what a screen reader hears. */
export interface FormulaData {
  say: string;
  line: MathPart[];
  note?: MathPart[];
}

/** One step of a worked solution; the last one is the result. */
export interface Step {
  label: MathPart[];
  line: MathPart[];
  say: string;
  result?: boolean;
}

/** A "Where to look" link: `to` is a route in the app. */
export interface Ref {
  code: string;
  label: string;
  to: string;
}

/** How she says it. */
export type Mood = 'happy' | 'laughing' | 'angry' | 'sad' | 'wave' | 'neutral';

/** One of her answers. */
export interface Reply {
  mood: Mood;
  /** one or two short sentences */
  text: string;
  formula?: FormulaData;
  steps?: Step[];
  refs: Ref[];
  /** questions to offer as chips */
  suggestions?: string[];
}

export interface NooraMessage extends Reply {
  id: number;
  from: 'noora';
}
export interface MyMessage {
  id: number;
  from: 'me';
  text: string;
  attachments: Attachment[];
}
export type Message = NooraMessage | MyMessage;

/** A question as the brain reads it. */
export interface Question {
  text: string;
  attachments: Pick<Attachment, 'kind' | 'name'>[];
  /** the year the student is browsing (breaks ties, picks the exam calendar) */
  year: number | null;
}
