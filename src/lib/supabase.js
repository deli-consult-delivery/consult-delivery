import { createClient } from '@supabase/supabase-js';

/** @typedef {import('../types/database').Database} Database */

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    'Faltam VITE_SUPABASE_URL e/ou VITE_SUPABASE_ANON_KEY no .env.local'
  );
}

/** @type {import('@supabase/supabase-js').SupabaseClient<Database>} */
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});
