import { execSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Reads URL and keys of the running local stack (`npx supabase start`). */
function localEnv(): Record<string, string> {
  const out = execSync('npx supabase status -o env', { encoding: 'utf8' });
  const env: Record<string, string> = {};
  for (const line of out.split(/\r?\n/)) {
    const m = /^(\w+)="?(.*?)"?$/.exec(line.trim());
    if (m) env[m[1]!] = m[2]!;
  }
  return env;
}

const env = localEnv();
const URL = env.API_URL;
const ANON_KEY = env.ANON_KEY;
const SERVICE_KEY = env.SERVICE_ROLE_KEY;
if (!URL || !ANON_KEY || !SERVICE_KEY) {
  throw new Error(`Is the local stack running? supabase status gave: ${Object.keys(env).join(', ')}`);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

/** A device that has not signed in. */
export const guestClient = (): SupabaseClient => createClient(URL, ANON_KEY, opts);

/** A fresh anonymous user (one per simulated device). */
export async function anonClient(): Promise<SupabaseClient> {
  const client = guestClient();
  const { error } = await client.auth.signInAnonymously();
  if (error) throw error;
  return client;
}

/** Bypasses RLS. Test setup only. */
export const adminClient = (): SupabaseClient => createClient(URL, SERVICE_KEY, opts);

type Res<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;

/** Returns data or throws the error message (our RPC error code). */
export async function ok<T>(call: Res<T>): Promise<T> {
  const { data, error } = await call;
  if (error) throw new Error(error.message);
  return data as T;
}

/** Returns the error message of a call that must fail. */
export async function fails(call: Res<unknown>): Promise<string> {
  const { error } = await call;
  if (!error) throw new Error('expected the call to fail');
  return error.message;
}
