// The Career Navigator editor's hooks: module options, and changing one item of a list.
import { useMemo } from 'react';
import type { CareerDoc } from '../../../api/types';
import { moduleLabel } from '../../../lib/modules';
import { useModules } from '../../../state/modules';
import type { SelectOption } from '../../../ui/Field';
import { freeId, renameItem, savedIdsOf, type EditorSection, type RefKind } from './doc';
import { openKey, useEditor } from './state';

/** The modules, as options: 'ST2133 Advanced statistics (Year 2)'. */
export function useModuleOptions(): SelectOption[] {
  const { modules } = useModules();
  return useMemo(() => modules.map((m) => ({ value: m.id, label: `${moduleLabel(m)} (Year ${m.year})` })), [modules]);
}

type ListPart = 'tracks' | 'employers' | 'roles' | 'certs' | 'checklist';

/** A function that changes the item with this id in one of the document's lists. */
export function useItemSetter<P extends ListPart>(part: P) {
  const { update } = useEditor();
  type Item = CareerDoc[P][number];
  return (id: string, patch: Partial<Item>) =>
    update((d) => ({ ...d, [part]: (d[part] as Item[]).map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
}

/** Whether this item was saved before (its id is then fixed). */
export function useIsSaved(section: EditorSection, id: string): boolean {
  const { saved } = useEditor();
  return savedIdsOf(saved, section).includes(id);
}

/** Gives a new item another id; every reference to it, and the open row, follow. */
export function useRenameNew(section: EditorSection, kind: RefKind | null) {
  const { update, setOpen } = useEditor();
  return (id: string, next: string) => {
    if (kind) update((d) => renameItem(d, kind, id, next));
    else update((d) => ({ ...d, checklist: d.checklist.map((x) => (x.id === id ? { ...x, id: next } : x)) }));
    setOpen(openKey(section, next));
  };
}

/** A new item's id follows its name until it is saved: called when the name field is left. */
export function useNameToId(section: EditorSection, kind: RefKind | null) {
  const { doc, saved } = useEditor();
  const rename = useRenameNew(section, kind);
  return (id: string, name: string) => {
    if (savedIdsOf(saved, section).includes(id) || !/^new(?:-\d+)?$/.test(id) || !name.trim()) return;
    rename(id, freeId(name, savedIdsOf(doc, section)));
  };
}
