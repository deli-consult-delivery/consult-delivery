import { useState } from 'react';
import SugestaoModal from './SugestaoModal.jsx';
import AgenteFeedbackModal from './AgenteFeedbackModal.jsx';
import { createTasksFromAnalise } from '../lib/api.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLOR = {
  bom:     { bg: '#D1FAE5', color: '#059669', label: 'Bom'      },
  atencao: { bg: '#FEF3C7', color: '#D97706', label: 'Atenção'  },
  critico: { bg: '#FEE2E2', color: '#DC2626', label: 'Crítico'  },
};

const SAUDE_COLOR = {
  saudavel: { bg: '#D1FAE5', color: '#059669', label: '✅ Saudável' },
  atencao:  { bg: '#FEF3C7', color: '#D97706', label: '⚠️ Atenção'  },
  critica:  { bg: '#FEE2E2', color: '#DC2626', label: '🔴 Crítica'  },
};

const BLOCO_LABEL = {
  identidade_visual: 'Identidade Visual',
  desempenho:        'Desempenho',
  operacao:          'Operação',
  funil_conversao:   'Funil de Conversão',
  cardapio:          'Cardápio',
  concorrencia:      'Concorrência',
  marketing:         'Marketing',
  avaliacoes:        'Avaliações',
  configuracoes:     'Configurações',
};

function StatusBadge({ status, small }) {
  const s = STATUS_COLOR[status] || STATUS_COLOR.atencao;
  return (
    <span style={{
      display: 'inline-block',
      padding: small ? '1px 7px' : '2px 10px',
      borderRadius: 9999,
      fontSize: small ? 11 : 12,
      fontWeight: 700,
      background: s.bg,
      color: s.color,
      flexShrink: 0,
    }}>
      {s.label}
    </span>
  );
}

