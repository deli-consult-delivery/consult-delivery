import { useState } from 'react';
import Icon from './Icon.jsx';

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

function BlocoCard({ blocoKey, bloco }) {
  const [open, setOpen] = useState(false);
  const label = BLOCO_LABEL[blocoKey] || blocoKey;
  const s = STATUS_COLOR[bloco.status] || STATUS_COLOR.atencao;
  const pontos = bloco.pontos || [];

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: s.color, flexShrink: 0,
          }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--g-900)' }}>{label}</span>
          <StatusBadge status={bloco.status} small />
        </div>
        <span style={{ fontSize: 12, color: 'var(--g-400)', flexShrink: 0 }}>
          {pontos.length} ponto{pontos.length !== 1 ? 's' : ''} {open ? '▲' : '▼'}
        </span>
      </button>

      {open && pontos.length > 0 && (
        <div style={{ borderTop: '1px solid var(--g-100)', padding: '4px 18px 14px' }}>
          {pontos.map((p, i) => (
            <div key={i} style={{
              padding: '10px 0',
              borderBottom: i < pontos.length - 1 ? '1px solid var(--g-100)' : 'none',
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <StatusBadge status={p.status} small />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-900)', marginBottom: 2 }}>
                  {p.titulo}
                </p>
                {p.descricao && (
                  <p style={{ fontSize: 12, color: 'var(--g-500)', marginBottom: 4 }}>{p.descricao}</p>
                )}
                {p.acao && (
                  <p style={{ fontSize: 12, color: 'var(--g-700)', fontWeight: 500 }}>
                    ✅ {p.acao}
                  </p>
                )}
              </div>
            </div>
          ))}
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
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--g-900)' }}>
            Mensagem WhatsApp
          </span>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 9999,
            background: '#D1FAE5', color: '#059669',
          }}>pronta pra enviar</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className={copied ? 'btn-primary' : 'btn-secondary'}
          style={{ fontSize: 13, gap: 6, display: 'flex', alignItems: 'center' }}
        >
          {copied ? '✓ Copiado!' : '📋 Copiar'}
        </button>
      </div>
      <pre style={{
        fontSize: 13,
        lineHeight: 1.6,
        color: 'var(--g-700)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        background: 'var(--g-50)',
        borderRadius: 'var(--r-sm)',
        padding: 14,
        margin: 0,
        fontFamily: 'inherit',
        maxHeight: 320,
        overflowY: 'auto',
      }}>
        {mensagem}
      </pre>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AnaliseResultado({ resultado_json, mensagem_whatsapp, onNovaAnalise }) {
  const analise = extractAnalise(resultado_json);

  if (!analise) {
    return (
      <div className="card" style={{ padding: 28, textAlign: 'center' }}>
        <p style={{ color: 'var(--g-500)', fontSize: 14 }}>
          Não foi possível carregar o resultado da análise.
        </p>
        <button type="button" className="btn-secondary" style={{ marginTop: 12 }} onClick={onNovaAnalise}>
          Nova Análise
        </button>
      </div>
    );
  }

  const saude    = SAUDE_COLOR[analise.saude_geral] || SAUDE_COLOR.atencao;
  const blocos   = analise.blocos   || {};
  const top5     = analise.top_5_whatsapp || [];
  const waMensagem = mensagem_whatsapp || analise.mensagem_whatsapp || '';
  const data = analise.data_analise
    ? new Date(analise.data_analise + 'T12:00:00').toLocaleDateString('pt-BR')
    : null;

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

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
          <span style={{
            padding: '6px 14px', borderRadius: 9999,
            background: saude.bg, color: saude.color,
            fontSize: 13, fontWeight: 700,
          }}>
            {saude.label}
          </span>
        </div>

        {analise.resumo_executivo && (
          <p style={{
            fontSize: 13, color: 'var(--g-600)', lineHeight: 1.6,
            marginTop: 14, paddingTop: 14,
            borderTop: '1px solid var(--g-100)',
          }}>
            {analise.resumo_executivo}
          </p>
        )}
      </div>

      {/* WhatsApp message — posição de destaque */}
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
                  width: 22, height: 22, borderRadius: '50%',
                  background: 'var(--red)', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1,
                }}>{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-900)', marginBottom: 2 }}>
                    {item.titulo || item}
                  </p>
                  {item.acao && (
                    <p style={{ fontSize: 12, color: 'var(--g-500)' }}>✅ {item.acao}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 9 Blocos */}
      {Object.keys(blocos).length > 0 && (
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-500)', marginBottom: 10, paddingLeft: 2 }}>
            ANÁLISE DETALHADA — {Object.keys(blocos).length} blocos
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(blocos).map(([key, bloco]) => (
              <BlocoCard key={key} blocoKey={key} bloco={bloco} />
            ))}
          </div>
        </div>
      )}

      {/* Botão nova análise */}
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={onNovaAnalise}
          style={{ fontSize: 14 }}
        >
          + Nova Análise
        </button>
      </div>

    </div>
  );
}
