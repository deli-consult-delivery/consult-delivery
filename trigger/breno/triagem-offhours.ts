import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { getSupabase } from '../_shared/supabase';
import { logAgentRun } from '../_shared/audit';
import { chat } from '../agents/llm-client';

const InputSchema = z.object({
  tenant_id:    z.string().uuid(),
  instance_name: z.string(),
  remote_jid:   z.string(),
  push_name:    z.string().optional(),
  message_text: z.string(),
  message_id:   z.string().optional(),
  fence_at:     z.string().optional(),
});

const ClassSchema = z.object({
  nivel:          z.enum(['urgente', 'normal', 'ignorar']),
  resumo:         z.string(),
  cliente_nome:   z.string(),
  cliente_numero: z.string(),
  loja:           z.string().nullable(),
  categoria:      z.enum(['suporte', 'demanda', 'venda', 'duvida', 'outro']),
  confianca:      z.number(),
});

const TRIAGE_SYSTEM_PROMPT = `
Você é BRENO, triador de demandas fora do expediente da Consult Delivery.
Classifique a mensagem e responda APENAS com JSON válido no formato:
{
  "nivel": "urgente | normal | ignorar",
  "resumo": "1-2 frases",
  "cliente_nome": "...",
  "cliente_numero": "+55...",
  "loja": "nome da loja ou null",
  "categoria": "suporte | demanda | venda | duvida | outro",
  "confianca": 0.0-1.0
}

URGENTE: sistema parado, cliente sem acesso/login, demanda contratada não entregue, produto/preço errado gerando prejuízo, integração caída.
NORMAL: quer contratar serviço (lead), dúvida não-crítica, pedido de demanda, agendamento.
IGNORAR: "oi", "bom dia", figurinha, "ok", áudio sem contexto, spam.
`.trim();

