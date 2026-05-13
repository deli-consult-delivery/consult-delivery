import { createClient } from "@supabase/supabase-js";

// Env vars são injetadas pelo Trigger.dev cloud em runtime, não no import.
// Não validar no topo do módulo — o worker explode no import se as vars não estiverem presentes localmente.
export const supabase = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } }
);
