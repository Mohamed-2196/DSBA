// The DSBA Newsletter: the shapes the feature passes around, all derived from the API's generated types
// (code quality review CQ-4: the API declares the issue's cover and sections, so nothing here re-describes them).
//
// Copy uses one level of inline markup: **bold**  *italic*  ==highlighter mark==  [label](/route | https://… | mailto:…)
import type { IssueDetail, IssueSection, IssueSummary, ReactionCounts } from '../../api/types';

/** A copy block: a paragraph, a bulleted list, the editors' sign-off or a button. */
export type Block = IssueSection['blocks'][number];

/** Beside the copy: a typographic card or a few numbers. */
export type Aside = NonNullable<IssueSection['aside']>;

/** A live section lists data from other features when it is read. */
export type SectionKind = NonNullable<IssueSection['kind']>;

/** The icon beside a section's label. */
export type SectionIcon = NonNullable<IssueSection['icon']>;

export type Reaction = ReactionCounts['mine'][number];

/** An issue as the reader uses it: the API's detail, plus its read time. */
export interface Issue extends IssueDetail {
  readMinutes: number;
}

/** An issue in a list: the summary, plus its sections once its detail has been read (for covers and read time). */
export interface IssueCard extends IssueSummary {
  sections: Pick<IssueSection, 'id' | 'label' | 'title'>[] | null;
  readMinutes: number | null;
}
