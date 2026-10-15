// Certificates, the featured competition, the checklist before applying, the further-study line, and the page's own
// words (labels, notes, the date links were checked).
import { useMemo } from 'react';
import type { CareerCert, CareerChecklistItem, CareerDoc, CareerFeatured } from '../../../../api/types';
import { Button, Select, Switch, TextArea, TextField } from '../../../../ui';
import { CertCard } from '../../Certificates';
import { CareerContext } from '../../context';
import { LogoSlot } from '../../LogoSlot';
import { freeId, moveItem, publicDoc, removalBlocker, removeItem, savedIdsOf } from '../doc';
import { ChecklistLinkField, LogoField, PickList } from '../fields';
import { ItemList } from '../ItemList';
import { useEditor } from '../state';
import { IdField } from './common';
import { useItemSetter, useModuleOptions, useNameToId } from '../hooks';

// ── certificates ─────────────────────────────────────────────────────────────────────────────

export function CertsSection() {
  const { doc, update, err } = useEditor();
  const set = useItemSetter('certs');
  return (
    <>
      <TextArea label="Note above the certificates" rows={2} value={doc.certNote} onChange={(v) => update((d) => ({ ...d, certNote: v.target.value }))} error={err('certNote')} maxLength={600} required />
      <ItemList
        section="certs"
        noun="certificate"
        items={doc.certs}
        idOf={(c) => c.id}
        titleOf={(c) => c.name}
        metaOf={(c) => `${c.issuer} · ${doc.effortLabel[String(c.effort)] ?? ''} effort`}
        leadOf={(c) => <LogoSlot kind="cert" id={c.id} logo={c.logo} mono={c.mono ?? ''} size="sm" />}
        isHidden={(c) => c.hidden}
        onHide={(id, hidden) => set(id, { hidden })}
        onMove={(from, by) => update((d) => ({ ...d, certs: moveItem(d.certs, from, by) }))}
        onRemove={(id) => update((d) => removeItem(d, 'cert', id))}
        blocker={(id) => removalBlocker(doc, 'cert', id)}
        onAdd={() => {
          const id = freeId('new', savedIdsOf(doc, 'certs'));
          update((d) => ({
            ...d,
            certs: [...d.certs, { id, name: '', short: '', issuer: '', mono: null, url: 'https://', file: null, goodFor: '', effort: 2, effortNote: '', covers: [], coversNote: null, roles: [], logo: null, hidden: false }],
          }));
          return id;
        }}
      >
        {(c, i) => <CertForm cert={c} index={i} />}
      </ItemList>
    </>
  );
}

