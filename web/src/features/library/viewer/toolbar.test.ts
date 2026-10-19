import { describe, expect, it } from 'vitest';
import { toolbarLayout, toolbarRoom, type ToolbarFacts } from './toolbar';

const facts = (patch: Partial<ToolbarFacts> = {}): ToolbarFacts => ({
  room: 'phone',
  published: true,
  annotate: true,
  report: true,
  edit: false,
  delete: false,
  ...patch,
});

describe('toolbarRoom', () => {
  it('names the room from the two widths', () => {
    expect(toolbarRoom(true, false)).toBe('phone');
    expect(toolbarRoom(false, false)).toBe('compact');
    expect(toolbarRoom(false, true)).toBe('full');
  });
});

describe('toolbarLayout', () => {
  it('puts Annotate in the More menu on phones, after Copy link and before Report', () => {
    const l = toolbarLayout(facts());
    expect(l.annotate).toBeNull();
    expect(l.more).toEqual(['copy', 'annotate', 'report']);
    expect(l).toMatchObject({ timeMeLabel: false, askLabel: false, primaryLabel: false });
  });

  it('keeps Annotate as a button with a short label on tablets, and Ask Mini Noora as an icon', () => {
    const l = toolbarLayout(facts({ room: 'compact' }));
    expect(l.annotate).toBe('short');
    expect(l.more).toEqual(['copy', 'report']);
    expect(l).toMatchObject({ timeMeLabel: true, askLabel: false, primaryLabel: true });
  });

  it('gives every label room on wide screens', () => {
    const l = toolbarLayout(facts({ room: 'full' }));
    expect(l.annotate).toBe('full');
    expect(l).toMatchObject({ timeMeLabel: true, askLabel: true, primaryLabel: true });
  });

  it('splits sharing from managing with a divider only when both are there', () => {
    expect(toolbarLayout(facts({ room: 'full', edit: true, delete: true })).more).toEqual([
      'copy',
      'report',
      null,
      'edit',
      'delete',
    ]);
    expect(
      toolbarLayout(facts({ room: 'full', published: false, report: false, edit: true, delete: true })).more,
    ).toEqual(['edit', 'delete']);
    expect(toolbarLayout(facts({ room: 'full', published: false, report: false })).more).toEqual([]);
  });

  it('offers no Annotate where the notebook is off or the file is not a PDF', () => {
    expect(toolbarLayout(facts({ annotate: false })).more).toEqual(['copy', 'report']);
    expect(toolbarLayout(facts({ room: 'compact', annotate: false })).annotate).toBeNull();
  });
});
