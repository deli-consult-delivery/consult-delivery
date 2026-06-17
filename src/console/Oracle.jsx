import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase.js';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

async function getBridgeHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${BRIDGE}${path}`, {
    ...opts,
    headers: {
      ...(await getBridgeHeaders()),
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

const STATUS_BADGE = {
  pendente:  { label: 'Pendente',  bg: '#fdf3e2', fg: '#9a6b15' },
  aprovado:  { label: 'Aprovado',  bg: '#e8f1fb', fg: '#1d5a96' },
  aplicado:  { label: 'Aplicado',  bg: '#e8f5e9', fg: '#1f7a33' },
  rejeitado: { label: 'Rejeitado', bg: '#fbeae8', fg: '#a13226' },
};

function StatusBadge({ status }) {
  const b = STATUS_BADGE[status] || { label: status, bg: 'var(--panel)', fg: 'var(--tx2)' };
  return (
    <span className="cv2-bdg" style={{ background: b.bg, color: b.fg, borderRadius: 99, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
      {b.label}
    </span>
  );
}

// ── Card da proposta estruturada do Oracle ────────────────────────────────────
function ProposalCard({ proposal, onSave, saving, saved }) {
  return (
    <div className="cv2-card" style={{
      borderLeft: `4px solid ${proposal.color || 'var(--red)'}`,
      padding: 14, marginTop: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 56 / 4,
          background: '#B70C00',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 56 * 0.44, color: '#fff', flexShrink: 0,
        }}>
          O
        </div>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--tx)', fontSize: 14 }}>{proposal.name}</div>
          <div style={{ fontSize: 12, color: 'var(--tx2)' }}>{proposal.slug} · {proposal.role}</div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--tx2)', display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 8 }}>
        <span>Modo: <b>{proposal.default_modo}</b></span>
        <span>Modelo: <b>{proposal.custom_model}</b></span>
        <span>Tools: <b>{proposal.tools?.length ? proposal.tools.join(', ') : 'nenhuma'}</b></span>
      </div>
      <details style={{ marginBottom: 10 }}>
        <summary style={{ fontSize: 12, color: 'var(--tx2)', cursor: 'pointer' }}>Ver system prompt completo</summary>
        <pre style={{
          whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--tx)', background: 'var(--panel)',
          border: '1px solid var(--line)', borderRadius: 8, padding: 10, marginTop: 6, maxHeight: 220, overflowY: 'auto',
        }}>{proposal.custom_prompt}</pre>
      </details>
      {saved ? (
        <div style={{ fontSize: 13, color: '#1f7a33', fontWeight: 600 }}>
          ✓ Draft salvo — aguardando aprovação de um admin na fila ao lado.
        </div>
      ) : (
        <button className="cv2-btn" disabled={saving} onClick={onSave}>
          {saving ? 'Salvando…' : 'Salvar como draft para aprovação'}
        </button>
      )}
    </div>
  );
}

// ── Chat com o Oracle ──────────────────────────────────────────────────────────
function OracleChat({ onDraftSaved }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [savingIdx, setSavingIdx] = useState(null);
  const [erro, setErro] = useState('');
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  async function enviar() {
    const text = input.trim();
    if (!text || sending) return;
    setErro('');
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const apiMessages = next.map(m => ({ role: m.role, content: m.content })).slice(-40);
      const data = await apiFetch('/api/oracle/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: apiMessages }),
      });
      setMessages(curr => [...curr, {
        role: 'assistant',
        content: data.reply,
        proposal: data.proposal || null,
        proposal_error: data.proposal_error || null,
      }]);
    } catch (e) {
      setErro(e.message);
      setMessages(curr => curr.slice(0, -1));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  async function salvarDraft(idx) {
    const msg = messages[idx];
    if (!msg?.proposal) return;
    setSavingIdx(idx);
    setErro('');
    try {
      const sourceChat = messages.slice(0, idx + 1).map(m => ({ role: m.role, content: m.content }));
      await apiFetch('/api/oracle/drafts', {
        method: 'POST',
        body: JSON.stringify({ payload: msg.proposal, source_chat: sourceChat }),
      });
      setMessages(curr => curr.map((m, i) => (i === idx ? { ...m, savedDraft: true } : m)));
      onDraftSaved?.();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSavingIdx(null);
    }
  }

  const inputStyle = {
    padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)',
    background: 'var(--panel)', color: 'var(--tx)', fontSize: 14,
    outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'none',
    fontFamily: 'inherit',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 420 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 2px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ color: 'var(--tx2)', fontSize: 14, padding: '24px 8px', textAlign: 'center' }}>
            Descreva o agente especialista que você precisa — ex.: <i>"quero um agente especialista
            no sistema Saipos para responder dúvidas de suporte nível 1"</i>.<br /><br />
            O Oracle faz 2-3 perguntas, propõe o agente, e a criação só acontece depois
            que um admin aprovar o draft.
          </div>
        )}
        {messages.map((m, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '85%',
              background: m.role === 'user' ? 'var(--red-soft, #fbeae8)' : 'var(--panel)',
              border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px',
              fontSize: 14, color: 'var(--tx)', whiteSpace: 'pre-wrap',
            }}>
              {m.role === 'assistant' && m.proposal
                ? m.content.replace(/```json[\s\S]*?```/, '').trim()
                : m.content}
              {m.proposal && (
                <ProposalCard
                  proposal={m.proposal}
                  saving={savingIdx === idx}
                  saved={!!m.savedDraft}
                  onSave={() => salvarDraft(idx)}
                />
              )}
              {m.proposal_error && (
                <div style={{ fontSize: 12, color: '#a13226', marginTop: 6 }}>
                  ⚠ A proposta veio com problema ({m.proposal_error}) — peça ao Oracle para corrigir.
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && <div style={{ color: 'var(--tx2)', fontSize: 13 }}>Oracle pensando…</div>}
        <div ref={endRef} />
      </div>
      {erro && <div style={{ color: '#a13226', fontSize: 13, padding: '6px 2px' }}>Erro: {erro}</div>}
      <div style={{ display: 'flex', gap: 8, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
        <textarea
          rows={2}
          style={inputStyle}
          placeholder="Descreva o agente que você precisa…"
          value={input}
          maxLength={8000}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
          }}
        />
        <button
          className="cv2-btn"
          style={{ alignSelf: 'flex-end' }}
          disabled={sending || !input.trim()}
          onClick={enviar}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}

// ── Card de um draft na fila ───────────────────────────────────────────────────
function DraftCard({ draft, isAdmin, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const p = draft.payload || {};

  async function agir(acao) {
    let note = null;
    if (acao === 'reject') {
      note = window.prompt('Motivo da rejeição (opcional):') ?? null;
      if (note === null) return;
    }
    setBusy(true);
    setErro('');
    try {
      await apiFetch(`/api/oracle/drafts/${draft.id}/${acao}`, {
        method: 'POST',
        body: JSON.stringify(note ? { note } : {}),
      });
      onChanged?.();
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cv2-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 36 / 4,
          background: p.color || '#B70C00',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 36 * 0.44, color: '#fff', flexShrink: 0,
        }}>
          {(p.letter || 'O').toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: 'var(--tx)', fontSize: 14 }}>{p.name || draft.proposed_slug}</div>
          <div style={{ fontSize: 12, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {draft.proposed_slug} · {p.role}
          </div>
        </div>
        <StatusBadge status={draft.status} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 8 }}>
        Criado em {new Date(draft.created_at).toLocaleString('pt-BR')}
        {draft.status === 'aplicado' && draft.agent_id && <> · agente <b>{draft.agent_id}</b> no catálogo</>}
      </div>
      {draft.review_note && (
        <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 4 }}>Nota: {draft.review_note}</div>
      )}
      <details style={{ marginTop: 8 }}>
        <summary style={{ fontSize: 12, color: 'var(--tx2)', cursor: 'pointer' }}>Ver proposta completa</summary>
        <pre style={{
          whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--tx)', background: 'var(--panel)',
          border: '1px solid var(--line)', borderRadius: 8, padding: 10, marginTop: 6, maxHeight: 220, overflowY: 'auto',
        }}>{JSON.stringify(p, null, 2)}</pre>
      </details>
      {erro && <div style={{ color: '#a13226', fontSize: 12, marginTop: 6 }}>Erro: {erro}</div>}
      {isAdmin && draft.status === 'pendente' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="cv2-btn" disabled={busy} onClick={() => agir('approve')}>
            {busy ? '…' : 'Aprovar e criar agente'}
          </button>
          <button className="cv2-btn sec" disabled={busy} onClick={() => agir('reject')}
            style={{ color: 'var(--red)', border: '1px solid #ecc7c2' }}>
            Rejeitar
          </button>
        </div>
      )}
      {!isAdmin && draft.status === 'pendente' && (
        <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 8 }}>Aguardando aprovação de um admin.</div>
      )}
    </div>
  );
}

// ── Tela principal ─────────────────────────────────────────────────────────────
export default function Oracle({ tenantDbId, userId }) {
  const [drafts, setDrafts] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try {
      const data = await apiFetch('/api/oracle/drafts');
      setDrafts(data.drafts || []);
      setIsAdmin(!!data.is_admin);
      setErro('');
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const pendentes = drafts.filter(d => d.status === 'pendente').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 1100, margin: '0 auto', padding: '24px 16px 0' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: '#B70C00',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: 18,
        }}>O</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--tx)' }}>Oracle — construtor de agentes</div>
          <div style={{ fontSize: 12, color: 'var(--tx2)' }}>
            Converse com o Oracle para desenhar um agente especialista. A proposta vira um draft;
            só depois da aprovação de um admin o agente entra no catálogo.
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 16, alignItems: 'start' }}>

          {/* Chat */}
          <div className="cv2-card" style={{ padding: 16, minHeight: 480, display: 'flex' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <OracleChat onDraftSaved={carregar} />
            </div>
          </div>

          {/* Fila de drafts */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--tx)' }}>
                Fila de drafts{' '}
                {pendentes > 0 && (
                  <span style={{ color: 'var(--red)' }}>
                    ({pendentes} pendente{pendentes > 1 ? 's' : ''})
                  </span>
                )}
              </div>
              <button className="cv2-btn sec" style={{ padding: '5px 12px', fontSize: 13 }} onClick={carregar}>
                Atualizar
              </button>
            </div>
            {erro && <div style={{ color: '#a13226', fontSize: 13, marginBottom: 8 }}>Erro: {erro}</div>}
            {loading ? (
              <div style={{ color: 'var(--tx2)', fontSize: 13 }}>Carregando…</div>
            ) : drafts.length === 0 ? (
              <div className="cv2-card" style={{ color: 'var(--tx2)', fontSize: 13, padding: 14 }}>
                Nenhum draft ainda — converse com o Oracle ao lado para criar o primeiro.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {drafts.map(d => (
                  <DraftCard key={d.id} draft={d} isAdmin={isAdmin} onChanged={carregar} />
                ))}
              </div>
            )}
          </div>

        </div>
        <div style={{ height: 32 }} />
      </div>
    </div>
  );
}
