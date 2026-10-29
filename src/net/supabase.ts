import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types.ts';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (see .env.example)');
}

export const supabase = createClient<Database>(url, key);

/** Each device is an anonymous Supabase user; RLS and RPCs key off its uid. Session persists in localStorage. */
export async function ensureSignedIn(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signIn, error } = await supabase.auth.signInAnonymously();
  if (error || !signIn.user) throw error ?? new Error('Anonymous sign-in failed');
  return signIn.user.id;
}
