// CSS inline — projeto usa CSS variables (var(--red), var(--g-500), etc), não Tailwind.
// Template: TabIaEspecialista.jsx (bridgeFetch, bridgeFetchRaw, CSS variables, 2-panel layout).

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function bridgeFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${BRIDGE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => ({ error: res.statusText }));
  if (res.status >= 400) throw new Error(body.error || res.statusText);
  return body;
}

// Retorna { status, body } — Bridge pode devolver 202 quando task ainda processa.
async function bridgeFetchRaw(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${BRIDGE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => ({ error: res.statusText }));
  return { status: res.status, body };
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// Markdown simples: negrito, itálico, títulos, bullets, quebras de linha
function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const result = [];
  lines.forEach((line, idx) => {
    const key = `md-${idx}`;
    // Título h2
    if (line.startsWith('## ')) {
      result.push(
        <div key={key} style={{ fontWeight: 700, fontSize: 13, color: 'var(--g-900)', marginTop: 14, marginBottom: 4 }}>
          {line.slice(3)}
        </div>
      );
      return;
    }
    // Título h3
    if (line.startsWith('### ')) {
      result.push(
        <div key={key} style={{ fontWeight: 600, fontSize: 12, color: 'var(--g-700)', marginTop: 10, marginBottom: 2 }}>
          {line.slice(4)}
        </div>
      );
      return;
    }
    // Bullet
    if (line.startsWith('- ') || line.startsWith('* ')) {
      result.push(
        <div key={key} style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
          <span style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }}>•</span>
          <span style={{ fontSize: 12, color: 'var(--g-700)', lineHeight: 1.6 }}>{line.slice(2)}</span>
        </div>
      );
      return;
    }
    // Linha vazia
    if (!line.trim()) {
      result.push(<div key={key} style={{ height: 6 }} />);
      return;
    }
    // Parágrafo normal
    result.push(
      <div key={key} style={{ fontSize: 12, color: 'var(--g-700)', lineHeight: 1.7, marginBottom: 2 }}>
        {line}
      </div>
    );
  });
  return result;
}

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_LABEL = {
  rascunho:         'Rascunho',
  processando:      'Processando…',
  processada:       'Processada',
  enviada_cliente:  'Enviada ao cliente',
  erro:             'Erro',
};

const STATUS_COLOR = {
  rascunho:        '#6b7280',
  processando:     '#f59e0b',
  processada:      '#10b981',
  enviada_cliente: '#8b5cf6',
  erro:            '#ef4444',
};

const TIPO_LABEL = {
  inicial: 'Inicial',
  periodica: 'Periódica',
  urgente: 'Urgente',
};

// ── Modal: Nova análise ───────────────────────────────────────────────────────

