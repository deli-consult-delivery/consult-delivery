import { useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import CustomSelect from '../CustomSelect.jsx';
import LeadPanelHeader from './LeadPanelHeader.jsx';
import LeadProfileSection from './LeadProfileSection.jsx';
import LeadNotesSection from './LeadNotesSection.jsx';
import LeadAddressSection from './LeadAddressSection.jsx';
import ReopenButton from './ReopenButton.jsx';
import TagPicker from './TagPicker.jsx';
import ListPicker from './ListPicker.jsx';
import LeadHistorySection from './LeadHistorySection.jsx';

const PIPELINES = ['Prospecção', 'Negociação', 'Fechamento', 'Pós-venda', 'Reativação'];

export default function LeadPanel({ conversation, customer, tenantId, members = [], onClose, onReopened }) {
  // Pipeline
  const [showPipeline, setShowPipeline] = useState(false);
  const [pipeline, setPipeline]         = useState('');
  const [pipelineOk, setPipelineOk]     = useState(false);

  // Criar tarefa
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitle, setTaskTitle]       = useState('');
  const [taskDue, setTaskDue]           = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskSaving, setTaskSaving]     = useState(false);
  const [taskOk, setTaskOk]             = useState(false);

  function confirmPipeline() {
    if (!pipeline) return;
    setPipelineOk(true);
    setShowPipeline(false);
    setTimeout(() => setPipelineOk(false), 3000);
  }

  async function saveTask() {
    if (!taskTitle.trim()) return;
    setTaskSaving(true);
    try {
      await supabase.from('tasks').insert({
        title:       taskTitle.trim(),
        tenant_id:   tenantId,
        col:         'todo',
        due_at:      taskDue || null,
        assignee_id: taskAssignee || null,
      });
      setTaskOk(true);
      setShowTaskForm(false);
      setTaskTitle(''); setTaskDue(''); setTaskAssignee('');
      setTimeout(() => setTaskOk(false), 3000);
    } catch { /* ignore */ }
    setTaskSaving(false);
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      <LeadPanelHeader
        conversation={conversation}
        onClose={onClose}
      />

      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        <LeadProfileSection customer={customer} />

        <Divider />

        {/* Tags do lead */}
        <div style={{ padding: '10px 16px' }}>
          <div style={sectionLabel}>Tags</div>
          <TagPicker customerId={customer?.id} tenantId={tenantId} />
        </div>

        <Divider />

        {/* Listas do lead */}
        <div style={{ padding: '10px 16px' }}>
          <div style={sectionLabel}>Listas</div>
          <ListPicker customerId={customer?.id} tenantId={tenantId} />
        </div>

        <Divider />

        <LeadNotesSection customerId={customer?.id} tenantId={tenantId} />

        <Divider />

        <LeadAddressSection customerId={customer?.id} tenantId={tenantId} />

        <Divider />

        {/* Pipeline */}
        <div style={{ padding: '10px 16px' }}>
          <div style={sectionLabel}>Pipeline</div>
          {pipelineOk ? (
            <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600, padding: '4px 0' }}>
              ✅ Adicionado ao pipeline "{pipeline}"
            </div>
          ) : showPipeline ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1 }}>
                <CustomSelect
                  compact
                  value={pipeline}
                  onChange={v => setPipeline(v)}
                  options={[{ value:'', label:'Selecionar pipeline…' }, ...PIPELINES.map(p => ({ value:p, label:p }))]}
                />
              </div>
              <button className="btn-primary" style={{ padding: '6px 10px', fontSize: 12 }} onClick={confirmPipeline}>OK</button>
              <button className="btn-icon" onClick={() => setShowPipeline(false)}>✕</button>
            </div>
          ) : (
            <button
              className="btn-secondary"
              style={{ justifyContent: 'flex-start', fontSize: 12, gap: 8, width: '100%' }}
              onClick={() => setShowPipeline(true)}
            >
              + Adicionar ao Pipeline
            </button>
          )}
        </div>

        <Divider />

        {/* Criar tarefa */}
        <div style={{ padding: '10px 16px' }}>
          <div style={sectionLabel}>Tarefas</div>
          {taskOk ? (
            <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600, padding: '4px 0' }}>
              ✅ Tarefa criada com sucesso
            </div>
          ) : showTaskForm ? (
            <div style={{ background: 'var(--g-50)', border: '1px solid var(--g-200)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                className="input"
                style={{ fontSize: 12, padding: '6px 8px' }}
                placeholder="Título da tarefa *"
                value={taskTitle}
                onChange={e => setTaskTitle(e.target.value)}
                autoFocus
              />
              <input
                className="input"
                style={{ fontSize: 12, padding: '6px 8px' }}
                type="date"
                value={taskDue}
                onChange={e => setTaskDue(e.target.value)}
              />
              <CustomSelect
                compact
                value={taskAssignee}
                onChange={v => setTaskAssignee(v)}
                options={[{ value:'', label:'Responsável (opcional)' }, ...members.map(m => ({ value:m.id, label:m.full_name || m.email }))]}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn-primary"
                  style={{ flex: 1, fontSize: 12, padding: '6px 0', justifyContent: 'center' }}
                  onClick={saveTask}
                  disabled={taskSaving || !taskTitle.trim()}
                >
                  {taskSaving ? 'Salvando…' : 'Criar tarefa'}
                </button>
                <button className="btn-icon" onClick={() => setShowTaskForm(false)}>✕</button>
              </div>
            </div>
          ) : (
            <button
              className="btn-secondary"
              style={{ justifyContent: 'flex-start', fontSize: 12, gap: 8, width: '100%' }}
              onClick={() => setShowTaskForm(true)}
            >
              + Criar Tarefa
            </button>
          )}
        </div>

        {conversation?.status_v2 === 'closed' && (
          <>
            <Divider />
            <div style={{ padding: '12px 16px' }}>
              <ReopenButton conversation={conversation} onReopened={onReopened} />
            </div>
          </>
        )}

        <Divider />

        <LeadHistorySection customerId={customer?.id} tenantId={tenantId} />
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--g-100)', margin: '0 16px' }} />;
}

const sectionLabel = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--g-500)',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};
