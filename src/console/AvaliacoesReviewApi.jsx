import { useState, useEffect, useCallback } from 'react';
import { listIfoodReviews, criarDraftRespostaReview, aprovarDraftIfood } from '../lib/api.js';

// ============================================================
// Bloco "Avaliações via API oficial do iFood" — só renderiza quando a loja
// selecionada está em `fonte_dados === 'api'` (Avaliacoes.jsx decide isso).
// Fluxo draft→aprovação (homologação App Avaliações, item Review):
//   1) POST .../draft   → cria o rascunho (valida 10–300 chars no bridge)
//   2) POST /ifood/aprovar/:draftId → só aqui a resposta sai de verdade no iFood
// Duas ações discretas — o clique em "Aprovar e enviar" é a aprovação humana
// explícita, nunca automática após salvar o rascunho.
// ============================================================

const PAGE_SIZE = 20; // ≤ 50 (limite documentado da Review API)
const POLITICA_AVALIACOES_URL = 'https://portalcentral.ifood.com.br/central/manual/regras-e-politicas/politica-de-avaliacoes-do-ifood/';
const TEXTO_MIN = 10;
const TEXTO_MAX = 300;

const inp = {
  width: '100%', fontFamily: 'inherit', fontSize: 13, padding: '7px 9px',
  border: '1px solid var(--line)', borderRadius: 4, background: '#fff', color: 'var(--ink)',
};

function mensagemErro(err) {
  const status = err?.status;
  if (status === 401) return 'Sessão expirada ou token inválido — faça login novamente.';
  if (status === 403) return 'Sem permissão para acessar as avaliações desta loja.';
  if (status === 404) return 'Avaliação ou loja não encontrada.';
  if (status === 429) {
    const s = err?.retryAfterSeconds;
    return `Limite de requisições do iFood atingido — tente novamente${s ? ` em ${s}s` : ' em instantes'}.`;
  }
  // err.details?.message carrega a mensagem de negócio do iFood (ex.: "já respondida")
  // quando o Bridge repassa o body de erro real — preferir sobre err.message genérico
  // ("iFood API retornou 409: Conflict"), que só descreve o status HTTP.
  if (status === 409 || status === 422) return err?.details?.message || err?.message || 'Esta avaliação já foi respondida (ou está em um status que não permite resposta).';
  if (status === 400) return err?.details?.message || err?.message || 'Dados inválidos.';
  return err?.details?.message || err?.message || 'Erro ao comunicar com o iFood.';
}

