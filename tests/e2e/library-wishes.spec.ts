import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('https://music.example.com').fill('http://localhost:4545');
  await page.getByPlaceholder('your username').fill('laila');
  await page.getByPlaceholder('paste your API key').fill('test-key');
  await page.getByRole('button', { name: 'Remember this server' }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Home' })).toBeVisible();
}

async function setTrashPlaylist(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Trash playlist', exact: true }).click();
  await page.getByRole('button', { name: /Evening/ }).click();
  await expect(
    page.getByRole('button', { name: 'Trash playlist', exact: true }),
  ).toContainText('Evening');
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Home' })).toBeVisible();
}

async function disableRadio(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  const radio = page.getByRole('button', { name: 'Continue with radio' });
  await expect(radio).toContainText('On');
  await radio.click();
  await expect(radio).toContainText('Off');
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Home' })).toBeVisible();
}

test.describe('library wishes', () => {
  test('moves an album to Trash, restores it and keeps the queue @smoke', async ({
    page,
  }) => {
    await login(page);
    await setTrashPlaylist(page);
    await page.goto('/album/al-1');
    await expect(page.getByRole('heading', { name: 'Blue Hour' })).toBeVisible();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await expect(page.getByRole('button', { name: /Now playing: First Light/ })).toBeVisible();

    await page.getByRole('button', { name: 'More album options' }).click();
    await page.getByRole('button', { name: 'Move album to Trash' }).click();
    await expect(page.getByText(/Moved “Blue Hour” to Trash/)).toBeVisible();

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('button', { name: /Now playing: First Light/ })).toBeVisible();
    await page.getByRole('button', { name: /Open queue/ }).first().click();
    await expect(page.getByText(/4 tracks · drag to reorder/)).toBeVisible();
  });

  test('moves a library row to Trash from its menu and undoes it', async ({ page }) => {
    await login(page);
    await setTrashPlaylist(page);
    await page.goto('/album/al-1');
    await expect(page.getByRole('heading', { name: 'Blue Hour' })).toBeVisible();

    await page.getByRole('button', { name: 'More options for Slow Motion' }).click();
    await page.getByRole('button', { name: 'Move to Trash' }).click();
    await expect(page.getByText(/Moved “Slow Motion” to Trash/)).toBeVisible();

    // Nothing is playing, so the row menu must not touch the queue.
    const queued = await page.evaluate(() => {
      const raw = window.localStorage.getItem('laila.player');
      return raw ? JSON.parse(raw).state.queueState.queue.length : 0;
    });
    expect(queued).toBe(0);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText(/Restored to queue/)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Blue Hour' })).toBeVisible();
  });

  test('shuffles an artist, then adds the rest of the discography @smoke', async ({
    page,
  }) => {
    await login(page);
    await disableRadio(page);
    await page.goto('/artist/ar-1');
    await expect(page.getByRole('heading', { name: 'Blue Harbor' })).toBeVisible();
    await page.getByRole('button', { name: 'Shuffle', exact: true }).click();
    await expect(page.getByRole('button', { name: /Now playing:/ })).toBeVisible();

    // The first two top songs start immediately; the remaining six arrive from
    // the background album fetch.
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = window.localStorage.getItem('laila.player');
          return raw ? JSON.parse(raw).state.queueState.queue.length : 0;
        }),
      )
      .toBeGreaterThanOrEqual(8);
    await page.getByRole('button', { name: /Open queue/ }).first().click();
    await expect(page.getByText(/8 tracks · drag to reorder/)).toBeVisible();
  });
});
