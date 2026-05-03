import { useState, useEffect } from 'react';
import Icon from '../components/Icon.jsx';
import { listClientes, listTarefasCliente, updateStatusTarefa } from '../lib/api.js';

const URGENCIA_CONFIG = {
  alta:  { label: 'Alta',  color: 'var(--red)',    bg: 'var(--red-soft)' },
  media: { label: 'Média', color: '#B45309',        bg: '#FEF3C7' },
  baixa: { label: 'Baixa', color: 'var(--g-500)',   bg: 'var(--g-100)' },
};

const STATUS_OPTIONS = [
  { value: 'pendente',     label: 'Pendente' },
  { value: 'em_progresso', label: 'Em progresso' },
  { value: 'concluida',    label: 'Concluída' },
];

function UrgenciaBadge({ urgencia }) {
  const cfg = URGENCIA_CONFIG[urgencia] ?? URGENCIA_CONFIG.media;
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
      color: cfg.color, background: cfg.bg, letterSpacing: 0.3,
    }}>
      {cfg.label}
    </span>
  );
}

export default function TarefasClienteScreen({ tenantDbId }) {
  const [clientes, setClientes]               = useState([]);
  const [clienteId, setClienteId]             = useState('');
  const [tarefas, setTarefas]                 = useState([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [loadingTarefas, setLoadingTarefas]   = useState(false);
  const [updatingId, setUpdatingId]           = useState(null);

  useEffect(() => {
    if (!tenantDbId) return;
    let alive = true;
    setLoadingClientes(true);
    listClientes(tenantDbId)
      .then(r => { if (alive) { setClientes(r); setLoadingClientes(false); } })
      .catch(() => { if (alive) setLoadingClientes(false); });
    return () => { alive = false; };
  }, [tenantDbId]);

  useEffect(() => {
    if (!clienteId) { setTarefas([]); return; }
    let alive = true;
    setLoadingTarefas(true);
    listTarefasCliente(clienteId)
      .then(r => { if (alive) { setTarefas(r); setLoadingTarefas(false); } })
      .catch(() => { if (alive) setLoadingTarefas(false); });
    return () => { alive = false; };
  }, [clienteId]);

  async function handleStatusChange(tarefaId, newStatus) {
    setUpdatingId(tarefaId);
    try {
      await updateStatusTarefa(tarefaId, newStatus);
      setTarefas(prev => prev.map(t => t.id === tarefaId ? { ...t, status: newStatus } : t));
    } finally {
      setUpdatingId(null);
    }
  }

  const clienteNome = clientes.find(c => c.id === clienteId)?.name ?? '';

  const pendentes    = tarefas.filter(t => t.status === 'pendente');
  const em_progresso = tarefas.filter(t => t.status === 'em_progresso');
  const concluidas   = tarefas.filter(t => t.status === 'concluida');

  return (
    <div className="route-enter page-container" style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>

      {/* Header */}
      <div className="header-wrap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 'var(--r-md)',
            background: 'linear-gradient(135deg, #EA1D2C, #C4111F)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: 22, flexShrink: 0,
          }}>
            <Icon name="check" size={22} />
          </div>
          <div>
            <h1 className="page-h1">Tarefas do Cliente</h1>
            <p className="page-sub">Ações geradas pela Análise iFood</p>
          </div>
        </div>
      </div>

      {/* Cliente selector */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <label htmlFor="cliente-tarefas" className="label" style={{ display: 'block', marginBottom: 6 }}>
          Cliente
        </label>
        <select
          id="cliente-tarefas"
          className="input"
          value={clienteId}
          onChange={e => setClienteId(e.target.value)}
          disabled={loadingClientes}
          style={{ width: '100%', maxWidth: 360, cursor: loadingClientes ? 'not-allowed' : 'pointer' }}
        >
          {loadingClientes
            ? <option value="" disabled>Carregando clientes...</option>
            : <option value="" disabled>Selecione o cliente...</option>
          }
          {clientes.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Empty state — no client selected */}
      {!clienteId && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--g-400)' }}>
          <Icon name="check" size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
          <p style={{ fontSize: 14 }}>Selecione um cliente para ver as tarefas</p>
        </div>
      )}

      {/* Loading */}
      {clienteId && loadingTarefas && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{
            width: 32, height: 32,
            border: '3px solid var(--g-200)',
            borderTopColor: 'var(--red)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto',
          }} />
        </div>
      )}

      {/* Empty state — client has no tasks */}
      {clienteId && !loadingTarefas && tarefas.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--g-400)' }}>
          <p style={{ fontSize: 14 }}>
            Nenhuma tarefa encontrada para <strong>{clienteNome}</strong>.<br />
            Inicie uma Análise iFood para gerar tarefas automáticas.
          </p>
        </div>
      )}

      {/* Task list */}
      {clienteId && !loadingTarefas && tarefas.length > 0 && (
        <>
          {/* Summary bar */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Pendentes',     count: pendentes.length,    color: 'var(--g-400)' },
              { label: 'Em progresso',  count: em_progresso.length, color: '#B45309' },
              { label: 'Concluídas',    count: concluidas.length,   color: '#059669' },
            ].map(s => (
              <div key={s.label} style={{
                background: 'var(--white)', border: '1px solid var(--g-200)',
                borderRadius: 'var(--r-md)', padding: '10px 16px',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.count}</span>
                <span style={{ fontSize: 13, color: 'var(--g-500)' }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Task cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tarefas.map((tarefa, i) => (
              <div
                key={tarefa.id}
                className="card"
                style={{
                  padding: '16px 20px',
                  opacity: tarefa.status === 'concluida' ? 0.6 : 1,
                  transition: 'opacity 200ms',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  {/* Priority number */}
                  <span style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: tarefa.status === 'concluida' ? 'var(--g-200)' : 'var(--red)',
                    color: tarefa.status === 'concluida' ? 'var(--g-500)' : 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, flexShrink: 0, marginTop: 2,
                  }}>
                    {i + 1}
                  </span>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{
                        fontSize: 14, fontWeight: 600, color: 'var(--g-900)',
                        textDecoration: tarefa.status === 'concluida' ? 'line-through' : 'none',
                      }}>
                        {tarefa.titulo}
                      </span>
                      <UrgenciaBadge urgencia={tarefa.urgencia} />
                    </div>

                    {tarefa.descricao && (
                      <p style={{ fontSize: 13, color: 'var(--g-500)', marginBottom: 6, lineHeight: 1.5 }}>
                        {tarefa.descricao}
                      </p>
                    )}

                    {tarefa.acao && (
                      <p style={{ fontSize: 13, color: 'var(--g-700)', fontWeight: 500, marginBottom: 6 }}>
                        <span style={{ color: 'var(--g-400)', marginRight: 4 }}>Ação:</span>
                        {tarefa.acao}
                      </p>
                    )}

                    {tarefa.impacto_financeiro && (
                      <p style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>
                        Impacto estimado: {tarefa.impacto_financeiro}
                      </p>
                    )}
                  </div>

                  {/* Status selector */}
                  <select
                    value={tarefa.status}
                    onChange={e => handleStatusChange(tarefa.id, e.target.value)}
                    disabled={updatingId === tarefa.id}
                    className="input"
                    style={{
                      fontSize: 12, padding: '6px 10px', flexShrink: 0,
                      minWidth: 130, cursor: updatingId === tarefa.id ? 'not-allowed' : 'pointer',
                      color: tarefa.status === 'concluida' ? '#059669'
                           : tarefa.status === 'em_progresso' ? '#B45309'
                           : 'var(--g-600)',
                    }}
                  >
                    {STATUS_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
