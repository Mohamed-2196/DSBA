// The DSBA Newsletter: the shapes of an issue's content. The API stores `cover` and `sections` as JSON
// (IssueDetail.cover / .sections); lib/schema.ts reads that JSON into these types, dropping (and, in the
// editor, reporting) anything it does not understand.
//
// Copy uses one level of inline markup: **bold**  *italic*  ==highlighter mark==  [label](/route | https://…)
import type { IssueDetail, IssueSummary, ReactionCounts } from '../../api/types';
import type { CohortYear } from '../../lib/modules';

/** A copy block. */
export type Block =
  | { type: 'p'; text: string; lead?: boolean }
  | { type: 'list'; items: string[] }
  | { type: 'steps'; items: { title: string; text: string }[] }
  | { type: 'qa'; items: { q: string; a: string }[] }
  | { type: 'signoff'; text: string }
  | { type: 'cta'; to: string; label: string }
  | ({ type: 'figure' } & Figure);

export type BlockType = Block['type'];

/**
 * An image: a file under the app's public/ folder ('demo/news/x.jpg') or an uploaded image
 * ('/api/v1/media/<id>'). Width and height reserve its space while it loads.
 */
export interface Figure {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption?: string;
}

/** A margin note beside a section. `wide` gives it the figure's column. */
export type Aside =
  | { type: 'note'; title: string; text: string; wide?: boolean }
  | { type: 'stats'; title: string; items: { value: string; label: string }[]; foot?: string; wide?: boolean }
  | { type: 'quote'; text: string; cite?: string; wide?: boolean }
  | { type: 'card'; kicker: string; title: string; text: string; wide?: boolean };

/** Sections that render live data from other features at read time, or a special layout. */
export type SectionKind = 'deadlines' | 'forum' | 'library' | 'cohorts' | 'chart';

export interface CohortUpdate {
  year: CohortYear;
  title: string;
  moduleIds: string[];
  paragraphs: string[];
}

/** A chart section: one series, days to the exam (first point) down to 0, against 0–100. */
export interface Chart {
  title: string;
  caption: string;
  xLabel: string;
  yLabel: string;
  points: [number, number][];
  notes: { day: number; text: string }[];
}

export interface Section {
  /** Stable: it is the ?section= deep link and the key of the section's reactions. */
  id: string;
  label: string;
  /** A Phosphor icon name (see components/sectionIcons.ts). */
  icon?: string;
  title: string;
  kind?: SectionKind;
  blocks: Block[];
  /** Blocks after a live section's list (a sign-off). */
  after?: Block[];
  figure?: Figure;
  aside?: Aside;
  /** A spotlight: the person the section is about. */
  profile?: { name: string; line?: string; year?: CohortYear };
  /** Deadlines: the dates the section lists ('YYYY-MM-DD'). */
  window?: { from?: string; to?: string };
  /** Live sections: what to say when there is nothing to list. */
  fallback?: { title: string; text: string };
  /** Words the live part adds to the read time. */
  estWords?: number;
  cohorts?: CohortUpdate[];
  chart?: Chart;
}

export interface CoverLine {
  /** A section id. */
  section: string;
  text: string;
}

/**
 * tone: the stock a typographic cover is printed on ('navy' | 'paper'); with an illustration, the colour of
 * the type's ground. art: an illustration that fills the cover (a path under public/, portrait 3:4).
 * lines: the cover lines in story order (five at most).
 */
export interface Cover {
  tone: 'navy' | 'paper';
  art: string | null;
  lines: CoverLine[];
}

export type Reaction = keyof Omit<ReactionCounts, 'mine'>;

/** An issue as the reader uses it: the API's detail with its JSON read into types. */
export interface Issue extends Omit<IssueDetail, 'cover' | 'sections'> {
  cover: Cover;
  sections: Section[];
  readMinutes: number;
}

/** An issue in a list: the summary, plus its sections once its detail has been read (for covers and read time). */
export interface IssueCard extends Omit<IssueSummary, 'cover'> {
  cover: Cover;
  sections: Pick<Section, 'id' | 'label'>[] | null;
  readMinutes: number | null;
}

/** What is wrong with a piece of the JSON, for the editor ('sections[2].blocks[0]: …'). */
export interface Problem {
  path: string;
  message: string;
  /** Shown, but nothing is left out because of it (a picture without alt text). */
  warning?: boolean;
}
