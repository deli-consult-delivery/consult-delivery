import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy singleton: createClient só é chamado quando getSupabase() é invocado
// dentro de uma task (runtime). Nunca no import — evita crash do worker local.
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios para tasks Trigger.dev"
      );
    }
    _client = createClient(url, key, { auth: { persistSession: false } });
  }
  return _client;
}
