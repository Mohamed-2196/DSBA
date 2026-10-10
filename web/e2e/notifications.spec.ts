// Notifications: the bell, opening one (it goes to the right page and becomes read), marking all as read.
import { expect, test } from './fixtures';
import { api, remember } from './support';

interface Note {
  id: string;
  kind: string;
  title: string;
  url: string | null;
  readAt: string | null;
}

test.describe.configure({ mode: 'serial' });

let slug = '';

test('a reply notification opens the thread and becomes read; mark all as read', async ({ ali, sara, run }) => {
  const thread = await api<{ id: string; slug: string }>(ali, 'POST', '/api/v1/forum/threads', {
    title: `MT1186: when do we use Lagrange multipliers instead of substitution? [e2e ${run.tag}]`,
    body: 'Both give the same answer in the Week 7 exercises. Is one of them expected in the exam?',
    category: 'year-1',
    moduleId: 'mathematics',
    tags: ['exam-prep'],
  });
  expect(thread.status).toBe(201);
  slug = thread.body.slug;
  remember('threads', thread.body.id);
  const answer = await api(sara, 'POST', `/api/v1/forum/threads/${thread.body.id}/replies`, {
    body: 'Use Lagrange when the constraint is hard to solve for one variable; the examiners accept either if you show the steps.',
  });
  expect(answer.status).toBe(201);

  await ali.goto('/');
  const bell = ali.locator('[data-hub="notifications"]');
  await expect(bell).toHaveAttribute('aria-label', /Notifications, \d+ unread/);
  await bell.click();
  const menu = ali.locator('[data-hub="notif-menu"]');
  await menu.getByText(`${run.sara.name} replied to your thread`).first().click();
  await expect(ali).toHaveURL(new RegExp(`/forum/${slug}`));
  const notes = await api<{ items: Note[] }>(ali, 'GET', '/api/v1/notifications');
  const opened = notes.body.items.find((n) => n.kind === 'thread_reply' && n.url?.includes(slug));
  expect(opened?.readAt).toBeTruthy();

  await ali.locator('[data-hub="notifications"]').click();
  await ali.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(ali.locator('[data-hub="notifications"]')).toHaveAttribute('aria-label', 'Notifications');
  const after = await api<{ unreadCount: number }>(ali, 'GET', '/api/v1/notifications');
  expect(after.body.unreadCount).toBe(0);
});

test('ST-4: a reply notification links to the reply itself', async ({ ali }) => {
  test.fail(true, 'ST-4: reply notifications link to /forum/<slug> without #reply-<id>');
  const notes = await api<{ items: Note[] }>(ali, 'GET', '/api/v1/notifications');
  const reply = notes.body.items.find((n) => n.kind === 'thread_reply' && n.url?.includes(slug));
  expect(reply?.url).toMatch(/#reply-[0-9a-f-]{36}$/);
});