function ModalNovaAnalise({ lojaId, onClose, onSaved, onAccepted }) {
  const [form, setForm] = useState({ loom_url: '', tipo: 'periodica', transcricao: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // 'form' → 'result' (200) ou onSaved (202/erro)
  const [viewMode, setViewMode] = useState('form');
  const [resultAnalise, setResultAnalise] = useState(null);
  const [tarefasPreview, setTarefasPreview] = useState([]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.transcricao.trim().length < 10) {
      setError('Transcrição deve ter pelo menos 10 caracteres.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = {
        tipo: form.tipo,
        ...(form.loom_url.trim() ? { loom_url: form.loom_url.trim() } : {}),
        ...(form.transcricao.trim() ? { transcricao: form.transcricao.trim() } : {}),
      };
      const data = await bridgeFetch(`/api/lojas/${lojaId}/analises`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const analise = data.analise;

      // Dispara processamento imediatamente
      const { status, body } = await bridgeFetchRaw(`/api/lojas/${lojaId}/analises/processar`, {
        method: 'POST',
        body: JSON.stringify({ analise_id: analise.id }),
      });

      if (status >= 400) {
        setError(`Análise criada mas erro ao processar: ${body.error || 'Erro desconhecido'}`);
        onSaved(analise);
        return;
      }

      if (status === 200) {
        // Busca analise atualizada (com resumo_executivo) + preview de tarefas
        const [{ data: analiseAtualizada }, { data: previews }] = await Promise.all([
          supabase
            .from('analises')
            .select('id,tipo,status,resumo_executivo,total_tarefas_geradas,relatorio_markdown,loom_url,created_at')
            .eq('id', analise.id)
            .single(),
          supabase
            .from('tarefas_loja')
            .select('id,titulo,bloco,prioridade,ordem')
            .eq('analise_id', analise.id)
            .order('ordem', { ascending: true })
            .limit(5),
        ]);
        setResultAnalise(analiseAtualizada || { ...analise, total_tarefas_geradas: body.tarefas_geradas || 0 });
        setTarefasPreview(previews || []);
        setViewMode('result');
        return;
      }

      // 202 = ainda processando — fecha o modal e mostra banner
      onSaved(analise, true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleRefazer() {
    setViewMode('form');
    setResultAnalise(null);
    setTarefasPreview([]);
    setError(null);
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-card, #1a1a1a)',
        border: '1px solid var(--g-200, #2a2a2a)',
        borderRadius: 12, width: '100%', maxWidth: 560,
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--g-200, #2a2a2a)',
        }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--g-900, #fff)' }}>
            Nova Análise
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--g-500, #6b7280)', fontSize: 18, padding: 4 }}
          >
            ✕
          </button>
        </div>

        {/* ── Resultado pós-processamento ───────────────────────────────── */}
        {viewMode === 'result' && resultAnalise && (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Cabeçalho */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--g-900, #fff)' }}>
                Análise processada!
              </span>
              {resultAnalise.total_tarefas_geradas > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                  background: 'rgba(16,185,129,0.12)', color: '#10b981',
                  border: '1px solid rgba(16,185,129,0.25)',
                }}>
                  {resultAnalise.total_tarefas_geradas} tarefas
                </span>
              )}
            </div>

            {/* Resumo executivo */}
            {resultAnalise.resumo_executivo && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--g-500, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  Resumo Executivo
                </div>
                <div style={{
                  padding: '10px 12px', borderRadius: 8, maxHeight: 140, overflowY: 'auto',
                  background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)',
                  fontSize: 12, color: 'var(--g-800, #e5e7eb)', lineHeight: 1.7,
                }}>
                  {resultAnalise.resumo_executivo}
                </div>
              </div>
            )}

            {/* Preview das tarefas */}
            {tarefasPreview.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--g-500, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  Tarefas geradas
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                  {tarefasPreview.map((t, i) => (
                    <div key={t.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                      padding: '5px 10px', borderRadius: 6,
                      background: 'var(--bg-input, #111)', border: '1px solid var(--g-200, #2a2a2a)',
                    }}>
                      <span style={{ fontSize: 10, color: 'var(--g-500, #6b7280)', minWidth: 16, flexShrink: 0 }}>
                        {t.ordem ?? i + 1}.
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--g-700, #d1d5db)', flex: 1 }}>
                        {t.titulo}
                      </span>
                      <span style={{
                        fontSize: 9, color: 'var(--g-500, #6b7280)', textTransform: 'uppercase',
                        letterSpacing: '0.06em', flexShrink: 0,
                      }}>
                        {t.bloco}
                      </span>
                    </div>
                  ))}
                  {resultAnalise.total_tarefas_geradas > tarefasPreview.length && (
                    <div style={{ fontSize: 11, color: 'var(--g-500, #6b7280)', padding: '3px 10px' }}>
                      + {resultAnalise.total_tarefas_geradas - tarefasPreview.length} mais na aba Tarefas
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Ações */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                type="button"
                onClick={handleRefazer}
                style={{
                  padding: '8px 18px', borderRadius: 6, cursor: 'pointer',
                  background: 'transparent', border: '1px solid var(--g-300, #374151)',
                  color: 'var(--g-600, #9ca3af)', fontSize: 13,
                }}
              >
                Refazer com ajuste
              </button>
              <button
                type="button"
                onClick={() => onAccepted(resultAnalise)}
                style={{
                  padding: '8px 18px', borderRadius: 6, cursor: 'pointer',
                  background: 'var(--red, #b70c00)', border: 'none',
                  color: '#fff', fontSize: 13, fontWeight: 600,
                }}
              >
                Aceitar e criar tarefas
              </button>
            </div>
          </div>
        )}

        {/* Form */}
        {viewMode === 'form' && (
        <form onSubmit={handleSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Tipo */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--g-600, #9ca3af)', marginBottom: 8 }}>
              Tipo de análise
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['inicial', 'periodica', 'urgente'].map(t => (
                <label
                  key={t}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${form.tipo === t ? 'var(--red, #b70c00)' : 'var(--g-200, #2a2a2a)'}`,
                    background: form.tipo === t ? 'rgba(183,12,0,0.10)' : 'transparent',
                    fontSize: 12, color: form.tipo === t ? 'var(--red, #b70c00)' : 'var(--g-600, #9ca3af)',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="radio"
                    name="tipo"
                    value={t}
                    checked={form.tipo === t}
                    onChange={handleChange}
                    style={{ display: 'none' }}
                  />
                  {TIPO_LABEL[t]}
                </label>
              ))}
            </div>
          </div>

          {/* Loom URL */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--g-600, #9ca3af)', marginBottom: 6 }}>
              URL do Loom <span style={{ fontWeight: 400 }}>(opcional)</span>
            </label>
            <input
              type="url"
              name="loom_url"
              value={form.loom_url}
              onChange={handleChange}
              placeholder="https://www.loom.com/share/..."
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '8px 12px', borderRadius: 6, border: '1px solid var(--g-200, #2a2a2a)',
                background: 'var(--bg-input, #111)', color: 'var(--g-900, #fff)',
                fontSize: 13,
              }}
            />
          </div>

          {/* Transcrição */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--g-600, #9ca3af)', marginBottom: 6 }}>
              Transcrição da reunião *
            </label>
            <textarea
              name="transcricao"
              value={form.transcricao}
              onChange={handleChange}
              rows={10}
              placeholder="Cole aqui a transcrição da reunião de consultoria com a loja..."
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '8px 12px', borderRadius: 6, border: '1px solid var(--g-200, #2a2a2a)',
                background: 'var(--bg-input, #111)', color: 'var(--g-900, #fff)',
                fontSize: 13, resize: 'vertical', minHeight: 160, lineHeight: 1.6,
                fontFamily: 'inherit',
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '8px 12px', borderRadius: 6,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              color: '#ef4444', fontSize: 12,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '8px 18px', borderRadius: 6, cursor: 'pointer',
                background: 'transparent', border: '1px solid var(--g-300, #374151)',
                color: 'var(--g-600, #9ca3af)', fontSize: 13,
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '8px 18px', borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer',
                background: loading ? '#555' : 'var(--red, #b70c00)',
                border: 'none', color: '#fff', fontSize: 13, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {loading && (
                <span style={{
                  width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff', borderRadius: '50%',
                  animation: 'spin 0.7s linear infinite', display: 'inline-block',
                }} />
              )}
              {loading ? 'Processando…' : 'Processar com IA'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const label = STATUS_LABEL[status] || status;
  const color = STATUS_COLOR[status] || '#6b7280';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 600, padding: '2px 8px',
      borderRadius: 4, background: `${color}1a`, color,
      border: `1px solid ${color}33`,
    }}>
      {status === 'processando' && (
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: color, animation: 'pulse 1.5s ease-in-out infinite',
          display: 'inline-block',
        }} />
      )}
      {label}
    </span>
  );
}

// ── Modal: Enviar análise ao cliente via WhatsApp ─────────────────────────────

const BLOCO_LABEL_PT = {
  identidade: 'IDENTIDADE',
  cardapio:   'CARDÁPIO',
  operacao:   'OPERAÇÃO',
  avaliacoes: 'AVALIAÇÕES',
  marketing:  'MARKETING',
  suporte:    'SUPORTE',
};

function buildWaMessage(nomeLoja, tarefas) {
  const lines = [];
  lines.push(`Análise da ${nomeLoja}`);
  lines.push('');
  lines.push('Olá! Conforme combinado, segue a relação completa de ajustes:');
  let numGlobal = 0;
  let currentBloco = null;
  let blocoNum = 0;
  for (const t of tarefas) {
    numGlobal++;
    if (t.bloco !== currentBloco) {
      currentBloco = t.bloco;
      blocoNum++;
      lines.push('');
      lines.push(`📋 BLOCO ${blocoNum} — ${BLOCO_LABEL_PT[t.bloco] || t.bloco.toUpperCase()}`);
    }
    lines.push('');
    lines.push(`Tarefa ${numGlobal}: ${t.titulo}`);
    lines.push(`Situação: ${t.situacao}`);
  }
  lines.push('');
  lines.push('Pra aprovar, responda:');
  lines.push("- 'OK 1' (aprova tarefa 1)");
  lines.push("- 'OK bloco 1' (aprova bloco inteiro)");
  lines.push("- 'OK tudo' (aprova todas)");
  lines.push("- 'NAO 3' (rejeita tarefa 3)");
  lines.push("- 'DUVIDA 4: [pergunta]' (envia pergunta)");
  lines.push("- 'OK 1, 3, 5' (aprova múltiplas)");
  lines.push('');
  lines.push('Aguardo retorno.');
  return lines.join('\n');
}

function ModalEnviarWhatsapp({ analise, lojaId, onClose, onEnviada }) {
  const [numeroDestino, setNumeroDestino] = useState('');
  const [tarefas, setTarefas] = useState([]);
  const [nomeLoja, setNomeLoja] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      setLoadingData(true);
      try {
        const [{ data: lojaData }, { data: tarefasData }] = await Promise.all([
          supabase.from('lojas').select('nome,whatsapp').eq('id', lojaId).single(),
          supabase
            .from('tarefas_loja')
            .select('id,titulo,bloco,situacao')
            .eq('analise_id', analise.id)
            .order('bloco', { ascending: true })
            .order('ordem_no_bloco', { ascending: true }),
        ]);
        if (lojaData?.nome)     setNomeLoja(lojaData.nome);
        if (lojaData?.whatsapp) setNumeroDestino(lojaData.whatsapp);
        setTarefas(tarefasData || []);
      } catch (err) {
        setError('Erro ao carregar dados: ' + err.message);
      } finally {
        setLoadingData(false);
      }
    }
    load();
  }, [analise.id, lojaId]);

  async function handleEnviar() {
    if (!numeroDestino.trim()) { setError('Informe o número de destino'); return; }
    setLoading(true);
    setError(null);
    try {
      await bridgeFetch(`/api/lojas/${lojaId}/analises/${analise.id}/enviar-whatsapp`, {
        method: 'POST',
        body: JSON.stringify({ numero_destino: numeroDestino.trim() }),
      });
      onEnviada();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const preview = loadingData ? '…carregando…' : buildWaMessage(nomeLoja || 'loja', tarefas);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: 'var(--bg-card, #1a1a1a)',
        border: '1px solid var(--g-200, #2a2a2a)',
        borderRadius: 12, padding: 24,
        width: '100%', maxWidth: 560, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', gap: 16,
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--g-900, #fff)' }}>
            Enviar análise ao cliente via WhatsApp
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--g-500, #6b7280)', fontSize: 20, lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--g-500, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
            Número de destino (formato Evolution API)
          </label>
          <input
            value={numeroDestino}
            onChange={e => setNumeroDestino(e.target.value)}
            placeholder="5511999999999@s.whatsapp.net"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '8px 12px', borderRadius: 6,
              border: '1px solid var(--g-200, #2a2a2a)',
              background: 'var(--bg-input, #111)', color: 'var(--g-900, #fff)',
              fontSize: 13, fontFamily: 'inherit',
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--g-500, #6b7280)', marginTop: 4, display: 'block' }}>
            Ex: 5511999999999@s.whatsapp.net — use o número sem + ou espaços
          </span>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--g-500, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
            Preview da mensagem ({tarefas.length} tarefas)
          </label>
          <pre style={{
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            padding: '10px 12px', borderRadius: 6,
            background: 'var(--bg-input, #111)',
            border: '1px solid var(--g-200, #2a2a2a)',
            fontSize: 11, color: 'var(--g-700, #9ca3af)', lineHeight: 1.6,
            maxHeight: 240, overflowY: 'auto', margin: 0,
            fontFamily: 'inherit',
          }}>
            {preview}
          </pre>
        </div>

        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: 6,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#ef4444', fontSize: 12,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '8px 18px', borderRadius: 6, cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--g-300, #374151)',
              color: 'var(--g-600, #9ca3af)', fontSize: 13,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleEnviar}
            disabled={loading || loadingData}
            style={{
              padding: '8px 18px', borderRadius: 6,
              cursor: (loading || loadingData) ? 'not-allowed' : 'pointer',
              background: (loading || loadingData) ? '#555' : '#8b5cf6',
              border: 'none', color: '#fff', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {loading && (
              <span style={{
                width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#fff', borderRadius: '50%',
                animation: 'spin 0.7s linear infinite', display: 'inline-block',
              }} />
            )}
            {loading ? 'Enviando…' : 'Enviar agora'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Painel de detalhe ─────────────────────────────────────────────────────────

function AnaliseDetalhe({ analise, lojaId, onGoToTarefas, onEnviada }) {
  const [showEnviarModal, setShowEnviarModal] = useState(false);
  if (!analise) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 8, color: 'var(--g-500, #6b7280)', padding: 32,
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <path d="M14 2v6h6"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        <span style={{ fontSize: 13 }}>Selecione uma análise</span>
        <span style={{ fontSize: 11, opacity: 0.6 }}>ou crie uma nova com o botão acima</span>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      overflowY: 'auto', padding: '0 20px 20px',
    }}>
      {/* Header do detalhe */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 0 12px', borderBottom: '1px solid var(--g-200, #2a2a2a)',
        marginBottom: 16, position: 'sticky', top: 0,
        background: 'var(--bg-card, #1a1a1a)', zIndex: 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--g-900, #fff)' }}>
            {TIPO_LABEL[analise.tipo] || analise.tipo || 'Análise'}
          </span>
          <StatusBadge status={analise.status} />
          {analise.total_tarefas_geradas > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
              background: 'rgba(59,130,246,0.12)', color: '#3b82f6',
              border: '1px solid rgba(59,130,246,0.25)',
            }}>
              {analise.total_tarefas_geradas} tarefas
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'var(--g-500, #6b7280)' }}>
          {formatDate(analise.created_at)}
        </span>
      </div>

      {/* Processando spinner */}
      {analise.status === 'processando' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
          marginBottom: 16,
        }}>
          <span style={{
            width: 14, height: 14, border: '2px solid rgba(245,158,11,0.3)',
            borderTopColor: '#f59e0b', borderRadius: '50%',
            animation: 'spin 0.7s linear infinite', display: 'inline-block',
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, color: '#f59e0b' }}>
            A IA está gerando o relatório. Aguarde alguns instantes e atualize a página.
          </span>
        </div>
      )}

      {/* Erro */}
      {analise.status === 'erro' && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          fontSize: 12, color: '#ef4444',
        }}>
          Ocorreu um erro ao processar esta análise. Tente criar uma nova.
        </div>
      )}

      {/* Resumo executivo */}
      {analise.resumo_executivo && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--g-500, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Resumo Executivo
          </div>
          <div style={{
            padding: '12px 14px', borderRadius: 8,
            background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)',
            fontSize: 13, color: 'var(--g-800, #e5e7eb)', lineHeight: 1.7,
          }}>
            {renderMarkdown(analise.resumo_executivo) || analise.resumo_executivo}
          </div>
        </div>
      )}

      {/* Botão Ver tarefas */}
      {analise.total_tarefas_geradas > 0 && onGoToTarefas && (
        <div style={{ marginBottom: 8 }}>
          <button
            onClick={() => onGoToTarefas(analise.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
              background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)',
              color: '#3b82f6', fontSize: 13, fontWeight: 600,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            Ver {analise.total_tarefas_geradas} tarefas geradas
          </button>
        </div>
      )}

      {/* Botão Enviar pra cliente — só quando processada */}
      {analise.status === 'processada' && (
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => setShowEnviarModal(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
              background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)',
              color: '#8b5cf6', fontSize: 13, fontWeight: 600,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            Enviar análise pra cliente via WhatsApp
          </button>
        </div>
      )}

      {/* Modal envio WhatsApp */}
      {showEnviarModal && (
        <ModalEnviarWhatsapp
          analise={analise}
          lojaId={lojaId}
          onClose={() => setShowEnviarModal(false)}
          onEnviada={() => { setShowEnviarModal(false); onEnviada?.(); }}
        />
      )}

      {/* Loom URL */}
      {analise.loom_url && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--g-500, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Vídeo Loom
          </div>
          <a
            href={analise.loom_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: 'var(--info, #3b82f6)', textDecoration: 'underline', wordBreak: 'break-all' }}
          >
            {analise.loom_url}
          </a>
        </div>
      )}

      {/* Relatório markdown */}
      {analise.relatorio_markdown && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--g-500, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Relatório Completo
          </div>
          <div style={{
            padding: '14px 16px', borderRadius: 8,
            background: 'var(--bg-input, #111)', border: '1px solid var(--g-200, #2a2a2a)',
          }}>
            {renderMarkdown(analise.relatorio_markdown)}
          </div>
        </div>
      )}

      {/* Placeholder quando não processada */}
      {analise.status === 'rascunho' && !analise.relatorio_markdown && (
        <div style={{
          padding: '12px 14px', borderRadius: 8,
          background: 'var(--bg-input, #111)', border: '1px solid var(--g-200, #2a2a2a)',
          fontSize: 12, color: 'var(--g-500, #6b7280)',
        }}>
          Esta análise ainda não foi processada. Clique em "Processar com IA" para gerar o relatório.
        </div>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function TabAnalises({ lojaId, userId, onGoToTarefas }) {
  const [analises, setAnalises] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [errorList, setErrorList] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [processingMsg, setProcessingMsg] = useState(null);

  const selectedAnalise = analises.find(a => a.id === selectedId) ?? null;

  const loadAnalises = useCallback(async () => {
    setLoadingList(true);
    setErrorList(null);
    try {
      const data = await bridgeFetch(`/api/lojas/${lojaId}/analises`);
      setAnalises(data.analises || []);
    } catch (err) {
      setErrorList(err.message);
    } finally {
      setLoadingList(false);
    }
  }, [lojaId]);

  useEffect(() => {
    if (!lojaId) return;
    loadAnalises();
  }, [lojaId, loadAnalises]);

  function handleSaved(analise, isProcessing = false) {
    setShowModal(false);
    if (isProcessing) {
      setProcessingMsg('Análise criada! O relatório está sendo gerado (pode levar 1-2 min). Atualize em breve.');
    }
    loadAnalises().then(() => {
      setSelectedId(analise.id);
    });
  }

  function handleAccepted(analise) {
    setShowModal(false);
    loadAnalises().then(() => {
      setSelectedId(analise.id);
    });
    if (onGoToTarefas) onGoToTarefas(analise.id);
  }

  const containerHeight = 560;
  const sidebarWidth = 220;

  return (
    <>
      {/* CSS para animações */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      <div style={{
        display: 'flex', height: containerHeight,
        border: '1px solid var(--g-200, #2a2a2a)', borderRadius: 10,
        background: 'var(--bg-card, #1a1a1a)', overflow: 'hidden',
      }}>
        {/* ── Sidebar: lista de análises ──────────────────────────────────────── */}
        <div style={{
          width: sidebarWidth, flexShrink: 0,
          borderRight: '1px solid var(--g-200, #2a2a2a)',
          display: 'flex', flexDirection: 'column',
          overflowY: 'hidden',
        }}>
          {/* Sidebar header */}
          <div style={{
            padding: '14px 14px 10px',
            borderBottom: '1px solid var(--g-200, #2a2a2a)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--g-700, #d1d5db)' }}>
              Análises
            </span>
            <button
              onClick={() => setShowModal(true)}
              title="Nova análise"
              style={{
                background: 'var(--red, #b70c00)', border: 'none', color: '#fff',
                borderRadius: 6, width: 24, height: 24, fontSize: 18, lineHeight: '1',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              +
            </button>
          </div>

          {/* Lista */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadingList && (
              <div style={{ padding: 14, fontSize: 12, color: 'var(--g-500, #6b7280)' }}>
                Carregando…
              </div>
            )}
            {errorList && (
              <div style={{ padding: 14, fontSize: 12, color: '#ef4444' }}>
                Erro: {errorList}
              </div>
            )}
            {!loadingList && !errorList && analises.length === 0 && (
              <div style={{ padding: 14, fontSize: 12, color: 'var(--g-500, #6b7280)', lineHeight: 1.5 }}>
                Nenhuma análise ainda.
                <br />
                <button
                  onClick={() => setShowModal(true)}
                  style={{
                    marginTop: 8, background: 'none', border: 'none',
                    color: 'var(--red, #b70c00)', fontSize: 12, cursor: 'pointer', padding: 0,
                    fontWeight: 600,
                  }}
                >
                  + Nova análise
                </button>
              </div>
            )}
            {analises.map((a, idx) => {
              const isSelected = a.id === selectedId;
              const label = a.tipo ? (TIPO_LABEL[a.tipo] || a.tipo) : `Análise ${analises.length - idx}`;
              return (
                <button
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 12px',
                    background: isSelected ? 'rgba(183,12,0,0.12)' : 'transparent',
                    border: 'none',
                    borderLeft: `2px solid ${isSelected ? 'var(--red, #b70c00)' : 'transparent'}`,
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--g-200, #2a2a2a)',
                    display: 'flex', flexDirection: 'column', gap: 4,
                  }}
                >
                  <div style={{
                    fontSize: 12, fontWeight: 600,
                    color: isSelected ? 'var(--g-900, #fff)' : 'var(--g-700, #d1d5db)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {label}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <StatusBadge status={a.status} />
                    {a.total_tarefas_geradas > 0 && (
                      <span style={{ fontSize: 10, color: 'var(--g-500, #6b7280)' }}>
                        {a.total_tarefas_geradas}t
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: 'var(--g-500, #6b7280)', marginLeft: 'auto' }}>
                      {formatDate(a.created_at)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Painel central: detalhe ─────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {processingMsg && (
            <div style={{
              padding: '8px 16px', fontSize: 12, color: '#f59e0b',
              background: 'rgba(245,158,11,0.08)', borderBottom: '1px solid rgba(245,158,11,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            }}>
              <span>{processingMsg}</span>
              <button
                onClick={() => { setProcessingMsg(null); loadAnalises(); }}
                style={{
                  background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)',
                  color: '#f59e0b', borderRadius: 4, padding: '2px 10px', fontSize: 11,
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                Atualizar
              </button>
            </div>
          )}

          <AnaliseDetalhe
            analise={selectedAnalise}
            lojaId={lojaId}
            onGoToTarefas={onGoToTarefas}
            onEnviada={loadAnalises}
          />
        </div>
      </div>

      {showModal && (
        <ModalNovaAnalise
          lojaId={lojaId}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
          onAccepted={handleAccepted}
        />
      )}
    </>
  );
}
