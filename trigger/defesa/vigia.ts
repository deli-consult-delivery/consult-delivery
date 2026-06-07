import { schedules, logger } from "@trigger.dev/sdk/v3";
import { getSupabase } from "../_shared/supabase";
import { notify } from "../_shared/notify";
import { defesaAnalisarCaso } from "./analisar-caso";

// =====================================================
// DEFESA — VIGIA (entrada automática + OK pelo WhatsApp)
// Cron 5 min: varre mensagens inbound do WhatsApp (Supabase é a
// fonte primária — padrão P3).
//  · Detecta cancelamento ou menção @defesa → cria caso (analisar-caso)
//  · PR5b: comandos de aprovação na MESMA conversa do caso:
//      "@defesa ok|aprovo|aprovar"      → aprova o caso pendente
//      "@defesa descartar|rejeitar"     → descarta
// NUNCA envia mensagem — apenas leitura (modelo WhatsApp preservado).
// Dedupe de criação: origem_message_id. Aprovação é idempotente
// (update com guarda status='aguardando_ok').
// =====================================================

const RE_CMD_APROVAR = /@defesa\s+(ok|aprovo|aprovar|pode\s+enviar)\b/i;
const RE_CMD_DESCARTAR = /@defesa\s+(descartar|descarta|rejeitar|rejeito|nao|não)\b/i;
const RE_MENCAO = /@defesa\b/i;
const RE_CANCEL = /(pedido\s+(foi\s+)?cancelad|cancelaram\s+o\s+pedido|cancelamento\s+(de\s+|do\s+)?pedido|golpe\s+do\s+estorno|estorno\s+indevido)/i;
const RE_AVALIACAO = /(avaliação|avaliacao|estrela|nota\s*(1|um|baixa))/i;
const RE_VALOR = /R\$\s*([\d.]+(?:,\d{2})?)/;

function extrairValorCentavos(texto: string): number {
  const m = texto.match(RE_VALOR);
  if (!m) return 0;
  const normalizado = m[1].replace(/\./g, "").replace(",", ".");
  const valor = Number(normalizado);
  return Number.isFinite(valor) ? Math.round(valor * 100) : 0;
}