function CertForm({ cert: c, index }: { cert: CareerCert; index: number }) {
  const { doc, err } = useEditor();
  const set = useItemSetter('certs');
  const nameToId = useNameToId('certs', 'cert');
  const modules = useModuleOptions();
  const preview = useMemo(() => publicDoc(doc), [doc]);
  const at = `certs.${index}`;
  const selfStudy = c.file !== null && c.file !== undefined;
  return (
    <div className="cedit-form">
      <div className="cedit-grid">
        <TextField label="Name" value={c.name} onChange={(v) => set(c.id, { name: v.target.value })} onBlur={() => nameToId(c.id, c.name)} error={err(`${at}.name`)} maxLength={160} required />
        <TextField label="Short name" value={c.short} onChange={(v) => set(c.id, { short: v.target.value })} error={err(`${at}.short`)} maxLength={60} required />
        <TextField label="Issuer" value={c.issuer} onChange={(v) => set(c.id, { issuer: v.target.value })} error={err(`${at}.issuer`)} maxLength={160} required />
        <TextField label="Initials" hint="Shown while there is no logo." value={c.mono ?? ''} onChange={(v) => set(c.id, { mono: v.target.value || null })} error={err(`${at}.mono`)} maxLength={6} />
        <IdField section="certs" kind="cert" id={c.id} error={err(`${at}.id`)} />
      </div>
      <Switch
        checked={selfStudy}
        onChange={(on) => set(c.id, on ? { file: { module: String(modules[0]?.value ?? ''), id: '' }, url: null } : { file: null, url: 'https://' })}
        label="Self-study from a library file"
        description="Instead of an official page, the card links to a file in the library."
      />
      {selfStudy && c.file ? (
        <div className="cedit-grid">
          <Select label="Module" value={c.file.module} onChange={(v) => set(c.id, { file: { ...(c.file as NonNullable<CareerCert['file']>), module: v.target.value } })} options={modules} error={err(`${at}.file.module`)} />
          <TextField label="Library file" hint="The file’s address in the library (the end of its link)." value={c.file.id} onChange={(v) => set(c.id, { file: { ...(c.file as NonNullable<CareerCert['file']>), id: v.target.value } })} error={err(`${at}.file.id`)} maxLength={160} required />
        </div>
      ) : (
        <TextField label="Official page" hint="https:// only." type="url" inputMode="url" value={c.url ?? ''} onChange={(v) => set(c.id, { url: v.target.value || null })} error={err(`${at}.url`)} maxLength={500} />
      )}
      <TextArea label="Good for" rows={2} value={c.goodFor} onChange={(v) => set(c.id, { goodFor: v.target.value })} error={err(`${at}.goodFor`)} maxLength={600} required />
      <div className="cedit-grid">
        <Select label="Effort" value={String(c.effort)} onChange={(v) => set(c.id, { effort: Number(v.target.value) as CareerCert['effort'] })} options={(['1', '2', '3'] as const).map((e) => ({ value: e, label: doc.effortLabel[e] ?? e }))} />
        <TextField label="About the effort" value={c.effortNote} onChange={(v) => set(c.id, { effortNote: v.target.value })} error={err(`${at}.effortNote`)} maxLength={600} required />
      </div>
      <PickList label="Modules that already teach part of it" value={c.covers} options={modules} onChange={(next) => set(c.id, { covers: next })} addLabel="Add a module" error={err(`${at}.covers`)} max={20} />
      <TextField label="About those modules" hint="Optional." value={c.coversNote ?? ''} onChange={(v) => set(c.id, { coversNote: v.target.value || null })} error={err(`${at}.coversNote`)} maxLength={600} />
      <PickList label="Roles it helps with" value={c.roles} options={doc.roles.map((r) => ({ value: r.id, label: r.label }))} onChange={(next) => set(c.id, { roles: next })} addLabel="Add a role" error={err(`${at}.roles`)} max={20} />
      {selfStudy ? null : <LogoField kind="cert" id={c.id} mono={c.mono ?? ''} logo={c.logo} onChange={(logo) => set(c.id, { logo })} path={`${at}.logo`} />}
      <section className="cedit-preview" aria-label={`${c.name || 'The certificate'} as students see it`}>
        <h5 className="cedit-preview__title">Preview</h5>
        {c.hidden ? <p className="cedit__note">Hidden: students don’t see this card.</p> : null}
        <CareerContext.Provider value={preview}>
          <ul role="list" className="cedit-preview__cards">
            <CertCard cert={c} />
          </ul>
        </CareerContext.Provider>
      </section>
    </div>
  );
}

// ── featured competition ─────────────────────────────────────────────────────────────────────

const EMPTY_FEATURED = (doc: CareerDoc): CareerFeatured => ({
  id: 'featured',
  kind: 'Competition',
  title: '',
  organiser: '',
  mono: '',
  logo: doc.certs[0] ? { kind: 'cert', id: doc.certs[0].id } : { kind: 'employer', id: doc.employers[0]?.id ?? '' },
  badge: '',
  blurb: '',
  note: '',
  url: 'https://',
});

export function FeaturedSection() {
  const { doc, update, err } = useEditor();
  const f = doc.featured;
  const set = (patch: Partial<CareerFeatured>) => update((d) => (d.featured ? { ...d, featured: { ...d.featured, ...patch } } : d));
  const logos = [
    ...doc.employers.map((e) => ({ value: `employer:${e.id}`, label: `${e.name} (employer)` })),
    ...doc.certs.map((c) => ({ value: `cert:${c.id}`, label: `${c.short || c.name} (certificate)` })),
  ];
  return (
    <div className="cedit-form">
      <Switch
        checked={f !== null}
        onChange={(on) => update((d) => ({ ...d, featured: on ? EMPTY_FEATURED(d) : null }))}
        label="Feature a competition"
        description="One competition beside the page title, with its own link."
      />
      {f ? (
        <>
          <div className="cedit-grid">
            <TextField label="Title" value={f.title} onChange={(v) => set({ title: v.target.value })} error={err('featured.title')} maxLength={160} required />
            <TextField label="Kind" hint="Competition, Hackathon…" value={f.kind} onChange={(v) => set({ kind: v.target.value })} error={err('featured.kind')} maxLength={60} required />
            <TextField label="Organiser" value={f.organiser} onChange={(v) => set({ organiser: v.target.value })} error={err('featured.organiser')} maxLength={160} required />
            <TextField label="Initials" value={f.mono} onChange={(v) => set({ mono: v.target.value })} error={err('featured.mono')} maxLength={6} required />
            <Select
              label="Logo"
              hint="The logo of an employer or a certificate on the page."
              value={`${f.logo.kind}:${f.logo.id}`}
              onChange={(v) => {
                const [kind, id] = v.target.value.split(':');
                set({ logo: { kind: kind === 'employer' ? 'employer' : 'cert', id: id ?? '' } });
              }}
              options={logos}
              error={err('featured.logo')}
            />
            <TextField label="Badge" hint="A few words, like “BIBF is taking participants”." value={f.badge} onChange={(v) => set({ badge: v.target.value })} error={err('featured.badge')} maxLength={60} required />
            <TextField label="Link" type="url" inputMode="url" value={f.url} onChange={(v) => set({ url: v.target.value })} error={err('featured.url')} maxLength={500} required />
            <TextField label="Id" value={f.id} onChange={(v) => set({ id: v.target.value.toLowerCase() })} error={err('featured.id')} maxLength={64} required />
          </div>
          <TextArea label="What it is" rows={2} value={f.blurb} onChange={(v) => set({ blurb: v.target.value })} error={err('featured.blurb')} maxLength={600} required />
          <TextField label="How to take part" value={f.note} onChange={(v) => set({ note: v.target.value })} error={err('featured.note')} maxLength={600} required />
        </>
      ) : null}
    </div>
  );
}

