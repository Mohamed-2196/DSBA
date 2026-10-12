// One section in the issue editor: a card that opens to its fields. Closed, it shows its number, icon, label and
// headline, what kind it is and how many problems it has, so a long issue stays easy to find your way around on a
// phone. Open: what it is, its label, icon, headline and link name, the copy, the live list's settings and what
// sits beside the text.
import { memo, useState } from 'react';
import { CaretDown, PencilSimple, WarningCircle } from '@phosphor-icons/react';
import { Badge, Button, Select, cx } from '../../../ui';
import { LIMITS, controlId, fieldPath, sectionOfPath, setKind, type FieldErrors, type SectionDraft } from '../lib/draft';
import { plainText } from '../lib/text';
import type { SectionIcon, SectionKind } from '../types';
import { BesideEditor } from './BesideEditor';
import { BlockList } from './BlockList';
import { ItemTools, MARKUP_HINT, TextBox, TextInput } from './fields';
import { SECTION_ICONS, sectionIcon } from '../components/sectionIcons';

const KINDS: { value: '' | SectionKind; label: string; note: string }[] = [
  { value: '', label: 'A story', note: '' },
  { value: 'deadlines', label: 'Deadlines from the calendar', note: 'Lists the exams between two days, from the calendar, with a countdown from the issue date.' },
  { value: 'forum', label: 'Hot threads from the forum', note: 'Lists the threads getting the most attention when someone reads the issue.' },
  { value: 'library', label: 'New files in the library', note: 'Lists the newest files in the library when someone reads the issue.' },
];

const KIND_BADGE: Record<SectionKind, string> = { deadlines: 'Deadlines', forum: 'Forum', library: 'Library' };

const ICON_NAMES: Record<SectionIcon, string> = {
  NotePencil: 'Note',
  ListBullets: 'List',
  CalendarCheck: 'Calendar',
  Sparkle: 'Sparkle',
  Megaphone: 'Announcement',
  UsersThree: 'People',
  Lightbulb: 'Idea',
  Student: 'Student',
  ChatsCircle: 'Conversation',
  Books: 'Books',
  ChartLineUp: 'Chart',
  Microphone: 'Microphone',
  RocketLaunch: 'Launch',
  Newspaper: 'News',
};

const ICONS = Object.keys(ICON_NAMES) as SectionIcon[];

