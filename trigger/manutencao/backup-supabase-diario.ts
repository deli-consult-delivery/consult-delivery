import { schedules, logger } from "@trigger.dev/sdk/v3";
import { gzipSync } from "node:zlib";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

const TABELAS_CRITICAS = [
  "tenants",
  "customers",
  "lojas",
  "contratos",
  "conversations",
  "messages",
  "analises",
  "tarefas_loja",
] as const;

const BUCKET = "backups";
const RETENCAO_DIAS = 30;

export const backupSupabaseDiario = schedules.task({
  id: "supabase-backup-diario",
  cron: "0 5 * * *", // 5h UTC = 2h BRT
  maxDuration: 600,
  retry: { maxAttempts: 3, minTimeoutInMs: 60_000 },

  run: async (_payload, { ctx }) => {
    const inicio = Date.now();
    const sb = getSupabase();
    const dataHoje = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const nomeArquivo = `backup_${dataHoje}.json.gz`;

    logger.info("supabase-backup-diario: iniciando", { data: dataHoje });

    // 1. Coletar dados de cada tabela crítica
    const dados: Record<string, unknown[]> = {};

    for (const tabela of TABELAS_CRITICAS) {
      const { data, error } = await sb.from(tabela).select("*");
      if (error) {
        logger.warn(`supabase-backup-diario: erro ao ler ${tabela}`, { error: error.message });
        dados[tabela] = [];
      } else {
        dados[tabela] = data ?? [];
        logger.info(`supabase-backup-diario: ${tabela} ok`, { rows: dados[tabela].length });
      }
    }

    // agent_runs: somente últimos 30 dias para limitar volume
    const cutoffAgentRuns = new Date(Date.now() - RETENCAO_DIAS * 24 * 60 * 60 * 1000).toISOString();
    const { data: agentRuns, error: arError } = await sb
      .from("agent_runs")
      .select("*")
      .gte("created_at", cutoffAgentRuns);

    if (arError) {
      logger.warn("supabase-backup-diario: erro ao ler agent_runs", { error: arError.message });
      dados["agent_runs"] = [];
    } else {
      dados["agent_runs"] = agentRuns ?? [];
      logger.info("supabase-backup-diario: agent_runs ok", { rows: dados["agent_runs"].length });
    }

    // 2. Serializar e comprimir com gzip
    const payload = {
      backup_date: dataHoje,
      generated_at: new Date().toISOString(),
      tables: dados,
    };
    const json = JSON.stringify(payload);
    const compressed = gzipSync(Buffer.from(json, "utf8"));
    const sizeKb = Math.round(compressed.length / 1024);

    logger.info("supabase-backup-diario: comprimido", { size_kb: sizeKb, size_original_kb: Math.round(json.length / 1024) });

    // 3. Upload para bucket 'backups' (upsert — idempotente em re-runs)
    const { error: uploadError } = await sb.storage
      .from(BUCKET)
      .upload(nomeArquivo, compressed, {
        contentType: "application/gzip",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Falha ao fazer upload do backup: ${uploadError.message}`);
    }

    logger.info("supabase-backup-diario: upload concluído", { arquivo: nomeArquivo });

    // 4. Reter apenas 30 dias — deletar backups antigos
    const { data: arquivos } = await sb.storage.from(BUCKET).list("", { limit: 200 });
    if (arquivos) {
      const cutoffRetencao = new Date(Date.now() - RETENCAO_DIAS * 24 * 60 * 60 * 1000);
      const parasApagar = arquivos
        .filter((f) => {
          const match = f.name.match(/^backup_(\d{4}-\d{2}-\d{2})\.json\.gz$/);
          if (!match) return false;
          return new Date(match[1]) < cutoffRetencao;
        })
        .map((f) => f.name);

      if (parasApagar.length > 0) {
        const { error: removeError } = await sb.storage.from(BUCKET).remove(parasApagar);
        if (removeError) {
          logger.warn("supabase-backup-diario: erro ao remover arquivos antigos", { error: removeError.message });
        } else {
          logger.info("supabase-backup-diario: arquivos antigos removidos", { count: parasApagar.length, files: parasApagar });
        }
      }
    }

    const duracao = Date.now() - inicio;
    const output = {
      ok: true,
      arquivo: nomeArquivo,
      size_kb: sizeKb,
      duration_ms: duracao,
      tabelas: Object.fromEntries(
        Object.entries(dados).map(([k, v]) => [k, (v as unknown[]).length])
      ),
    };

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "manutencao-backup",
      input: { data: dataHoje },
      output,
      durationMs: duracao,
      status: "success",
    });

    logger.info("supabase-backup-diario: concluído com sucesso", output);
    return output;
  },
});