export const defesaVigia = schedules.task({
  id: "defesa-vigia",
  cron: "*/5 * * * *",
  run: async () => {
    const sb = getSupabase();
    const desde = new Date(Date.now() - 15 * 60000).toISOString(); // janela 15min (overlap; dedupe garante idempotência)

    const { data: msgs, error } = await sb
      .from("messages")
      .select("id, tenant_id, conversation_id, content, body, sender_name, created_at")
      .eq("direction", "inbound")
      .is("deleted_at", null)
      .gte("created_at", desde)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(`vigia: leitura de messages falhou: ${error.message}`);

    let detectados = 0;
    let disparados = 0;
    let duplicados = 0;
    let aprovacoes = 0;
    let descartes = 0;

    for (const msg of msgs ?? []) {
      const texto = (msg.content || msg.body || "").toString();
      if (!texto || texto.length < 3) continue;

      // ---------- PR5b: comandos de aprovação/descarte ----------
      const cmdAprovar = RE_CMD_APROVAR.test(texto);
      const cmdDescartar = !cmdAprovar && RE_CMD_DESCARTAR.test(texto);
      if (cmdAprovar || cmdDescartar) {
        // caso pendente mais recente ORIGINADO nesta conversa
        const { data: caso } = await sb
          .from("defesa_casos")
          .select("id, analise, valor_centavos, tipo")
          .eq("tenant_id", msg.tenant_id)
          .eq("status", "aguardando_ok")
          .filter("analise->>origem_conversation_id", "eq", String(msg.conversation_id))
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!caso) continue;
        const novaAnalise = {
          ...(caso.analise ?? {}),
          aprovado_via: "whatsapp",
          comando_de: msg.sender_name ?? null,
          comando_message_id: String(msg.id),
        };
        const { data: upd } = await sb
          .from("defesa_casos")
          .update(cmdAprovar
            ? { status: "aprovado", aprovado_em: new Date().toISOString(), analise: novaAnalise, updated_at: new Date().toISOString() }
            : { status: "descartado", analise: novaAnalise, updated_at: new Date().toISOString() })
          .eq("id", caso.id)
          .eq("status", "aguardando_ok") // guarda: idempotente entre varreduras
          .select("id");
        if (upd && upd.length > 0) {
          if (cmdAprovar) aprovacoes++; else descartes++;
          await notify({
            tenantId: msg.tenant_id,
            kind: cmdAprovar ? "draft_approved" : "draft_rejected",
            agent: "defesa",
            title: `Caso ${cmdAprovar ? "APROVADO" : "descartado"} pelo WhatsApp (${msg.sender_name || "sem nome"})`,
            body: `${caso.tipo} · R$ ${(caso.valor_centavos / 100).toFixed(2)} — comando "@defesa ${cmdAprovar ? "ok" : "descartar"}" na conversa do caso.`,
            metadata: { caso_id: caso.id },
          });
          logger.info("VIGIA — comando processado", { caso_id: caso.id, comando: cmdAprovar ? "aprovar" : "descartar", de: msg.sender_name ?? null });
        }
        continue; // comando não vira caso novo
      }

      // ---------- entrada automática de casos ----------
      if (texto.length < 8) continue;
      const mencionado = RE_MENCAO.test(texto);
      const ehCancel = RE_CANCEL.test(texto);
      if (!mencionado && !ehCancel) continue;
      detectados++;

      // Dedupe por mensagem de origem
      const { count: jaExiste } = await sb
        .from("defesa_casos")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", msg.tenant_id)
        .filter("analise->>origem_message_id", "eq", String(msg.id));
      if ((jaExiste ?? 0) > 0) { duplicados++; continue; }

      // Identifica a conversa/loja (nome do grupo como fallback de loja)
      const { data: conv } = await sb
        .from("conversations")
        .select("id, title, group_name, is_group, whatsapp_chat_id")
        .eq("id", msg.conversation_id)
        .maybeSingle();
      let lojaId: string | undefined;
      let lojaNome: string | undefined = conv?.group_name || conv?.title || undefined;
      if (conv?.whatsapp_chat_id) {
        const { data: grupo } = await sb
          .from("whatsapp_groups")
          .select("loja_id, group_name")
          .eq("evolution_jid", conv.whatsapp_chat_id)
          .maybeSingle();
        if (grupo?.loja_id) lojaId = grupo.loja_id;
        if (!lojaNome && grupo?.group_name) lojaNome = grupo.group_name;
      }

      // Contexto: últimas 8 mensagens da conversa
      const { data: ultimas } = await sb
        .from("messages")
        .select("sender_name, content, body, direction, created_at")
        .eq("conversation_id", msg.conversation_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(8);
      const contexto = (ultimas ?? [])
        .reverse()
        .map(m => `${m.sender_name || (m.direction === "inbound" ? "cliente/loja" : "equipe")}: ${(m.content || m.body || "").toString().slice(0, 300)}`)
        .join("\n");

      const tipo: "cancelamento" | "avaliacao" = !ehCancel && RE_AVALIACAO.test(texto) ? "avaliacao" : "cancelamento";

      await defesaAnalisarCaso.trigger({
        tenant_id: msg.tenant_id,
        loja_id: lojaId,
        canal: "ifood",
        tipo,
        valor_centavos: extrairValorCentavos(texto),
        motivo: texto.slice(0, 600),
        contexto: `Detectado automaticamente pelo vigia (mensagem de ${msg.sender_name || "desconhecido"} no WhatsApp).\nConversa recente:\n${contexto}`.slice(0, 3000),
        loja_nome: lojaNome,
        origem_message_id: String(msg.id),
        origem_conversation_id: String(msg.conversation_id),
      });
      disparados++;
      logger.info("VIGIA — caso disparado", { message_id: msg.id, tipo, mencionado, loja: lojaNome ?? null });
    }

    logger.info("VIGIA — varredura concluída", { janela_msgs: (msgs ?? []).length, detectados, disparados, duplicados, aprovacoes, descartes });
    return { ok: true, mensagens_na_janela: (msgs ?? []).length, detectados, disparados, duplicados, aprovacoes, descartes };
  },
});
