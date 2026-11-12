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

test.describe('Laila web app', () => {
  test('signs in and shows the library', async ({ page }) => {
    await login(page);
    await expect(page.getByText('Recently played').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /A Quiet Place by/ }).first()).toBeVisible();
  });

  test('opens an album and plays a track @both', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await expect(page.getByText('Album', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await expect(page.getByRole('button', { name: /Now playing: First Light/ })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => navigator.mediaSession?.metadata?.title ?? null),
      )
      .toBe('First Light');
    await expect
      .poll(() => page.evaluate(() => navigator.mediaSession?.playbackState ?? null))
      .toBe('playing');
  });

  test('searches the library from the library tab', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Library' }).click();
    const searchField = page.getByPlaceholder('Search albums, artists, playlists and genres');
    await expect(searchField).toBeVisible();

    // The grid used the full window width, so cards overlapped on layouts with
    // a sidebar. Check the first visible row does not intersect or overflow.
    const cards = page.locator('[data-testid^="album-card-"]:visible');
    await expect(cards.first()).toBeVisible();
    const rects = await cards.evaluateAll((nodes) =>
      nodes.slice(0, 12).map((node) => {
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    expect(rects.length).toBeGreaterThan(3);
    const row = rects.filter((r) => Math.abs(r.y - rects[0]!.y) < 8);
    for (let i = 1; i < row.length; i += 1) {
      expect(row[i]!.x).toBeGreaterThanOrEqual(row[i - 1]!.x + row[i - 1]!.w - 2);
    }
    const viewport = page.viewportSize()?.width ?? 1440;
    expect(Math.max(...rects.map((r) => r.x + r.w))).toBeLessThanOrEqual(viewport + 2);

    await searchField.fill('Quiet');
    await expect(page.getByText('Albums', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /A Quiet Place by/ }).first()).toBeVisible();
    await page.getByPlaceholder('Search albums, artists, playlists and genres').fill('Blue');
    await expect(page.getByText('Songs', { exact: true })).toBeVisible();
    await expect(page.getByText('First Light').first()).toBeVisible();
    await page.getByRole('button', { name: 'Clear library search' }).click();
    await expect(page.getByPlaceholder('Search albums, artists, playlists and genres')).toHaveValue('');
    await expect(page.getByRole('button', { name: /A Quiet Place by/ }).first()).toBeVisible();
  });

  test('supports keyboard search, space and escape', async ({ page }) => {
    await login(page);
    await page.keyboard.press('/');
    await expect(
      page.getByPlaceholder('Search albums, artists, playlists and genres'),
    ).toBeFocused();
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await page.getByRole('button', { name: /Now playing: First Light/ }).click();
    await expect(page.getByRole('button', { name: 'Close player' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Close player' })).toHaveCount(0);
    await page.getByText('A Quiet Place', { exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await page.keyboard.press(' ');
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
  });

  test('opens the keyboard shortcut sheet with ? and closes it with Escape', async ({
    page,
  }) => {
    await login(page);
    await page.keyboard.press('Shift+/');
    await expect(page.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible();
    await expect(page.getByText('Play / pause')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Keyboard shortcuts' })).toHaveCount(0);
  });

  test('steps tracks and seeks with keyboard shortcuts', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await expect(page.getByRole('button', { name: /Now playing: First Light/ })).toBeVisible();

    await page.keyboard.press('n');
    await expect(page.getByRole('button', { name: /Now playing: Slow Motion/ })).toBeVisible();
    await page.keyboard.press('p');
    await expect(page.getByRole('button', { name: /Now playing: First Light/ })).toBeVisible();

    await page.getByRole('button', { name: /Now playing: First Light/ }).click();
    await page.waitForTimeout(900);
    const slider = page
      .getByTestId('player-sheet')
      .getByRole('slider', { name: 'Playback position' });
    await slider.focus();
    const before = Number(await slider.getAttribute('aria-valuenow'));
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => Number(await slider.getAttribute('aria-valuenow')))
      .toBeGreaterThan(before);
  });

  test('traps focus in the player and restores it on close', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    const mini = page.getByRole('button', { name: /Now playing: First Light/ });
    await expect(page.getByTestId('player-sheet')).toHaveAttribute('inert', '');
    await mini.click();
    await expect(page.getByTestId('player-sheet')).not.toHaveAttribute('inert', '');
    await expect(page.getByRole('button', { name: 'Close player' })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
      .toBe('Close player');

    for (let index = 0; index < 25; index += 1) await page.keyboard.press('Tab');
    const inside = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('[data-testid="player-sheet"]')),
    );
    expect(inside).toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Close player' })).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''))
      .toContain('Now playing');
  });

  test('re-opens the player from the pill after closing it', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    const mini = page.getByRole('button', { name: /Now playing: First Light/ });
    await mini.click();
    await expect(page.getByRole('button', { name: 'Close player' })).toBeVisible();
    await page.getByRole('button', { name: 'Close player' }).click();
    await expect(page.getByRole('button', { name: 'Close player' })).toHaveCount(0);

    // A parked morph overlay must not stay interactive: this tap has to open
    // the player again. While it was stale the invisible cover/play buttons
    // took the tap and toggled playback instead.
    await mini.click();
    await expect(page.getByRole('button', { name: 'Close player' })).toBeVisible();
    expect(await page.evaluate(() => navigator.mediaSession?.playbackState ?? null)).toBe(
      'playing',
    );
  });

  test('Space toggles playback instead of re-running the focused button', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await page.getByRole('button', { name: /Now playing: First Light/ }).click();
    await page.waitForTimeout(900);

    await page
      .getByTestId('player-sheet')
      .getByRole('button', { name: 'Next track' })
      .click();
    await expect(page.getByTestId('player-sheet').getByText('Slow Motion').first()).toBeVisible();

    await page.keyboard.press(' ');
    await expect(
      page
        .getByTestId('player-sheet')
        .getByRole('button', { name: 'Play', exact: true })
        .first(),
    ).toBeVisible();
    await expect(page.getByTestId('player-sheet').getByText('Slow Motion').first()).toBeVisible();
  });

  test('F maximises and minimises the player', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await page.keyboard.press('f');
    await expect(page.getByRole('button', { name: 'Close player' })).toBeVisible();
    await page.keyboard.press('f');
    await expect(page.getByRole('button', { name: 'Close player' })).toHaveCount(0);
  });

  test('does not clip the bottom tab labels @mobile', async ({ page }) => {
    await login(page);
    const label = page.getByText('Library', { exact: true }).last();
    await expect(label).toBeVisible();
    const box = await label.boundingBox();
    expect(box).not.toBeNull();
    // The label must span the tab width; a content-sized text used to wrap
    // "LIBRARY" and hide the final Y under the pill.
    expect(box!.width).toBeGreaterThan(50);
  });

  test('provides a skip link that focuses the main content', async ({ page }) => {
    await login(page);
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await skip.focus();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id))
      .toBe('main-content');
  });

  test('shows a visible keyboard focus ring', async ({ page }) => {
    await login(page);
    await page.keyboard.press('Tab');
    const style = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element) return null;
      const computed = getComputedStyle(element);
      return {
        outline: computed.outlineStyle,
        width: computed.outlineWidth,
        label: element.getAttribute('aria-label') ?? element.textContent,
      };
    });
    expect(style?.label).toBeTruthy();
    expect(style?.outline).not.toBe('none');
    expect(style?.width).not.toBe('0px');
  });

  test('moves focus to the main landmark after navigation', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Library' }).click();
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('main-content');
    await page.keyboard.press('/');
    await expect(
      page.getByPlaceholder('Search albums, artists, playlists and genres'),
    ).toBeFocused();
  });

  test('keeps reverse-proxy headers and pings a saved server', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('https://music.example.com').fill('http://localhost:4545');
    await page.getByPlaceholder('your username').fill('laila');
    await page.getByPlaceholder('paste your API key').fill('test-key');
    await page.getByRole('button', { name: 'Proxy headers' }).click();
    await page.getByLabel('Header 1 name').fill('X-Auth-Request-User');
    await page.getByLabel('Header 1 value').fill('laila');
    await page.getByRole('button', { name: 'Remember this server' }).click();
    const pingRequest = page.waitForRequest((request) => request.url().includes('/rest/ping'));
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    expect((await pingRequest).headers()['x-auth-request-user']).toBe('laila');
    await expect(page.getByRole('button', { name: 'Home' })).toBeVisible();

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Servers and networks' }).click();
    await expect(page.getByText(/1 proxy headers/)).toBeVisible();
    await page.getByRole('button', { name: /Edit proxy headers/ }).click();
    await expect(page.getByLabel('Header 1 name')).toHaveValue('X-Auth-Request-User');
    await expect(page.getByLabel('Header 1 value')).toHaveValue('laila');
    await page.getByRole('button', { name: /^Test / }).click();
    await expect(page.getByText(/Online · \d+ ms/)).toBeVisible();
  });

  test('finds a Chinese album by pinyin in the library', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Library' }).click();
    await page
      .getByPlaceholder('Search albums, artists, playlists and genres')
      .fill('zhoujielun');
    await expect(
      page.getByRole('button', { name: /周杰伦精选 by/ }).first(),
    ).toBeVisible();
  });

  test('scans all albums for pinyin from the dedicated search screen', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Search' }).click();
    await page.getByPlaceholder('Search your library').fill('zhoujielun');
    await expect(page.getByText('No matches')).toBeVisible();
    await page.getByRole('button', { name: 'Search all albums by pinyin' }).click();
    await expect(page.getByText('Albums (local pinyin scan)')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /周杰伦精选 by/ }).first(),
    ).toBeVisible();
  });

  test('selects a lower-quality download and shows free space', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Opus 128' }).click();
    await page.getByRole('button', { name: 'Downloads' }).last().click();
    await expect(page.getByText('New downloads: Opus 128 kbps')).toBeVisible();
    await expect(page.getByText(/on this device · .* free/)).toBeVisible();
  });

  test('shows Segue devices when the hub is present @both', async ({ page }) => {
    await login(page);
    await page.goto('/devices');
    await expect(page.getByText('Connected as laila')).toBeVisible();
    await expect(page.getByText('Living room TV', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play on' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Previous track on Living room TV' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play Living room TV' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Next track on Living room TV' }),
    ).toBeVisible();
    const volume = page.getByRole('slider', { name: 'Volume for Living room TV' });
    await expect(volume).toBeVisible();
    await page.getByRole('button', { name: 'Play Living room TV' }).click();
    await expect(
      page.getByRole('button', { name: 'Pause Living room TV' }),
    ).toBeVisible();
    await volume.focus();
    await page.keyboard.press('ArrowRight');
    await expect(volume).toHaveAttribute('aria-valuenow', '75');
    await expect(page.getByTestId('seek-preview')).toHaveText('75');
    // SSDP is Android-only; the web build explains the limitation.
    await expect(page.getByText(/Speaker discovery runs in the Android app/)).toBeVisible();
  });

  test('shuffles the library while excluding exclusive playlists', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Shuffle' }).first().click();
    await expect(page.getByRole('button', { name: /Now playing:/ })).toBeVisible();
    await page.getByRole('button', { name: /Open queue/ }).first().click();
    await expect(page.getByText('4 tracks · drag to reorder')).toBeVisible();
  });

  test('album Shuffle removes songs from exclusive playlists', async ({ page }) => {
    await login(page);
    await page.goto('/album/al-3');
    await expect(page.getByText('Album', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Shuffle', exact: true }).click();
    await expect(page.getByRole('button', { name: /Now playing:/ })).toBeVisible();
    await page.getByRole('button', { name: /Open queue/ }).first().click();
    await expect(page.getByText('3 tracks · drag to reorder')).toBeVisible();
  });

  test('Firefox progress bar seeks with mouse and keyboard @firefox', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await page.getByRole('button', { name: /Now playing: First Light/ }).click();
    await page.waitForTimeout(900);
    const slider = page
      .getByTestId('player-sheet')
      .getByRole('slider', { name: 'Playback position' });
    const box = await slider.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width * 0.7, box!.y + box!.height / 2);
    await expect
      .poll(async () => Number(await slider.getAttribute('aria-valuenow')))
      .toBeGreaterThan(5);
    const before = Number(await slider.getAttribute('aria-valuenow'));
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => Number(await slider.getAttribute('aria-valuenow')))
      .toBeGreaterThan(before);

    await page.mouse.click(box!.x + box!.width * 0.1, box!.y + box!.height / 2);
    const beforeDrag = Number(await slider.getAttribute('aria-valuenow'));
    await page.mouse.move(box!.x + box!.width * 0.2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * 0.85, box!.y + box!.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
    await expect
      .poll(async () => Number(await slider.getAttribute('aria-valuenow')))
      .toBeGreaterThan(beforeDrag + 5);
  });

  test('restores the queue without starting playback after a reload @both', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await expect(
      page.getByRole('button', { name: /Now playing: First Light/ }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('button', { name: /Now playing: First Light/ }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
  });

  test('continues a Segue playback from the handoff pill @both', async ({ page }) => {
    await login(page);
    const pill = page.getByRole('button', {
      name: /Continue playback from Living room TV/,
    });
    await expect(pill).toBeVisible();
    await pill.click();
    await expect(pill).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Now playing: First Light/ }),
    ).toBeVisible();
  });

  test('dismisses the handoff pill on a tap elsewhere @both', async ({ page }) => {
    await login(page);
    const pill = page.getByRole('button', {
      name: /Continue playback from Living room TV/,
    });
    await expect(pill).toBeVisible();
    await page.getByRole('heading', { name: /Good |Late night/ }).first().click();
    await expect(pill).toHaveCount(0);
  });

  test('continues the last Segue playback with resolved covers', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Devices and Segue' }).click();
    await expect(page.getByText('Last playback')).toBeVisible();
    await page.getByRole('button', { name: 'Continue here' }).click();
    // Close back to Settings (the route has history now) instead of reloading;
    // a reload can race the hub's transfer response and drop the queue.
    await page.getByRole('button', { name: 'Close devices' }).click();
    await expect(
      page.getByRole('button', { name: /Now playing: First Light/ }),
    ).toBeVisible();
    // The hub strips cover ids from relayed queues; the receiver resolves them
    // from getSong, so the grey placeholder becomes the real cover.
    await expect(page.getByTestId('artwork-cover-1').first()).toBeVisible();
  });

  test('keeps covers when unshuffling a transferred queue @both', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Devices and Segue' }).click();
    await page.getByRole('button', { name: 'Continue here' }).click();
    await page.getByRole('button', { name: 'Close devices' }).click();
    await expect(
      page.getByRole('button', { name: /Now playing: First Light/ }),
    ).toBeVisible();
    // Wait for the receiver to resolve the cover ids stripped by the hub.
    await expect(page.getByTestId('artwork-cover-1').first()).toBeVisible();

    await page.getByRole('button', { name: /Now playing: First Light/ }).click();
    await page.getByRole('button', { name: 'Shuffle' }).last().click();
    // Regression: unshuffling restored the un-hydrated original queue, so every
    // cover in the player and queue became a placeholder.
    await expect(page.getByTestId('artwork-cover-1').first()).toBeVisible();
    await expect(page.getByTestId('artwork-placeholder')).toHaveCount(0);
  });

  test('does not nest buttons in the mini player, track rows or queue @both', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await expect(page.locator('button button')).toHaveCount(0);
    await page.getByRole('button', { name: /Open queue/ }).first().click();
    await expect(page.locator('button button')).toHaveCount(0);
  });

  test('player exposes favourite and more options', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await page.getByRole('button', { name: /Now playing: First Light/ }).click();
    await expect(page.getByRole('button', { name: 'Add to favourites' })).toBeVisible();
    await expect(
      page.getByTestId('player-sheet').getByRole('slider', { name: 'Playback position' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lyrics', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'More options' }).click();
    await expect(page.getByRole('button', { name: 'Add to next' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add to queue' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add to playlist' })).toBeVisible();
  });

  test('scrubs the player progress horizontally', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await page.getByRole('button', { name: /Now playing: First Light/ }).click();
    // Wait for the morph to settle: before that the player is not interactive.
    await page.waitForTimeout(900);
    const slider = page
      .getByTestId('player-sheet')
      .getByRole('slider', { name: 'Playback position' });
    await expect(slider).toBeVisible();
    const box = await slider.boundingBox();
    if (!box) throw new Error('progress bar has no layout box');
    const y = box.y + box.height / 2;

    // Press at 20%, wobble vertically, then drag to 70%. Only X should matter.
    await page.mouse.move(box.x + box.width * 0.2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.45, y + 8, { steps: 6 });

    const preview = page.getByTestId('seek-preview');
    await expect(preview).toBeVisible();
    // The mock stream is an 8 second wav; 45% rounds to 0:04.
    await expect(preview).toHaveText('0:04');

    await page.mouse.move(box.x + box.width * 0.7, y, { steps: 6 });
    await expect(preview).toHaveText('0:06');

    await page.mouse.up();
    await expect(slider).toHaveAttribute('aria-valuenow', '6');
    // The preview clears itself a moment after release.
    await expect(preview).toHaveCount(0);
  });

  test('cross-fades the player backdrop when the cover changes', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Shuffle' }).first().click();
    await page.getByRole('button', { name: /Now playing:/ }).click();
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      const w = window as unknown as { __backdrop: number[][] };
      w.__backdrop = [];
      const start = performance.now();
      const tick = () => {
        const layers = Array.from(
          document.querySelectorAll('[data-testid="player-backdrop"]'),
        ).map((el) => Number(getComputedStyle(el).opacity));
        if (layers.length) w.__backdrop.push(layers);
        if (performance.now() - start < 2400) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.getByTestId('player-sheet').getByRole('button', { name: 'Next track' }).click();
    await page.waitForTimeout(2600);
    const samples = await page.evaluate(
      () => (window as unknown as { __backdrop: number[][] }).__backdrop,
    );
    // Both scenes are visible during the fade, with the incoming one mid-way.
    expect(
      samples.some(
        (layers) => layers.length === 2 && (layers[1] ?? 1) > 0.05 && (layers[1] ?? 1) < 0.95,
      ),
    ).toBe(true);
    // The outgoing layer is dropped after the fade.
    expect(samples[samples.length - 1]?.length).toBe(1);
  });

  test('toggles exclude-from-shuffle by editing the playlist comment', async ({ page }) => {
    await login(page);
    await page.goto('/playlist/pl-1');
    const exclude = page.getByRole('button', { name: 'Exclude playlist from shuffle' });
    await expect(exclude).toBeVisible();

    const added = page.waitForRequest((request) => {
      if (!request.url().includes('updatePlaylist')) return false;
      return new URL(request.url()).searchParams.get('comment') === '#laila-exclusive';
    });
    await exclude.click();
    await added;
    await expect(
      page.getByRole('button', { name: 'Include playlist in shuffle' }),
    ).toBeVisible();

    const removed = page.waitForRequest((request) => {
      if (!request.url().includes('updatePlaylist')) return false;
      return new URL(request.url()).searchParams.get('comment') === '';
    });
    await page.getByRole('button', { name: 'Include playlist in shuffle' }).click();
    await removed;
    await expect(
      page.getByRole('button', { name: 'Exclude playlist from shuffle' }),
    ).toBeVisible();
  });

  test('opens favourites from the playlists section', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('button', { name: 'Open favourites' })).toBeVisible();
    await page.goto('/library');
    await page.getByRole('button', { name: 'Playlists' }).click();
    await page.getByRole('button', { name: 'Open favourites' }).click();
    await expect(page.getByText('Starred tracks and albums.')).toBeVisible();
    await expect(page.getByText('Songs', { exact: true })).toBeVisible();
    await expect(page.getByText('First Light').first()).toBeVisible();
    await page.getByRole('button', { name: 'Pin favourites' }).click();
    await expect(page.getByRole('button', { name: 'Unpin favourites' })).toBeVisible();
    await page.goto('/');
    await expect(page.getByText('Pinned', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open favourites' })).toHaveCount(2);
  });

  test('swiping the cover changes track', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await page.getByRole('button', { name: /Now playing: First Light/ }).click();
    await page.waitForTimeout(800);
    const cover = page.getByRole('button', { name: /Album cover/ }).first();
    const box = await cover.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    // The queue panel is no longer pre-mounted, so assert the actual track
    // change rather than any "Slow Motion" text inside the player sheet.
    await expect(page.locator('[aria-label^="Now playing: Slow Motion"]')).toHaveCount(1);
    // The new cover must slide back in, not stay parked off-screen.
    await page.waitForTimeout(700);
    const after = await page.getByRole('button', { name: /Album cover/ }).first().boundingBox();
    expect(after).not.toBeNull();
    if (!after) return;
    expect(Math.abs(after.x - box.x)).toBeLessThan(4);
  });

  test('pins and unpins an album from Home', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'More album options' }).click();
    await page.getByRole('button', { name: 'Pin album' }).click();
    await page.goto('/');
    await expect(page.getByText('Pinned', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'More album options' }).click();
    await page.getByRole('button', { name: 'Unpin album' }).click();
    await page.goto('/');
    await expect(page.getByText('Pinned', { exact: true })).toHaveCount(0);
  });

  test('opens album actions', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'More album options' }).click();
    await expect(page.getByRole('button', { name: 'Add album to queue' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add album to playlist' })).toBeVisible();
  });

  test('marks playlists that already contain the track', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Add First Light to playlist' }).click();
    await expect(page.getByText('Excluded from shuffle').first()).toBeVisible();
    const evening = page.getByRole('checkbox', { name: 'Evening' });
    await expect(evening).toBeChecked();
    await expect(page.getByText('Already in playlist').first()).toBeVisible();
    await evening.click();
    await expect(evening).not.toBeChecked();
    await expect(page.getByText('Will be removed').first()).toBeVisible();
    const remove = page.waitForRequest((request) => {
      if (!request.url().includes('updatePlaylist')) return false;
      return new URL(request.url()).searchParams.has('songIndexToRemove');
    });
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await remove;
  });

  test('adds an album track to a playlist', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /Blue Hour by/ }).first().click();
    await page.getByRole('button', { name: 'Add First Light to playlist' }).click();
    await expect(page.getByText('Add to playlist', { exact: true })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Evening' }).click();
    const update = page.waitForRequest((request) => request.url().includes('updatePlaylist'));
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await update;
    await expect(page.getByText('Add to playlist', { exact: true })).toHaveCount(0);
  });

  test('filters the tracks inside a playlist', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Open playlist Evening' }).click();
    // Regression: the search input used to be a sibling of the header text
    // inside the row, squeezing the title into a one-character column.
    const title = page.getByRole('heading', { name: 'Evening' });
    await expect(title).toBeVisible();
    await expect
      .poll(async () => (await title.boundingBox())?.width ?? 0)
      .toBeGreaterThan(40);
    const titleBox = await title.boundingBox();
    expect(titleBox).not.toBeNull();
    expect(titleBox!.height).toBeLessThan(80);
    await page.getByPlaceholder('Search in this playlist').fill('Slow');
    await expect(page.getByText('Slow Motion')).toBeVisible();
    await expect(page.getByText('First Light')).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear playlist search' }).click();
    await expect(page.getByText('First Light')).toBeVisible();
  });

  test('opens the lyrics screen for the current track', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await page.getByRole('button', { name: /Now playing: First Light/ }).click();
    await page.getByRole('button', { name: /Album cover: tap for lyrics/ }).click();
    await expect(page.getByText('Synced lyrics')).toBeVisible();
    await expect(page.getByText('Lyric line 1')).toBeVisible();
  });

  test('centres the active lyric line on the lyrics screen @both', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await page.getByRole('button', { name: /Now playing: First Light/ }).click();
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: /Album cover: tap for lyrics/ }).click();
    await expect(page.getByText('Synced lyrics')).toBeVisible();
    await page.keyboard.press(' ');
    await page.getByRole('button', { name: 'Seek to Lyric line 5' }).click();
    await page.waitForTimeout(900);

    const alignment = await page.evaluate(() => {
      const button = document.querySelector('[aria-label="Seek to Lyric line 5"]');
      if (!button) return null;
      const text = [...button.querySelectorAll('*')].find(
        (element) => element.textContent === 'Lyric line 5',
      );
      return text ? getComputedStyle(text).textAlign : null;
    });
    expect(alignment).toBe('center');

    const delta = await page.evaluate(() => {
      const line = document.querySelector('[aria-label="Seek to Lyric line 5"]');
      if (!line) return null;
      let scroller = line.parentElement;
      while (scroller) {
        const style = getComputedStyle(scroller);
        if (
          scroller.scrollHeight > scroller.clientHeight + 10 &&
          /auto|scroll/.test(style.overflowY)
        ) {
          break;
        }
        scroller = scroller.parentElement;
      }
      if (!scroller) return null;
      const lineRect = line.getBoundingClientRect();
      return Math.round(lineRect.top + lineRect.height / 2 - window.innerHeight / 2);
    });

    expect(delta).not.toBeNull();
    expect(Math.abs(delta as number)).toBeLessThan(12);
  });

  test('closing the player animates instead of snapping shut', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await page.getByRole('button', { name: /Now playing: First Light/ }).click();
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const w = window as unknown as { __surface: number[] };
      w.__surface = [];
      const el = document.querySelector('[data-testid="player-surface"]');
      const start = performance.now();
      const tick = () => {
        if (el) w.__surface.push(Number(getComputedStyle(el).opacity));
        if (performance.now() - start < 400) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.getByRole('button', { name: 'Close player' }).first().click();
    await page.waitForTimeout(500);
    const samples = await page.evaluate(
      () => (window as unknown as { __surface: number[] }).__surface,
    );
    // Regression: an effect on playerOpen used to reset progress to 0, which
    // cancelled the closing spring. The surface must stay up for a few frames.
    expect(samples.filter((opacity) => opacity > 0.5).length).toBeGreaterThan(3);
  });

  test('queue sheet never sits under the morph cover @mobile', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await page.getByRole('button', { name: /Now playing: First Light/ }).click();
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const w = window as unknown as { __overlap: number[] };
      w.__overlap = [];
      const overlay = document.querySelector('[data-testid="player-morph-overlay"]');
      const start = performance.now();
      const tick = () => {
        // The queue panel mounts on first intent, so it may not exist yet.
        const sheet = document.querySelector('[data-testid="queue-sheet"]');
        if (overlay && sheet) {
          // The cover is the largest overlay child (web adds 0-size wrappers).
          const art = Array.from(overlay.querySelectorAll('*'))
            .map((node) => node.getBoundingClientRect())
            .reduce((big, rect) => (rect.width * rect.height > big.width * big.height ? rect : big));
          const top = sheet.getBoundingClientRect().top;
          // Record overlay opacity on frames where the sheet covers the cover.
          if (top < art.bottom) w.__overlap.push(Number(getComputedStyle(overlay).opacity));
        }
        if (performance.now() - start < 700) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.getByTestId('player-sheet').getByRole('button', { name: 'Open queue' }).click();
    await page.waitForTimeout(800);
    const overlap = await page.evaluate(
      () => (window as unknown as { __overlap: number[] }).__overlap,
    );
    expect(overlap.length).toBeGreaterThan(0);
    expect(overlap.every((opacity) => opacity === 0)).toBe(true);
  });

  test('opens the queue and removes a track @both', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await page.getByRole('button', { name: /Open queue/ }).first().click();
    await expect(page.getByText('4 tracks · drag to reorder')).toBeVisible();
    await page.getByRole('button', { name: /Remove Slow Motion/ }).click();
    await expect(page.getByText('3 tracks · drag to reorder')).toBeVisible();
  });

  test('moves the current track to Trash and undoes it @both', async ({ page }) => {
    await login(page);
    await setTrashPlaylist(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await page.getByRole('button', { name: /Now playing: First Light/ }).click();
    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('button', { name: 'Move to Trash' }).click();

    await expect(page.getByText(/Moved “First Light” to Trash/)).toBeVisible();
    await expect(page.getByText('Slow Motion').first()).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('Restored to queue.')).toHaveCount(0);

    await page.getByTestId('player-sheet').getByRole('button', { name: 'Open queue' }).click();
    await expect(page.getByText('First Light').first()).toBeVisible();
  });

  test('moves the current track to Trash with Delete', async ({ page }) => {
    await login(page);
    await setTrashPlaylist(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await page.getByRole('button', { name: /Now playing: First Light/ }).click();
    await page.keyboard.press('Delete');
    await expect(page.getByText(/Moved “First Light” to Trash/)).toBeVisible();
    await expect(page.getByText('Slow Motion').first()).toBeVisible();
  });

  test('swipes a queue row left to Trash and undoes it @both', async ({ page }) => {
    await login(page);
    await setTrashPlaylist(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await page.getByRole('button', { name: /Open queue/ }).first().click();

    const row = page.getByRole('button', { name: 'Play Slow Motion' });
    await expect(row).toBeVisible();
    const box = await row.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width * 0.75, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * 0.2, box!.y + box!.height / 2, {
      steps: 10,
    });
    await page.mouse.up();

    await expect(page.getByText(/Moved “Slow Motion” to Trash/)).toBeVisible();
    await expect(page.getByText('3 tracks · drag to reorder')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('4 tracks · drag to reorder')).toBeVisible();

    const restored = page.getByRole('button', { name: 'Play Slow Motion' });
    const restoredBox = await restored.boundingBox();
    expect(restoredBox).not.toBeNull();
    await page.mouse.move(restoredBox!.x + restoredBox!.width * 0.25, restoredBox!.y + restoredBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(restoredBox!.x + restoredBox!.width * 0.8, restoredBox!.y + restoredBox!.height / 2, {
      steps: 10,
    });
    await page.mouse.up();

    await expect(page.getByText('Up next')).toBeVisible();
    await expect(page.getByText('Slow Motion').last()).toBeVisible();
    await expect(page.getByText('3 tracks · drag to reorder')).toBeVisible();
  });

  test('opens the downloads and settings screens', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Downloads' }).click();
    await expect(page.getByText('No downloads yet')).toBeVisible();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByText('Streaming quality')).toBeVisible();
    const rounded = page.getByRole('button', { name: 'Rounded', exact: true });
    await rounded.click();
    await expect(rounded).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Segue hub')).toBeVisible();
    const hex = page.getByLabel('Custom accent hex colour');
    await hex.fill('0A84FF');
    await page.getByRole('button', { name: 'Apply colour' }).click();
    await expect(hex).toHaveValue('#0A84FF');
  });

  test('manual offline mode shows downloads only', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Downloads' }).click();
    await page.getByRole('button', { name: 'Offline mode off' }).click();
    await expect(page.getByRole('button', { name: 'Offline mode on' })).toBeVisible();
    await page.goto('/');
    await expect(page.getByText('Offline · downloads only')).toBeVisible();
    await expect(page.getByText('No downloads yet')).toBeVisible();
    await page.goto('/library');
    await expect(page.getByText('No downloaded albums')).toBeVisible();
    await page.goto('/downloads');
    await page.getByRole('button', { name: 'Offline mode on' }).click();
    await page.goto('/');
    await expect(page.getByText('Recently played').first()).toBeVisible();
  });

  test('shows saved server instances', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Servers and networks' }).click();
    await expect(page.getByText('Any network')).toBeVisible();
    await expect(page.getByText('Active')).toBeVisible();
  });

  test('asks for the secret again when the server was not remembered', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('https://music.example.com').fill('http://localhost:4545');
    await page.getByPlaceholder('your username').fill('laila');
    await page.getByPlaceholder('paste your API key').fill('test-key');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Home' })).toBeVisible();

    await page.reload();
    await expect(page.getByText('Unlock server')).toBeVisible();
    expect(page.url()).toContain('reconnect=1');
  });

  test('makes no third-party requests', async ({ page }) => {
    const hosts = new Set<string>();
    const allowed = new Set(['localhost', '127.0.0.1']);
    const record = (rawUrl: string) => {
      const url = new URL(rawUrl);
      if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return;
      hosts.add(url.hostname);
    };
    page.on('request', (request) => record(request.url()));
    page.on('websocket', (socket) => record(socket.url()));

    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await page.getByRole('button', { name: /Now playing: First Light/ }).click();
    await page.getByRole('button', { name: /Album cover: tap for lyrics/ }).click();
    await expect(page.getByText('Synced lyrics')).toBeVisible();

    for (const host of hosts) expect(allowed.has(host)).toBe(true);
  });

  test('service worker caches only the app shell', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    const cached = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return [];
      await navigator.serviceWorker.ready;
      const urls: string[] = [];
      for (const key of await caches.keys()) {
        const cache = await caches.open(key);
        for (const request of await cache.keys()) urls.push(new URL(request.url).pathname);
      }
      return urls;
    });
    expect(cached.length).toBeGreaterThan(0);
    for (const path of cached) {
      expect(path).not.toMatch(/\/rest\/|\/connect\/|stream|download/);
    }
  });
});
