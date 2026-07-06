// bridge-server/lib/ifood-dupla-checagem.js
// Frente A fase 2: compara reviews da API oficial do iFood (lib/ifood.js →
// listarReviews, shape tolerante/não confirmado) com a tabela `avaliacoes`
// (dado colado do Portal pelo worker/consultor) para validar a migração
// gradual loja a loja (Plano Integração iFood §2 A2). Puro — sem I/O.
'use strict';

function normalizarTexto(s) {
  return typeof s === 'string' ? s.trim().toLowerCase().replace(/\s+/g, ' ') : '';
}

// A API iFood ainda não teve o shape real de review confirmado (00-api-reference.md
// só lista o endpoint) — aceita os nomes de campo mais prováveis, defensivamente.
function normalizarApiReview(raw) {
  const review = raw?.review ?? raw ?? {};
  const nota = review?.score ?? review?.rating ?? raw?.score ?? raw?.rating ?? null;
  const comentario = review?.comment ?? review?.text ?? raw?.comment ?? raw?.text ?? '';
  const nomeCliente = raw?.customer?.name ?? raw?.customerName ?? raw?.author ?? null;
  const id = raw?.id ?? raw?.reviewId ?? null;
  return {
    id: id != null ? String(id) : null,
    nota: nota != null ? Number(nota) : null,
    comentario: String(comentario ?? ''),
    nomeCliente: nomeCliente != null ? String(nomeCliente) : null,
  };
}

// Formato da tabela `avaliacoes` (20260614_001_avaliacoes.sql): nota, comentario, nome_cliente.
function normalizarAvaliacaoRow(row) {
  return {
    id: row?.id != null ? String(row.id) : null,
    nota: row?.nota != null ? Number(row.nota) : null,
    comentario: String(row?.comentario ?? ''),
    nomeCliente: row?.nome_cliente != null ? String(row.nome_cliente) : null,
  };
}

// ponytail: chave de correspondência = nota + cliente + comentário normalizados.
// Hoje não existe id compartilhado entre a API do iFood e `avaliacoes` (dado
// colado manualmente, sem coluna de referência externa). Inclui nomeCliente p/
// não colapsar 2 clientes diferentes com nota+texto genérico idênticos (ex.:
// "Muito bom", nota 5) na mesma review. Upgrade: gravar o id da review do
// iFood em `avaliacoes` quando a Fase 2 for aplicada de verdade — a chave
// vira exata em vez de heurística.
function chave(r) {
  return `${r.nota ?? ''}::${normalizarTexto(r.nomeCliente)}::${normalizarTexto(r.comentario)}`;
}

// Compara reviews da API × linhas de `avaliacoes` de uma loja.
// Retorna { totalApi, totalBrowser, faltantes, excedentes, divergencias }:
//   faltantes    — na API, ausentes em `avaliacoes` (candidatas a importar)
//   excedentes   — em `avaliacoes`, ausentes na API (revisar origem)
//   divergencias — mesma nota + mesmo cliente, texto do comentário diverge
function compararReviews(apiReviewsRaw, avaliacoesRows) {
  const apiNorm = (Array.isArray(apiReviewsRaw) ? apiReviewsRaw : []).map(normalizarApiReview);
  const browserNorm = (Array.isArray(avaliacoesRows) ? avaliacoesRows : []).map(normalizarAvaliacaoRow);

  const browserPorChave = new Set(browserNorm.map(chave));
  const apiPorChave = new Set(apiNorm.map(chave));

  const faltantesBrutos = apiNorm.filter((a) => !browserPorChave.has(chave(a)));
  const excedentesBrutos = browserNorm.filter((b) => !apiPorChave.has(chave(b)));

  // Divergência: mesma nota + mesmo nome_cliente entre um "faltante" e um
  // "excedente" — é a mesma avaliação com texto diferente, não duas reais.
  const divergencias = [];
  const excedentesUsados = new Set();
  for (const a of faltantesBrutos) {
    if (!a.nomeCliente || a.nota == null) continue;
    const idx = excedentesBrutos.findIndex(
      (b, i) =>
        !excedentesUsados.has(i) &&
        b.nota === a.nota &&
        normalizarTexto(b.nomeCliente) === normalizarTexto(a.nomeCliente)
    );
    if (idx !== -1) {
      excedentesUsados.add(idx);
      divergencias.push({ api: a, browser: excedentesBrutos[idx] });
    }
  }

  const apiEmDivergencia = new Set(divergencias.map((d) => d.api));
  return {
    totalApi: apiNorm.length,
    totalBrowser: browserNorm.length,
    faltantes: faltantesBrutos.filter((a) => !apiEmDivergencia.has(a)),
    excedentes: excedentesBrutos.filter((_, i) => !excedentesUsados.has(i)),
    divergencias,
  };
}

module.exports = { compararReviews, normalizarApiReview, normalizarAvaliacaoRow };
