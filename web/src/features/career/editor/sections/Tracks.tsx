// Tracks: the filters above the employers (Markets, Quant, ...), each with the modules closest to it.
import type { CareerTrack } from '../../../../api/types';
import { TextArea, TextField } from '../../../../ui';
import { freeId, moveItem, removeItem, savedIdsOf } from '../doc';
import { PickList } from '../fields';
import { ItemList } from '../ItemList';
import { useEditor } from '../state';
import { IdField } from './common';
import { useItemSetter, useModuleOptions, useNameToId } from '../hooks';

export function TracksSection() {
  const { doc, update } = useEditor();
  const set = useItemSetter('tracks');
  return (
    <ItemList
      section="tracks"
      noun="track"
      items={doc.tracks}
      idOf={(t) => t.id}
      titleOf={(t) => t.label}
      metaOf={(t) => {
        const n = doc.employers.filter((e) => e.tracks.includes(t.id)).length;
        return `${t.short} · ${n === 1 ? '1 employer' : `${n} employers`}`;
      }}
      isHidden={(t) => t.hidden}
      onHide={(id, hidden) => set(id, { hidden })}
      onMove={(from, by) => update((d) => ({ ...d, tracks: moveItem(d.tracks, from, by) }))}
      onRemove={(id) => update((d) => removeItem(d, 'track', id))}
      onAdd={() => {
        const id = freeId('new', savedIdsOf(doc, 'tracks'));
        update((d) => ({ ...d, tracks: [...d.tracks, { id, label: '', short: '', about: '', modules: [], hidden: false }] }));
        return id;
      }}
    >
      {(t, i) => <TrackForm track={t} index={i} />}
    </ItemList>
  );
}

function TrackForm({ track: t, index }: { track: CareerTrack; index: number }) {
  const { err } = useEditor();
  const set = useItemSetter('tracks');
  const nameToId = useNameToId('tracks', 'track');
  const modules = useModuleOptions();
  const at = `tracks.${index}`;
  return (
    <div className="cedit-form">
      <div className="cedit-grid">
        <TextField label="Name" value={t.label} onChange={(v) => set(t.id, { label: v.target.value })} onBlur={() => nameToId(t.id, t.label)} error={err(`${at}.label`)} maxLength={160} required />
        <TextField label="Short name" hint="On the filter chips and the cards." value={t.short} onChange={(v) => set(t.id, { short: v.target.value })} error={err(`${at}.short`)} maxLength={60} required />
        <IdField section="tracks" kind="track" id={t.id} error={err(`${at}.id`)} />
      </div>
      <TextArea label="What it is" rows={2} value={t.about} onChange={(v) => set(t.id, { about: v.target.value })} error={err(`${at}.about`)} maxLength={600} required />
      <PickList label="Closest modules" hint="Shown when a student picks this track." value={t.modules} options={modules} onChange={(next) => set(t.id, { modules: next })} addLabel="Add a module" error={err(`${at}.modules`)} max={20} />
    </div>
  );
}
