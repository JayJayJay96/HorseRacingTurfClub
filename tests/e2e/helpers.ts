import { expect, type Page } from '@playwright/test';
import { adminClient, ok } from '../db/helpers.ts';
import { adminPassword, officeRow } from '../db/officeFixtures.ts';

export { adminClient, adminPassword, officeRow, ok };

/** Unique per run, so specs never depend on a clean office roster. */
export const uniqueName = (prefix: string) => `${prefix}${Date.now().toString(36).slice(-6)}`;

/** Office room back to LOBBY with nobody ticked; clears a stale admin lockout. Returns the room. */
export async function resetOffice() {
  const admin = adminClient();
  const room = await officeRow();
  await ok(admin.rpc('admin_gate_reset'));
  await ok(admin.from('rooms').update({ phase: 'LOBBY', race_id: null }).eq('id', room.id));
  await ok(
    admin.from('room_players').update({ ticked: false, ready: false }).eq('room_id', room.id),
  );
  return room;
}

/** Unlocks the office big screen with the admin password; this page becomes the host. */
export async function unlockOfficeScreen(page: Page) {
  await page.goto('/track?code=TURF');
  await page.getByLabel('Admin password').fill(adminPassword());
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('group', { name: 'Track' })).toBeVisible();
}

/** Signs in to /admin with the admin password. */
export async function openAdmin(page: Page) {
  await page.goto('/admin');
  await page.getByLabel('Admin password').fill(adminPassword());
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
}

/** Room row by code (service role): phase and current race. */
export async function roomByCode(code: string) {
  const [room] = await ok(
    adminClient().from('rooms').select('id, phase, race_id').eq('code', code),
  );
  return room as { id: string; phase: string; race_id: string | null };
}
