import { describe, expect, it } from 'vitest';
import type { PaperQuestion, StudyTopic } from '../../api/types';
import { practisePath } from './practice';
import { OTHER_TOPIC, hasTopics, inTopic, questionAbout, topicGroups, topicParam, topicTitle } from './topics';

const SCARCITY: StudyTopic = { id: 'scarcity', title: 'Scarcity' };
const MARKETS: StudyTopic = { id: 'markets', title: 'Markets' };
const MODELS: StudyTopic = { id: 'models', title: 'Models' };
const GUIDE = [SCARCITY, MARKETS, MODELS];

function q(id: string, topics: StudyTopic[] = []): PaperQuestion {
  return {
    id,
    paper: {
      id: `p-${id}`,
      slug: 'ec1002-za-may-2024',
      title: 'EC1002 ZA',
      examYear: 2024,
      examSession: 'may',
      zone: 'A',
      coverUrl: null,
    },
    chapterId: 'c1',
    chapterTitle: 'The economic problem',
    topics,
    section: null,
    question: 1,
    page: null,
    anchor: null,
    flagged: false,
    flagCount: null,
    isMine: false,
    canRemove: false,
    createdAt: '2026-10-01T00:00:00Z',
    answer: null,
  };
}

const LIST = [q('a', [MARKETS]), q('b'), q('c', [SCARCITY, MARKETS]), q('d', [{ id: 'gone', title: 'Gone' }])];

describe('topicGroups', () => {
  it("groups by the guide's order, then topics it no longer lists, then Other", () => {
    const groups = topicGroups(LIST, GUIDE);
    expect(groups.map((g) => [g.id, g.title, g.questions.map((x) => x.id)])).toEqual([
      ['scarcity', 'Scarcity', ['c']],
      ['markets', 'Markets', ['a', 'c']],
      ['gone', 'Gone', ['d']],
      [OTHER_TOPIC, 'Other', ['b']],
    ]);
  });

  it('leaves out empty groups, Other included, and works without the guide', () => {
    expect(topicGroups([q('a', [MODELS])]).map((g) => g.id)).toEqual(['models']);
    expect(topicGroups([])).toEqual([]);
  });
});

describe('inTopic and hasTopics', () => {
  it('keeps a topic’s questions, the ones without a topic for Other, and every one for null', () => {
    expect(inTopic(LIST, 'markets').map((x) => x.id)).toEqual(['a', 'c']);
    expect(inTopic(LIST, OTHER_TOPIC).map((x) => x.id)).toEqual(['b']);
    expect(inTopic(LIST, null)).toHaveLength(4);
    expect(inTopic(LIST, 'models')).toEqual([]);
    expect(hasTopics(LIST)).toBe(true);
    expect(hasTopics([q('x')])).toBe(false);
  });
});

describe('topicTitle', () => {
  it('finds a title in the groups, then the guide', () => {
    const groups = topicGroups(LIST, GUIDE);
    expect(topicTitle('markets', groups)).toBe('Markets');
    expect(topicTitle('models', groups, GUIDE)).toBe('Models');
    expect(topicTitle(OTHER_TOPIC, [])).toBe('Other');
    expect(topicTitle('nope', groups, GUIDE)).toBeNull();
    expect(topicTitle(null, groups)).toBeNull();
  });
});

describe('questionAbout', () => {
  it('names the chapter, then its topics', () => {
    expect(questionAbout(LIST[2])).toBe('The economic problem › Scarcity, Markets');
    expect(questionAbout(LIST[1])).toBe('The economic problem');
  });
});

describe('topicParam', () => {
  it('takes a well-formed topic id or Other, and nothing else', () => {
    expect(topicParam('price-elasticity-2')).toBe('price-elasticity-2');
    expect(topicParam(OTHER_TOPIC)).toBe(OTHER_TOPIC);
    expect(topicParam(null)).toBeNull();
    expect(topicParam('')).toBeNull();
    expect(topicParam('Bad Id')).toBeNull();
    expect(topicParam('-x')).toBeNull();
  });
});

describe('practisePath', () => {
  it('adds the topic to the chapter’s practise page', () => {
    expect(practisePath('economics', 'c1', 'markets')).toBe('/modules/economics/practise/c1?topic=markets');
    expect(practisePath('economics', 'c1', OTHER_TOPIC)).toBe('/modules/economics/practise/c1?topic=_other');
    expect(practisePath('economics', 'c1', null)).toBe('/modules/economics/practise/c1');
  });
});
