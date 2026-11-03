import { expect, test } from '@playwright/test';
import {
  adminClient,
  ok,
  openAdmin,
  resetOffice,
  roomByCode,
  uniqueName,
  unlockOfficeScreen,
} from './helpers.ts';

const names = [uniqueName('Eve'), uniqueName('Fay')];
let roomId = '';
let originalTrack = '';
const races: string[] = [];

test.afterAll(async () => {
  const admin = adminClient();
  if (!roomId) return;
  const room = await roomByCode('TURF');
  if (room.race_id) races.push(room.race_id);
  await ok(
    admin
      .from('rooms')
      .update({ phase: 'LOBBY', race_id: null, track: originalTrack })
      .eq('id', roomId),
  );
  if (races.length) await ok(admin.from('races').delete().in('id', races).select());
  // The office room is permanent: archive (not delete) the members this spec made.
  const members = await ok(
    admin.from('room_players').select('id').eq('room_id', roomId).in('name', names),
  );
  for (const m of members as { id: string }[])
    await ok(admin.rpc('admin_archive', { p_player: m.id }));
});

test('office: admin adds members, phone buys and wears looks, host races on Kidney', async ({
  browser,
}) => {
  test.setTimeout(3 * 60_000);
  const room = await resetOffice();
  roomId = room.id;
  const [{ track }] = await ok(adminClient().from('rooms').select('track').eq('id', roomId));
  originalTrack = track as string;

  // /admin: add two members.
  const adminPage = await (await browser.newContext()).newPage();
  await openAdmin(adminPage);
  for (const n of names) {
    await adminPage.getByLabel('New member name').fill(n);
    await adminPage.getByRole('button', { name: 'Add person' }).click();
    await expect(adminPage.getByRole('cell', { name: n, exact: true })).toBeVisible();
  }
  // Coins for a looks purchase (members start with 100; the cheapest look costs 150).
  const [eve] = (await ok(
    adminClient().from('room_players').select('id').eq('room_id', roomId).eq('name', names[0]!),
  )) as { id: string }[];
  await ok(
    adminClient().rpc('admin_adjust', { p_player: eve!.id, p_amount: 200, p_reason: 'e2e' }),
  );

  // Phone: first sign-in sets the PIN.
  const phone = await (await browser.newContext()).newPage();
  await phone.goto('/play?code=TURF');
  await phone.getByLabel('Who are you?').selectOption({ label: names[0]! });
  await phone.getByLabel('Choose a 4-digit PIN').fill('4321');
  await phone.getByRole('button', { name: 'Set PIN and sign in' }).click();
  await expect(phone.getByRole('heading', { name: names[0]! })).toBeVisible();

  // Looks shop: buy, then wear.
  await phone.getByRole('button', { name: 'Buy Hoops silks' }).click();
  await phone.getByRole('button', { name: 'Pay 150' }).click();
  await phone.getByRole('button', { name: 'Wear Hoops silks' }).click();
  await expect(phone.getByRole('button', { name: 'Remove Hoops silks' })).toBeVisible();
  const [worn] = await ok(adminClient().from('room_players').select('pattern').eq('id', eve!.id));
  expect(worn).toEqual({ pattern: 'pattern:hoops' });

  // Big screen: Kidney, tick both, run the phases to the race.
  const screen = await (await browser.newContext()).newPage();
  await unlockOfficeScreen(screen);
  await screen.getByRole('radio', { name: 'Kidney' }).click();
  await expect(screen.getByRole('radio', { name: 'Kidney' })).toBeChecked();
  for (const n of names) {
    await screen.getByRole('checkbox', { name: n, exact: true }).click();
    await expect(screen.getByRole('checkbox', { name: n, exact: true })).toBeChecked();
  }
  await screen.getByRole('button', { name: 'Open shop' }).click();
  await screen.getByRole('button', { name: 'Lock odds' }).click();
  await expect(screen.getByRole('heading', { name: /Place your bets/ })).toBeVisible();
  await screen.getByRole('button', { name: 'Start race' }).click();
  await expect(screen.getByRole('img', { name: /^Kidney race, 2 horses/ })).toBeVisible();
  await expect(screen.getByText('Track: Kidney')).toBeVisible();
  expect((await roomByCode('TURF')).phase).toBe('RUNNING');
});
