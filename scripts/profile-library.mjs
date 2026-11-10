#!/usr/bin/env node
/**
 * Large-library profiler. Starts the mock server with MOCK_ALBUMS albums and
 * the built web app, then measures the Library first grid and offset paging.
 *
 *   npm run build:web
 *   node scripts/profile-library.mjs
 *   MOCK_ALBUMS=5000 node scripts/profile-library.mjs
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import { chromium } from 'playwright';

const ALBUMS = Math.max(120, Number(process.env.MOCK_ALBUMS ?? 1200) || 1200);
const MOCK_PORT = Number(process.env.MOCK_PORT ?? 4547);
const WEB_PORT = Number(process.env.WEB_PORT ?? 4175);
const MOCK = `http://127.0.0.1:${MOCK_PORT}`;
const WEB = `http://127.0.0.1:${WEB_PORT}`;

function waitForPort(port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, '127.0.0.1');
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) reject(new Error(`Port ${port} did not open`));
        else setTimeout(attempt, 150);
      });
    };
    attempt();
  });
}

function stop(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
}

const mock = spawn('node', ['scripts/mock-server.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, MOCK_PORT: String(MOCK_PORT), MOCK_ALBUMS: String(ALBUMS) },
  stdio: 'ignore',
});
const web = spawn('node_modules/.bin/serve', ['dist', '-s', '-l', String(WEB_PORT)], {
  cwd: process.cwd(),
  stdio: 'ignore',
});

let browser;
try {
  await Promise.all([waitForPort(MOCK_PORT), waitForPort(WEB_PORT)]);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  const offsets = [];
  const started = Date.now();
  page.on('request', (request) => {
    const url = request.url();
    if (!url.includes('getAlbumList2')) return;
    const offset = new URL(url).searchParams.get('offset') ?? '0';
    offsets.push({ offset: Number(offset), at: Date.now() - started });
  });

  await page.goto(`${WEB}/login`);
  await page.getByPlaceholder('https://music.example.com').fill(MOCK);
  await page.getByPlaceholder('your username').fill('laila');
  await page.getByPlaceholder('paste your API key').fill('test-key');
  await page.getByRole('button', { name: 'Remember this server' }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await page.getByRole('button', { name: 'Home' }).waitFor();

  const gridStart = Date.now();
  await page.getByRole('button', { name: 'Library' }).first().click();
  await page.getByTestId('album-shelf').getByRole('button', { name: / by / }).first().waitFor();
  const firstGridMs = Date.now() - gridStart;

  // FlashList on web is a scrollable div; find the largest one.
  const scroll = async () => {
    await page.evaluate(() => {
      const shelf = document.querySelector('[data-testid="album-shelf"]');
      const candidates = Array.from(document.querySelectorAll('div')).filter(
        (el) => el.scrollHeight > el.clientHeight + 100,
      );
      const target =
        shelf && shelf.scrollHeight > shelf.clientHeight + 100
          ? shelf
          : candidates.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
      if (target) target.scrollTop = target.scrollHeight;
    });
  };

  let lastCount = 0;
  let stable = 0;
  for (let i = 0; i < 160; i += 1) {
    await scroll();
    await page.waitForTimeout(350);
    if (offsets.length === lastCount) stable += 1;
    else stable = 0;
    lastCount = offsets.length;
    if (stable >= 8) break;
  }
  const loadedMs = Date.now() - started;
  const heap = await page.evaluate(() =>
    'memory' in performance
      ? Math.round(performance.memory.usedJSHeapSize / (1024 * 1024))
      : null,
  );
  const cards = await page.getByRole('button', { name: / by / }).count();

  console.log(
    JSON.stringify(
      {
        albums: ALBUMS,
        firstGridMs,
        loadedMs,
        requests: offsets.length,
        offsets: offsets.map((entry) => entry.offset),
        renderedCards: cards,
        heapMB: heap,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  stop(mock);
  stop(web);
}