function ReviewCard({ review, lojaId, tenantId }) {
  const reviewId = review.id;
  const jaRespondida = Array.isArray(review.replies) && review.replies.some(r => r.from === 'MERCHANT');
  const [texto, setTexto] = useState('');
  const [draftId, setDraftId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);

  const len = texto.trim().length;
  const invalido = len > 0 && (len < TEXTO_MIN || len > TEXTO_MAX);

  async function salvarRascunho() {
    setBusy(true); setErro(null); setOk(null);
    try {
      const draft = await criarDraftRespostaReview({ lojaId, reviewId, texto: texto.trim() });
      setDraftId(draft.draft_id);
      setOk('Rascunho salvo — revise e aprove para publicar no iFood.');
    } catch (e) { setErro(mensagemErro(e)); }
    setBusy(false);
  }

  async function aprovarEEnviar() {
    setBusy(true); setErro(null); setOk(null);
    try {
      await aprovarDraftIfood({ draftId, tenantId });
      setOk('Resposta publicada no iFood.');
    } catch (e) {
      setErro(mensagemErro(e));
      // o Bridge marca o draft como 'failed' quando a aprovação falha — reenviar o
      // MESMO draftId bate no gate "não está pendente" (409) pra sempre. Volta pro
      // estado de rascunho (mantendo o texto) pra criar um draft novo no próximo clique.
      setDraftId(null);
    }
    setBusy(false);
  }

  return (
    <div className="cv2-card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
        {review.score != null && <span className="cv2-bdg ok" style={{ fontSize: 11 }}>⭐ {review.score}</span>}
        <span className="cv2-bdg mut" style={{ fontSize: 11 }}>{review.status || (jaRespondida ? 'RESPONDIDA' : 'NOT_REPLIED')}</span>
      </div>
      <div style={{ fontSize: 13, marginBottom: 10, color: 'var(--ink)' }}>
        {review.comment || review.text || '(sem comentário)'}
      </div>

      {jaRespondida ? (
        <div style={{ fontSize: 12.5, color: 'var(--tx2)' }}>Já respondida — sem ação necessária.</div>
      ) : (
        <>
          {!draftId && (
            <>
              <textarea
                value={texto}
                onChange={e => setTexto(e.target.value)}
                rows={3}
                placeholder={`Resposta (${TEXTO_MIN}–${TEXTO_MAX} caracteres)…`}
                style={{ ...inp, resize: 'vertical', borderColor: invalido ? 'var(--red)' : 'var(--line)' }}
              />
              <div style={{ fontSize: 11.5, fontWeight: 700, color: invalido ? 'var(--red)' : 'var(--tx2)', textAlign: 'right', margin: '3px 0 8px' }}>
                {len}/{TEXTO_MAX}{invalido ? ` — precisa ter entre ${TEXTO_MIN} e ${TEXTO_MAX} caracteres` : ''}
              </div>
            </>
          )}

          {erro && <div style={{ fontSize: 12.5, color: 'var(--red)', background: '#fdecea', borderRadius: 4, padding: '8px 10px', marginBottom: 8 }}>⚠ {erro}</div>}
          {ok && <div style={{ fontSize: 12.5, color: 'var(--green)', marginBottom: 8 }}>{ok}</div>}

          {!draftId ? (
            <button className="cv2-btn" style={{ fontSize: 11.5 }} disabled={busy || len < TEXTO_MIN || len > TEXTO_MAX} onClick={salvarRascunho}>
              {busy ? 'Salvando…' : 'Salvar rascunho'}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12.5, color: 'var(--ink)', background: 'var(--green-soft)', borderRadius: 4, padding: '8px 10px', flex: '1 1 100%' }}>
                <b>Rascunho:</b> {texto.trim()}
              </div>
              <button className="cv2-btn" style={{ fontSize: 11.5 }} disabled={busy} onClick={aprovarEEnviar}>
                {busy ? 'Enviando…' : 'Aprovar e enviar ao iFood'}
              </button>
              <button className="cv2-btn sec" style={{ fontSize: 11.5 }} disabled={busy} onClick={() => { setDraftId(null); setOk(null); }}>
                Editar
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AvaliacoesReviewApi({ loja, tenantDbId }) {
  const [reviews, setReviews] = useState(null);
  const [page, setPage] = useState(1); // paginação 1-based (checklist do portal: "pageSize > 50 → 400")
  const [meta, setMeta] = useState(null);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const data = await listIfoodReviews({ lojaId: loja.id, page, size: PAGE_SIZE });
      setReviews(data?.reviews ?? []);
      setMeta({ total: data?.total ?? null, pageCount: data?.pageCount ?? null });
    } catch (e) {
      setReviews([]);
      setErro(mensagemErro(e));
    }
  }, [loja.id, page]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div>
      <div className="cv2-card">
        <div style={{ fontSize: 12, color: 'var(--tx2)' }}>
          Avaliações via API oficial do iFood (sandbox de homologação) — loja com fonte de dados <b>api</b>.
          {' · '}
          <a href={POLITICA_AVALIACOES_URL} target="_blank" rel="noreferrer">Política de Avaliações do iFood ↗</a>
        </div>
      </div>

      {erro && <div className="cv2-card" style={{ color: 'var(--red)' }}>⚠ {erro}</div>}
      {reviews == null && !erro && <div style={{ color: 'var(--tx2)', fontSize: 13 }}>Carregando avaliações…</div>}
      {reviews && reviews.length === 0 && !erro && (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Nenhuma avaliação encontrada.</div>
      )}

      {(reviews ?? []).map(r => (
        <ReviewCard key={r.id} review={r} lojaId={loja.id} tenantId={tenantDbId} />
      ))}

      {reviews && reviews.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="cv2-btn sec" style={{ fontSize: 11.5 }} disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Anterior</button>
          <button className="cv2-btn sec" style={{ fontSize: 11.5 }} disabled={meta?.pageCount != null && page >= meta.pageCount} onClick={() => setPage(p => p + 1)}>Próxima →</button>
        </div>
      )}
    </div>
  );
}
