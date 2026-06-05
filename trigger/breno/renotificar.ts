import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { getSupabase } from '../_shared/supabase';

const InputSchema = z.object({
  triagem_id:    z.string().uuid(),
  tenant_id:     z.string().uuid(),
  instance_name: z.string(),
  tentativa:     z.number().int().min(1),
});

export const brenoRenotificar = task({
  id: 'breno-renotificar',
  retry: { maxAttempts: 1 },
  run: async (payload: unknown) => {
    const input = InputSchema.parse(payload);
    const sb    = getSupabase();

    const MAX_TENTATIVAS = parseInt(process.env.BRENO_RENOTIFY_MAX ?? '5');

    const { data: triagem } = await sb
      .from('breno_triagem')
      .select('confirmado, nivel, resumo, cliente_nome, categoria')
      .eq('id', input.triagem_id)
      .single();

    if (!triagem || triagem.confirmado) {
      logger.info('breno-renotificar: confirmado ou não encontrado, encerrando');
      return { renotificado: false, motivo: 'ja_confirmado' };
    }

    if (input.tentativa > MAX_TENTATIVAS) {
      logger.info('breno-renotificar: máximo de tentativas atingido', { tentativa: input.tentativa });
      return { renotificado: false, motivo: 'max_tentativas' };
    }

    const notifyNum = process.env.BRENO_NOTIFY_WHATSAPP;
    const { data: inst } = await sb
      .from('evolution_instances')
      .select('evolution_url, api_key, instance_name')
      .eq('instance_name', input.instance_name)
      .maybeSingle();

    if (!notifyNum || !inst) {
      logger.warn('breno-renotificar: configuração ausente', { notifyNum: !!notifyNum, inst: !!inst });
      return { renotificado: false, motivo: 'config_ausente' };
    }

    const emoji        = triagem.nivel === 'urgente' ? '🔴 URGENTE' : '🟡 NORMAL';
    const supabaseUrl  = process.env.SUPABASE_URL ?? '';
    const confirmarBase = `${supabaseUrl}/functions/v1/breno-confirmar?triagem_id=${input.triagem_id}`;

    const texto = [
      `⏰ Lembrete (tentativa ${input.tentativa}/${MAX_TENTATIVAS}) — aguardando sua confirmação`,
      ``,
      `${emoji} — ${triagem.cliente_nome} · ${triagem.categoria}`,
      `Resumo: ${triagem.resumo}`,
      ``,
      `Como deseja tratar?`,
      `1️⃣ Darei o suporte → ${confirmarBase}&acao=suporte`,
      `2️⃣ Tratarei amanhã → ${confirmarBase}&acao=amanha`,
      `3️⃣ Ignorar → ${confirmarBase}&acao=ignorar`,
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

    if (!sendRes.ok) {
      logger.warn('breno-renotificar: falha ao enviar', { status: sendRes.status });
      return { renotificado: false, motivo: 'envio_falhou' };
    }

    await brenoRenotificar.trigger({
      ...input,
      tentativa: input.tentativa + 1,
    }, { delay: '5m' });

    logger.info('breno-renotificar: renotificação enviada', { tentativa: input.tentativa });
    return { renotificado: true, proxima_tentativa: input.tentativa + 1 };
  },
});
