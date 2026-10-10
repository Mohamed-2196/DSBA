// The newsletter: a rep publishes a draft, students are notified, read it and react; guests read it too.
// Publishing notifies every account in the database that wants newsletter news (the teardown deletes the issue).
import { expect, test } from './fixtures';
import { api, remember } from './support';

test.describe.configure({ mode: 'serial' });

const bahrainToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bahrain' }).format(new Date());

test('a rep publishes a draft; Ali is notified, reads it and reacts; a guest reads it', async ({ rep, ali, guest, run }) => {
  const slug = `e2e-${run.tag}`;
  const title = `Revision week special [e2e ${run.tag}]`;
  const created = await api<{ id: string; status: string }>(rep, 'POST', '/api/v1/newsletter/issues', {
    slug,
    number: 99,
    title,
    date: bahrainToday(),
    dek: 'Where to revise, what to bring, and the dates that matter.',
    summary: 'Revision rooms and the October dates.',
    editors: ['Fatima E2E'],
    cover: { tone: 'paper', lines: [{ text: 'Rooms for revision week', section: 'rooms' }] },
    sections: [
      {
        id: 'rooms',
        icon: 'NotePencil',
        label: 'Revision',
        title: 'Rooms for revision week',
        blocks: [
          { type: 'p', lead: true, text: 'The library study rooms are open until 9 PM in revision week. Book them at the front desk.' },
          { type: 'signoff', text: 'Fatima' },
        ],
      },
    ],
  });
  expect(created.status).toBe(201);
  expect(created.body.status).toBe('draft');
  remember('issues', created.body.id);

  // A draft: the rep sees it, a guest doesn't.
  await guest.goto(`/newsletter/${slug}`);
  await expect(guest.getByText('We couldn’t find that issue')).toBeVisible();
  await rep.goto(`/newsletter/${slug}`);
  await expect(rep.locator('main')).toContainText('Only student reps can see this issue until it’s published.');
  await rep.getByRole('button', { name: 'Publish', exact: true }).first().click();
  const confirm = rep.getByRole('dialog');
  await expect(confirm).toContainText('Publish issue 99?');
  await confirm.getByRole('button', { name: 'Publish and notify everyone' }).click();
  await expect(rep.locator('main')).not.toContainText('Only student reps can see this issue');

  // Ali opens the notification and reacts.
  await ali.goto('/');
  await ali.locator('[data-hub="notifications"]').click();
  await ali.getByText(`New issue of The DSBA Newsletter: ${title}`).click();
  await expect(ali).toHaveURL(new RegExp(`/newsletter/${slug}$`));
  await expect(ali.locator('main')).toContainText('Rooms for revision week');
  const useful = ali.locator('[data-hub="reactions"]').first().getByRole('button', { name: /^Useful/ });
  await expect(useful).toHaveAttribute('aria-pressed', 'false');
  await useful.click();
  await expect(useful).toHaveAttribute('aria-pressed', 'true');
  await expect(useful).toHaveAttribute('aria-label', 'Useful, 1');
  await ali.reload();
  await expect(ali.locator('[data-hub="reactions"]').first().getByRole('button', { name: /^Useful/ })).toHaveAttribute('aria-pressed', 'true');

  // A guest reads it; reacting asks them to sign in.
  await guest.goto('/newsletter');
  await expect(guest.locator('main')).toContainText(title);
  await guest.goto(`/newsletter/${slug}`);
  await expect(guest.locator('main')).toContainText('The library study rooms are open until 9 PM');
  await guest.locator('[data-hub="reactions"]').first().getByRole('button', { name: /^Useful/ }).click();
  await expect(guest.getByRole('dialog')).toContainText('Sign in to react');
});
