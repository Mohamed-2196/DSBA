// Asking the cohort, switched on for the run: Ali asks without his name and Sara sees "A Year 1
// student"; Sara follows his thread and hears when it is answered; a rep's poll takes one vote from Sara and shows
// her the counts. The switches end off, as they start.
import { expect, test } from './fixtures';
import { api, remember, switchBack, switchOn } from './support';

test.describe.configure({ mode: 'serial' });

const bahrainToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bahrain' }).format(new Date());

test.beforeAll(async ({ browser }) =>
  switchOn(browser, 'cohort', ['forum.anonymous', 'forum.follow', 'newsletter.polls']),
);

test.afterAll(async ({ browser }) => switchBack(browser, 'cohort'));

test('Ali asks without his name; Sara follows and hears about the answer', async ({ ali, sara, rep, run }) => {
  const title = `Is this too basic to ask? [e2e ${run.tag}]`;
  await ali.goto('/forum/new');
  await ali.locator('[data-hub="composer-title"]').fill(title);
  await ali.locator('[data-hub="composer-anonymous"]').check();
  await ali.locator('[data-hub="composer"]').getByRole('button', { name: 'Post thread' }).click();
  await expect(ali).toHaveURL(/\/forum$/);
  const list = await api<{ items: { id: string; slug: string; author: unknown; anonymous: boolean }[] }>(
    sara,
    'GET',
    `/api/v1/forum/threads?q=${encodeURIComponent(run.tag)}&sort=new`,
  );
  const thread = list.body.items[0];
  expect(thread?.anonymous).toBe(true);
  expect(thread?.author).toBeNull();
  if (!thread) return;
  remember('threads', thread.id);

  await sara.goto(`/forum/${thread.slug}`);
  await expect(sara.locator('[data-hub="thread-op"]')).toContainText('A Year 1 student');
  await sara.locator('[data-hub="follow"]').click();
  await expect(sara.locator('[data-hub="following"]')).toBeVisible();

  const reply = await api<{ id: string }>(rep, 'POST', `/api/v1/forum/threads/${thread.id}/replies`, {
    body: 'Never too basic. Start with the worked example.',
  });
  expect(reply.status).toBe(201);
  expect((await api(ali, 'POST', `/api/v1/forum/threads/${thread.id}/accept`, { replyId: reply.body.id })).status).toBe(
    200,
  );
  const told = await api<{ items: { kind: string; actor: unknown }[] }>(sara, 'GET', '/api/v1/notifications');
  expect(told.body.items.some((n) => n.kind === 'followed_answer' && n.actor === null)).toBe(true);
});

test('Sara votes once in a poll and sees the counts', async ({ rep, sara, run }) => {
  const slug = `e2e-poll-${run.tag}`;
  const created = await api<{ id: string }>(rep, 'POST', '/api/v1/newsletter/issues', {
    slug,
    number: 98,
    title: `Ask the cohort [e2e ${run.tag}]`,
    date: bahrainToday(),
    sections: [
      {
        id: 'ask',
        title: 'Ask the cohort',
        blocks: [
          {
            type: 'poll',
            id: 'saturday',
            question: 'Which Saturday suits a revision session?',
            answers: ['The 18th', 'The 25th'],
          },
        ],
      },
    ],
  });
  expect(created.status).toBe(201);
  remember('issues', created.body.id);
  expect((await api(rep, 'POST', `/api/v1/newsletter/issues/${created.body.id}/publish`)).status).toBe(200);

  await sara.goto(`/newsletter/${slug}`);
  const poll = sara.locator('[data-hub="poll"]');
  await poll.getByRole('button', { name: 'The 25th' }).click();
  await expect(poll).toContainText('(your vote)');
  await expect(poll).toContainText('100%');
  const again = await api(sara, 'PUT', `/api/v1/newsletter/issues/${created.body.id}/polls/saturday/vote`, {
    choice: 0,
  });
  expect(again.status).toBe(409);
});
