import { useState } from 'react';
import Icon from '../Icon.jsx';
import UserAvatar from '../UserAvatar.jsx';
import AgentAvatar from '../AgentAvatar.jsx';
import { AGENTS } from '../../data.js';

const PRIORITY_ORDER = { high: 0, med: 1, low: 2 };
const PRIORITY_META  = {
  high: { label: 'Urgente', cls: 'badge-red',    dot: 'var(--red)'     },
  med:  { label: 'Média',   cls: 'badge-yellow', dot: 'var(--warn)'    },
  low:  { label: 'Baixa',   cls: 'badge-green',  dot: 'var(--success)' },
};
const COL_META = {
  todo:     { label: 'A Fazer',       color: 'var(--g-400)'   },
  progress: { label: 'Em Andamento',  color: 'var(--info)'    },
  review:   { label: 'Em Revisão',    color: 'var(--warn)'    },
  done:     { label: 'Concluído',     color: 'var(--success)' },
};

export default function TaskList({ tasks, onEdit, onDelete }) {
  const [sortKey, setSortKey]   = useState('priority');
  const [sortDir, setSortDir]   = useState('asc');
  const [confirmId, setConfirmId] = useState(null);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  const sorted = [...tasks].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'priority') cmp = (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
    else if (sortKey === 'title')    cmp = a.title.localeCompare(b.title, 'pt-BR');
    else if (sortKey === 'col')      cmp = (a.col ?? '').localeCompare(b.col ?? '', 'pt-BR');
    else if (sortKey === 'assignee') cmp = (a.assigneeName ?? a.assignee ?? '').localeCompare(b.assigneeName ?? b.assignee ?? '', 'pt-BR');
    else if (sortKey === 'due')      cmp = (a.due ?? '').localeCompare(b.due ?? '', 'pt-BR');
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function SortIcon({ col }) {
    if (sortKey !== col) return <Icon name="chevdown" size={10} style={{ opacity: 0.3 }} />;
    return <Icon name={sortDir === 'asc' ? 'arrowup' : 'arrowdown'} size={10} style={{ color: 'var(--red)' }} />;
  }

  function Th({ col, label, style }) {
    return (
      <th onClick={() => toggleSort(col)} style={style}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {label} <SortIcon col={col} />
        </span>
      </th>
    );
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <table className="task-tbl">
        <thead>
          <tr>
            <Th col="priority" label="Prioridade" style={{ width: 110 }} />
            <Th col="title"    label="Título" />
            <Th col="col"      label="Status"     style={{ width: 140 }} />
            <Th col="assignee" label="Responsável" style={{ width: 130 }} />
            <Th col="due"      label="Prazo"       style={{ width: 110 }} />
            <th style={{ width: 80, textAlign: 'right' }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--g-400)' }}>
                Nenhuma tarefa encontrada.
              </td>
            </tr>
          )}
          {sorted.map(t => {
            const p     = PRIORITY_META[t.priority] || PRIORITY_META.med;
            const col   = COL_META[t.col] || COL_META.todo;
            const agent = t.agent ? AGENTS.find(a => a.id === t.agent) : null;
            return (
              <tr key={t.id}>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.dot, flexShrink: 0 }} />
                    <span className={`badge ${p.cls}`} style={{ fontSize: 10 }}>{p.label}</span>
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--g-900)', lineHeight: 1.3 }}>{t.title}</div>
                      {t.desc && (
                        <div style={{ fontSize: 11, color: 'var(--g-400)', lineHeight: 1.3, marginTop: 1 }}>
                          {t.desc.slice(0, 60)}{t.desc.length > 60 ? '…' : ''}
                        </div>
                      )}
                    </div>
                    {agent && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                        <AgentAvatar id={t.agent} size={16} />
                      </span>
                    )}
                    {t.fonte === 'analise' && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 9999, background: '#FEE2E2', color: '#B91C1C' }}>
                        🍔
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: col.color }} />
                    {col.label}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <UserAvatar name={t.assignee} size={22} />
                    <span style={{ fontSize: 12, color: 'var(--g-700)' }}>
                      {t.assigneeName ? t.assigneeName.split(' ')[0] : t.assignee}
                    </span>
                  </div>
                </td>
                <td>
                  {t.due ? (
                    <span style={{ fontSize: 12, color: t.due === 'Hoje' ? 'var(--red)' : 'var(--g-600)', fontWeight: t.due === 'Hoje' ? 700 : 400 }}>
                      {t.due}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--g-300)', fontSize: 12 }}>—</span>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                    <button
                      onClick={() => onEdit(t)}
                      style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--g-100)', border: '1px solid var(--g-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      title="Editar"
                    >
                      <Icon name="edit" size={12} style={{ color: 'var(--g-600)' }} />
                    </button>
                    {confirmId === t.id ? (
                      <button
                        onClick={() => { onDelete(t.id); setConfirmId(null); }}
                        style={{ height: 28, padding: '0 8px', borderRadius: 6, background: 'var(--red)', border: 'none', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'white' }}
                      >
                        <Icon name="trash" size={11} style={{ color: 'white' }} /> OK
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmId(t.id)}
                        style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--g-100)', border: '1px solid var(--g-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                        title="Excluir"
                      >
                        <Icon name="trash" size={12} style={{ color: 'var(--g-600)' }} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