export const brenoTriagemOffhours = task({
  id: 'breno-triagem-offhours',
  retry: { maxAttempts: 3 },

  run: async (payload: unknown, { ctx }) => {
    const input = InputSchema.parse(payload);
    const sb    = getSupabase();
    const start = Date.now();

    // Effective text/name — overridden by buffer when multiple messages arrive
    let effectiveText     = input.message_text;
    let effectivePushName = input.push_name;

    // Debounce: abort if a newer message arrived after this trigger was scheduled
    if (input.fence_at) {
      const { data: buf } = await sb
        .from('breno_message_buffer')
        .select('buffered_messages, last_message_at, push_name')
        .eq('tenant_id', input.tenant_id)
        .eq('remote_jid', input.remote_jid)
        .maybeSingle();

      if (buf && buf.last_message_at > input.fence_at) {
        logger.info('breno-triagem-offhours: stale — nova mensagem chegou, abortando', {
          fence_at:        input.fence_at,
          last_message_at: buf.last_message_at,
        });
        return { triagem_id: null, nivel: 'ignorar', categoria: 'outro', confianca: 0, notificado: false };
      }

      if (buf?.buffered_messages?.length) {
        const texts = (buf.buffered_messages as Array<{ text: string }>)
          .map(m => m.text)
          .filter(Boolean)
          .join('\n');
        if (texts) effectiveText = texts;
        if (buf.push_name) effectivePushName = buf.push_name;
      }
    }

    logger.info('breno-triagem-offhours: início', {
      tenant_id:     input.tenant_id,
      remote_jid:    input.remote_jid,
      instance_name: input.instance_name,
    });

    // 1. Origem (grupo vs PV)
    const origem = input.remote_jid.endsWith('@g.us') ? 'grupo' : 'pv';

    // 2. Resolver identidade: remote_jid → loja_id
    const { data: vinculo } = await sb
      .from('loja_whatsapp_vinculo')
      .select('loja_id')
      .eq('tenant_id', input.tenant_id)
      .eq('remote_jid', input.remote_jid)
      .maybeSingle();

    const lojaId: string | null = vinculo?.loja_id ?? null;

    // 3. Resolver nome/número do cliente
    const phone       = input.remote_jid.split('@')[0];
    let clienteNome   = phone; // fallback: número
    let clienteNumero = `+${phone}`;

    if (lojaId) {
      const { data: loja } = await sb
        .from('lojas')
        .select('nome, client_id')
        .eq('id', lojaId)
        .maybeSingle();

      if (loja?.client_id) {
        const { data: cust } = await sb
          .from('customers')
          .select('name, phone')
          .eq('id', loja.client_id)
          .maybeSingle();
        if (cust?.name)  clienteNome   = cust.name;
        if (cust?.phone) clienteNumero = cust.phone;
      }
    }

    // push_name do WhatsApp sempre vence o nome do DB
    if (effectivePushName) clienteNome = effectivePushName;

    // 4. Classificar via LLM (llm-client.ts — nunca @anthropic-ai/claude-agent-sdk)
    const minConfianca = parseFloat(process.env.BRENO_CONFIANCA_MINIMA || '0.6');

    let classificacao: z.infer<typeof ClassSchema>;
    try {
      const resp = await chat([
        { role: 'system', content: TRIAGE_SYSTEM_PROMPT },
        { role: 'user',   content: `Cliente: ${clienteNome} (${clienteNumero})\nMensagem: ${effectiveText}` },
      ]);

      const raw = JSON.parse(resp.content);
      classificacao = ClassSchema.parse(raw);

      // Confiança abaixo do limiar com nivel=ignorar → elevar para normal
      if (classificacao.confianca < minConfianca && classificacao.nivel === 'ignorar') {
        classificacao.nivel = 'normal';
      }
    } catch (e) {
      logger.warn('breno-triagem-offhours: falha na classificação LLM, usando fallback', {
        error: (e as Error).message,
      });
      classificacao = {
        nivel:          'normal',
        resumo:         input.message_text.slice(0, 200),
        cliente_nome:   clienteNome,
        cliente_numero: clienteNumero,
        loja:           null,
        categoria:      'outro',
        confianca:      0,
      };
    }

    // 5. Persistir na tabela breno_triagem
    const { data: row, error: insertErr } = await sb
      .from('breno_triagem')
      .insert({
        tenant_id:      input.tenant_id,
        origem,
        remote_jid:     input.remote_jid,
        cliente_nome:   classificacao.cliente_nome,
        cliente_numero: classificacao.cliente_numero,
        loja_id:        lojaId,
        nivel:          classificacao.nivel,
        categoria:      classificacao.categoria,
        resumo:         classificacao.resumo,
        mensagem_raw:   effectiveText,
        confianca:      classificacao.confianca,
      })
      .select('id')
      .single();

    if (insertErr) {
      throw new Error(`breno_triagem insert falhou: ${insertErr.message}`);
    }

    logger.info('breno-triagem-offhours: triagem persistida', {
      triagem_id: row.id,
      nivel:      classificacao.nivel,
    });

    // 6. Notificar CEO via WhatsApp PV (urgente e normal; ignorar = só log)
    let notificado = false;
    if (classificacao.nivel !== 'ignorar') {
      const notifyNum = process.env.BRENO_NOTIFY_WHATSAPP;
      if (!notifyNum) {
        logger.warn('breno-triagem-offhours: BRENO_NOTIFY_WHATSAPP não configurado — sem notificação');
      } else {
        // Buscar instância Evolution pelo instance_name
        const { data: inst } = await sb
          .from('evolution_instances')
          .select('evolution_url, api_key, instance_name')
          .eq('instance_name', input.instance_name)
          .maybeSingle();

        if (!inst) {
          logger.warn('breno-triagem-offhours: instância Evolution não encontrada', {
            instance_name: input.instance_name,
          });
        } else {
          const emoji = classificacao.nivel === 'urgente' ? '🔴 URGENTE' : '🟡 NORMAL';
          const hora  = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Belem',
            hour:     '2-digit',
            minute:   '2-digit',
          }).format(new Date());

          const texto = [
            `${emoji} — Demanda fora do expediente`,
            `Cliente: ${classificacao.cliente_nome}`,
            `Número: ${classificacao.cliente_numero}`,
            `Loja: ${classificacao.loja ?? 'não identificada'}`,
            `Categoria: ${classificacao.categoria}`,
            ``,
            `Resumo: ${classificacao.resumo}`,
            ``,
            `Recebido: ${hora} (Belém) · responder pelo número de suporte`,
          ].join('\n');

          const sendRes = await fetch(
            `${inst.evolution_url}/message/sendText/${inst.instance_name}`,
            {
              method:  'POST',
              headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
              body:    JSON.stringify({ number: notifyNum, text: texto }),
              signal:  AbortSignal.timeout(10_000),
            },
          );

          if (sendRes.ok) {
            notificado = true;
            await sb
              .from('breno_triagem')
              .update({ notificado: true, notificado_em: new Date().toISOString() })
              .eq('id', row.id);

            logger.info('breno-triagem-offhours: CEO notificado', {
              nivel:       classificacao.nivel,
              notify_num:  notifyNum,
            });
          } else {
            logger.warn('breno-triagem-offhours: falha ao notificar CEO via WhatsApp', {
              status: sendRes.status,
            });
          }
        }
      }
    }

    // Limpa buffer desta conversa após triagem processada com sucesso
    if (input.fence_at) {
      await sb
        .from('breno_message_buffer')
        .delete()
        .eq('tenant_id', input.tenant_id)
        .eq('remote_jid', input.remote_jid);
    }

    const output = {
      triagem_id:    row.id,
      nivel:         classificacao.nivel,
      categoria:     classificacao.categoria,
      confianca:     classificacao.confianca,
      notificado,
    };

    await logAgentRun({
      runId:       ctx.run.id,
      agentSlug:   'breno',
      tenantId:    input.tenant_id,
      input,
      output,
      durationMs:  Date.now() - start,
      status:      'success',
    });

    return output;
  },
});
