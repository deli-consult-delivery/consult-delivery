import { useState, useEffect, useCallback } from 'react';
import { listIfoodReviews, getIfoodReviewDetalhe, criarDraftRespostaReview, aprovarDraftIfood } from '../lib/api.js';

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

// Detalhe de UMA review — critério "Obter detalhes" do checklist Review:
// todos os campos V2 + replies[].from (MERCHANT|CUSTOMER); reviewId
// inexistente → 404 com mensagem clara (mensagemErro trata status 404).
function ReviewDetalheModal({ lojaId, reviewId, onClose }) {
  const [detalhe, setDetalhe] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const d = await getIfoodReviewDetalhe({ lojaId, reviewId });
        if (ativo) setDetalhe(d);
      } catch (e) {
        if (ativo) setErro(mensagemErro(e));
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => { ativo = false; };
  }, [lojaId, reviewId]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,27,26,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, padding: 24, width: 520, maxWidth: '92vw', maxHeight: '84vh', overflowY: 'auto', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Detalhe da avaliação</h3>

        {carregando && <div style={{ color: 'var(--tx2)', fontSize: 13 }}>Carregando…</div>}
        {erro && <div style={{ fontSize: 12.5, color: 'var(--red)', background: '#fdecea', borderRadius: 4, padding: '8px 10px' }}>⚠ {erro}</div>}

        {detalhe && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {detalhe.score != null && <span className="cv2-bdg ok" style={{ fontSize: 11 }}>⭐ {detalhe.score}</span>}
              <span className="cv2-bdg mut" style={{ fontSize: 11 }}>{detalhe.status || detalhe.id}</span>
              {detalhe.createdAt && (
                <span style={{ fontSize: 11.5, color: 'var(--tx2)' }}>{new Date(detalhe.createdAt).toLocaleString('pt-BR')}</span>
              )}
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>{detalhe.comment || detalhe.text || '(sem comentário)'}</div>

            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 8 }}>
              Respostas ({(detalhe.replies || []).length})
            </div>
            {(detalhe.replies || []).length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--tx2)' }}>Nenhuma resposta ainda.</div>
            ) : (
              detalhe.replies.map((r, i) => (
                <div key={i} style={{ background: r.from === 'MERCHANT' ? 'var(--green-soft)' : '#f0f0ef', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 2 }}>
                    {r.from === 'MERCHANT' ? 'Lojista' : 'Cliente'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink)' }}>{r.text}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewCard({ review, lojaId, tenantId }) {
  const reviewId = review.id;
  const jaRespondida = Array.isArray(review.replies) && review.replies.some(r => r.from === 'MERCHANT');
  const [texto, setTexto] = useState('');
  const [draftId, setDraftId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);
  const [detalheAberto, setDetalheAberto] = useState(false);

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
        <button className="cv2-btn sec" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={() => setDetalheAberto(true)}>
          Ver detalhes
        </button>
      </div>
      <div style={{ fontSize: 13, marginBottom: 10, color: 'var(--ink)' }}>
        {review.comment || review.text || '(sem comentário)'}
      </div>

      {detalheAberto && (
        <ReviewDetalheModal lojaId={lojaId} reviewId={reviewId} onClose={() => setDetalheAberto(false)} />
      )}

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
  // Filtro por data — critério "Filtro por data: retorna apenas reviews do
  // período" do checklist Review. yyyy-MM-dd (mesmo formato de <input type="date">).
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const data = await listIfoodReviews({ lojaId: loja.id, page, size: PAGE_SIZE, dataInicio, dataFim });
      setReviews(data?.reviews ?? []);
      setMeta({ total: data?.total ?? null, pageCount: data?.pageCount ?? null });
    } catch (e) {
      setReviews([]);
      setErro(mensagemErro(e));
    }
  }, [loja.id, page, dataInicio, dataFim]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div>
      <div className="cv2-card">
        <div style={{ fontSize: 12, color: 'var(--tx2)' }}>
          Avaliações via API oficial do iFood (sandbox de homologação) — loja com fonte de dados <b>api</b>.
          {' · '}
          <a href={POLITICA_AVALIACOES_URL} target="_blank" rel="noreferrer">Política de Avaliações do iFood ↗</a>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--tx2)' }}>
            De
            <input type="date" value={dataInicio} onChange={e => { setPage(1); setDataInicio(e.target.value); }} style={{ ...inp, width: 150 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--tx2)' }}>
            Até
            <input type="date" value={dataFim} onChange={e => { setPage(1); setDataFim(e.target.value); }} style={{ ...inp, width: 150 }} />
          </label>
          {(dataInicio || dataFim) && (
            <button className="cv2-btn sec" style={{ fontSize: 11.5, height: 32 }} onClick={() => { setPage(1); setDataInicio(''); setDataFim(''); }}>
              Limpar filtro
            </button>
          )}
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
