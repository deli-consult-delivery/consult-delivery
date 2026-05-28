/**
 * MIA-03: ClienteFocoPanel — painel "Cliente em Foco" no ChatAoVivo
 *
 * Aparece quando a conversa ativa tem um loja_whatsapp_vinculo com monitorar=true.
 * Exibe: SugestoesInbox, DocViewer, TarefasResumo em tabs.
 *
 * Props:
 *   lojaId     (string) — id da loja vinculada
 *   conversaId (string) — id da conversa ativa
 *   tenantId   (string) — tenant do usuário (para canal Realtime)
 */

import { useState } from 'react';
import SugestoesInbox from './SugestoesInbox.jsx';
import DocViewer from './DocViewer.jsx';
import TarefasResumo from './TarefasResumo.jsx';

const TABS = [
  { id: 'sugestoes', label: '🤖 IA',    title: 'Sugestões da IA' },
  { id: 'doc',       label: '📋 DOC',   title: 'DOC do Cliente' },
  { id: 'tarefas',   label: '✅ Ações', title: 'Tarefas abertas' },
];

export default function ClienteFocoPanel({ lojaId, conversaId, tenantId }) {
  const [tab, setTab] = useState('sugestoes');

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        paddingBottom: 0,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.5)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 8,
        }}>
          Cliente em Foco · MIA
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              title={t.title}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: '5px 0',
                background: 'transparent',
                border: 'none',
                borderBottom: tab === t.id
                  ? '2px solid #B70C00'
                  : '2px solid transparent',
                color: tab === t.id ? 'white' : 'rgba(255,255,255,0.4)',
                fontSize: 11,
                fontWeight: tab === t.id ? 700 : 400,
                cursor: 'pointer',
                transition: 'color 150ms',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo da tab */}
      <div style={{ paddingTop: 12 }}>
        {tab === 'sugestoes' && (
          <SugestoesInbox
            lojaId={lojaId}
            conversaId={conversaId}
            tenantId={tenantId}
          />
        )}
        {tab === 'doc' && (
          <DocViewer lojaId={lojaId} />
        )}
        {tab === 'tarefas' && (
          <TarefasResumo lojaId={lojaId} />
        )}
      </div>
    </div>
  );
}
