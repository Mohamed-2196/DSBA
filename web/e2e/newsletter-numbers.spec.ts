// Newsletter issue numbers: each published issue has its own number, so the cover, the list and "Publish issue 99?"
// never name two issues alike (ST-68). Drafts may share a number until one is published.
import { expect, test } from './fixtures';
import { api, freshIssueNumber, remember } from './support';

const bahrainToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bahrain' }).format(new Date());

test('a draft can’t take a published issue’s number, and is told the next free one', async ({ rep, run }) => {
  const number = freshIssueNumber();
  const make = (slug: string) =>
    api<{ id: string; error?: { code: string; message: string } }>(rep, 'POST', '/api/v1/newsletter/issues', {
      slug,
      number,
      title: `Numbering check [e2e ${run.tag}]`,
      date: bahrainToday(),
      sections: [{ id: 'a', title: 'A story', blocks: [{ type: 'p', text: 'One story, so it can be published.' }] }],
    });
  const first = await make(`e2e-number-a-${run.tag}`);
  expect(first.status).toBe(201);
  remember('issues', first.body.id);
  // Drafts may share a number...
  const twin = await make(`e2e-number-b-${run.tag}`);
  expect(twin.status).toBe(201);
  remember('issues', twin.body.id);
  // ... until one is out: then neither the other draft nor a new one can have it.
  expect((await api(rep, 'POST', `/api/v1/newsletter/issues/${first.body.id}/publish`)).status).toBe(200);
  const publishTwin = await api<{ error: { code: string } }>(
    rep,
    'POST',
    `/api/v1/newsletter/issues/${twin.body.id}/publish`,
  );
  expect(publishTwin.status).toBe(409);
  expect(publishTwin.body.error.code).toBe('number_taken');
  const third = await make(`e2e-number-c-${run.tag}`);
  if (third.status === 201) remember('issues', third.body.id);
  expect(third.status).toBe(409);
  expect(third.body.error?.message).toMatch(
    new RegExp(`^Issue ${number} is already out\\. The next free number is \\d+\\.$`),
  );
});

test('an issue with no stories can’t be published', async ({ rep, run }) => {
  const empty = await api<{ id: string }>(rep, 'POST', '/api/v1/newsletter/issues', {
    slug: `e2e-number-empty-${run.tag}`,
    number: freshIssueNumber(),
    title: `Empty issue [e2e ${run.tag}]`,
    date: bahrainToday(),
    sections: [],
  });
  expect(empty.status).toBe(201);
  remember('issues', empty.body.id);
  await rep.goto(`/newsletter/e2e-number-empty-${run.tag}`);
  await rep.getByRole('button', { name: 'Publish', exact: true }).first().click();
  const confirm = rep.getByRole('dialog');
  await expect(confirm).toContainText('This issue has no stories yet');
  await expect(confirm.getByRole('button', { name: 'Publish and notify everyone' })).toHaveCount(0);
});
