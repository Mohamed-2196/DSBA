import { describe, expect, it } from 'vitest';
import type { Chapter } from '../../api/types';
import { MODULE_TABS, lessonName, moduleTabOn } from './lessons';

describe('moduleTabOn', () => {
  it('shows every tab while every feature is on', () => {
    expect(MODULE_TABS.filter((t) => moduleTabOn(t, () => true))).toEqual([
      'overview',
      'lessons',
      'files',
      'discussion',
    ]);
  });

  it('leaves out Files while the library is off and Discussion while the forum is off', () => {
    expect(MODULE_TABS.filter((t) => moduleTabOn(t, (f) => f !== 'library'))).toEqual([
      'overview',
      'lessons',
      'discussion',
    ]);
    expect(MODULE_TABS.filter((t) => moduleTabOn(t, (f) => f !== 'forum'))).toEqual(['overview', 'lessons', 'files']);
  });
});

describe('lessonName', () => {
  const chapter: Chapter = {
    id: 'c1',
    title: 'Point estimation',
    videos: [
      { id: 'a', kind: 'youtube', videoId: 'x', title: 'The method of moments', unavailable: false, topics: [] },
      { id: 'b', kind: 'youtube', videoId: 'y', unavailable: false, topics: [] },
      {
        id: 'c',
        kind: 'bbb',
        url: 'https://vc.bibf.com/playback/presentation/2.3/65797004-1758094343105',
        unavailable: false,
        topics: [],
      },
    ],
  };

  it('uses the video’s title, or says where it sits, or when the class was', () => {
    expect(lessonName(chapter, 0)).toBe('The method of moments');
    expect(lessonName(chapter, 1)).toBe('Point estimation, video 2');
    expect(lessonName(chapter, 2)).toBe('Point estimation: class of 17 Sep 2025');
    expect(lessonName(chapter, 9)).toBe('Point estimation');
  });
});
