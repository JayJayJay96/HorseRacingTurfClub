import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { BoxType, RaceLength } from '../../../src/sim/types.ts';

/** What lock_odds_begin / start_race_begin return (private.race_input in SQL). */
export interface RaceInputRow {
  race_id: string;
  length: RaceLength;
  horses: string[];
  bought: Record<string, BoxType[]>;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Serves a host action. `user` carries the caller's token (RLS and host checks apply);
 * `admin` is service-role for the *_finish RPCs. Errors go back as 400 `{ error: code }`.
 */
export function serve(
  handler: (body: { room?: string }, user: SupabaseClient, admin: SupabaseClient) => Promise<unknown>,
) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    const url = Deno.env.get('SUPABASE_URL')!;
    const auth = { persistSession: false, autoRefreshToken: false };
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth,
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth });
    try {
      const body = await req.json().catch(() => ({}));
      return Response.json((await handler(body, user, admin)) ?? {}, { headers: CORS });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return Response.json({ error }, { status: 400, headers: CORS });
    }
  });
}

export async function rpc<T>(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
