// Newsletter issue numbers: each issue has its own number, so the cover, the list and "Publish issue 99?" never
// name two issues alike.
import { expect, test } from './fixtures';
import { api, remember } from './support';

const bahrainToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bahrain' }).format(new Date());

test('a second draft with an issue number already taken is refused', async ({ rep, run }) => {
  test.fail(true, 'ST-68: the API takes any number, so two issues (drafts or published) can share one');
  const number = 900 + Math.floor(Math.random() * 99);
  const make = (slug: string) =>
    api<{ id: string }>(rep, 'POST', '/api/v1/newsletter/issues', {
      slug,
      number,
      title: `Numbering check [e2e ${run.tag}]`,
      date: bahrainToday(),
      sections: [],
    });
  const first = await make(`e2e-number-a-${run.tag}`);
  expect(first.status).toBe(201);
  remember('issues', first.body.id);
  const second = await make(`e2e-number-b-${run.tag}`);
  if (second.status === 201) remember('issues', second.body.id);
  expect(second.status).toBe(409);
});
