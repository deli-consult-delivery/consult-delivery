/**
 * G05.1 — Lista clientes para re-contratação
 * Executar: npx tsx scripts/recontratacao-list.ts > scripts/output/recontratacao-2026-05-25.csv
 * Requer: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no env (ou bridge-server/.env)
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

for (const envFile of ['../.env', '../bridge-server/.env']) {
  try {
    const content = readFileSync(join(__dirname, envFile), 'utf-8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch { /* sem arquivo */ }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Requer SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const SB_HEADERS = { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY}` };

async function sbFetch(path: string): Promise<any[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SB_HEADERS });
  if (!r.ok) {
    process.stderr.write(`warn: GET ${path} → ${r.status}: ${await r.text()}\n`);
    return [];
  }
  return r.json();
}

function normalizePhone(p: string | null | undefined): string {
  if (!p) return '';
  return p.replace(/\D/g, '');
}

async function main() {
  // 1. Todos os customers
  const customers: any[] = await sbFetch(
    'customers?select=id,tenant_id,name,phone_normalized,phone,status&limit=5000'
  );
  if (!customers.length) { process.stderr.write('Nenhum customer\n'); process.exit(0); }

  // 2. JID via conversations — match por customer_id (se existir) ou por phone
  const convRows: any[] = await sbFetch(
    'conversations?select=customer_id,whatsapp_chat_id,push_name&is_group=eq.false&whatsapp_chat_id=not.is.null&limit=5000'
  );

  // Mapa customer_id → JID (link direto)
  const jidByCustomerId: Record<string, string> = {};
  // Mapa phone_digits → JID (fallback por número)
  const jidByPhone: Record<string, string> = {};
  for (const c of convRows) {
    const jid = c.whatsapp_chat_id as string;
    const numPart = jid.split('@')[0]; // ex: "5521970447080"
    if (c.customer_id) jidByCustomerId[c.customer_id] = jid;
    if (numPart) jidByPhone[numPart] = jid;
    // Também indexar últimos 8 e 10 dígitos para match parcial
    if (numPart.length >= 8) jidByPhone[numPart.slice(-8)] = jid;
    if (numPart.length >= 10) jidByPhone[numPart.slice(-10)] = jid;
  }

  // 3. Contratos
  const contratos: any[] = await sbFetch('contratos?select=customer_id,pacote,status&limit=5000');
  const contratoMap: Record<string, { pacote: string; status: string }> = {};
  for (const c of contratos) contratoMap[c.customer_id] = { pacote: c.pacote, status: c.status };

  // 4. Aceites já enviados
  const aceites: any[] = await sbFetch(
    'aceite_recontratacao?select=customer_id,status,mensagem_enviada_em&limit=5000'
  );
  const aceiteMap: Record<string, { status: string; enviada_em: string | null }> = {};
  for (const a of aceites) aceiteMap[a.customer_id] = { status: a.status, enviada_em: a.mensagem_enviada_em };

  // 5. Montar JID por customer (por id → por phone completo → por sufixo)
  function resolveJid(c: any): string {
    if (jidByCustomerId[c.id]) return jidByCustomerId[c.id];
    const phones = [c.phone_normalized, c.phone].map(normalizePhone).filter(Boolean);
    for (const p of phones) {
      if (jidByPhone[p]) return jidByPhone[p];
      if (p.length >= 8 && jidByPhone[p.slice(-8)]) return jidByPhone[p.slice(-8)];
      if (p.length >= 10 && jidByPhone[p.slice(-10)]) return jidByPhone[p.slice(-10)];
    }
    return phones[0] ?? ''; // fallback: número bruto sem JID
  }

  // 6. CSV
  const lines = ['customer_id,nome,whatsapp_jid,pacote_contrato,status_contrato,oferta_enviada,status_aceite'];
  let comJid = 0;
  for (const c of customers) {
    const jid    = resolveJid(c);
    const cont   = contratoMap[c.id];
    const aceite = aceiteMap[c.id];
    const nome   = String(c.name ?? '').replace(/"/g, '""');
    if (jid.includes('@')) comJid++;
    lines.push([
      c.id,
      `"${nome}"`,
      `"${jid}"`,
      `"${cont?.pacote ?? ''}"`,
      `"${cont?.status ?? ''}"`,
      aceite?.enviada_em ? 'sim' : 'nao',
      `"${aceite?.status ?? ''}"`,
    ].join(','));
  }

  process.stdout.write(lines.join('\n') + '\n');
  process.stderr.write(
    `\n✓ ${customers.length} clientes | ${comJid} com JID @WA | ${Object.keys(contratoMap).length} com contrato\n`
  );
}

main().catch(err => { console.error(err); process.exit(1); });
