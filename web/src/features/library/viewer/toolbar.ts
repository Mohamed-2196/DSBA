// What a file's toolbar shows for the room it has. Phones get icons and one More menu; tablets and small laptops
// keep the labels that matter (Time me, Annotate, Download); wide screens get every label. Copy link, Report, Edit
// details and Delete always sit in the More menu, with Save my score on a past paper,, so the row never holds more than it can fit.

/** phone: under 700 px; compact: 700 to 1279 px; full: 1280 px and wider */
export type ToolbarRoom = 'phone' | 'compact' | 'full';

export type MoreAction = 'score' | 'copy' | 'annotate' | 'report' | 'edit' | 'delete';

export interface ToolbarFacts {
  room: ToolbarRoom;
  /** the file is published (it has a link to copy) */
  published: boolean;
  /** the notebook is on and the file is a published PDF */
  annotate: boolean;
  /** this person may report it (it isn't theirs) */
  report: boolean;
  /** a past paper, and this person keeps practice scores */
  score?: boolean;
  edit: boolean;
  delete: boolean;
}

export interface ToolbarLayout {
  /** Annotate as a button with its full or its short label, or in the More menu (null) */
  annotate: 'full' | 'short' | null;
  /** Time me with its label (an icon on phones) */
  timeMeLabel: boolean;
  /** Ask Mini Noora with her name (an icon below 1280 px) */
  askLabel: boolean;
  /** Download (or Open) with its label */
  primaryLabel: boolean;
  /** the More menu, in order; null splits sharing from managing (a divider) */
  more: (MoreAction | null)[];
}

export function toolbarRoom(phone: boolean, wide: boolean): ToolbarRoom {
  return phone ? 'phone' : wide ? 'full' : 'compact';
}

export function toolbarLayout(f: ToolbarFacts): ToolbarLayout {
  const phone = f.room === 'phone';
  const share: MoreAction[] = [];
  if (f.score) share.push('score');
  if (f.published) share.push('copy');
  if (f.annotate && phone) share.push('annotate');
  if (f.report) share.push('report');
  const manage: MoreAction[] = [];
  if (f.edit) manage.push('edit');
  if (f.delete) manage.push('delete');
  return {
    annotate: !f.annotate || phone ? null : f.room === 'full' ? 'full' : 'short',
    timeMeLabel: !phone,
    askLabel: f.room === 'full',
    primaryLabel: !phone,
    more: share.length && manage.length ? [...share, null, ...manage] : [...share, ...manage],
  };
}
