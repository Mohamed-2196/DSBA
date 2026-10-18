// Employers: who they are, what they offer, the tracks they suit, their own page, their logo, and their application
// dates on the calendar. Each one shows its card as students will see it.
import { CalendarPlus, PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import type { CareerEmployer, CareerOffer } from '../../../../api/types';
import { useAuth } from '../../../../auth';
import { Button, IconButton, Select, TextArea, TextField } from '../../../../ui';
import { EventFormDialog, useCalendarEvents, type CalendarEvent } from '../../../calendar/public';
import { CareerContext } from '../../context';
import { EmployerCard } from '../../EmployerCard';
import { SECTORS } from '../../lib/sectors';
import { LogoSlot } from '../../LogoSlot';
import { freeId, moveItem, publicDoc, removalBlocker, removeItem, savedIdsOf } from '../doc';
import { LogoField, PickList } from '../fields';
import { ItemList } from '../ItemList';
import { useEditor } from '../state';
import { IdField } from './common';
import { useIsSaved, useItemSetter, useNameToId } from '../hooks';

const OFFER_TYPES: CareerOffer['type'][] = ['graduate', 'internship', 'careers'];

export function EmployersSection() {
  const { doc, update } = useEditor();
  const set = useItemSetter('employers');
  return (
    <ItemList
      section="employers"
      noun="employer"
      items={doc.employers}
      idOf={(e) => e.id}
      titleOf={(e) => e.name}
      metaOf={(e) =>
        [
          e.sector,
          e.offers
            .map((o) => doc.offerTypes[o.type].label)
            .filter((x, i, a) => a.indexOf(x) === i)
            .join(', '),
        ]
          .filter(Boolean)
          .join(' · ')
      }
      leadOf={(e) => <LogoSlot kind="employer" id={e.id} logo={e.logo} mono={e.mono} size="sm" />}
      isHidden={(e) => e.hidden}
      onHide={(id, hidden) => set(id, { hidden })}
      onMove={(from, by) => update((d) => ({ ...d, employers: moveItem(d.employers, from, by) }))}
      onRemove={(id) => update((d) => removeItem(d, 'employer', id))}
      blocker={(id) => removalBlocker(doc, 'employer', id)}
      onAdd={() => {
        const id = freeId('new', savedIdsOf(doc, 'employers'));
        update((d) => ({
          ...d,
          employers: [
            ...d.employers,
            {
              id,
              name: '',
              mono: '',
              sector: '',
              offers: [{ type: 'careers', name: null }],
              tracks: [],
              why: '',
              url: 'https://',
              cta: 'roles',
              logo: null,
              hidden: false,
            },
          ],
        }));
        return id;
      }}
    >
      {(e, i) => <EmployerForm employer={e} index={i} />}
    </ItemList>
  );
}

function EmployerForm({ employer: e, index }: { employer: CareerEmployer; index: number }) {
  const { doc, err } = useEditor();
  const set = useItemSetter('employers');
  const nameToId = useNameToId('employers', 'employer');
  const at = `employers.${index}`;
  const tracks = useMemo(() => new Map(doc.tracks.map((t) => [t.id, t])), [doc.tracks]);
  const preview = useMemo(() => publicDoc(doc), [doc]);
  const setOffer = (n: number, patch: Partial<CareerOffer>) =>
    set(e.id, { offers: e.offers.map((o, k) => (k === n ? { ...o, ...patch } : o)) });
  return (
    <div className="cedit-form">
      <div className="cedit-grid">
        <TextField
          label="Name"
          value={e.name}
          onChange={(v) => set(e.id, { name: v.target.value })}
          onBlur={() => nameToId(e.id, e.name)}
          error={err(`${at}.name`)}
          maxLength={160}
          required
        />
        <TextField
          label="Initials"
          hint="Shown on a tile while there is no logo. Up to 6 letters."
          value={e.mono}
          onChange={(v) => set(e.id, { mono: v.target.value })}
          error={err(`${at}.mono`)}
          maxLength={6}
          required
        />
        <TextField
          label="Sector"
          hint="Bank, Consulting, Technology…"
          value={e.sector}
          onChange={(v) => set(e.id, { sector: v.target.value })}
          error={err(`${at}.sector`)}
          maxLength={60}
          list="cedit-sectors"
          required
        />
        <IdField section="employers" kind="employer" id={e.id} error={err(`${at}.id`)} />
      </div>
      <datalist id="cedit-sectors">
        {SECTORS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <fieldset className="cedit-group">
        <legend className="cedit-group__legend">What it offers</legend>
        <ol role="list" className="cedit-rows">
          {e.offers.map((o, n) => (
            <li key={n} className="cedit-rows__row">
              <Select
                label="Kind"
                value={o.type}
                onChange={(v) => setOffer(n, { type: v.target.value as CareerOffer['type'] })}
                options={OFFER_TYPES.map((t) => ({ value: t, label: doc.offerTypes[t].label }))}
              />
              <TextField
                label="Programme name"
                hint="Only as the employer’s own site names it."
                value={o.name ?? ''}
                onChange={(v) => setOffer(n, { name: v.target.value || null })}
                error={err(`${at}.offers.${n}.name`)}
                maxLength={160}
              />
              <IconButton
                icon={Trash}
                label={`Remove offer ${n + 1}`}
                onClick={() => set(e.id, { offers: e.offers.filter((_, k) => k !== n) })}
                className="cedit-rows__remove"
              />
            </li>
          ))}
        </ol>
        {e.offers.length < 6 ? (
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={Plus}
            onClick={() => set(e.id, { offers: [...e.offers, { type: 'internship', name: null }] })}
          >
            Add an offer
          </Button>
        ) : null}
      </fieldset>

      <PickList
        label="Good for"
        hint="Tracks, the most relevant first."
        value={e.tracks}
        options={doc.tracks.map((t) => ({ value: t.id, label: t.short }))}
        onChange={(next) => set(e.id, { tracks: next })}
        addLabel="Add a track"
        error={err(`${at}.tracks`)}
        max={10}
      />
      <TextArea
        label="Why it’s here"
        rows={3}
        value={e.why}
        onChange={(v) => set(e.id, { why: v.target.value })}
        error={err(`${at}.why`)}
        maxLength={600}
        required
      />
      <div className="cedit-grid">
        <TextField
          label="Its own page"
          hint="The employer’s careers or programme page. https:// only."
          type="url"
          inputMode="url"
          value={e.url}
          onChange={(v) => set(e.id, { url: v.target.value })}
          error={err(`${at}.url`)}
          maxLength={500}
          required
        />
        <Select
          label="Button"
          value={e.cta}
          onChange={(v) => set(e.id, { cta: v.target.value as CareerEmployer['cta'] })}
          options={(['apply', 'programme', 'roles'] as const).map((c) => ({ value: c, label: doc.ctaLabel[c] }))}
        />
      </div>
      <LogoField
        kind="employer"
        id={e.id}
        mono={e.mono}
        logo={e.logo}
        onChange={(logo) => set(e.id, { logo })}
        path={`${at}.logo`}
      />
      <ApplicationDates employer={e} />

      <section className="cedit-preview" aria-label={`${e.name || 'The employer'} as students see it`}>
        <h5 className="cedit-preview__title">Preview</h5>
        {e.hidden ? <p className="cedit__note">Hidden: students don’t see this card.</p> : null}
        <CareerContext.Provider value={preview}>
          <ul role="list" className="cedit-preview__cards">
            <EmployerCard
              employer={{ ...e, tracks: e.tracks.filter((t) => tracks.get(t) && !tracks.get(t)?.hidden) }}
              track="all"
              tracks={tracks}
            />
          </ul>
        </CareerContext.Provider>
      </section>
    </div>
  );
}

/** The employer's opening and closing dates: careers dates on the calendar, linked to it. */
function ApplicationDates({ employer }: { employer: CareerEmployer }) {
  const { can, featureOn } = useAuth();
  const isSaved = useIsSaved('employers', employer.id);
  const manages = can('calendar.manage') && featureOn('calendar');
  const dates = useCalendarEvents({ type: 'careers' }, { enabled: featureOn('calendar') });
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null);
  const mine = (dates.data ?? []).filter((d) => d.employerId === employer.id);
  return (
    <fieldset className="cedit-group">
      <legend className="cedit-group__legend">Application dates</legend>
      <p className="cedit__note">
        On the calendar as Careers dates, and on the card as “Opens in January” or “Closes 30 November”. Only dates the
        employer has published, with where they come from.
      </p>
      {mine.length ? (
        <ul role="list" className="cedit-dates">
          {mine.map((d) => (
            <li key={d.id} className="cedit-dates__row">
              <span className="cedit-dates__when">{d.endDate ? `${d.date} to ${d.endDate}` : d.date}</span>
              <span className="cedit-dates__title">{d.title}</span>
              {manages ? (
                <IconButton size="sm" icon={PencilSimple} label={`Edit ${d.title}`} onClick={() => setEditing(d)} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="cedit__empty">No dates yet.</p>
      )}
      {!featureOn('calendar') ? (
        <p className="cedit__note">The calendar is switched off, so dates can’t be added.</p>
      ) : !manages ? (
        <p className="cedit__note">People who manage the calendar add these dates.</p>
      ) : !isSaved ? (
        <p className="cedit__note">Save the new employer first, then add its dates.</p>
      ) : (
        <Button variant="secondary" size="sm" leadingIcon={CalendarPlus} onClick={() => setEditing('new')}>
          Add a date
        </Button>
      )}
      {manages && editing !== null ? (
        <EventFormDialog
          open
          event={editing === 'new' ? null : editing}
          preset={{ type: 'careers', employerId: employer.id, title: `${employer.name} applications` }}
          employers={[{ id: employer.id, name: employer.name }]}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      ) : null}
    </fieldset>
  );
}
