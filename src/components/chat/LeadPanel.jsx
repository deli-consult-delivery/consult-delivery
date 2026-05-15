import { useState, useEffect } from 'react';
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

export default function LeadPanel({ conversation, customer, tenantId, members = [], onClose, onReopened, onCustomerLinked }) {

  // === Lead não encontrado ===
  if (!customer?.id) {
    return (
      <NoLeadSection
        conversation={conversation}
        tenantId={tenantId}
        onClose={onClose}
        onLinked={onCustomerLinked}
      />
    );
  }
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

/* ─── Lead não encontrado ─── */
function NoLeadSection({ conversation, tenantId, onClose, onLinked }) {
  const isGroup = conversation?.whatsapp_chat_id?.endsWith('@g.us');
  // name may arrive empty/JID on first render (async Evolution profile fetch); sanitize
  const sanitizeName = n => (n && !n.includes('@') ? n : '');
  const initialPhone = isGroup ? '' : (conversation?.whatsapp_chat_id?.split('@')[0] || '');

  const [mode, setMode]               = useState('idle'); // 'idle' | 'creating' | 'searching'
  const [name, setName]               = useState(sanitizeName(conversation?.name));
  const [phone, setPhone]             = useState(initialPhone);
  const [email, setEmail]             = useState('');
  const [saving, setSaving]           = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setResults]   = useState([]);
  const [searching, setSearching]     = useState(false);

  // Sync name once Evolution profile arrives asynchronously after mount
  useEffect(() => {
    const n = sanitizeName(conversation?.name);
    if (n) setName(prev => prev || n);
  }, [conversation?.name]);

  useEffect(() => {
    if (!searchQuery.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from('customers')
        .select('id, name, phone, avatar, segment')
        .eq('tenant_id', tenantId)
        .or(`name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`)
        .limit(8);
      setResults(data || []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, tenantId]);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    const { data: cust, error } = await supabase
      .from('customers')
      .insert({
        tenant_id: tenantId,
        name:      name.trim(),
        phone:     phone || null,
        email:     email || null,
        avatar:    name.trim().slice(0, 2).toUpperCase(),
        segment:   'Lead',
        tags:      [],
        metadata:  { source: 'chat_create' },
      })
      .select()
      .single();
    if (!error && cust) {
      await supabase.from('conversations').update({ customer_id: cust.id }).eq('id', conversation.id);
      onLinked?.(cust);
    }
    setSaving(false);
  }

  async function handleLink(cust) {
    await supabase.from('conversations').update({ customer_id: cust.id }).eq('id', conversation.id);
    onLinked?.(cust);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <LeadPanelHeader conversation={conversation} onClose={onClose} />

      <div style={{ padding: '20px 16px' }}>

        {mode === 'idle' && (
          <>
            <div style={{ textAlign: 'center', padding: '24px 8px 28px' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', background: 'var(--g-100)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 14px', fontSize: 24,
              }}>👤</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--g-800)', marginBottom: 6 }}>
                Lead não encontrado
              </div>
              <div style={{ fontSize: 12, color: 'var(--g-500)', lineHeight: 1.5 }}>
                Este contato ainda não está cadastrado como lead na plataforma.
              </div>
            </div>

            <button
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginBottom: 10, background: '#B70C00' }}
              onClick={() => setMode('creating')}
            >
              Criar lead
            </button>

            <button
              onClick={() => setMode('searching')}
              style={{
                background: 'none', border: 'none', width: '100%', textAlign: 'center',
                fontSize: 13, color: 'var(--g-500)', cursor: 'pointer',
                textDecoration: 'underline', padding: '6px 0',
              }}
            >
              Atribuir a lead existente
            </button>
          </>
        )}

        {mode === 'creating' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--g-800)', marginBottom: 2 }}>Criar lead</div>

            <div>
              <div style={fieldLabel}>Nome *</div>
              <input className="input" value={name} onChange={e => setName(e.target.value)}
                placeholder="Nome do lead" style={{ width: '100%' }} autoFocus />
            </div>
            <div>
              <div style={fieldLabel}>Telefone</div>
              <input className="input" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="5594..." style={{ width: '100%' }} />
            </div>
            <div>
              <div style={fieldLabel}>E-mail</div>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="email@..." style={{ width: '100%' }} />
            </div>

            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setMode('idle')}>
                Voltar
              </button>
              <button
                className="btn-primary"
                style={{ flex: 2, justifyContent: 'center', background: saving || !name.trim() ? 'rgba(183,12,0,0.4)' : '#B70C00' }}
                disabled={saving || !name.trim()}
                onClick={handleCreate}
              >
                {saving ? 'Salvando…' : 'Criar lead'}
              </button>
            </div>
          </div>
        )}

        {mode === 'searching' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--g-800)', marginBottom: 2 }}>
              Atribuir a lead existente
            </div>
            <input
              className="input"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome ou telefone…"
              autoFocus
              style={{ width: '100%' }}
            />

            {searching && (
              <div style={{ fontSize: 12, color: 'var(--g-500)', textAlign: 'center', padding: '4px 0' }}>Buscando…</div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {searchResults.map(c => (
                <button
                  key={c.id}
                  onClick={() => handleLink(c)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', background: 'var(--g-50)',
                    border: '1px solid var(--g-200)', borderRadius: 8,
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', background: 'var(--g-200)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: 'var(--g-600)', flexShrink: 0,
                  }}>
                    {c.avatar || c.name?.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--g-500)' }}>{c.phone || '—'}</div>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'rgba(183,12,0,0.1)', color: '#B70C00', flexShrink: 0 }}>
                    {c.segment}
                  </div>
                </button>
              ))}
            </div>

            {searchResults.length === 0 && searchQuery && !searching && (
              <div style={{ fontSize: 12, color: 'var(--g-500)', textAlign: 'center', padding: '8px 0' }}>
                Nenhum lead encontrado para "{searchQuery}"
              </div>
            )}

            <button className="btn-secondary" style={{ justifyContent: 'center', marginTop: 4 }}
              onClick={() => setMode('idle')}>
              Voltar
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

const fieldLabel = {
  fontSize: 11, fontWeight: 600, color: 'var(--g-500)',
  marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5,
};

const sectionLabel = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--g-500)',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};
