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

test.describe('queue opening', () => {
  test('aligns the playing track at the top, including the last track @both @smoke', async ({
    page,
  }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: /Play Night Drive by/ }).click();
    await page.getByRole('button', { name: /Now playing: Night Drive/ }).click();
    await page.waitForTimeout(900);

    const queue = page.getByTestId('player-sheet').getByRole('button', { name: 'Open queue' });
    const list = page.getByTestId('queue-list');
    const current = list.getByRole('button', { name: 'Play Night Drive', exact: true });

    async function currentIsAtTop() {
      const listBox = await list.boundingBox();
      const rowBox = await current.boundingBox();
      if (!listBox || !rowBox) return false;
      const offset = rowBox.y - listBox.y;
      return offset >= 0 && offset < 20;
    }

    await queue.click();
    await expect(list).toBeVisible();
    await expect.poll(currentIsAtTop).toBe(true);

    // Scrolling away and reopening must snap back to the playing track.
    await list.evaluate((node) => {
      node.scrollTop = 0;
    });
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Close queue' }).click();
    await page.waitForTimeout(900);
    await queue.click();
    await expect.poll(currentIsAtTop).toBe(true);
  });

  test('pre-mounts and aligns a deep track in a long queue before opening', async ({
    page,
  }) => {
    await login(page);
    // The mock albums have four tracks; a deep index is what exposes a wrong
    // row pitch, because its error accumulates once per row.
    await page.evaluate(() => {
      const queue = Array.from({ length: 60 }, (_, index) => ({
        id: `seed-${index}`,
        title: `Seed ${index}`,
        artist: 'Queue Fixture',
        album: 'Long Queue',
        duration: 180,
      }));
      window.localStorage.setItem(
        'laila.player',
        JSON.stringify({
          state: {
            queueState: {
              queue,
              index: 45,
              upNext: [],
              originalQueue: null,
              repeat: 'off',
              shuffle: false,
            },
            volume: 1,
          },
          version: 1,
        }),
      );
    });
    await page.reload();
    await expect(page.getByRole('button', { name: /Now playing: Seed 45/ })).toBeVisible();
    await page.getByRole('button', { name: /Now playing: Seed 45/ }).click();
    await page.waitForTimeout(900);

    const queue = page.getByTestId('player-sheet').getByRole('button', { name: 'Open queue' });
    const sheet = page.getByTestId('queue-sheet');
    const list = page.getByTestId('queue-list');
    const current = list.getByRole('button', { name: 'Play Seed 45', exact: true });

    // The panel is already mounted and aligned while it is still translated
    // below the screen, so the open is a pure sheet animation.
    await expect(sheet).toHaveCount(1);
    await expect(sheet).toHaveAttribute('aria-hidden', 'true');
    await expect.poll(() => list.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    const warmOffset = await list.evaluate((node) => node.scrollTop);

    await queue.click();
    await expect(list).toBeVisible();
    await expect
      .poll(async () => {
        const listBox = await list.boundingBox();
        const rowBox = await current.boundingBox();
        if (!listBox || !rowBox) return false;
        const offset = rowBox.y - listBox.y;
        return offset >= 0 && offset < 20;
      })
      .toBe(true);

    // Opening must not move the list: the scroll happened while it was closed.
    await page.waitForTimeout(500);
    const openOffset = await list.evaluate((node) => node.scrollTop);
    expect(Math.abs(openOffset - warmOffset)).toBeLessThan(1);
  });

  test('scrolling an open long queue does not snap back to the current track', async ({
    page,
  }) => {
    await login(page);
    await page.evaluate(() => {
      const queue = Array.from({ length: 60 }, (_, index) => ({
        id: `seed-${index}`,
        title: `Seed ${index}`,
        artist: 'Queue Fixture',
        album: 'Long Queue',
        duration: 180,
      }));
      window.localStorage.setItem(
        'laila.player',
        JSON.stringify({
          state: {
            queueState: {
              queue,
              index: 45,
              upNext: [],
              originalQueue: null,
              repeat: 'off',
              shuffle: false,
            },
            volume: 1,
          },
          version: 1,
        }),
      );
    });
    await page.reload();
    await expect(page.getByRole('button', { name: /Now playing: Seed 45/ })).toBeVisible();
    await page.getByRole('button', { name: /Now playing: Seed 45/ }).click();
    await page.waitForTimeout(900);

    const queue = page.getByTestId('player-sheet').getByRole('button', { name: 'Open queue' });
    const list = page.getByTestId('queue-list');
    await queue.click();
    await expect(list).toBeVisible();
    await page.waitForTimeout(700);

    await list.evaluate((node) => {
      node.scrollTop = 600;
    });
    await page.waitForTimeout(700);
    const offset = await list.evaluate((node) => node.scrollTop);
    expect(offset).toBeGreaterThan(500);
  });
});
