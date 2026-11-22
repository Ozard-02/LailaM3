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

  test('drops backdrop blur and halves cover requests when on', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await page.getByRole('button', { name: /Now playing: First Light/ }).click();
    const sheet = page.getByTestId('player-sheet');
    await expect(sheet).toHaveAttribute('aria-modal', 'true');

    // Auto resolves to off on web, so the full 900 px blurred backdrop and 2x
    // cover requests must be present before performance mode is enabled.
    const backdrop = page.getByTestId('player-backdrop');
    await expect(backdrop.locator('img')).toHaveCount(1);
    const normalCover = sheet.locator('[data-testid^="artwork-"] img').first();
    await expect(normalCover).toBeVisible();
    const normalSrc = await normalCover.getAttribute('src');
    expect(normalSrc).toBeTruthy();
    const normalSize = Number(new URL(normalSrc!, page.url()).searchParams.get('size'));
    expect(normalSize).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Close player' }).click();
    await openSettings(page);
    const card = page.getByTestId('performance-mode');
    await card.getByRole('button', { name: 'On', exact: true }).click();
    await page.getByRole('button', { name: /Now playing: First Light/ }).click();
    await expect(sheet).toHaveAttribute('aria-modal', 'true');

    // The blurred scene is gone and the visible cover asks for its laid-out
    // size instead of the 2x decode.
    await expect(backdrop.locator('img')).toHaveCount(0);
    const perfCover = sheet.locator('[data-testid^="artwork-"] img').first();
    await expect(perfCover).toBeVisible();
    const perfSrc = await perfCover.getAttribute('src');
    expect(perfSrc).toBeTruthy();
    const perfSize = Number(new URL(perfSrc!, page.url()).searchParams.get('size'));
    expect(perfSize).toBeGreaterThan(0);
    expect(perfSize).toBeLessThan(normalSize);
  });
});