// Extrai análise do resultado_json independente do formato (wrapper OpenClaw ou direto)
export function extractAnalise(resultado_json) {
  if (!resultado_json) return null;
  if (resultado_json.loja_nome) return resultado_json;
  if (resultado_json.texto_bruto) {
    try { return JSON.parse(resultado_json.texto_bruto); } catch (_) { return null; }
  }
  // Wrapper OpenClaw: { result: { meta: { finalAssistantRawText: "..." } } }
  const raw = resultado_json?.result?.meta?.finalAssistantRawText;
  if (raw) {
    try {
      const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      return JSON.parse(cleaned);
    } catch (_) { return null; }
  }
  return null;
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function BlocoCard({ blocoKey, bloco, selecionados, onToggle, tenantDbId }) {
  const [open, setOpen]           = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const label  = BLOCO_LABEL[blocoKey] || blocoKey;
  const s      = STATUS_COLOR[bloco.status] || STATUS_COLOR.atencao;
  const pontos = bloco.pontos || [];

  const selecionadosNoBloco = pontos.filter((_, i) => selecionados.has(`${blocoKey}_${i}`)).length;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            flex: 1, display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', padding: '14px 18px',
            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--g-900)' }}>{label}</span>
            <StatusBadge status={bloco.status} small />
            {selecionadosNoBloco > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 9999, background: '#DBEAFE', color: '#2563EB' }}>
                {selecionadosNoBloco} marcado{selecionadosNoBloco > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <span style={{ fontSize: 12, color: 'var(--g-400)', flexShrink: 0 }}>
            {pontos.length} ponto{pontos.length !== 1 ? 's' : ''} {open ? '▲' : '▼'}
          </span>
        </button>
        <button
          type="button"
          title="Treinar agente — reportar erro neste bloco"
          onClick={e => { e.stopPropagation(); setShowFeedback(true); }}
          style={{
            padding: '14px 14px', background: 'none', border: 'none',
            cursor: 'pointer', fontSize: 14, opacity: 0.4,
            borderLeft: '1px solid var(--g-100)',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
          onMouseLeave={e => e.currentTarget.style.opacity = '0.4'}
        >
          🚩
        </button>
      </div>
      {showFeedback && (
        <AgenteFeedbackModal tenantDbId={tenantDbId} blocoKey={blocoKey} onClose={() => setShowFeedback(false)} />
      )}

      {open && pontos.length > 0 && (
        <div style={{ borderTop: '1px solid var(--g-100)', padding: '4px 18px 14px' }}>
          {pontos.map((p, i) => {
            const key       = `${blocoKey}_${i}`;
            const marcado   = selecionados.has(key);
            return (
              <div key={i} style={{
                padding: '10px 0',
                borderBottom: i < pontos.length - 1 ? '1px solid var(--g-100)' : 'none',
                display: 'flex', gap: 10, alignItems: 'flex-start',
              }}>
                {/* Checkbox WhatsApp */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', flex: 1 }}
                  onClick={e => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() => onToggle(key)}
                    style={{ marginTop: 3, cursor: 'pointer', accentColor: '#25D366', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <StatusBadge status={p.status} small />
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-900)', margin: 0 }}>
                        {p.titulo}
                      </p>
                    </div>
                    {p.descricao && (
                      <p style={{ fontSize: 12, color: 'var(--g-500)', marginBottom: 4, marginLeft: 0 }}>{p.descricao}</p>
                    )}
                    {p.acao && (
                      <p style={{ fontSize: 12, color: 'var(--g-700)', fontWeight: 500 }}>✅ {p.acao}</p>
                    )}
                  </div>
                </label>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WhatsAppCard({ mensagem }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(mensagem).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>💬</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--g-900)' }}>Mensagem WhatsApp</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: '#D1FAE5', color: '#059669' }}>
            pronta pra enviar
          </span>
        </div>
        <button type="button" onClick={handleCopy}
          className={copied ? 'btn-primary' : 'btn-secondary'}
          style={{ fontSize: 13, gap: 6, display: 'flex', alignItems: 'center' }}
        >
          {copied ? '✓ Copiado!' : '📋 Copiar'}
        </button>
      </div>
      <pre style={{
        fontSize: 13, lineHeight: 1.6, color: 'var(--g-700)',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        background: 'var(--g-50)', borderRadius: 'var(--r-sm)', padding: 14,
        margin: 0, fontFamily: 'inherit', maxHeight: 320, overflowY: 'auto',
      }}>
        {mensagem}
      </pre>
    </div>
  );
}

// Modal de preview dos pontos selecionados para envio
function EnvioModal({ pontosSelecionados, onClose }) {
  const [copied, setCopied] = useState(false);

  const texto = pontosSelecionados.map(p =>
    [`📌 *${p.titulo}*`, p.descricao, p.acao ? `✅ Ação: ${p.acao}` : ''].filter(Boolean).join('\n')
  ).join('\n\n');

  function handleCopy() {
    navigator.clipboard.writeText(texto).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card" style={{ width: '100%', maxWidth: 520, padding: 24, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 20 }}>📤</span>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--g-900)', flex: 1 }}>
            {pontosSelecionados.length} ponto{pontosSelecionados.length > 1 ? 's' : ''} para enviar
          </h3>
          <button type="button" onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--g-400)', lineHeight: 1 }}>
            ×
          </button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--g-500)', marginBottom: 12 }}>
          Copie o texto abaixo e envie manualmente pelo WhatsApp do cliente.
        </p>
        <pre style={{
          flex: 1, overflowY: 'auto', fontSize: 13, lineHeight: 1.7,
          color: 'var(--g-700)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          background: 'var(--g-50)', borderRadius: 'var(--r-sm)', padding: 14,
          margin: 0, fontFamily: 'inherit',
        }}>
          {texto}
        </pre>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Fechar</button>
          <button type="button" className="btn-primary" onClick={handleCopy}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {copied ? '✓ Copiado!' : '📋 Copiar tudo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AnaliseResultado({ resultado_json, mensagem_whatsapp, onNovaAnalise, tenantDbId, analiseId, clienteId }) {
  const analise = extractAnalise(resultado_json);

  const [selecionados, setSelecionados]   = useState(new Set());
  const [showEnvio, setShowEnvio]         = useState(false);
  const [showSugestao, setShowSugestao]   = useState(false);
  const [exportando, setExportando]       = useState(false);
  const [exportToast, setExportToast]     = useState(null);

  function togglePonto(key) {
    setSelecionados(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function exportarParaKanban() {
    if (!analiseId || !clienteId) return;
    const blocos = analise?.blocos || {};
    const pontos = [];
    Object.values(blocos).forEach(bloco => {
      (bloco.pontos || []).forEach(p => {
        if (p.status === 'critico' || p.status === 'atencao') pontos.push(p);
      });
    });
    if (pontos.length === 0) { setExportToast('Nenhum ponto crítico ou de atenção encontrado.'); setTimeout(() => setExportToast(null), 3000); return; }
    setExportando(true);
    try {
      const criadas = await createTasksFromAnalise({ tenantId: tenantDbId, analiseId, clienteId, pontos });
      setExportToast(`✅ ${criadas.length} tarefas criadas no Kanban!`);
    } catch {
      setExportToast('Erro ao criar tarefas. Tente novamente.');
    } finally {
      setExportando(false);
      setTimeout(() => setExportToast(null), 4000);
    }
  }

  if (!analise) {
    return (
      <div className="card" style={{ padding: 28, textAlign: 'center' }}>
        <p style={{ color: 'var(--g-500)', fontSize: 14 }}>Não foi possível carregar o resultado da análise.</p>
      </div>
    );
  }

  const saude      = SAUDE_COLOR[analise.saude_geral] || SAUDE_COLOR.atencao;
  const blocos     = analise.blocos || {};
  const top5       = analise.top_5_whatsapp || [];
  const waMensagem = mensagem_whatsapp || analise.mensagem_whatsapp || '';
  const data       = analise.data_analise
    ? new Date(analise.data_analise + 'T12:00:00').toLocaleDateString('pt-BR')
    : null;

  // Pontos selecionados como objetos para o modal de envio
  const pontosSelecionadosObj = [];
  Object.entries(blocos).forEach(([blocoKey, bloco]) => {
    (bloco.pontos || []).forEach((p, i) => {
      if (selecionados.has(`${blocoKey}_${i}`)) pontosSelecionadosObj.push(p);
    });
  });

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: selecionados.size > 0 ? 80 : 0 }}>

      {/* Header */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--g-900)', marginBottom: 4 }}>
              {analise.loja_nome || 'Análise concluída'}
            </h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {data && <span style={{ fontSize: 12, color: 'var(--g-500)' }}>{data}</span>}
              {analise.tipo_analise && (
                <span style={{ fontSize: 12, color: 'var(--g-400)', textTransform: 'capitalize' }}>
                  • Análise {analise.tipo_analise}
                </span>
              )}
            </div>
          </div>
          <span style={{ padding: '6px 14px', borderRadius: 9999, background: saude.bg, color: saude.color, fontSize: 13, fontWeight: 700 }}>
            {saude.label}
          </span>
        </div>
        {analise.resumo_executivo && (
          <p style={{ fontSize: 13, color: 'var(--g-600)', lineHeight: 1.6, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--g-100)' }}>
            {analise.resumo_executivo}
          </p>
        )}
      </div>

      {/* WhatsApp message */}
      {waMensagem && <WhatsAppCard mensagem={waMensagem} />}

      {/* TOP 5 */}
      {top5.length > 0 && (
        <div className="card" style={{ padding: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--g-900)', marginBottom: 14 }}>
            🎯 Top 5 prioridades da semana
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {top5.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%', background: 'var(--red)', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1,
                }}>{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-900)', marginBottom: 2 }}>{item.titulo || item}</p>
                  {item.acao && <p style={{ fontSize: 12, color: 'var(--g-500)' }}>✅ {item.acao}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 9 Blocos com checkboxes */}
      {Object.keys(blocos).length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingLeft: 2 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-500)' }}>
              ANÁLISE DETALHADA — {Object.keys(blocos).length} blocos
            </p>
            <p style={{ fontSize: 12, color: 'var(--g-400)' }}>
              ☑ Marque os pontos para enviar ao cliente via WhatsApp
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(blocos).map(([key, bloco]) => (
              <BlocoCard key={key} blocoKey={key} bloco={bloco} selecionados={selecionados} onToggle={togglePonto} tenantDbId={tenantDbId} />
            ))}
          </div>
        </div>
      )}

      {/* Rodapé */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, flexWrap: 'wrap', gap: 8 }}>
        {analiseId && clienteId && (
          <button type="button" className="btn-secondary" onClick={exportarParaKanban}
            disabled={exportando}
            style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            {exportando ? 'Exportando...' : '📋 Exportar críticos para Kanban'}
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={() => setShowSugestao(true)}
          style={{ fontSize: 13, color: 'var(--g-500)', marginLeft: 'auto' }}>
          💡 Sugerir melhoria
        </button>
      </div>

      {exportToast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a1a', color: 'white', borderRadius: 9999,
          padding: '10px 20px', fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 101, whiteSpace: 'nowrap',
        }}>
          {exportToast}
        </div>
      )}

      {/* Barra flutuante de pontos selecionados */}
      {selecionados.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a1a', color: 'white', borderRadius: 9999,
          padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 100, whiteSpace: 'nowrap',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {selecionados.size} ponto{selecionados.size > 1 ? 's' : ''} selecionado{selecionados.size > 1 ? 's' : ''}
          </span>
          <button type="button" onClick={() => setSelecionados(new Set())}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 9999, color: 'white', fontSize: 12, padding: '4px 10px', cursor: 'pointer' }}>
            Limpar
          </button>
          <button type="button" onClick={() => setShowEnvio(true)}
            style={{ background: '#25D366', border: 'none', borderRadius: 9999, color: 'white', fontSize: 13, fontWeight: 700, padding: '6px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            📤 Preparar envio
          </button>
        </div>
      )}

      {showEnvio && (
        <EnvioModal pontosSelecionados={pontosSelecionadosObj} onClose={() => setShowEnvio(false)} />
      )}

      {showSugestao && (
        <SugestaoModal tenantDbId={tenantDbId} tela="analise-ifood" onClose={() => setShowSugestao(false)} />
      )}

    </div>
  );
}
