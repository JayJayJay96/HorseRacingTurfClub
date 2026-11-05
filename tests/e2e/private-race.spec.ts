import { expect, test, type Browser, type Page } from '@playwright/test';
import { adminClient, ok, roomByCode } from './helpers.ts';

const ORDINAL: Record<string, number> = { '1st': 1, '2nd': 2, '3rd': 3 };

async function phone(browser: Browser, code: string, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/play?code=${code}`);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  return page;
}

let code = '';
test.afterAll(async () => {
  // Deleting the room cascades to its players, races, bets and ledger.
  if (code) await ok(adminClient().from('rooms').delete().eq('code', code).select());
});

test('private race: 3 phones, reload mid-race, podium matches phones', async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  const screen = await (await browser.newContext()).newPage();
  const pageErrors: Error[] = [];
  screen.on('pageerror', (e) => pageErrors.push(e));
  await screen.goto('/');
  await screen.getByRole('button', { name: 'Host a race (big screen)' }).click();
  await expect(screen).toHaveURL(/\/track\?code=/);
  code = new URL(screen.url()).searchParams.get('code')!;
  await expect(screen.getByRole('group', { name: 'Race length' })).toBeVisible();

  const names = ['Ann', 'Ben', 'Cat'];
  const phones = await Promise.all(names.map((n) => phone(browser, code, n)));
  for (const n of names) {
    await screen.getByRole('checkbox', { name: n, exact: true }).click();
    await expect(screen.getByRole('checkbox', { name: n, exact: true })).toBeChecked();
  }

  await screen.getByRole('button', { name: 'Open shop' }).click();
  for (const p of phones) {
    await p.getByRole('button', { name: /Attack/ }).click();
    await expect(p.getByText(/Your boxes: 💥/)).toBeVisible();
  }

  await screen.getByRole('button', { name: 'Lock odds' }).click();
  await expect(screen.getByRole('heading', { name: /Place your bets/ })).toBeVisible();
  for (const p of phones) {
    await p.getByRole('button', { name: 'Bet', exact: true }).click();
    await expect(p.getByRole('button', { name: /^Cancel 10 bet on/ })).toBeVisible();
  }

  await screen.getByRole('button', { name: 'Start race' }).click();
  const raceView = screen.getByRole('img', { name: /race, 3 horses/ });
  await expect(raceView).toBeVisible();
  // HD-2D runs where WebGL2 exists (headless Chromium has it); otherwise the chip says so.
  await expect(screen.getByRole('button', { name: /^HD/ })).toBeVisible();
  const before = await roomByCode(code);
  expect(before.phase).toBe('RUNNING');

  // The big screen reloads mid-race and picks the same race back up.
  await screen.waitForTimeout(5_000);
  await screen.reload();
  await expect(raceView).toBeVisible();
  const after = await roomByCode(code);
  expect(after).toMatchObject({ phase: 'RUNNING', race_id: before.race_id });
  // The race keeps playing: the canvas changes frame to frame.
  const frame = await raceView.screenshot();
  await expect
    .poll(async () => (await raceView.screenshot()).equals(frame), { timeout: 30_000 })
    .toBe(false);

  // The big screen asks for the results itself when the race ends.
  await expect(screen.getByRole('heading', { name: 'Results' })).toBeVisible({
    timeout: 4 * 60_000,
  });
  const podium = (await screen.locator('ol.podium > li').allTextContents()).map((t) =>
    t.split(' · ')[0]!.trim(),
  );
  expect(podium).toHaveLength(3);

  const fromPhones: string[] = [];
  for (const [i, p] of phones.entries()) {
    // .result-place, not getByText: the live region also says "You finished ...".
    const text = await p.locator('.result-place').textContent({ timeout: 30_000 });
    const place = ORDINAL[/finished (\w+)/.exec(text ?? '')![1]!]!;
    fromPhones[place - 1] = names[i]!;
  }
  expect(podium).toEqual(fromPhones);
  expect(pageErrors).toEqual([]);
});