// ── checklist ────────────────────────────────────────────────────────────────────────────────

export function ChecklistSection() {
  const { doc, update } = useEditor();
  const set = useItemSetter('checklist');
  return (
    <ItemList
      section="checklist"
      noun="checklist item"
      items={doc.checklist}
      idOf={(c) => c.id}
      titleOf={(c) => c.title}
      metaOf={(c) => c.hint}
      isHidden={(c) => c.hidden}
      onHide={(id, hidden) => set(id, { hidden })}
      onMove={(from, by) => update((d) => ({ ...d, checklist: moveItem(d.checklist, from, by) }))}
      onRemove={(id) => update((d) => ({ ...d, checklist: d.checklist.filter((c) => c.id !== id) }))}
      onAdd={() => {
        const id = freeId('new', savedIdsOf(doc, 'checklist'));
        update((d) => ({ ...d, checklist: [...d.checklist, { id, title: '', hint: '', link: null, hidden: false }] }));
        return id;
      }}
    >
      {(c, i) => <ChecklistForm item={c} index={i} />}
    </ItemList>
  );
}

function ChecklistForm({ item: c, index }: { item: CareerChecklistItem; index: number }) {
  const { err } = useEditor();
  const set = useItemSetter('checklist');
  const nameToId = useNameToId('checklist', null);
  const at = `checklist.${index}`;
  return (
    <div className="cedit-form">
      <div className="cedit-grid">
        <TextField label="What to have" value={c.title} onChange={(v) => set(c.id, { title: v.target.value })} onBlur={() => nameToId(c.id, c.title)} error={err(`${at}.title`)} maxLength={160} required />
        <IdField section="checklist" kind={null} id={c.id} error={err(`${at}.id`)} />
      </div>
      <TextArea label="Hint" rows={2} value={c.hint} onChange={(v) => set(c.id, { hint: v.target.value })} error={err(`${at}.hint`)} maxLength={600} required />
      <ChecklistLinkField value={c.link ?? null} onChange={(link) => set(c.id, { link })} path={`${at}.link`} />
      <p className="cedit__note">Students tick these in their own browser. A new item starts unticked; renaming one keeps its ticks.</p>
    </div>
  );
}

// ── further study ────────────────────────────────────────────────────────────────────────────

export function FurtherStudySection() {
  const { doc, update, err } = useEditor();
  const s = doc.furtherStudy;
  type Study = NonNullable<CareerDoc['furtherStudy']>;
  const set = (patch: Partial<Study>) => update((d) => (d.furtherStudy ? { ...d, furtherStudy: { ...d.furtherStudy, ...patch } } : d));
  return (
    <div className="cedit-form">
      <Switch
        checked={s !== null}
        onChange={(on) => update((d) => ({ ...d, furtherStudy: on ? { title: '', body: '', action: { to: '/grades', label: 'Open the grade calculator' } } : null }))}
        label="Show the further-study line"
        description="One line at the end of the page for students heading to an MSc instead, with a button."
      />
      {s ? (
        <>
          <TextField label="Title" value={s.title} onChange={(v) => set({ title: v.target.value })} error={err('furtherStudy.title')} maxLength={160} required />
          <TextArea label="Text" rows={3} value={s.body} onChange={(v) => set({ body: v.target.value })} error={err('furtherStudy.body')} maxLength={600} required />
          <div className="cedit-grid">
            <TextField label="Button text" value={s.action.label} onChange={(v) => set({ action: { ...s.action, label: v.target.value } })} error={err('furtherStudy.action.label')} maxLength={60} required />
            <TextField label="Button goes to" hint="A page of the hub, starting with /." value={s.action.to} onChange={(v) => set({ action: { ...s.action, to: v.target.value } })} error={err('furtherStudy.action.to')} maxLength={500} required />
          </div>
        </>
      ) : null}
    </div>
  );
}

