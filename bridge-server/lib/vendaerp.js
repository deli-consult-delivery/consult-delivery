// bridge-server/lib/vendaerp.js
// Cliente de LEITURA do VendaERP (ERP .NET REST — cw.vendaerp.com.br).
// Espelha o padrão de trigger/_shared/asaas.ts: config lazy, withRetry em 429/5xx,
// fetch base que injeta auth e lança erro tipado. Schemas Zod TOLERANTES (.passthrough)
// porque ainda não temos o shape exato das respostas — refinar após 1º retorno real.
//
// SEGURANÇA: a credencial (3 headers) vive SÓ no env do Bridge (Infisical). Nem o
// Console nem o Hermes a tocam — ambos chamam /api/vendaerp/* e o Bridge injeta.
//
// Fase 1 = MVP read-only. Escrita (criar/emitir) é Fase 2, gated e confirmada.
'use strict';

const { z } = require('zod');

// ---------------------------------------------------------------------------
// Erro customizado
// ---------------------------------------------------------------------------
class VendaErpApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'VendaErpApiError';
    this.status = status;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Config lazy — lida dentro de cada chamada, nunca no topo do módulo.
// Fase 1: fonte é o env (VENDAERP_*). O parâmetro tenantId já existe na assinatura
// para, na Fase 3, buscar credencial em vendaerp_instances com fallback ao env
// (mesmo padrão de evolution_instances em index.js).
// ---------------------------------------------------------------------------
function getVendaErpConfig(_tenantId) {
  const baseUrl = (process.env.VENDAERP_BASE_URL || 'https://cw.vendaerp.com.br').replace(/\/+$/, '');
  const token = process.env.VENDAERP_TOKEN;
  const user = process.env.VENDAERP_USER;
  const app = process.env.VENDAERP_APP;

  if (!token || !user || !app) {
    throw new VendaErpApiError(
      'Credencial VendaERP ausente. Configure VENDAERP_TOKEN, VENDAERP_USER e VENDAERP_APP no Infisical/env do Bridge.',
      0,
      null
    );
  }
  return { baseUrl, token, user, app };
}

// ---------------------------------------------------------------------------
// Retry — só em 429 (rate limit 1.000/h) e 5xx. 4xx (exceto 429) = não retenta.
// ---------------------------------------------------------------------------
function shouldRetry(status) {
  return status === 429 || status >= 500;
}

async function withRetry(fn, maxAttempts = 3) {
  const delaysMs = [0, 1000, 2000];
  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const delay = delaysMs[attempt] ?? 2000;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err instanceof VendaErpApiError && !shouldRetry(err.status)) throw err;
      if (attempt === maxAttempts - 1) throw err;
    }
  }
  throw lastError ?? new VendaErpApiError('withRetry esgotou tentativas', 0, null);
}

// ---------------------------------------------------------------------------
// Fetch base — injeta os 3 headers + Content-Type/accept, timeout 20s.
// ---------------------------------------------------------------------------
async function erpFetch(path, options = {}, tenantId) {
  const { baseUrl, token, user, app } = getVendaErpConfig(tenantId);
  const url = `${baseUrl}/api/request${path}`;

  const headers = {
    'Content-Type': 'application/json',
    accept: 'application/json',
    'Authorization-Token': token,
    User: user,
    App: app,
    ...(options.headers || {}),
  };

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    // timeout / rede — status 0 (NÃO retentável: shouldRetry só aceita 429/5xx).
    // ERP fora do ar falha rápido (1 tentativa) em vez de 3×15s ≈ 45s pendurado.
    throw new VendaErpApiError(`VendaERP indisponível: ${err.message}`, 0, null);
  }

  let body;
  const text = await response.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text; // resposta não-JSON (ex.: HTML de boleto)
  }

  if (!response.ok) {
    throw new VendaErpApiError(
      `VendaERP API retornou ${response.status}: ${response.statusText}`,
      response.status,
      body
    );
  }
  return body;
}