function IconPicker({ name, value, onChange }: { name: string; value: SectionIcon | null; onChange: (icon: SectionIcon | null) => void }) {
  return (
    <fieldset className="nl-ed-icons">
      <legend className="ui-field__label">Icon</legend>
      <div className="nl-ed-icons__grid">
        {ICONS.map((icon) => {
          const Glyph = SECTION_ICONS[icon];
          return (
            <label key={icon} className="nl-ed-icon" title={ICON_NAMES[icon]}>
              <input type="radio" name={name} value={icon} checked={value === icon} onChange={() => onChange(icon)} className="nl-ed-icon__input" />
              <Glyph weight="duotone" aria-hidden="true" />
              <span className="visually-hidden">{ICON_NAMES[icon]}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export interface SectionCardProps {
  section: SectionDraft;
  index: number;
  count: number;
  /** the issue's date: a new deadlines section starts there */
  issueDate: string;
  published: boolean;
  errors: FieldErrors;
  open: boolean;
  onToggle: (key: string) => void;
  onChange: (key: string, fn: (s: SectionDraft) => SectionDraft) => void;
  onRename: (key: string, id: string) => void;
  onMove: (key: string, dir: -1 | 1) => void;
  onRemove: (key: string) => void;
  onFocus: (path: string) => void;
}

function SectionCardImpl({ section: s, index, count, issueDate, published, errors, open, onToggle, onChange, onRename, onMove, onRemove, onFocus }: SectionCardProps) {
  const [editingId, setEditingId] = useState(false);
  const change = (fn: (x: SectionDraft) => SectionDraft) => onChange(s.key, fn);
  const path = (field: string) => fieldPath.section(s.key, field);
  const problems = Object.keys(errors).filter((p) => sectionOfPath(p) === s.key).length;
  const Icon = sectionIcon(s.icon);
  const label = plainText(s.label.trim() || s.title.trim()) || 'New section';
  const headline = plainText(s.title.trim());
  const bodyId = `nl-ed-sec-${s.key}`;
  const kindNote = KINDS.find((k) => k.value === (s.kind ?? ''))?.note ?? '';
  const live = s.kind !== null;

  return (
    <li className={cx('nl-ed-section', open && 'is-open', problems > 0 && 'has-problems')} data-hub="editor-section" data-section-id={s.id}>
      <div className="nl-ed-section__head">
        <h3 className="nl-ed-section__heading">
          <button type="button" id={controlId(`toggle:${s.key}`)} className="nl-ed-section__toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => onToggle(s.key)}>
          <span className="nl-ed-section__no u-tabular" aria-hidden="true">
            {index + 1}
          </span>
          <Icon className="nl-ed-section__icon" weight="duotone" aria-hidden="true" />
          <span className="nl-ed-section__names">
            <span className="nl-ed-section__label">
              {label}
              {s.kind ? (
                <Badge tone="outline" size="sm" className="nl-ed-section__kind">
                  {KIND_BADGE[s.kind]}
                </Badge>
              ) : null}
            </span>
            {headline && headline !== label ? <span className="nl-ed-section__title">{headline}</span> : null}
          </span>
          {problems > 0 ? (
            <span className="nl-ed-section__problems">
              <WarningCircle weight="fill" aria-hidden="true" />
              {problems === 1 ? '1 problem' : `${problems} problems`}
            </span>
          ) : null}
          <span className="visually-hidden">{open ? ', open' : ', closed'}</span>
            <CaretDown className="nl-ed-section__caret" weight="bold" aria-hidden="true" />
          </button>
        </h3>
        <ItemTools
          name={`section ${index + 1}`}
          first={index === 0}
          last={index === count - 1}
          onMove={(dir) => onMove(s.key, dir)}
          onRemove={() => onRemove(s.key)}
          className="nl-ed-section__tools"
        />
      </div>

      {open ? (
        <div id={bodyId} className="nl-ed-section__body">
          <div className="nl-ed-grid">
            <Select
              label="What it is"
              value={s.kind ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                const kind = value === 'deadlines' || value === 'forum' || value === 'library' ? value : null;
                change((x) => setKind(x, kind, issueDate));
              }}
              options={KINDS.map((k) => ({ value: k.value, label: k.label }))}
              hint={kindNote || undefined}
              className="nl-ed-wide"
            />
            <TextInput path={path('label')} errors={errors} label="Label" max={LIMITS.label} hint="Beside the icon, above the headline. Leave it empty to show the headline." placeholder="Deadlines and dates" value={s.label} onValue={(label) => change((x) => ({ ...x, label }))} />
            <TextInput path={path('title')} errors={errors} label="Headline" required max={LIMITS.heading} value={s.title} onValue={(title) => change((x) => ({ ...x, title }))} />
          </div>

          <IconPicker name={`icon-${s.key}`} value={s.icon} onChange={(icon) => change((x) => ({ ...x, icon }))} />

          <div className="nl-ed-link">
            {editingId || errors[path('id')] ? (
              <TextInput
                path={path('id')}
                errors={errors}
                label="Link name"
                max={LIMITS.sectionId}
                hint={published && !s.isNew ? 'Changing it breaks links to this section and resets its reactions.' : 'The end of the section’s link (…?section=link-name). Lowercase letters, numbers and hyphens.'}
                value={s.id}
                onValue={(id) => onRename(s.key, id.toLowerCase())}
                autoComplete="off"
              />
            ) : (
              <p className="nl-ed-link__line">
                <span className="nl-ed-link__label">Link</span>
                <code className="nl-ed-link__id">?section={s.id || '…'}</code>
                <Button size="sm" variant="ghost" leadingIcon={PencilSimple} onClick={() => setEditingId(true)}>
                  Change
                </Button>
              </p>
            )}
          </div>

          <section className="nl-ed-part" aria-label={live ? 'Before the list' : 'The text'}>
            <h4 className="nl-ed-part__title">{live ? 'Before the list' : 'The text'}</h4>
            <p className="nl-ed-note">Format the text with **bold**, *italic*, ==highlight== and [link text](/calendar).</p>
            <BlockList
              sectionKey={s.key}
              title={live ? `the words before the list of section ${index + 1}` : `the text of section ${index + 1}`}
              blocks={s.blocks}
              max={LIMITS.blocks}
              errors={errors}
              path={path('blocks')}
              onChange={(fn) => change((x) => ({ ...x, blocks: fn(x.blocks) }))}
              onFocus={onFocus}
            />
          </section>

          {s.kind === 'deadlines' ? (
            <section className="nl-ed-part" aria-label="The dates listed">
              <h4 className="nl-ed-part__title">The dates listed</h4>
              <div className="nl-ed-grid">
                <TextInput path={path('window.from')} errors={errors} type="date" label="From" hint="Empty: the issue’s date." value={s.window.from} onValue={(from) => change((x) => ({ ...x, window: { ...x.window, from } }))} />
                <TextInput path={path('window.to')} errors={errors} type="date" label="To" min={s.window.from || undefined} hint="Empty: three months after." value={s.window.to} onValue={(to) => change((x) => ({ ...x, window: { ...x.window, to } }))} />
              </div>
            </section>
          ) : null}

          {s.kind === 'forum' || s.kind === 'library' ? (
            <section className="nl-ed-part" aria-label="When there’s nothing to list">
              <h4 className="nl-ed-part__title">When there’s nothing to list</h4>
              <p className="nl-ed-note">Shown instead of the headline and the words above, until the {s.kind === 'forum' ? 'forum has threads' : 'library has files'} to list.</p>
              <TextInput path={path('fallback.title')} errors={errors} label="Headline" max={LIMITS.line} value={s.fallback.title} onValue={(title) => change((x) => ({ ...x, fallback: { ...x.fallback, title } }))} />
              <TextBox path={path('fallback.text')} errors={errors} label="Text" rows={2} max={LIMITS.item} hint={MARKUP_HINT} value={s.fallback.text} onValue={(text) => change((x) => ({ ...x, fallback: { ...x.fallback, text } }))} />
            </section>
          ) : null}

          {live || s.after.length ? (
            <section className="nl-ed-part" aria-label={live ? 'After the list' : 'At the end'}>
              <h4 className="nl-ed-part__title">{live ? 'After the list' : 'At the end'}</h4>
              <BlockList
                sectionKey={s.key}
                title={live ? `the words after the list of section ${index + 1}` : `the end of section ${index + 1}`}
                blocks={s.after}
                max={LIMITS.after}
                errors={errors}
                path={path('after')}
                onChange={(fn) => change((x) => ({ ...x, after: fn(x.after) }))}
                onFocus={onFocus}
              />
            </section>
          ) : null}

          <section className="nl-ed-part" aria-label="Beside the text">
            <h4 className="nl-ed-part__title">Beside the text</h4>
            <BesideEditor section={s} errors={errors} onChange={change} />
          </section>
        </div>
      ) : null}
    </li>
  );
}

/** A section of the issue editor (memoised: typing in one section doesn't redraw the others). */
export const SectionCard = memo(SectionCardImpl);
