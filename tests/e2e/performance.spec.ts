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

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByTestId('performance-mode')).toBeVisible();
}

async function playFirstTrack(page: Page) {
  await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
  await page.getByRole('button', { name: 'Play', exact: true }).first().click();
  await expect(page.getByRole('button', { name: /Now playing: First Light/ })).toBeVisible();
}

test.describe('performance mode', () => {
  test('turns on manually, hides the blur toggle and persists', async ({ page }) => {
    await login(page);
    await openSettings(page);

    const card = page.getByTestId('performance-mode');
    await expect(card.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(
      card.getByText('Auto: off — this device does not need it.'),
    ).toBeVisible();

    await card.getByRole('button', { name: 'On', exact: true }).click();
    await expect(card.getByRole('button', { name: 'On', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(card.getByText('On — reduced visuals and no backdrop blur.')).toBeVisible();
    await expect(page.getByText('Reduce blur effects')).toHaveCount(0);

    await page.reload();
    await openSettings(page);
    await expect(
      page.getByTestId('performance-mode').getByRole('button', { name: 'On', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('skips parked artwork, 1x covers and the blurred backdrop when on', async ({ page }) => {
    await login(page);
    await openSettings(page);
    const card = page.getByTestId('performance-mode');
    await card.getByRole('button', { name: 'On', exact: true }).click();

    await page.goto('/');
    await playFirstTrack(page);

    const playerArtwork = page.getByTestId('player-artwork');
    const artwork = playerArtwork.locator('[data-testid^="artwork-"]');
    // Parked: performance mode does not decode the hidden large cover.
    await expect(artwork).toHaveCount(0);

    await page.getByRole('button', { name: /Now playing: First Light/ }).click();
    await expect(page.getByTestId('player-sheet')).toHaveAttribute('aria-modal', 'true');

    // The cover is decoded only once the player is actually open, and it asks
    // the server for exactly the laid-out size instead of the 2x request.
    await expect(artwork).toHaveCount(1);
    const image = playerArtwork.locator('img').first();
    const box = await image.boundingBox();
    const src = await image.getAttribute('src');
    expect(box?.width).toBeGreaterThan(0);
    expect(src).toBeTruthy();
    const requested = Number(new URL(src!).searchParams.get('size'));
    expect(requested).toBeGreaterThan(0);
    expect(Math.abs(requested - (box?.width ?? 0))).toBeLessThanOrEqual(1);

    await expect(page.getByTestId('player-backdrop').locator('img')).toHaveCount(0);
  });

  test('keeps the parked player cover in normal mode', async ({ page }) => {
    await login(page);
    await playFirstTrack(page);
    await expect(
      page.getByTestId('player-artwork').locator('[data-testid^="artwork-"]'),
    ).toHaveCount(1);
  });
});
