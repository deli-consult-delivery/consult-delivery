import { useState } from 'react';
import { usePermissions } from '../../hooks/usePermissions.js';
import DraftsLara from './DraftsLara.jsx';
import CalendarioLara from './CalendarioLara.jsx';
import PublicadosLara from './PublicadosLara.jsx';

const TABS = [
  { id: 'drafts',     label: 'Rascunhos',   icon: '✍️' },
  { id: 'calendario', label: 'Calendário',   icon: '📅' },
  { id: 'publicados', label: 'Publicados',   icon: '📢' },
];

export default function LaraEditorialScreen({ tenantDbId, userId }) {
  const [tab, setTab] = useState('drafts');
  const { can } = usePermissions(userId, tenantDbId);

  // marketing e admin podem aprovar/publicar
  const canApprove = can('lara', 'approve') || can('lara', 'execute');

  return (
    <div style={{ padding: '24px 20px', maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: 'linear-gradient(135deg, #B70C00, #FF4D4D)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20,
        }}>
          ✨
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--g-900)' }}>LARA Editorial</h1>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--g-400)' }}>
            Conteúdo gerado automaticamente · seg/qua/sex 9h BRT
          </p>
        </div>
        {!canApprove && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--g-400)', background: 'var(--g-100)', padding: '4px 10px', borderRadius: 20 }}>
            somente leitura
          </span>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--g-200)', marginBottom: 20 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: 'transparent', borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
              color: tab === t.id ? 'var(--primary)' : 'var(--g-500)',
              marginBottom: -1,
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'drafts' && (
        <DraftsLara tenantDbId={tenantDbId} canApprove={canApprove} />
      )}
      {tab === 'calendario' && (
        <CalendarioLara tenantDbId={tenantDbId} />
      )}
      {tab === 'publicados' && (
        <PublicadosLara tenantDbId={tenantDbId} />
      )}
    </div>
  );
}
