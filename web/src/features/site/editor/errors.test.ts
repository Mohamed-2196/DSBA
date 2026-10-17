import { describe, expect, it } from 'vitest';
import { docErrors, hasErrorUnder } from './errors';

describe('docErrors', () => {
  it('files each message under its field’s path in the document', () => {
    expect(docErrors({ 'data.links.myclass.url': 'Use an https:// link.' }).fields).toEqual({ 'links.myclass.url': 'Use an https:// link.' });
  });

  it('drops the kind the API puts in a link’s path', () => {
    const e = docErrors({ 'data.startHere.steps.2.links.0.page.to': 'Use a page of the Hub.', 'data.resultsDay.steps.0.links.1.web.href': 'Use an https:// link.' });
    expect(e.fields).toEqual({ 'startHere.steps.2.links.0.to': 'Use a page of the Hub.', 'resultsDay.steps.0.links.1.href': 'Use an https:// link.' });
  });

  it('keeps what is about the document, a part or a list as general messages, once each', () => {
    const e = docErrors({ data: 'There is no module “x”.', 'data.startHere': 'Two steps have the same id “a”.', 'data.startHere.steps': 'Add at least one step.', 'data.x': 'There is no module “x”.' }, ['startHere.steps']);
    expect(e.general).toEqual(['There is no module “x”.', 'Two steps have the same id “a”.', 'Add at least one step.']);
    expect(e.fields).toEqual({});
  });
});

describe('hasErrorUnder', () => {
  it('finds errors inside an item or a part', () => {
    const fields = { 'startHere.steps.2.title': 'Give the step a title.' };
    expect(hasErrorUnder(fields, 'startHere.steps.2')).toBe(true);
    expect(hasErrorUnder(fields, 'startHere')).toBe(true);
    expect(hasErrorUnder(fields, 'startHere.steps.1')).toBe(false);
    expect(hasErrorUnder(fields, 'startHere.steps.20')).toBe(false);
  });
});
