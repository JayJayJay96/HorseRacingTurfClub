import { describe, expect, it } from 'vitest';
import { anonClient } from './helpers.ts';

describe('local supabase', () => {
  it('signs a device in anonymously', async () => {
    const db = await anonClient();
    const { data } = await db.auth.getUser();
    expect(data.user?.is_anonymous).toBe(true);
  });
});
