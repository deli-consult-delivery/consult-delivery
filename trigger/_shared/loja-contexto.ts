import { getSupabase } from "./supabase";

export interface LojaInfo {
  nome: string;
  segmento: string | null;
  cidade: string | null;
  posicionamento: string | null;
  status: string;
  ticket_medio: number | null;
}

export interface UltimaMetrica {
  data: string;
  pedidos_30d: number | null;
  pedidos_90d: number | null;
  nota_media: number | null;
  taxa_cancelamento: number | null;
  taxa_chamados: number | null;
  tempo_preparo_min: number | null;
  ticket_medio: number | null;
  posicao_categoria: string | null;
}

export interface Memoria {
  kind: string;
  content: string;
  importance: number;
  created_at: string;
}

export interface Consultor {
  user_id: string;
  email: string;
  nome: string;
}

export interface LojaContexto {
  loja: LojaInfo;
  ultima_metrica: UltimaMetrica | null;
  tarefas_em_aberto: Record<string, number>;
  memorias: Memoria[];
  consultores: Consultor[];
}

// Max chars por item de memória (~200 tokens) e total (~1500 tokens)
const MAX_CHARS_PER_MEMORY = 800;
const MAX_CHARS_MEMORIAS_TOTAL = 6000;

function truncateMemories(memorias: Memoria[]): Memoria[] {
  let total = 0;
  const result: Memoria[] = [];
  for (const m of memorias) {
    const content =
      m.content.length > MAX_CHARS_PER_MEMORY
        ? m.content.slice(0, MAX_CHARS_PER_MEMORY) + "…"
        : m.content;
    if (total + content.length > MAX_CHARS_MEMORIAS_TOTAL) break;
    total += content.length;
    result.push({ ...m, content });
  }
  return result;
}

export async function buildLojaContexto(loja_id: string): Promise<LojaContexto> {
  const sb = getSupabase();

  const { data: lojaRow, error: lojaError } = await sb
    .from("lojas")
    .select("id, tenant_id, nome, segmento, cidade, posicionamento, status, ticket_medio")
    .eq("id", loja_id)
    .single();

  if (lojaError || !lojaRow) {
    throw new Error(`Loja não encontrada: ${loja_id}`);
  }

  const now = new Date().toISOString();

  const [metricaResult, tarefasResult, memoriasResult, consultores] = await Promise.all([
    sb
      .from("loja_metricas_snapshot")
      .select(
        "data, pedidos_30d, pedidos_90d, nota_media, taxa_cancelamento, taxa_chamados, tempo_preparo_min, ticket_medio, posicao_categoria"
      )
      .eq("loja_id", loja_id)
      .order("data", { ascending: false })
      .limit(1)
      .maybeSingle(),

    sb
      .from("tarefas_loja")
      .select("status")
      .eq("loja_id", loja_id)
      .not("status", "in", '("concluida","cancelada")'),

    // v1: filtra por tenant_id (agent_memories não tem loja_id).
    // Memórias são compartilhadas por tenant — decisão explícita de Wandson em 2026-05-20.
    // Reverter em v2 se agent_memories receber coluna loja_id via migration.
    sb
      .from("agent_memories")
      .select("kind, content, importance, created_at")
      .eq("tenant_id", lojaRow.tenant_id)
      .gte("importance", 5)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20),

    (async (): Promise<Consultor[]> => {
      const { data: membersData, error: membersError } = await sb
        .from("tenant_members")
        .select("user_id")
        .eq("tenant_id", lojaRow.tenant_id);

      if (membersError) {
        throw new Error(`Erro ao buscar tenant_members: ${membersError.message}`);
      }

      const userIds = (membersData ?? []).map((m) => m.user_id as string);
      if (userIds.length === 0) return [];

      const { data: authData, error: authError } = await sb.auth.admin.listUsers({
        perPage: 200,
      });

      if (authError) {
        throw new Error(`Erro ao buscar auth.users: ${authError.message}`);
      }

      return (authData?.users ?? [])
        .filter((u) => userIds.includes(u.id))
        .map((u) => ({
          user_id: u.id,
          email: u.email ?? "",
          nome:
            (u.user_metadata?.full_name as string | undefined) ??
            u.email ??
            u.id,
        }));
    })(),
  ]);

  if (metricaResult.error) {
    throw new Error(`Erro ao buscar métricas: ${metricaResult.error.message}`);
  }
  if (tarefasResult.error) {
    throw new Error(`Erro ao buscar tarefas: ${tarefasResult.error.message}`);
  }
  if (memoriasResult.error) {
    throw new Error(`Erro ao buscar memórias: ${memoriasResult.error.message}`);
  }

  const tarefas_em_aberto: Record<string, number> = {};
  for (const t of tarefasResult.data ?? []) {
    tarefas_em_aberto[t.status] = (tarefas_em_aberto[t.status] ?? 0) + 1;
  }

  const memoriasBruto: Memoria[] = (memoriasResult.data ?? []).map((m) => ({
    kind: m.kind,
    content: m.content,
    importance: m.importance,
    created_at: m.created_at,
  }));

  return {
    loja: {
      nome: lojaRow.nome,
      segmento: lojaRow.segmento,
      cidade: lojaRow.cidade,
      posicionamento: lojaRow.posicionamento,
      status: lojaRow.status,
      ticket_medio: lojaRow.ticket_medio,
    },
    ultima_metrica: metricaResult.data ?? null,
    tarefas_em_aberto,
    memorias: truncateMemories(memoriasBruto),
    consultores,
  };
}
