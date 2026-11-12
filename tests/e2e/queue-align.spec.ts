import { expect, test, type Page } from '@playwright/test';

interface QueueSample {
  /** List scroll offset, or null while the list is not mounted yet. */
  top: number | null;
  /** Sheet translateY, or null while the sheet is not mounted. */
  translate: number | null;
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('https://music.example.com').fill('http://localhost:4545');
  await page.getByPlaceholder('your username').fill('laila');
  await page.getByPlaceholder('paste your API key').fill('test-key');
  await page.getByRole('button', { name: 'Remember this server' }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Home' })).toBeVisible();
}

async function startQueueSampler(page: Page) {
  await page.evaluate(() => {
    const sampled = window as unknown as {
      __queueSamples: QueueSample[];
      __queueSampling: boolean;
    };
    sampled.__queueSamples = [];
    sampled.__queueSampling = true;
    const tick = () => {
      if (!sampled.__queueSampling) return;
      const list = document.querySelector<HTMLElement>('[data-testid="queue-list"]');
      const sheet = document.querySelector<HTMLElement>('[data-testid="queue-sheet"]');
      let translate: number | null = null;
      if (sheet) {
        const transform = getComputedStyle(sheet).transform;
        if (transform !== 'none') translate = new DOMMatrixReadOnly(transform).m42;
      }
      sampled.__queueSamples.push({ top: list ? list.scrollTop : null, translate });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function readQueueSamples(page: Page): Promise<QueueSample[]> {
  return page.evaluate(() => {
    const sampled = window as unknown as {
      __queueSamples: QueueSample[];
      __queueSampling: boolean;
    };
    sampled.__queueSampling = false;
    return sampled.__queueSamples;
  });
}

test.describe('queue opening', () => {
  test('aligns the playing track at the top, including the last track @both', async ({
    page,
  }) => {
    await login(page);
    await page.getByRole('button', { name: /A Quiet Place by/ }).first().click();
    await page.getByRole('button', { name: /Play Night Drive by/ }).click();
    await page.getByRole('button', { name: /Now playing: Night Drive/ }).click();
    await page.waitForTimeout(900);

    const queue = page.getByTestId('player-sheet').getByRole('button', { name: 'Open queue' });
    const list = page.getByTestId('queue-list');
    const sheet = page.getByTestId('queue-sheet');
    const current = list.getByRole('button', { name: 'Play Night Drive', exact: true });

    async function currentIsAtTop() {
      const listBox = await list.boundingBox();
      const rowBox = await current.boundingBox();
      if (!listBox || !rowBox) return false;
      const offset = rowBox.y - listBox.y;
      return offset >= 0 && offset < 20;
    }

    await startQueueSampler(page);
    await queue.click();
    await expect(list).toBeVisible();
    await expect.poll(currentIsAtTop).toBe(true);

    // The row must already be aligned while the sheet is still rising: a
    // scroll after this point is the late jump this test guards against.
    const samples = await readQueueSamples(page);
    const sheetHeight = await sheet.evaluate((node) => node.getBoundingClientRect().height);
    const rising = samples.filter(
      (sample) => sample.translate !== null && sample.translate < sheetHeight * 0.6,
    );
    const aligned = rising.filter((sample) => sample.top !== null);
    expect(aligned.length).toBeGreaterThan(0);
    const finalTop = await list.evaluate((node) => node.scrollTop);
    for (const sample of aligned) {
      expect(Math.abs((sample.top ?? -1) - finalTop)).toBeLessThan(1);
    }

    // Scrolling away and reopening must snap back to the playing track, and a
    // closed sheet must not leave its controls in the tab order.
    await list.evaluate((node) => {
      node.scrollTop = 0;
    });
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Close queue' }).click();
    await expect(sheet).toHaveAttribute('inert', '');
    await page.waitForTimeout(900);
    await queue.click();
    await expect(sheet).not.toHaveAttribute('inert', '');
    await expect.poll(currentIsAtTop).toBe(true);
  });
});
