import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { rpc, serve, type Body } from '../_shared/http.ts';

const RPC: Record<string, (b: Body) => [string, Record<string, unknown>]> = {
  overview: () => ['admin_overview', {}],
  weather: (b) => ['admin_set_weather', { p_on: b.on === true }],
  add: (b) => ['admin_add_member', { p_name: b.name, p_pin: b.pin }],
  rename: (b) => ['admin_rename', { p_player: b.player, p_name: b.name }],
  archive: (b) => ['admin_archive', { p_player: b.player }],
  reset_pin: (b) => ['admin_reset_pin', { p_player: b.player, p_pin: b.pin }],
  adjust: (b) => ['admin_adjust', { p_player: b.player, p_amount: b.amount, p_reason: b.reason }],
  delete_race: (b) => ['admin_delete_race', { p_race: b.race }],
};

/** Actions that sign a phone out: it is told over its room channel, since RLS now hides the room. */
const SIGNS_OUT = new Set(['archive', 'reset_pin']);

/**
 * Constant-time compare, then the DB lockout (10 misses lock this device for 10 minutes, even for
 * the right password). A wrong password also waits 1 s.
 */
async function checkPassword(admin: SupabaseClient, given: unknown, uid: string) {
  const expected = Deno.env.get('ADMIN_PASSWORD');
  if (!expected) throw new Error('admin_not_configured');
  const a = new TextEncoder().encode(typeof given === 'string' ? given : '');
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i]!;
  const gate = await rpc<string>(admin, 'admin_gate', { p_ok: diff === 0, p_uid: uid });
  if (diff !== 0) await new Promise((r) => setTimeout(r, 1000));
  if (gate !== 'ok') throw new Error(gate);
}

// /admin (spec §10): every action needs ADMIN_PASSWORD; claim_host makes the calling device the office host.
serve(async (body, _user, admin, token) => {
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error('not_signed_in');
  await checkPassword(admin, body.password, data.user.id);
  if (body.action === 'claim_host') {
    await rpc(admin, 'admin_claim_host', { p_uid: data.user.id });
    return {};
  }
  const make = typeof body.action === 'string' ? RPC[body.action] : undefined;
  if (!make) throw new Error('bad_action');
  const [fn, args] = make(body);
  const result = await rpc(admin, fn, args);
  if (SIGNS_OUT.has(body.action as string)) await tellPhone(admin, body.player);
  return result ?? {};
});

/** Best effort: the phone also finds out on its next reload. */
async function tellPhone(admin: SupabaseClient, player: unknown) {
  try {
    const { data } = await admin.from('rooms').select('id').eq('kind', 'office').single();
    if (!data) return;
    const channel = admin.channel(`room:${data.id}`);
    await channel.httpSend('signed_out', { player });
    void admin.removeChannel(channel);
  } catch {
    // ignored: see above
  }
}
