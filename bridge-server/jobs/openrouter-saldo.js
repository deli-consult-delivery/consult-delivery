'use strict';

// B-08 (auditoria M1 / plano M2 semana 1): alerta proativo de saldo OpenRouter.
// Em 2026-05-29 os créditos zeraram e derrubaram Encerramento/Estúdio sem aviso.
// Checa o saldo a cada 6h e cria notificação no sino (internal_notifications)
// quando ficar abaixo de OPENROUTER_SALDO_MIN_USD (default 5).
//
// Requer OPENROUTER_API_KEY no .env do bridge (mesma chave já usada no Trigger.dev
// cloud). Sem a chave, o job loga aviso e fica inativo — não derruba o servidor.

const TENANT_ID    = process.env.BRIDGE_TENANT_ID || '9079bd4d-4df7-4023-90fb-d79c8ba7e900'; // tenant CD (mesmo do deli-orchestrator)
const SALDO_MIN    = Number(process.env.OPENROUTER_SALDO_MIN_USD || 5);
const INTERVALO_MS = 6 * 60 * 60 * 1000; // 6h

module.exports = function startOpenrouterSaldoJob({ sbFetch }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn('[openrouter-saldo] OPENROUTER_API_KEY ausente no .env — job INATIVO (B-08 aguardando chave)');
    return { active: false };
  }

  async function jaAlertouHoje() {
    const hoje = new Date().toISOString().slice(0, 10);
    const rows = await sbFetch(
      `internal_notifications?metadata->>source=eq.openrouter_saldo&created_at=gte.${hoje}&select=id&limit=1`
    );
    return rows.length > 0;
  }

  async function checar() {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/credits', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const { data } = await r.json();
      const saldo = (data?.total_credits ?? 0) - (data?.total_usage ?? 0);
      console.log(`[openrouter-saldo] saldo atual: $${saldo.toFixed(2)} (mínimo: $${SALDO_MIN})`);
      if (saldo >= SALDO_MIN) return;
      if (await jaAlertouHoje()) return; // máx. 1 alerta por dia

      await sbFetch('internal_notifications', {
        method: 'POST',
        body: {
          tenant_id: TENANT_ID,
          kind:      'system',
          title:     `⚠️ Saldo OpenRouter baixo: $${saldo.toFixed(2)}`,
          body:      `Saldo abaixo do mínimo de $${SALDO_MIN}. Recarregar para não derrubar Estúdio/BomDia/Encerramento (como no apagão de 29/05).`,
          link:      '/custos',
          metadata:  { source: 'openrouter_saldo', saldo_usd: Number(saldo.toFixed(2)), minimo_usd: SALDO_MIN },
        },
      });
      console.warn(`[openrouter-saldo] ALERTA criado — saldo $${saldo.toFixed(2)} < $${SALDO_MIN}`);
    } catch (err) {
      console.error('[openrouter-saldo] falha na checagem:', err.message);
    }
  }

  setTimeout(checar, 60 * 1000); // 1ª checagem 1min após o boot
  const timer = setInterval(checar, INTERVALO_MS);
  timer.unref?.();
  console.log(`[openrouter-saldo] job ativo — checagem a cada 6h, mínimo $${SALDO_MIN}`);
  return { active: true, checar };
};
