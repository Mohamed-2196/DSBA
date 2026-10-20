// The library's filters on a phone: a bottom sheet with the year, module, type, Starred and Your uploads, and the
// view. Each choice applies at once (the list behind it updates); "Show N files" closes it.
import type { ModuleSummary } from '../../../api/types';
import { Button, Chip, Drawer, SegmentedControl, Select, Switch, formatCount, glyph, Icon } from '../../../ui';
import type { KindInfo, LibraryKind } from '../kinds';
import type { CohortYear, LibraryView } from '../types';

export interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  year: CohortYear | null;
  onYear: (year: 'all' | CohortYear) => void;
  modules: readonly ModuleSummary[];
  moduleId: string | null;
  onModule: (id: string | null) => void;
  kinds: readonly KindInfo[];
  kind: LibraryKind | null;
  onKind: (kind: LibraryKind | null) => void;
  starred: boolean;
  onStarred: (on: boolean) => void;
  /** null while signed out: Your uploads isn't offered */
  mine: boolean | null;
  onMine: (on: boolean) => void;
  /** null when the view has no grid or list (the sittings table) */
  view: LibraryView | null;
  onView: (view: LibraryView) => void;
  styledCovers: boolean;
  onStyledCovers: (on: boolean) => void;
  /** how many files the filters give; null while they load */
  total: number | null;
  activeCount: number;
  onClearAll: () => void;
}

export function FilterSheet(p: FilterSheetProps) {
  const yearValue: 'all' | CohortYear = p.year ?? 'all';
  return (
    <Drawer
      open={p.open}
      onClose={p.onClose}
      side="bottom"
      title="Filters"
      className="lib-sheet"
      bodyClassName="lib-sheet__body"
      footer={
        <>
          <Button variant="ghost" onClick={p.onClearAll} disabled={!p.activeCount}>
            Clear all
          </Button>
          <Button variant="primary" onClick={p.onClose} data-hub="library-filters-done">
            {p.total == null ? 'Show files' : `Show ${formatCount(p.total)} ${p.total === 1 ? 'file' : 'files'}`}
          </Button>
        </>
      }
    >
      <SegmentedControl
        label="Year"
        fullWidth
        value={yearValue}
        onChange={p.onYear}
        options={[
          { value: 'all' as const, label: 'All years' },
          ...([1, 2, 3] as const).map((y) => ({
            value: y,
            label: `Y${y}`,
            ariaLabel: `Year ${y}`,
            color: `var(--y${y})`,
            onColor: `var(--on-y${y})`,
          })),
        ]}
      />
      <Select
        label="Module"
        value={p.moduleId ?? ''}
        onChange={(e) => p.onModule(e.target.value || null)}
        options={[
          { value: '', label: 'All modules' },
          ...p.modules.map((m) => ({
            value: m.id,
            label: m.unitCode ? `${m.unitCode} ${m.shortName}` : m.shortName,
          })),
        ]}
      />
      <Select
        label="Type"
        value={p.kind ?? ''}
        onChange={(e) => p.onKind((e.target.value || null) as LibraryKind | null)}
        options={[{ value: '', label: 'All types' }, ...p.kinds.map((k) => ({ value: k.id, label: k.plural }))]}
      />
      <div className="lib-sheet__group" role="group" aria-label="Show">
        <Chip selected={p.starred} onChange={p.onStarred} icon={<Icon glyph={glyph.star} active={p.starred} />}>
          Starred
        </Chip>
        {p.mine !== null ? (
          <Chip selected={p.mine} onChange={p.onMine} icon={<Icon glyph={glyph.upload} />}>
            Your uploads
          </Chip>
        ) : null}
      </div>
      {p.view ? (
        <>
          <SegmentedControl
            label="View"
            fullWidth
            value={p.view}
            onChange={p.onView}
            options={[
              { value: 'grid' as const, label: 'Covers', icon: glyph.gridView },
              { value: 'list' as const, label: 'List', icon: glyph.rows },
            ]}
          />
          {p.view === 'grid' ? (
            <Switch
              checked={p.styledCovers}
              onChange={p.onStyledCovers}
              label="Styled covers"
              description="Covers drawn from the title, in place of the file’s first page."
            />
          ) : null}
        </>
      ) : null}
    </Drawer>
  );
}