// ── the page's own words ─────────────────────────────────────────────────────────────────────

export function PageTextSection() {
  const { doc, update, err } = useEditor();
  const set = (patch: Partial<CareerDoc>) => update((d) => ({ ...d, ...patch }));
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="cedit-form">
      <div className="cedit-grid">
        <TextField
          label="Links last checked"
          hint="The day someone last opened every employer and certificate link."
          value={doc.checkedOn}
          onChange={(v) => set({ checkedOn: v.target.value })}
          error={err('checkedOn')}
          maxLength={60}
          required
          trailing={
            <Button variant="ghost" size="sm" onClick={() => set({ checkedOn: today })}>
              Today
            </Button>
          }
        />
        <TextField label="Employers shown before “Show all”" type="number" inputMode="numeric" min={1} max={100} value={String(doc.initialCount)} onChange={(v) => set({ initialCount: Math.max(1, Math.min(100, Number(v.target.value) || 1)) })} error={err('initialCount')} />
      </div>
      <fieldset className="cedit-group">
        <legend className="cedit-group__legend">What employers offer</legend>
        <div className="cedit-grid">
          {(['graduate', 'internship', 'careers'] as const).flatMap((t) => [
            <TextField key={`${t}-l`} label={`${t === 'careers' ? 'Careers page' : t === 'graduate' ? 'Graduate programme' : 'Internship'}: one`} value={doc.offerTypes[t].label} onChange={(v) => set({ offerTypes: { ...doc.offerTypes, [t]: { ...doc.offerTypes[t], label: v.target.value } } })} error={err(`offerTypes.${t}.label`)} maxLength={60} required />,
            <TextField key={`${t}-p`} label="Several" value={doc.offerTypes[t].plural} onChange={(v) => set({ offerTypes: { ...doc.offerTypes, [t]: { ...doc.offerTypes[t], plural: v.target.value } } })} error={err(`offerTypes.${t}.plural`)} maxLength={60} required />,
          ])}
        </div>
      </fieldset>
      <fieldset className="cedit-group">
        <legend className="cedit-group__legend">Employer buttons</legend>
        <div className="cedit-grid">
          {(['apply', 'programme', 'roles'] as const).map((c) => (
            <TextField key={c} label={c === 'apply' ? 'To apply' : c === 'programme' ? 'To a programme' : 'To open roles'} value={doc.ctaLabel[c]} onChange={(v) => set({ ctaLabel: { ...doc.ctaLabel, [c]: v.target.value } })} error={err(`ctaLabel.${c}`)} maxLength={60} required />
          ))}
        </div>
      </fieldset>
      <fieldset className="cedit-group">
        <legend className="cedit-group__legend">Words for effort and depth</legend>
        <div className="cedit-grid">
          {(['1', '2', '3'] as const).map((e) => (
            <TextField key={`e${e}`} label={`Effort ${e} of 3`} value={doc.effortLabel[e] ?? ''} onChange={(v) => set({ effortLabel: { ...doc.effortLabel, [e]: v.target.value } })} error={err(`effortLabel.${e}`)} maxLength={60} required />
          ))}
          {(['0', '1', '2', '3'] as const).map((d) => (
            <TextField key={`d${d}`} label={`Depth ${d} of 3`} value={doc.depthLabel[d] ?? ''} onChange={(v) => set({ depthLabel: { ...doc.depthLabel, [d]: v.target.value } })} error={err(`depthLabel.${d}`)} maxLength={60} required />
          ))}
        </div>
      </fieldset>
      <fieldset className="cedit-group">
        <legend className="cedit-group__legend">A line for each year, above the skills</legend>
        {(['1', '2', '3'] as const).map((y) => (
          <TextArea key={y} label={`Year ${y}`} rows={2} value={doc.yearHints[y] ?? ''} onChange={(v) => set({ yearHints: { ...doc.yearHints, [y]: v.target.value } })} error={err(`yearHints.${y}`)} maxLength={600} required />
        ))}
      </fieldset>
    </div>
  );
}
