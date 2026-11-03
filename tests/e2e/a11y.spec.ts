import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { adminClient, ok, openAdmin, resetOffice, unlockOfficeScreen } from './helpers.ts';

/** Serious and critical axe violations on the page as it is now. */
async function serious(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(' ')) }));
}

const codes: string[] = [];
test.afterAll(async () => {
  if (codes.length) await ok(adminClient().from('rooms').delete().in('code', codes).select());
});

test('home', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Horse Racing Turf Club' })).toBeVisible();
  expect(await serious(page)).toEqual([]);
});

test('track lobby and joined phone', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Host a race (big screen)' }).click();
  await expect(page.getByRole('group', { name: 'Track' })).toBeVisible();
  const code = new URL(page.url()).searchParams.get('code')!;
  codes.push(code);

  const phone = await (await browser.newContext()).newPage();
  await phone.goto(`/play?code=${code}`);
  await phone.getByLabel('Your name').fill('Axe');
  await phone.getByRole('button', { name: 'Join' }).click();
  await expect(phone.getByRole('heading', { name: 'Axe' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Axe' })).toBeVisible();

  expect(await serious(page)).toEqual([]);
  expect(await serious(phone)).toEqual([]);
});

test('admin (signed in)', async ({ page }) => {
  await resetOffice();
  await openAdmin(page);
  expect(await serious(page)).toEqual([]);
});

test('office big screen lobby and stats', async ({ page }) => {
  await resetOffice();
  await unlockOfficeScreen(page);
  expect(await serious(page)).toEqual([]);
  // The unlocked big screen may read /stats.
  await page.goto('/stats');
  await expect(page.getByRole('heading', { name: 'Horses' })).toBeVisible();
  expect(await serious(page)).toEqual([]);
});
