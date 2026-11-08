import { describe, expect, it } from 'vitest';
import type { HeldImage, ReportOut } from '../../../api/types';
import { canOpen, heldCaption } from './heldPictures';
import { hubDecision } from './hubReports';
import { reasonLabel } from './reports';

const image = (state: HeldImage['state'], mine: boolean): HeldImage => ({ id: 'u1', state, mine });

describe('held pictures', () => {
  it('opens for its uploader until a rep removes it, and for reps always', () => {
    expect(canOpen(image('checking', true), false)).toBe(true);
    expect(canOpen(image('held', true), false)).toBe(true);
    expect(canOpen(image('removed', true), false)).toBe(false);
    expect(canOpen(image('checking', false), false)).toBe(false);
    expect(canOpen(image('removed', false), true)).toBe(true);
  });

  it('tells its uploader and the reps why others don’t see it', () => {
    expect(heldCaption(image('checking', true), false)).toBe('Being checked. Only you can see it for now.');
    expect(heldCaption(image('held', true), false)).toBe('Hidden from others until a student rep looks at it.');
    expect(heldCaption(image('held', false), true)).toContain('Manage, Reports');
  });
});

describe('reports from the Hub', () => {
  const report = (over: Partial<ReportOut>): ReportOut =>
    ({ fromHub: true, targetType: 'thread', targetStatus: 'hidden', reason: 'hub_flagged', ...over }) as ReportOut;

  it('names what closing it does', () => {
    expect(hubDecision(report({ targetType: 'image' }))?.resolve.label).toBe('Remove picture');
    expect(hubDecision(report({ targetType: 'image' }))?.dismiss.label).toBe('Show picture');
    expect(hubDecision(report({}))?.resolve.label).toBe('Keep hidden');
    expect(hubDecision(report({ targetStatus: 'visible', reason: 'hub_unchecked' }))?.resolve.label).toBe('Hide it');
    expect(hubDecision(report({ fromHub: false }))).toBeNull();
  });

  it('labels its reasons', () => {
    expect(reasonLabel('hub_flagged')).toBe('Flagged by the Hub');
    expect(reasonLabel('hub_unchecked')).toBe('Couldn’t be checked');
    expect(reasonLabel('spam')).toBe('Spam');
  });
});