// Helper p/ querystring (omite undefined/null/'').
function qs(params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ---------------------------------------------------------------------------
// Schemas tolerantes — só garantem que é objeto/array; passthrough mantém o resto.
// ---------------------------------------------------------------------------
const PassObj = z.object({}).passthrough();
const tolerant = (raw) => {
  if (Array.isArray(raw)) return z.array(PassObj).parse(raw);
  if (raw && typeof raw === 'object') return PassObj.parse(raw);
  return raw;
};

function requireBusinessSuccess(raw, validate, operation) {
  if (!validate(raw)) {
    throw new VendaErpApiError(`VendaERP rejeitou ${operation}`, 200, raw);
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Métodos de LEITURA (GET) — um conjunto por domínio do MVP.
// Caminhos confirmados via swagger.json do VendaERP.
// ---------------------------------------------------------------------------

// Status / saúde da credencial — chamada barata sem parâmetros.
async function getEmpresas(tenantId) {
  return withRetry(() => erpFetch('/Empresas/GetTodasEmpresas', {}, tenantId)).then(tolerant);
}
async function getConfiguracoes(tenantId) {
  return withRetry(() => erpFetch('/Configuracoes/Get', {}, tenantId)).then(tolerant);
}

// Contratos
async function listContratos({ pageSize = 20, skip = 0 } = {}, tenantId) {
  return withRetry(() => erpFetch(`/Contratos/GetAll${qs({ pageSize, skip })}`, {}, tenantId)).then(tolerant);
}
async function pesquisarContratos({ codigo, cliente, situacao } = {}, tenantId) {
  return withRetry(() => erpFetch(`/Contratos/Pesquisar${qs({ codigo, cliente, situacao })}`, {}, tenantId)).then(tolerant);
}

// Financeiro — Lançamentos / Boletos
async function listLancamentos({ pageSize = 20, skip = 0 } = {}, tenantId) {
  return withRetry(() => erpFetch(`/Lancamentos/GetAll${qs({ pageSize, skip })}`, {}, tenantId)).then(tolerant);
}
async function getLancamento({ codigo } = {}, tenantId) {
  return withRetry(() => erpFetch(`/Lancamentos/Get${qs({ codigo })}`, {}, tenantId)).then(tolerant);
}
async function pesquisarBoletos({ codigo, cliente } = {}, tenantId) {
  return withRetry(() => erpFetch(`/Boletos/Pesquisar${qs({ codigo, cliente })}`, {}, tenantId)).then(tolerant);
}

// Estoque
async function getEstoque({ deposito } = {}, tenantId) {
  return withRetry(() => erpFetch(`/Estoque/BuscarQuantidades${qs({ deposito })}`, {}, tenantId)).then(tolerant);
}
async function getDepositos(tenantId) {
  return withRetry(() => erpFetch('/Depositos/GetTodosDepositos', {}, tenantId)).then(tolerant);
}

// Fiscal — NFE por período
async function consultarNfePeriodo({ dataInicial, dataFinal } = {}, tenantId) {
  return withRetry(() =>
    erpFetch(`/Fiscal/ConsultarNfePeriodo${qs({ DataInicial: dataInicial, DataFinal: dataFinal })}`, {}, tenantId)
  ).then(tolerant);
}
async function consultarNfe({ codigoNfe } = {}, tenantId) {
  return withRetry(() => erpFetch(`/Fiscal/ConsultarNFE${qs({ CodigoNFe: codigoNfe })}`, {}, tenantId)).then(tolerant);
}

// CRM — Oportunidades
async function pesquisarOportunidades({ codigo, empresa, cliente } = {}, tenantId) {
  return withRetry(() =>
    erpFetch(`/Oportunidades/Pesquisar${qs({ codigo, empresa, cliente })}`, {}, tenantId)
  ).then(tolerant);
}

// Formas de pagamento
async function getFormasPagamento(tenantId) {
  return withRetry(() => erpFetch('/FormasPagamento/GetTodasFormasPagamento', {}, tenantId)).then(tolerant);
}

async function pesquisarPedidos({
  dataInicial,
  dataFinal,
  pageSize = 100,
  skip = 0,
} = {}, tenantId) {
  return withRetry(() => erpFetch(`/Pedidos/Pesquisar${qs({
    dataInicial,
    dataFinal,
    filtrarPor: 0,
    pageSize,
    skip,
  })}`, {}, tenantId)).then(tolerant);
}

async function pesquisarPessoas({ cpfcnpj, nomefantasia } = {}, tenantId) {
  return withRetry(() => erpFetch(`/Pessoas/Pesquisar${qs({
    cpfcnpj,
    nomefantasia,
    cliente: true,
    fornecedor: false,
    pageSize: 100,
    skip: 0,
  })}`, {}, tenantId)).then(tolerant);
}

// ---------------------------------------------------------------------------
// Métodos de ESCRITA (POST) — Fase 2.
// ⚠️ SEM withRetry: POST não-idempotente. Retry em 5xx/timeout duplicaria
// registro no ERP. Falha fechada → a tool erp_confirmar marca a proposta failed.
// Caminhos/corpos confirmados no swagger (Task 1).
// ---------------------------------------------------------------------------

// CRM — criar oportunidade. Caminho verificado: POST /api/request/Oportunidades/Cadastrar.
async function criarOportunidade(payload, tenantId) {
  return erpFetch('/Oportunidades/Cadastrar', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, tenantId).then(tolerant);
}

// Financeiro — criar lançamento. Caminho verificado: POST /api/request/Lancamentos/Criar.
async function criarLancamento(payload, tenantId) {
  return erpFetch('/Lancamentos/Criar', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, tenantId).then(tolerant);
}

// Financeiro — gerar boleto/cobrança. Caminho verificado: POST /api/request/Lancamentos/GerarCobrancaIntegracao.
async function gerarBoleto(payload, tenantId) {
  return erpFetch('/Lancamentos/GerarCobrancaIntegracao', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, tenantId).then(tolerant);
}

// Fiscal — emitir NFE. Caminho verificado: POST /api/request/Fiscal/EmitirNFE.
// ⚠️ Diferente dos demais: CodigoVenda vai na QUERY string, sem corpo.
async function emitirNfe(payload, tenantId) {
  const codigoVenda = payload?.CodigoVenda ?? payload?.codigoVenda;
  // Defesa em profundidade: a rota Bridge aceita body cru; sem CodigoVenda a
  // emissão fiscal iria sem alvo. Falha fechada antes de tocar o ERP.
  if (codigoVenda === undefined || codigoVenda === null || codigoVenda === '') {
    throw new VendaErpApiError('CodigoVenda obrigatório para emitir NFE', 0, null);
  }
  return erpFetch(`/Fiscal/EmitirNFE${qs({ CodigoVenda: codigoVenda })}`, {
    method: 'POST',
  }, tenantId).then(tolerant);
}

// Estoque — ajuste/movimentação. Caminho verificado: POST /api/request/ProdutosEstoque/Salvar.
async function ajustarEstoque(payload, tenantId) {
  return erpFetch('/ProdutosEstoque/Salvar', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, tenantId).then(tolerant);
}

async function salvarEFaturarPedido(payload, tenantId) {
  const raw = await erpFetch('/Pedidos/SalvarEFaturar?retornarPedido=true', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, tenantId);
  return requireBusinessSuccess(
    raw,
    (body) => Boolean(body && typeof body === 'object' && (body.Pedido?.Codigo ?? body.pedido?.codigo)),
    'o faturamento do pedido'
  );
}

async function atualizarPedido(payload, tenantId) {
  const raw = await erpFetch('/Pedidos/Salvar', {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, tenantId);
  return requireBusinessSuccess(
    raw,
    (body) => typeof body === 'string' &&
      /modificad[oa].*sucesso|sucesso.*modificad[oa]/i.test(body),
    'a atualização do pedido'
  );
}

async function excluirPedido(codigo, tenantId) {
  const raw = await erpFetch('/Pedidos/ExcluirPedido', {
    method: 'DELETE',
    body: JSON.stringify([codigo]),
  }, tenantId);
  return requireBusinessSuccess(
    raw,
    (body) => typeof body === 'string' && /sucesso/i.test(body),
    'a exclusão do pedido'
  );
}

async function salvarPessoa(payload, tenantId) {
  const raw = await erpFetch('/Pessoas/Salvar', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, tenantId);
  return requireBusinessSuccess(
    raw,
    (body) => (
      (typeof body === 'string' && /sucesso/i.test(body)) ||
      Boolean(body && typeof body === 'object' && (
        Number.isInteger(body.Codigo) ||
        Number.isInteger(body.codigo) ||
        Number.isInteger(body.Pessoa?.Codigo) ||
        Number.isInteger(body.pessoa?.codigo)
      ))
    ),
    'o cadastro do cliente'
  );
}

module.exports = {
  VendaErpApiError,
  getVendaErpConfig,
  // status
  getEmpresas,
  getConfiguracoes,
  // contratos
  listContratos,
  pesquisarContratos,
  // financeiro
  listLancamentos,
  getLancamento,
  pesquisarBoletos,
  criarLancamento,
  gerarBoleto,
  // estoque
  getEstoque,
  getDepositos,
  ajustarEstoque,
  // fiscal
  consultarNfePeriodo,
  consultarNfe,
  emitirNfe,
  // crm
  pesquisarOportunidades,
  criarOportunidade,
  // pagamentos
  getFormasPagamento,
  // pedidos Cardápio Web
  pesquisarPedidos,
  pesquisarPessoas,
  salvarEFaturarPedido,
  atualizarPedido,
  excluirPedido,
  salvarPessoa,
};
