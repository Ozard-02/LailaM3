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

async function playFirstTrack(page: Page) {
  await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
  await page.getByRole('button', { name: 'Play', exact: true }).first().click();
  await expect(page.getByRole('button', { name: /Now playing: First Light/ })).toBeVisible();
}

async function openPlayer(page: Page) {
  await page.getByRole('button', { name: /Now playing: First Light/ }).click();
  await expect(page.getByTestId('player-sheet')).toHaveAttribute('aria-modal', 'true');
  await page.waitForTimeout(900);
}

async function openQueue(page: Page) {
  await page
    .getByTestId('player-sheet')
    .getByRole('button', { name: 'Open queue', exact: true })
    .click();
  await expect(page.getByTestId('queue-sheet')).not.toHaveAttribute('aria-hidden', 'true');
}

function queueState(page: Page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('laila.player');
    if (!raw) return { queue: [] as string[], upNext: [] as string[] };
    const state = JSON.parse(raw).state.queueState;
    return {
      queue: state.queue.map((track: { title: string }) => track.title) as string[],
      upNext: state.upNext.map((track: { title: string }) => track.title) as string[],
    };
  });
}

/** Drag Night Drive onto the top row; `hold` waits for the Up-next arm hint. */
async function dragNightDriveToTop(page: Page, hold: boolean) {
  const list = page.getByTestId('queue-list');
  const from = await list
    .getByRole('button', { name: 'Play Night Drive', exact: true })
    .boundingBox();
  const to = await list
    .getByRole('button', { name: 'Play First Light', exact: true })
    .boundingBox();
  expect(from).not.toBeNull();
  expect(to).not.toBeNull();
  if (!from || !to) return;

  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  const endX = to.x + to.width / 2;
  const endY = to.y + 6;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Long enough to activate the drag and clear the long-press threshold.
  await page.waitForTimeout(360);
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(
      startX + ((endX - startX) * step) / 10,
      startY + ((endY - startY) * step) / 10,
    );
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(200);
  if (hold) {
    await expect(page.getByText('Release to add to next')).toBeVisible({ timeout: 2500 });
  }
  await page.mouse.up();
}

