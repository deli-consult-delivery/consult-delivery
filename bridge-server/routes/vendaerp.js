// bridge-server/routes/vendaerp.js
// Endpoints de LEITURA e ESCRITA do VendaERP. Ponto único de contato com o ERP:
//   Console v2 (JWT do usuário) e Hermes (x-internal-token) chamam aqui;
//   o Bridge injeta a credencial (3 headers) via lib/vendaerp.js.
//
// Auth: requireJwtOrInternal — aceita JWT do Console OU x-internal-token do Hermes.
// Fase 1 = GET (leitura). Fase 2 = POST (escrita, gated + confirmação no Telegram).
'use strict';

module.exports = function ({ requireJwtOrInternal, erp }) {
  const router = require('express').Router();

  // Wrapper: executa um método do ERP (leitura ou escrita) e devolve JSON padronizado.
  // Erros viram { ok:false, status, error, details } sem derrubar o Bridge.
  // `details` carrega o corpo de erro do próprio ERP (VendaErpApiError.body) — sem ele
  // o cliente só via "retornou 400: Bad Request", perdendo a regra de negócio real
  // (ex.: "O cliente informado não foi encontrado. Informe um responsável."). É o que
  // torna o write-live-smoke um artefato de evidência útil em vez de um 400 opaco.
  function handle(fn) {
    return async (req, res) => {
      try {
        const data = await fn(req);
        res.json({ ok: true, data });
      } catch (err) {
        const status = err && typeof err.status === 'number' && err.status >= 400 ? err.status : 502;
        console.error(`[vendaerp] ${req.path} erro ${err.status ?? '?'}: ${err.message}`, err.body ?? '');
        res.status(status).json({
          ok: false,
          status: err.status ?? null,
          error: err.message,
          details: err.body ?? null,
        });
      }
    };
  }

  // Fase 1 = 1 credencial no env do Bridge. O tenant_id da query é IGNORADO de
  // propósito: aceitá-lo agora seria uma superfície cross-tenant sem checagem de
  // membership. Fase 3 (multi-tenant) reintroduz isto via assertTenantMember(req)
  // — só então a credencial passa a ser resolvida por tenant em vendaerp_instances.
  const tid = () => undefined;

  // ── Status — chamada barata p/ validar credencial ───────────────────────────
  router.get('/vendaerp/status', requireJwtOrInternal, handle(async (req) => {
    const empresas = await erp.getEmpresas(tid(req));
    const lista = Array.isArray(empresas) ? empresas : (empresas?.empresas ?? empresas?.data ?? []);
    const primeira = Array.isArray(lista) ? lista[0] : null;
    return {
      conectado: true,
      total_empresas: Array.isArray(lista) ? lista.length : null,
      empresa:
        primeira?.NomeFantasia ?? primeira?.RazaoSocial ?? primeira?.Empresa ??
        primeira?.nome ?? primeira?.razaoSocial ?? primeira?.fantasia ?? null,
    };
  }));

  // ── Contratos ───────────────────────────────────────────────────────────────
  router.get('/vendaerp/contratos', requireJwtOrInternal, handle((req) => {
    const { codigo, cliente, situacao, pageSize, skip } = req.query;
    if (codigo || cliente || situacao) {
      return erp.pesquisarContratos({ codigo, cliente, situacao }, tid(req));
    }
    return erp.listContratos({ pageSize: num(pageSize, 20, 1), skip: num(skip, 0) }, tid(req));
  }));

  // ── Financeiro — lançamentos e boletos ──────────────────────────────────────
  router.get('/vendaerp/lancamentos', requireJwtOrInternal, handle((req) => {
    const { codigo, pageSize, skip } = req.query;
    if (codigo) return erp.getLancamento({ codigo }, tid(req));
    return erp.listLancamentos({ pageSize: num(pageSize, 20, 1), skip: num(skip, 0) }, tid(req));
  }));
  router.get('/vendaerp/boletos', requireJwtOrInternal, handle((req) => {
    const { codigo, cliente } = req.query;
    return erp.pesquisarBoletos({ codigo, cliente }, tid(req));
  }));

  // ── Estoque ─────────────────────────────────────────────────────────────────
  router.get('/vendaerp/estoque', requireJwtOrInternal, handle((req) =>
    erp.getEstoque({ deposito: req.query.deposito }, tid(req))
  ));
  router.get('/vendaerp/depositos', requireJwtOrInternal, handle((req) =>
    erp.getDepositos(tid(req))
  ));

  // ── Fiscal — NFE ────────────────────────────────────────────────────────────
  router.get('/vendaerp/fiscal', requireJwtOrInternal, handle((req) => {
    const { codigoNfe, dataInicial, dataFinal } = req.query;
    if (codigoNfe) return erp.consultarNfe({ codigoNfe }, tid(req));
    return erp.consultarNfePeriodo({ dataInicial, dataFinal }, tid(req));
  }));

  // ── CRM — oportunidades ─────────────────────────────────────────────────────
  router.get('/vendaerp/oportunidades', requireJwtOrInternal, handle((req) => {
    const { codigo, empresa, cliente } = req.query;
    return erp.pesquisarOportunidades({ codigo, empresa, cliente }, tid(req));
  }));

  // ── CRM — criar oportunidade (Fase 2, escrita) ──────────────────────────────
  router.post('/vendaerp/oportunidade', requireJwtOrInternal, handle((req) =>
    erp.criarOportunidade(req.body, tid(req))
  ));

  // ── Financeiro — criar lançamento (Fase 2, escrita) ─────────────────────────
  router.post('/vendaerp/lancamento', requireJwtOrInternal, handle((req) =>
    erp.criarLancamento(req.body, tid(req))
  ));

  // ── Financeiro — gerar boleto/cobrança (Fase 2, escrita) ────────────────────
  router.post('/vendaerp/boleto', requireJwtOrInternal, handle((req) =>
    erp.gerarBoleto(req.body, tid(req))
  ));

  // ── Fiscal — emitir NFE (Fase 2, escrita) ───────────────────────────────────
  // Recebe o payload normal; a lib traduz CodigoVenda p/ query param do ERP.
  router.post('/vendaerp/nfe', requireJwtOrInternal, handle((req) =>
    erp.emitirNfe(req.body, tid(req))
  ));

  // ── Estoque — ajuste (Fase 2, escrita) ──────────────────────────────────────
  router.post('/vendaerp/estoque-ajuste', requireJwtOrInternal, handle((req) =>
    erp.ajustarEstoque(req.body, tid(req))
  ));

  // ── Auxiliares ──────────────────────────────────────────────────────────────
  router.get('/vendaerp/empresas', requireJwtOrInternal, handle((req) => erp.getEmpresas(tid(req))));
  router.get('/vendaerp/formas-pagamento', requireJwtOrInternal, handle((req) => erp.getFormasPagamento(tid(req))));

  return router;
};

function num(v, def, min = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(min, n) : def;
}
