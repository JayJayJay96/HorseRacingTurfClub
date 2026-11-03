import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { rpc, serve, type Body } from '../_shared/http.ts';

const RPC: Record<string, (b: Body) => [string, Record<string, unknown>]> = {
  overview: () => ['admin_overview', {}],
  add: (b) => ['admin_add_member', { p_name: b.name }],
  rename: (b) => ['admin_rename', { p_player: b.player, p_name: b.name }],
  archive: (b) => ['admin_archive', { p_player: b.player }],
  reset_pin: (b) => ['admin_reset_pin', { p_player: b.player }],
  adjust: (b) => ['admin_adjust', { p_player: b.player, p_amount: b.amount, p_reason: b.reason }],
  delete_race: (b) => ['admin_delete_race', { p_race: b.race }],
};

/**
 * Constant-time compare, then the DB lockout (10 misses lock /admin for 10 minutes, even for the
 * right password). A wrong password also waits 1 s.
 */
async function checkPassword(admin: SupabaseClient, given: unknown) {
  const expected = Deno.env.get('ADMIN_PASSWORD');
  if (!expected) throw new Error('admin_not_configured');
  const a = new TextEncoder().encode(typeof given === 'string' ? given : '');
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i]!;
  const gate = await rpc<string>(admin, 'admin_gate', { p_ok: diff === 0 });
  if (diff !== 0) await new Promise((r) => setTimeout(r, 1000));
  if (gate !== 'ok') throw new Error(gate);
}

// /admin (spec §10): every action needs ADMIN_PASSWORD; claim_host makes the calling device the office host.
serve(async (body, _user, admin, token) => {
  await checkPassword(admin, body.password);
  if (body.action === 'claim_host') {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) throw new Error('not_signed_in');
    await rpc(admin, 'admin_claim_host', { p_uid: data.user.id });
    return {};
  }
  const make = typeof body.action === 'string' ? RPC[body.action] : undefined;
  if (!make) throw new Error('bad_action');
  const [fn, args] = make(body);
  return (await rpc(admin, fn, args)) ?? {};
});
