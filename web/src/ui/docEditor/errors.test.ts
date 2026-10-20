import { describe, expect, it } from 'vitest';
import { docErrors, hasErrorUnder } from './errors';

describe('docErrors', () => {
  it('files each message under its field’s path in the document', () => {
    expect(docErrors({ 'data.links.myclass.url': 'Use an https:// link.' }).fields).toEqual({
      'links.myclass.url': 'Use an https:// link.',
    });
  });

  it('gives a field at the top of the document its message', () => {
    const e = docErrors({ 'data.copyrightHolder': 'String should have at least 1 character' });
    expect(e.fields).toEqual({ copyrightHolder: 'String should have at least 1 character' });
    expect(e.general).toEqual([]);
  });

  it('leaves out the shape the API names after a place that holds one of several', () => {
    const guides = docErrors(
      {
        'data.resultsDay.steps.2.links.0.page.to': 'Use a page of the Hub.',
        'data.resultsDay.steps.0.links.1.web.href': 'Use an https:// link.',
      },
      { unions: ['*.steps.*.links.*'] },
    );
    expect(guides.fields).toEqual({
      'resultsDay.steps.2.links.0.to': 'Use a page of the Hub.',
      'resultsDay.steps.0.links.1.href': 'Use an https:// link.',
    });
    const career = docErrors(
      {
        'data.skills.sql.close.lesson.chapter': 'Give the chapter.',
        'data.roles.1.close.sql.forum.to': 'Use a page of the Hub.',
        'data.checklist.0.link.cert.label': 'Give the link a label.',
        'data.skills.sql.close': 'Choose a kind of step.',
      },
      { unions: ['skills.*.close', 'roles.*.close.*', 'checklist.*.link'] },
    );
    expect(career.fields).toEqual({
      'skills.sql.close.chapter': 'Give the chapter.',
      'roles.1.close.sql.to': 'Use a page of the Hub.',
      'checklist.0.link.label': 'Give the link a label.',
      'skills.sql.close': 'Choose a kind of step.',
    });
  });

  it('keeps what is about the save, the document or a whole part as general messages, once each', () => {
    const e = docErrors(
      {
        data: 'There is no module “x”.',
        'data.resultsDay': 'Two steps have the same id “a”.',
        'data.resultsDay.steps': 'Add at least one step.',
        'data.x': 'There is no module “x”.',
        version: 'Field required',
        logo: 'A logo isn’t uploaded yet.',
      },
      { wholes: ['resultsDay', 'resultsDay.steps', 'x'] },
    );
    expect(e.general).toEqual([
      'There is no module “x”.',
      'Two steps have the same id “a”.',
      'Add at least one step.',
      'Field required',
      'A logo isn’t uploaded yet.',
    ]);
    expect(e.fields).toEqual({});
  });
});

describe('hasErrorUnder', () => {
  it('finds errors inside an item or a part', () => {
    const fields = { 'resultsDay.steps.2.title': 'Give the step a title.' };
    expect(hasErrorUnder(fields, 'resultsDay.steps.2')).toBe(true);
    expect(hasErrorUnder(fields, 'resultsDay')).toBe(true);
    expect(hasErrorUnder(fields, 'resultsDay.steps.1')).toBe(false);
    expect(hasErrorUnder(fields, 'resultsDay.steps.20')).toBe(false);
  });
});
