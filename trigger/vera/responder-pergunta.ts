import { task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { calcularCustoUsd } from "../_shared/pricing";

// =====================================================
// SCHEMAS
// =====================================================

const InputSchema = z.object({
  tenant_id:    z.string().uuid(),
  pergunta:     z.string().min(5).max(500),
  triggered_by: z.string().uuid().optional(),
});

const OutputSchema = z.object({
  ok:          z.boolean(),
  resposta:    z.string(),
  sql_gerado:  z.string().nullable(),
  dados:       z.unknown().nullable(),
});

// Schema do SQL gerado pelo Claude
const SqlClaudeSchema = z.object({
  sql:        z.string(),
  view_alvo:  z.string(),
  justificativa: z.string(),
});

// Schema da interpretação final pelo Claude
const InterpretacaoClaudeSchema = z.object({
  resposta: z.string(),
});

type Input  = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

// Views e tabelas disponíveis para consulta VERA (READ-ONLY)
const SCHEMA_DISPONIVEL = `
Tabelas e views disponíveis para consulta VERA:

1. vera_metricas_snapshot (tenant_id, data DATE, metricas JSONB)
   - Snapshot diário de métricas por tenant
   - metricas contém: num_prospects_novos, num_conversas_novas, num_runs, custo_total_usd, cobrancas{total,pagas,valor_recuperado}
   - Use para: histórico de métricas, tendências, comparativos

2. prospects (id, tenant_id, nome, cidade, estado, segmento, status, score, avaliacao_ifood, num_avaliacoes_ifood, instagram, created_at)
   - Prospects cadastrados pela SOFIA
   - status: novo | pesquisando | qualificado | nao_qualificado | manual | abordado | respondeu | convertido

3. cora_cobrancas (id, tenant_id, customer_name, valor_atual NUMERIC, status TEXT, data_vencimento DATE, created_at)
   - Cobranças gerenciadas pela CORA
   - status: pendente | pago | atrasado | cancelado

4. conversations (id, tenant_id, contact_name, status, created_at, last_message_at)
   - Conversas do chat ao vivo

5. agent_runs (id, tenant_id, agent_id TEXT, status TEXT, cost_usd NUMERIC, duration_ms INTEGER, created_at)
   - Log de execuções de agentes IA

REGRAS DE CONSULTA:
- Sempre filtrar por tenant_id = '<tenant_id>' usando parâmetro seguro
- Usar apenas SELECT — nunca INSERT, UPDATE, DELETE, DROP, etc.
- Preferir views vera_metricas_snapshot para métricas históricas
- Limitar resultados (LIMIT 100 máximo)
`;

// =====================================================
// TASK (on-demand — sem schedule)
// =====================================================

export const veraResponderPergunta = task({
  id:    "vera-responder-pergunta",
  retry: { maxAttempts: 2, minTimeoutInMs: 2000 },

  run: async (payload: Input, { ctx }): Promise<Output> => {
    // OBRIGATÓRIO: validar input na primeira linha
    const input = InputSchema.parse(payload);
    const sb    = getSupabase();

    logger.info("vera-responder-pergunta iniciado", {
      tenant_id: input.tenant_id,
      pergunta:  input.pergunta.slice(0, 100),
    });

    try {
      // Instanciação dentro do run() — anti-padrão #4 evitado
      const anthropic = new Anthropic();

      // 1. Claude gera SQL SELECT que responde à pergunta
      logger.info("vera-responder-pergunta: gerando SQL com Claude");

      const sqlSystemPrompt = `Você é VERA, analista de BI da Consult Delivery.
Sua função é gerar queries SQL SELECT seguras para responder perguntas de negócio.
Você tem acesso APENAS às tabelas listadas no schema.
NUNCA gere INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT ou REVOKE.
Sempre filtre por tenant_id.
Retorne APENAS JSON válido.`;

      const sqlUserPrompt = `${SCHEMA_DISPONIVEL}

Tenant ID: ${input.tenant_id}

Pergunta do usuário: "${input.pergunta}"

Gere uma query SQL SELECT que responda a pergunta. Use apenas as tabelas disponíveis.
Se a pergunta não puder ser respondida pelas tabelas disponíveis, use vera_metricas_snapshot com os dados de metricas JSONB.

Retorne APENAS JSON:
{
  "sql": "SELECT ... FROM ... WHERE tenant_id = '${input.tenant_id}' ...",
  "view_alvo": "nome_da_tabela_ou_view_principal",
  "justificativa": "por que esta query responde a pergunta"
}`;

      const sqlResponse = await anthropic.messages.create({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 800,
        system:     sqlSystemPrompt,
        messages:   [{ role: "user", content: sqlUserPrompt }],
      });

      const sqlCostUsd = calcularCustoUsd("claude-haiku-4-5-20251001", sqlResponse.usage);

      const sqlRawText = sqlResponse.content
        .filter((b) => b.type === "text")
        .map((b) => (b as Anthropic.TextBlock).text)
        .join("");

      let sqlResult: z.infer<typeof SqlClaudeSchema>;
      try {
        const matchSql = sqlRawText.match(/\{[\s\S]*\}/);
        sqlResult = SqlClaudeSchema.parse(JSON.parse(matchSql ? matchSql[0] : sqlRawText));
      } catch {
        // Fallback: consulta snapshots diretamente
        logger.warn("vera-responder-pergunta: Claude não gerou SQL válido, usando fallback snapshot");
        sqlResult = {
          sql:           `SELECT data, metricas FROM vera_metricas_snapshot WHERE tenant_id = '${input.tenant_id}' ORDER BY data DESC LIMIT 7`,
          view_alvo:     "vera_metricas_snapshot",
          justificativa: "Fallback: consultando snapshots recentes para contexto geral",
        };
      }

      // 2. VALIDAÇÃO OBRIGATÓRIA do SQL gerado — VERA é READ-ONLY
      const sqlLower   = sqlResult.sql.toLowerCase().trim();
      const permitido  = sqlLower.startsWith("select");
      const palavrasProibidas = [
        "drop", "delete", "update", "insert", "truncate",
        "alter", "create", "grant", "revoke",
      ];
      const bloqueado = palavrasProibidas.some((kw) => sqlLower.includes(kw));

      if (!permitido || bloqueado) {
        throw new Error(
          `SQL gerado inválido: apenas SELECT é permitido. SQL recebido: ${sqlResult.sql.slice(0, 100)}`
        );
      }

      // Validação adicional: tenant_id deve aparecer no SQL (proteção multi-tenant)
      if (!sqlLower.includes(input.tenant_id.toLowerCase())) {
        throw new Error(
          `SQL gerado não filtra por tenant_id. Abortado por segurança multi-tenant.`
        );
      }

      logger.info("vera-responder-pergunta: SQL validado", {
        view_alvo: sqlResult.view_alvo,
        sql:       sqlResult.sql.slice(0, 150),
      });

      // 3. Executa a query via Supabase nas views/tabelas VERA
      // Em vez de SQL arbitrário, mapeamos para queries estruturadas nas views disponíveis
      let dados: unknown = null;
      let sqlEfetivo     = sqlResult.sql;

      try {
        dados = await executarQueryEstruturada(sb, sqlResult.view_alvo, input.tenant_id, sqlResult.sql);
      } catch (queryError) {
        // Se a query falhar, usa snapshots como fallback
        logger.warn("vera-responder-pergunta: query falhou, usando snapshots como fallback", {
          error: (queryError as Error).message,
        });

        const { data: snapshots } = await sb
          .from("vera_metricas_snapshot")
          .select("data, metricas")
          .eq("tenant_id", input.tenant_id)
          .order("data", { ascending: false })
          .limit(7);

        dados = snapshots ?? [];
        sqlEfetivo = `SELECT data, metricas FROM vera_metricas_snapshot WHERE tenant_id = '${input.tenant_id}' ORDER BY data DESC LIMIT 7 (fallback)`;
      }

      logger.info("vera-responder-pergunta: dados obtidos, interpretando com Claude");

      // 4. Claude interpreta os dados e gera resposta em linguagem natural
      const interpretacaoSystemPrompt = `Você é VERA, analista de BI da Consult Delivery.
Interprete os dados retornados e responda a pergunta do usuário em português brasileiro.
Seja concisa, clara e acionável. Foque no insight, não nos dados brutos.
Retorne APENAS JSON válido.`;

      const interpretacaoUserPrompt = `Pergunta do usuário: "${input.pergunta}"

Dados retornados pela query:
${JSON.stringify(dados, null, 2)}

Responda a pergunta em linguagem natural, usando os dados acima como base.
Se os dados não respondem diretamente, informe o que está disponível e o que significa.
Seja objetivo (2-4 frases por padrão, mais se necessário para ser útil).

Retorne APENAS JSON:
{
  "resposta": "resposta em linguagem natural aqui"
}`;

      const interpResponse = await anthropic.messages.create({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system:     interpretacaoSystemPrompt,
        messages:   [{ role: "user", content: interpretacaoUserPrompt }],
      });

      const interpCostUsd = calcularCustoUsd("claude-haiku-4-5-20251001", interpResponse.usage);

      const interpRawText = interpResponse.content
        .filter((b) => b.type === "text")
        .map((b) => (b as Anthropic.TextBlock).text)
        .join("");

      let resposta: string;
      try {
        const matchInterp = interpRawText.match(/\{[\s\S]*\}/);
        const parsedInterp = InterpretacaoClaudeSchema.parse(
          JSON.parse(matchInterp ? matchInterp[0] : interpRawText)
        );
        resposta = parsedInterp.resposta;
      } catch {
        // Fallback: usa o texto bruto do Claude como resposta
        resposta = interpRawText.replace(/```[a-z]*\n?/g, "").replace(/```/g, "").trim()
          || "Não foi possível interpretar os dados automaticamente. Consulte os snapshots disponíveis.";
      }

      logger.info("vera-responder-pergunta concluído", {
        tenant_id: input.tenant_id,
        resposta:  resposta.slice(0, 100),
      });

      const output = OutputSchema.parse({
        ok:         true,
        resposta,
        sql_gerado: sqlEfetivo,
        dados,
      });

      const costUsd = (sqlCostUsd ?? 0) + (interpCostUsd ?? 0);

      // OBRIGATÓRIO: audit log (sucesso)
      await logAgentRun({
        runId:       ctx.run.id,
        agentSlug:   "vera",
        tenantId:    input.tenant_id,
        triggeredBy: input.triggered_by,
        input,
        output: { ok: true, resposta: resposta.slice(0, 200) },
        costUsd,
        status:      "success",
      });

      return output;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error("vera-responder-pergunta falhou", {
        tenant_id: input.tenant_id,
        error:     errorMessage,
      });

      // OBRIGATÓRIO: audit log (falha)
      await logAgentRun({
        runId:       ctx.run.id,
        agentSlug:   "vera",
        tenantId:    input.tenant_id,
        triggeredBy: input.triggered_by,
        input,
        output:      { error: errorMessage },
        status:      "failed",
      });

      throw error;
    }
  },
});

// =====================================================
// HELPER — executa query estruturada nas views VERA
// Em vez de SQL arbitrário, mapeia para queries Supabase
// usando as views/tabelas disponíveis de forma segura.
// =====================================================

async function executarQueryEstruturada(
  sb: ReturnType<typeof import("../_shared/supabase").getSupabase>,
  viewAlvo: string,
  tenantId: string,
  sqlGerado: string
): Promise<unknown> {
  // Mapeamento de views para queries Supabase estruturadas
  const viewsPermitidas: Record<string, () => Promise<unknown>> = {
    vera_metricas_snapshot: async () => {
      const { data, error } = await sb
        .from("vera_metricas_snapshot")
        .select("data, metricas")
        .eq("tenant_id", tenantId)
        .order("data", { ascending: false })
        .limit(30);
      if (error) throw new Error(error.message);
      return data;
    },
    prospects: async () => {
      const { data, error } = await sb
        .from("prospects")
        .select("id, nome, cidade, estado, segmento, status, score, avaliacao_ifood, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return data;
    },
    cora_cobrancas: async () => {
      const { data, error } = await sb
        .from("cora_cobrancas")
        .select("id, customer_name, valor_atual, status, data_vencimento, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return data;
    },
    conversations: async () => {
      const { data, error } = await sb
        .from("conversations")
        .select("id, contact_name, status, created_at, last_message_at")
        .eq("tenant_id", tenantId)
        .order("last_message_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return data;
    },
    agent_runs: async () => {
      const { data, error } = await sb
        .from("agent_runs")
        .select("id, agent_id, status, cost_usd, duration_ms, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return data;
    },
  };

  // Tenta encontrar a view mapeada
  const queryFn = viewsPermitidas[viewAlvo];
  if (queryFn) {
    return queryFn();
  }

  // Se a view não está no mapa, tenta identificar pelo SQL gerado
  for (const [viewNome, fn] of Object.entries(viewsPermitidas)) {
    if (sqlGerado.toLowerCase().includes(viewNome.replace(/_/g, "_"))) {
      return fn();
    }
  }

  // Fallback final: snapshots
  return viewsPermitidas.vera_metricas_snapshot();
}
