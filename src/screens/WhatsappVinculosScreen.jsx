/**
 * MIA-04: Configurações — Vínculos WhatsApp ↔ Loja
 *
 * Rota: 'config-whatsapp-vinculos'
 * Acesso: admin + atendimento
 *
 * Lista vínculos por loja com:
 * - toggle monitorar (PATCH /api/whatsapp-vinculo/:id)
 * - último run e qtd sugestões últimas 7d
 * - botão "+ Vincular" → formulário simples
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { getVinculos, createVinculo, patchVinculo, deleteVinculo } from '../lib/miaApi.js';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

export default function WhatsappVinculosScreen({ tenantDbId, userId }) {
  const [lojas, setLojas]     = useState([]);
  const [vinculos, setVinculos] = useState({}); // { lojaId: [vinculo, ...] }
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState(null);

  // Modal novo vínculo
  const [modal, setModal]         = useState(null); // { lojaId, lojaNome }
  const [novoJid, setNovoJid]     = useState('');
  const [novoTipo, setNovoTipo]   = useState('grupo');
  const [saving, setSaving]       = useState(false);

  const loadLojas = useCallback(async () => {
    if (!tenantDbId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('lojas')
        .select('id, nome, slug, status')
        .eq('tenant_id', tenantDbId)
        .eq('status', 'ativo')
        .order('nome');
      setLojas(data || []);
    } catch (err) {
      console.error('[WhatsappVinculosScreen] loadLojas:', err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantDbId]);

  useEffect(() => { loadLojas(); }, [loadLojas]);

  async function loadVinculos(lojaId) {
    try {
      const data = await getVinculos(lojaId);
      setVinculos(prev => ({ ...prev, [lojaId]: data || [] }));
    } catch (err) {
      console.error('[WhatsappVinculosScreen] loadVinculos:', err.message);
    }
  }

  function toggleExpandido(lojaId) {
    if (expandido === lojaId) {
      setExpandido(null);
    } else {
      setExpandido(lojaId);
      if (!vinculos[lojaId]) loadVinculos(lojaId);
    }
  }

  async function toggleMonitorar(lojaId, vinculo) {
    const novoVal = !vinculo.monitorar;
    // Otimistic update
    setVinculos(prev => ({
      ...prev,
      [lojaId]: prev[lojaId].map(v =>
        v.id === vinculo.id ? { ...v, monitorar: novoVal } : v
      ),
    }));
    try {
      await patchVinculo(vinculo.id, { monitorar: novoVal });
    } catch (err) {
      console.error('[WhatsappVinculosScreen] toggleMonitorar:', err.message);
      // Reverte
      setVinculos(prev => ({
        ...prev,
        [lojaId]: prev[lojaId].map(v =>
          v.id === vinculo.id ? { ...v, monitorar: !novoVal } : v
        ),
      }));
    }
  }

  async function removerVinculo(lojaId, vinculoId) {
    if (!window.confirm('Remover vínculo? O monitoramento desta conversa será desativado.')) return;
    try {
      await deleteVinculo(vinculoId);
      setVinculos(prev => ({
        ...prev,
        [lojaId]: prev[lojaId].filter(v => v.id !== vinculoId),
      }));
    } catch (err) {
      console.error('[WhatsappVinculosScreen] removerVinculo:', err.message);
      alert('Erro ao remover: ' + err.message);
    }
  }

  async function salvarVinculo() {
    if (!novoJid.trim() || !modal) return;
    setSaving(true);
    try {
      const criado = await createVinculo(modal.lojaId, {
        remote_jid: novoJid.trim(),
        tipo: novoTipo,
      });
      setVinculos(prev => ({
        ...prev,
        [modal.lojaId]: [criado, ...(prev[modal.lojaId] || [])],
      }));
      setModal(null);
      setNovoJid('');
      setNovoTipo('grupo');
    } catch (err) {
      alert('Erro ao criar vínculo: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function formatarData(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div style={{ padding: 24, maxWidth: 860, color: 'rgba(255,255,255,0.85)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'white' }}>
            📲 Vínculos WhatsApp — MIA
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            Configure quais grupos/contatos o Monitor IA monitora por loja
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Carregando lojas…</div>
      ) : lojas.length === 0 ? (
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Nenhuma loja ativa encontrada.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lojas.map(loja => (
            <div key={loja.id} style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              overflow: 'hidden',
            }}>
              {/* Row da loja */}
              <div
                onClick={() => toggleExpandido(loja.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  cursor: 'pointer',
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{loja.nome}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                  {vinculos[loja.id]?.length ?? '?'} vínculo{vinculos[loja.id]?.length !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); setModal({ lojaId: loja.id, lojaNome: loja.nome }); }}
                  style={{
                    fontSize: 11,
                    padding: '4px 10px',
                    background: '#B70C00',
                    color: 'white',
                    border: 'none',
                    borderRadius: 5,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  + Vincular
                </button>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                  {expandido === loja.id ? '▲' : '▼'}
                </span>
              </div>

              {/* Vínculos da loja */}
              {expandido === loja.id && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  {!vinculos[loja.id] ? (
                    <div style={{ padding: '12px 16px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Carregando…</div>
                  ) : vinculos[loja.id].length === 0 ? (
                    <div style={{ padding: '12px 16px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                      Nenhum grupo/contato vinculado. Clique em "+ Vincular" para adicionar.
                    </div>
                  ) : vinculos[loja.id].map(v => (
                    <div key={v.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 16px',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>
                      {/* Toggle monitorar */}
                      <button
                        onClick={() => toggleMonitorar(loja.id, v)}
                        style={{
                          width: 36,
                          height: 20,
                          borderRadius: 10,
                          background: v.monitorar ? '#22C55E' : 'rgba(255,255,255,0.1)',
                          border: 'none',
                          cursor: 'pointer',
                          position: 'relative',
                          transition: 'background 200ms',
                          flexShrink: 0,
                        }}
                        title={v.monitorar ? 'Monitorando — clicar para pausar' : 'Pausado — clicar para ativar'}
                      >
                        <span style={{
                          position: 'absolute',
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          background: 'white',
                          top: 3,
                          left: v.monitorar ? 19 : 3,
                          transition: 'left 200ms',
                        }} />
                      </button>

                      {/* JID + tipo */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: 'white', fontFamily: 'monospace' }}>
                          {v.remote_jid}
                        </div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
                          {v.tipo} · último run: {formatarData(v.ultimo_run_em)}
                        </div>
                      </div>

                      {/* Remover */}
                      <button
                        onClick={() => removerVinculo(loja.id, v.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'rgba(239,68,68,0.6)',
                          fontSize: 14,
                          cursor: 'pointer',
                          padding: 4,
                          lineHeight: 1,
                        }}
                        title="Remover vínculo"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal: novo vínculo */}
      {modal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}
          onClick={e => { if (e.target === e.currentTarget) setModal(null); }}
        >
          <div style={{
            background: '#1a1a1a',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 12,
            padding: 24,
            width: 380,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'white' }}>
              📲 Vincular grupo/contato
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
              Loja: <strong style={{ color: 'white' }}>{modal.lojaNome}</strong>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 5, textTransform: 'uppercase' }}>
                Remote JID (ex: 5511999@g.us)
              </div>
              <input
                value={novoJid}
                onChange={e => setNovoJid(e.target.value)}
                placeholder="5511999999999@g.us"
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  color: 'white',
                  fontSize: 12,
                  padding: '7px 10px',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 5, textTransform: 'uppercase' }}>Tipo</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {['grupo', 'privado'].map(t => (
                  <button
                    key={t}
                    onClick={() => setNovoTipo(t)}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      background: novoTipo === t ? '#B70C00' : 'rgba(255,255,255,0.07)',
                      border: '1px solid',
                      borderColor: novoTipo === t ? '#B70C00' : 'rgba(255,255,255,0.1)',
                      borderRadius: 6,
                      color: 'white',
                      fontSize: 12,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={() => setModal(null)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 7,
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={salvarVinculo}
                disabled={saving || !novoJid.trim()}
                style={{
                  flex: 2,
                  padding: '8px 0',
                  background: saving || !novoJid.trim() ? 'rgba(183,12,0,0.35)' : '#B70C00',
                  border: 'none',
                  borderRadius: 7,
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: saving || !novoJid.trim() ? 'default' : 'pointer',
                }}
              >
                {saving ? 'Salvando…' : 'Vincular'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