test.describe('top-surface Escape', () => {
  test('Escape closes the queue first, then the player @smoke', async ({ page }) => {
    await login(page);
    await playFirstTrack(page);
    await openPlayer(page);
    await openQueue(page);
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
      .toBe('Close queue');

    await page.keyboard.press('Escape');
    // The queue is parked; the player stays open and focus returns to its handle.
    await expect(page.getByTestId('queue-sheet')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByTestId('player-sheet')).toHaveAttribute('aria-modal', 'true');
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
      .toBe('Open queue');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('player-sheet')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByRole('button', { name: 'Close player' })).toHaveCount(0);
  });

  test('opening lyrics moves focus into the lyrics screen', async ({ page }) => {
    await login(page);
    await playFirstTrack(page);
    await openPlayer(page);
    await page.getByRole('button', { name: /Album cover: tap for lyrics/ }).first().click();
    await expect(page.getByText('Synced lyrics')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
      .toBe('Close lyrics');
  });

  test('closing lyrics returns to the open player', async ({ page }) => {
    await login(page);
    await playFirstTrack(page);
    await openPlayer(page);
    await page.getByRole('button', { name: /Album cover: tap for lyrics/ }).first().click();
    await expect(page.getByText('Synced lyrics')).toBeVisible();

    await page.getByRole('button', { name: 'Close lyrics' }).first().click();
    await expect(page.getByTestId('player-sheet')).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByRole('button', { name: 'Close player' }).first()).toBeVisible();
  });

  test('Escape closes lyrics and leaves the player open', async ({ page }) => {
    await login(page);
    await playFirstTrack(page);
    await openPlayer(page);
    await page.getByRole('button', { name: /Album cover: tap for lyrics/ }).first().click();
    await expect(page.getByText('Synced lyrics')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByText('Synced lyrics')).toHaveCount(0);
    await expect(page.getByTestId('player-sheet')).toHaveAttribute('aria-modal', 'true');
  });

  test('Escape in Add to playlist does not close the player behind it', async ({ page }) => {
    await login(page);
    await playFirstTrack(page);
    await openPlayer(page);
    await page.getByTestId('player-sheet').getByRole('button', { name: 'More options' }).click();
    await page.getByRole('button', { name: 'Add to playlist' }).click();
    await expect(page.getByRole('heading', { name: 'Add to playlist' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Close add to playlist' })).toHaveCount(0);
    await expect(page.getByTestId('player-sheet')).toHaveAttribute('aria-modal', 'true');
  });
});

test('clearing the queue parks the player', async ({ page }) => {
  await login(page);
  await playFirstTrack(page);
  await openPlayer(page);
  await openQueue(page);

  await page.getByTestId('player-sheet').getByRole('button', { name: 'Clear queue' }).click();
  // The sheet unmounts with the track; what matters is that playerOpen is false.
  await expect(page.getByTestId('player-sheet')).toHaveCount(0);

  // `playerOpen` must be false again, otherwise `/` is swallowed and the app
  // stays a11y-modal with no visible surface.
  await page.keyboard.press('/');
  await expect(
    page.getByPlaceholder('Search albums, artists, playlists and genres'),
  ).toBeVisible();
});

test('a slow swipe does not also play the row', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Library' }).click();
  await page.getByPlaceholder('Search albums, artists, playlists and genres').fill('Blue');
  const row = page.getByRole('button', { name: /^Play .* by / }).first();
  await expect(row).toBeVisible();
  const box = await row.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, y, { steps: 5 });
  // A deliberate swipe outlives the old 400 ms window measured from drag start.
  await page.waitForTimeout(700);
  await page.mouse.move(box.x + box.width * 0.85, y, { steps: 5 });
  await page.mouse.up();

  await expect.poll(async () => (await queueState(page)).upNext.length).toBe(1);
  await expect.poll(async () => (await queueState(page)).queue.length).toBe(0);
  await expect(page.getByRole('button', { name: /Now playing: / })).toHaveCount(0);
});

test('wide-layout cover swipe stays inside the artwork stage', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 900, 'wide layout only');
  await login(page);
  await playFirstTrack(page);
  await openPlayer(page);

  const cover = page.getByRole('button', { name: /Album cover: tap for lyrics/ }).first();
  const coverBox = await cover.boundingBox();
  const slider = page
    .getByTestId('player-sheet')
    .getByRole('slider', { name: 'Playback position' })
    .first();
  const sliderBox = await slider.boundingBox();
  expect(coverBox).not.toBeNull();
  expect(sliderBox).not.toBeNull();
  if (!coverBox || !sliderBox) return;

  await page.mouse.move(coverBox.x + coverBox.width * 0.8, coverBox.y + coverBox.height / 2);
  await page.mouse.down();
  // Move far enough that an unclipped cover would cover the info column.
  await page.mouse.move(
    coverBox.x + coverBox.width + 400,
    coverBox.y + coverBox.height / 2,
    { steps: 10 },
  );
  await page.waitForTimeout(120);

  const movedBox = await cover.boundingBox();
  expect(movedBox).not.toBeNull();
  expect((movedBox?.x ?? coverBox.x) - coverBox.x).toBeGreaterThan(150);

  const overlapped = await page.evaluate(
    ({ x, y }) => {
      const node = document.elementFromPoint(x, y);
      return Boolean(node?.closest('[aria-label^="Album cover"]'));
    },
    { x: sliderBox.x + 4, y: sliderBox.y + sliderBox.height / 2 },
  );
  expect(overlapped).toBe(false);
  await page.mouse.up();
});

