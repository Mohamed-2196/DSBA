import type { Location } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { losesChanges, unsavedNames, type UnsavedEditor } from './unsaved';

const at = (path: string): Location => {
  const url = new URL(path, 'https://hub.test');
  return { pathname: url.pathname, search: url.search, hash: url.hash, state: null, key: path };
};

const site: UnsavedEditor = { name: 'Site settings' };
const module: UnsavedEditor = {
  name: 'ST2133 Advanced statistics',
  keeps: (to) => new URLSearchParams(to.search).get('module') === 'st2133',
};

describe('losesChanges', () => {
  it('asks before another page, whatever the editors', () => {
    expect(losesChanges([site], at('/manage?tab=site'), at('/forum'))).toBe(true);
  });

  it('lets another tab of the same page through: the editors stay mounted', () => {
    expect(losesChanges([site], at('/manage?tab=site'), at('/manage?tab=guides'))).toBe(false);
    expect(losesChanges([module], at('/manage?tab=content&module=st2133'), at('/manage?tab=site&module=st2133'))).toBe(
      false,
    );
  });

  it('asks when an editor leaves the screen at the new address', () => {
    expect(losesChanges([site, module], at('/manage?tab=content&module=st2133'), at('/manage?tab=content'))).toBe(true);
  });

  it('has nothing to lose without editors', () => {
    expect(losesChanges([], at('/manage?tab=site'), at('/forum'))).toBe(false);
  });
});

describe('unsavedNames', () => {
  it('names each editor once, in the order they reported', () => {
    expect(unsavedNames([site, module, { name: 'Site settings' }])).toEqual([
      'Site settings',
      'ST2133 Advanced statistics',
    ]);
  });
});
