import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';

const PORT = 8790;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = process.argv[2] ?? 'ui-shots';
const PERSIST = '.wrangler/ui-test';

let server: ChildProcess | null = null;
const errors: string[] = [];
const notes: string[] = [];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function startServer() {
  rmSync(PERSIST, { recursive: true, force: true });
  server = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--var', 'DEV:true', '--persist-to', PERSIST], { stdio: 'ignore' });
  for (let i = 0; i < 200; i++) {
    try {
      if ((await fetch(`${BASE}/api/rooms/AAAAAA`)).ok) return;
    } catch {
      await sleep(300);
    }
  }
  throw new Error('wrangler dev did not start');
}

function stopServer() {
  if (!server) return;
  if (process.platform === 'win32') execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' });
  else server.kill('SIGKILL');
  server = null;
}

function watch(page: Page, who: string) {
  page.on('pageerror', (e) => errors.push(`${who} page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/WebSocket|Failed to load resource/.test(m.text())) errors.push(`${who} console: ${m.text()}`);
  });
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
}

async function debug(code: string) {
  return (await (await fetch(`${BASE}/api/rooms/${code}/debug`)).json()) as {
    game: { turn: { player: string; phase: string }; players: { id: string; name: string; cash: number; connected: boolean }[]; props: ({ owner: string | null } | null)[]; status: string; auction: unknown; debts: unknown[]; version: number } | null;
    members: { id: string; name: string }[];
  };
}

async function clickFirst(page: Page, names: RegExp[]): Promise<string | null> {
  for (const name of names) {
    const button = page.getByRole('button', { name }).first();
    if (await button.isVisible().catch(() => false)) {
      if (await button.isDisabled().catch(() => true)) continue;
      const label = (await button.textContent())?.trim() ?? '';
      await button.click();
      return label;
    }
  }
  return null;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  await startServer();

  const browser: Browser = await chromium.launch({ channel: 'msedge', headless: true });
  const samCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const priyaCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const leoCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  const sam = await samCtx.newPage();
  const priya = await priyaCtx.newPage();
  let leo = await leoCtx.newPage();
  watch(sam, 'Sam');
  watch(priya, 'Priya');
  watch(leo, 'Leo');

  await sam.goto(BASE);
  await shot(sam, '01-home');
  await sam.getByLabel('Your name').fill('Sam');
  await sam.getByRole('button', { name: 'Create a room' }).click();
  await sam.waitForURL(/\/r\/[A-Z0-9]{6}$/);
  const code = sam.url().split('/').pop()!;
  await sam.getByText(`Room ${code}`).waitFor();
  notes.push(`Room ${code} created through the home page`);

  for (const [page, name] of [
    [priya, 'Priya'],
    [leo, 'Leo']
  ] as const) {
    await page.goto(`${BASE}/r/${code}`);
    await page.getByLabel('Your name').fill(name);
    await page.getByRole('button', { name: 'Take a seat' }).click();
    await page.getByText('Game setup').waitFor();
  }

  await sam.getByText('Leo').first().waitFor();
  await sam.getByRole('switch', { name: 'Double salary on Start' }).click();
  await sleep(400);
  const seen = await priya.getByRole('switch', { name: 'Double salary on Start' }).getAttribute('aria-checked');
  notes.push(`Host toggled "Double salary on Start", Priya sees aria-checked=${seen}`);
  await sam.getByRole('switch', { name: 'Roll again on doubles' }).click();
  await sleep(400);
  notes.push(`Turning off doubles greys out three doubles: ${await priya.getByText('Needs roll again on doubles').isVisible()}`);
  await sam.getByRole('switch', { name: 'Roll again on doubles' }).click();
  await sleep(300);
  await shot(sam, '02-lobby-host');
  await shot(leo, '03-lobby-phone');

  await sam.getByRole('button', { name: 'Start game' }).click();
  for (const page of [sam, priya, leo]) await page.locator('.board').waitFor();
  notes.push('Game started, all three see the board');
  await sleep(500);
  await shot(sam, '04-game-desktop');
  await shot(leo, '05-game-phone');

  const pages: Record<string, Page> = {};
  const state0 = await debug(code);
  for (const m of state0.members) pages[m.id] = m.name === 'Sam' ? sam : m.name === 'Priya' ? priya : leo;

  let actions = 0;
  let boughtSomething = false;
  let sawAuction = false;
  for (let i = 0; i < 60; i++) {
    const s = await debug(code);
    if (!s.game || s.game.status !== 'playing') break;

    if (s.game.auction) {
      sawAuction = true;
      for (const page of Object.values(pages)) await clickFirst(page, [/^Drop out$/]);
      await sleep(250);
      continue;
    }

    const page = pages[s.game.turn.player];
    const label = await clickFirst(page, [/^Roll dice$/, /^Roll again$/, /^Roll for doubles$/, /^Buy for/, /^End turn$/]);
    if (label) {
      actions++;
      if (label.startsWith('Buy for')) boughtSomething = true;
    } else {
      await clickFirst(page, [/^Pass/]);
    }
    await sleep(250);
  }
  notes.push(`Clicked through ${actions} turn actions in the UI, bought something: ${boughtSomething}, saw an auction: ${sawAuction}`);

  await sam.locator('.tile').nth(39).click();
  await sleep(300);
  await shot(sam, '06-property-card');

  const s1 = await debug(code);
  const ownerIds = new Set(s1.game!.props.flatMap((p) => (p?.owner ? [p.owner] : [])));
  notes.push(`Properties owned after the turns: ${s1.game!.props.filter((p) => p?.owner).length}, by ${ownerIds.size} players`);

  await priya.getByRole('button', { name: 'New offer' }).click();
  await priya.getByRole('dialog').waitFor();
  await priya.getByRole('dialog').getByRole('button', { name: /Sam/ }).click();
  await priya.getByRole('dialog').getByLabel('Cash').first().fill('25');
  await sleep(200);
  await shot(priya, '07-trade-composer');
  await priya.getByRole('button', { name: 'Send offer' }).click();
  await sam.getByText('From Priya').waitFor({ timeout: 5000 });
  const samCashBefore = (await debug(code)).game!.players.find((p) => p.name === 'Sam')!.cash;
  await sam.getByRole('button', { name: 'Accept' }).click();
  await sleep(500);
  const samCashAfter = (await debug(code)).game!.players.find((p) => p.name === 'Sam')!.cash;
  notes.push(`Priya offered Sam $25 through the trade screen; Sam accepted, Sam's cash ${samCashBefore} -> ${samCashAfter}`);

  await leo.getByRole('button', { name: /^Log$/ }).click();
  await sleep(200);
  await shot(leo, '08-phone-log');
  await leo.locator('.tile').nth(5).click();
  await sleep(200);
  await shot(leo, '09-phone-card');

  const leoId = Object.keys(pages).find((id) => pages[id] === leo)!;
  await leo.close();
  await sleep(1500);
  leo = await leoCtx.newPage();
  watch(leo, 'Leo');
  await leo.goto(`${BASE}/r/${code}`);
  await leo.locator('.board').waitFor();
  const back = (await debug(code)).game!.players.find((p) => p.id === leoId)!;
  notes.push(`Leo closed the tab and reopened the link: back in the same seat without typing a name, connected=${back.connected}`);

  await sam.getByRole('button', { name: 'Game menu' }).click();
  await shot(sam, '10-menu');
  await sam.getByRole('button', { name: 'End the game now' }).click();
  await sam.getByRole('dialog', { name: 'End the game now?' }).getByRole('button', { name: 'End the game' }).click();
  await sam.getByText(/won$/).first().waitFor();
  await sleep(400);
  await shot(sam, '11-game-over');
  notes.push(`Host ended the game: ${(await debug(code)).game!.status}`);

  await browser.close();
  stopServer();

  console.log(notes.join('\n'));
  console.log(errors.length ? `\nBrowser errors:\n${errors.join('\n')}` : '\nNo browser errors.');
  if (errors.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  console.log(notes.join('\n'));
  console.log(errors.join('\n'));
  stopServer();
  process.exit(1);
});
