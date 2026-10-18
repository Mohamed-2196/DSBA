import { describe, expect, it } from 'vitest';
import {
  examLabel,
  isZone,
  paperLabel,
  SESSIONS,
  sessionLabel,
  sittingKey,
  sittingLabel,
  ZONES,
  zoneLabel,
} from './exams';

describe('zones', () => {
  it('names each zone, RTC as itself', () => {
    expect(ZONES.map(zoneLabel)).toEqual(['Zone A', 'Zone B', 'RTC']);
  });

  it('knows a zone only by its own values', () => {
    expect(isZone('RTC')).toBe(true);
    expect(isZone('C')).toBe(false);
    expect(isZone('toString')).toBe(false);
    expect(isZone(null)).toBe(false);
  });
});

describe('sittings', () => {
  it('names a session on its own and with its year', () => {
    expect(SESSIONS.map(sessionLabel)).toEqual(['May', 'October (resits)']);
    expect(sittingLabel(2024, 'may')).toBe('May 2024');
    expect(sittingLabel(2023, 'october')).toBe('October 2023');
    expect(sittingLabel(2022, null)).toBe('2022');
  });

  it('keys a sitting by year and session, whatever the zone', () => {
    expect(sittingKey({ examYear: 2024, examSession: 'may' })).toBe('2024-may');
    expect(sittingKey({ examYear: 2024, examSession: null })).toBe('2024-');
    expect(sittingKey({ examYear: null, examSession: 'may' })).toBeNull();
  });

  it('names an exam file by its sitting and zone', () => {
    expect(examLabel({ examYear: 2024, examSession: 'may', zone: 'A' })).toBe('May 2024, Zone A');
    expect(examLabel({ examYear: 2023, examSession: 'october', zone: null })).toBe('October 2023');
    expect(examLabel({ examYear: 2025, examSession: 'may', zone: 'RTC' })).toBe('May 2025, RTC');
    expect(examLabel({ examYear: 2023, examSession: null, zone: null })).toBe('2023');
    expect(examLabel({ examYear: null, examSession: null, zone: 'B' })).toBe('Zone B');
    expect(examLabel({ examYear: null, examSession: null, zone: null })).toBeNull();
  });

  it('names a past paper by its sitting, or by its title without an exam year', () => {
    const paper = { title: 'Mock exam', examYear: 2024, examSession: 'may', zone: 'B' } as const;
    expect(paperLabel(paper)).toBe('May 2024, Zone B');
    expect(paperLabel({ ...paper, examYear: null })).toBe('Mock exam');
  });
});