test('swiping next on the last track bounces instead of closing the player', async ({ page }) => {
  await login(page);
  await playFirstTrack(page);
  await openPlayer(page);

  // Album order: First Light, Slow Motion, Paper Planes, Night Drive.
  for (let step = 0; step < 3; step += 1) {
    await page.getByTestId('player-sheet').getByRole('button', { name: 'Next track' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Night Drive' }).first()).toBeVisible();

  const cover = page.getByRole('button', { name: /Album cover: tap for lyrics/ }).first();
  const box = await cover.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();

  await page.waitForTimeout(900);
  await expect(page.getByTestId('player-sheet')).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByRole('heading', { name: 'Night Drive' }).first()).toBeVisible();
  // The cover must bounce back into its stage, not stay parked off-screen.
  const after = await cover.boundingBox();
  expect(after).not.toBeNull();
  if (after) expect(Math.abs(after.x - box.x)).toBeLessThan(4);
});

test('a quick drop at the top reorders instead of moving to Up next', async ({ page }) => {
  await login(page);
  await playFirstTrack(page);
  await openPlayer(page);
  await openQueue(page);
  await page.waitForTimeout(500);

  await dragNightDriveToTop(page, false);

  // The drop spring settles after the point where the old timer armed.
  await page.waitForTimeout(1400);
  const state = await queueState(page);
  expect(state.upNext).toEqual([]);
  expect(state.queue.slice(0, 2)).toEqual(['Night Drive', 'First Light']);
});

test('holding at the top still moves the row to Up next', async ({ page }) => {
  await login(page);
  await playFirstTrack(page);
  await openPlayer(page);
  await openQueue(page);
  await page.waitForTimeout(500);

  await dragNightDriveToTop(page, true);

  await expect.poll(async () => (await queueState(page)).upNext).toEqual(['Night Drive']);
  expect((await queueState(page)).queue).not.toContain('Night Drive');
});

/** Sample the queue sheet's translateY for the next 800 ms. */
function startQueueTransformSamples(page: Page) {
  return page.evaluate(() => {
    const target = window as unknown as { __queueTy: number[] };
    target.__queueTy = [];
    const started = performance.now();
    const tick = () => {
      const node = document.querySelector('[data-testid="queue-sheet"]');
      if (node && node.getAttribute('aria-hidden') !== 'true') {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
        const value = Math.round(matrix.m42);
        // The pre-mounted sheet starts at its closed offset. That rest frame is
        // not an intermediate position; anything between it and 0 is.
        if (Math.abs(value - node.getBoundingClientRect().height) > 1) {
          target.__queueTy.push(value);
        }
      }
      if (performance.now() - started < 800) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function queueTransformSamples(page: Page) {
  return page.evaluate(() => (window as unknown as { __queueTy: number[] }).__queueTy);
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('queue sheet reaches its rest position without intermediate frames', async ({ page }) => {
    await login(page);
    await playFirstTrack(page);
    await openPlayer(page);
    await startQueueTransformSamples(page);

    await openQueue(page);
    await page.waitForTimeout(900);
    const samples = await queueTransformSamples(page);
    expect(samples.length).toBeGreaterThan(5);
    expect(samples.filter((value) => Math.abs(value) > 1)).toHaveLength(0);
  });
});

test('reduce motion applied after load stops the queue animation', async ({ page }) => {
  await login(page);
  await playFirstTrack(page);
  await openPlayer(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  await startQueueTransformSamples(page);

  await openQueue(page);
  await page.waitForTimeout(900);
  const samples = await queueTransformSamples(page);
  expect(samples.length).toBeGreaterThan(5);
  expect(samples.filter((value) => Math.abs(value) > 1)).toHaveLength(0);
});

test('queue sheet animates when motion is allowed (control)', async ({ page }) => {
  await login(page);
  await playFirstTrack(page);
  await openPlayer(page);
  await startQueueTransformSamples(page);

  await openQueue(page);
  await page.waitForTimeout(900);
  const samples = await queueTransformSamples(page);
  expect(samples.filter((value) => Math.abs(value) > 1)).not.toHaveLength(0);
});
