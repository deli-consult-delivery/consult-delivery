import { useState, useEffect, useRef } from 'react';
import Icon from '../components/Icon.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { supabase } from '../lib/supabase.js';
import {
  fetchGroups,
  createWAGroup,
  updateWAGroupSubject,
  addWAGroupParticipants,
  removeWAGroupParticipant,
  fetchWAGroupParticipants,
  leaveWAGroup,
  sendGroupTextMessage,
} from '../lib/evolution.js';

const GROUP_TYPES = [
  { id: 'geral',       label: 'Geral',        emoji: '💬' },
  { id: 'cozinha',     label: 'Cozinha',       emoji: '🍳' },
  { id: 'atendimento', label: 'Atendimento',   emoji: '🎧' },
  { id: 'entrega',     label: 'Entrega',       emoji: '🛵' },
  { id: 'gerencia',    label: 'Gerência',      emoji: '📊' },
];

const TYPE_MAP = Object.fromEntries(GROUP_TYPES.map(t => [t.id, t]));

const CHAN_COLORS = ['#2563EB','#B70C00','#059669','#D97706','#7C3AED','#0D0D0D','#EC4899','#06B6D4'];

/* ─── Main ────────────────────────────────────────────── */
export default function GruposScreen({ tenant, tenantDbId }) {
  const [tab, setTab] = useState('whatsapp');

  return (
    <div className="route-enter" style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-h1">Grupos</h1>
        <p className="page-sub">Grupos WhatsApp dos restaurantes e canais internos da equipe</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid var(--g-200)', paddingBottom: 0 }}>
        {[
          { id: 'whatsapp',  label: 'Grupos WhatsApp', icon: 'whatsapp' },
          { id: 'channels',  label: 'Canais Internos',  icon: 'msg'     },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '10px 18px', fontSize: 14, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? 'var(--red)' : 'var(--g-600)',
              borderBottom: tab === t.id ? '2px solid var(--red)' : '2px solid transparent',
              marginBottom: -1, background: 'none', cursor: 'pointer',
              transition: 'all 150ms',
            }}
          >
            <Icon name={t.icon} size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'whatsapp' && <TabWhatsApp tenant={tenant} tenantDbId={tenantDbId} />}
      {tab === 'channels'  && <TabChannels tenantDbId={tenantDbId} />}
    </div>
  );
}

/* ─── Tab WhatsApp Groups ─────────────────────────────── */
function TabWhatsApp({ tenant, tenantDbId }) {
  const [instances,    setInstances]    = useState([]);
  const [selInstance,  setSelInstance]  = useState('');
  const [groups,       setGroups]       = useState([]);
  const [loadingGroups,setLoadingGroups]= useState(false);
  const [syncing,      setSyncing]      = useState(false);
  const [showCreate,   setShowCreate]   = useState(false);
  const [editGroup,    setEditGroup]    = useState(null);
  const [broadcastGrp, setBroadcastGrp]= useState(null);
  const [membersGrp,   setMembersGrp]  = useState(null);
  const [search,       setSearch]       = useState('');
  const [filterType,   setFilterType]   = useState('all');

  useEffect(() => { loadInstances(); }, []);
  useEffect(() => { if (selInstance) loadGroups(); }, [selInstance]);

  async function loadInstances() {
    try {
      const { data } = await supabase
        .from('evolution_instances')
        .select('instance_name, status, phone')
        .order('created_at');
      if (data?.length) {
        setInstances(data);
        const connected = data.find(i => i.status === 'connected') || data[0];
        setSelInstance(connected.instance_name);
      }
    } catch { /* sem instâncias cadastradas */ }
  }

  async function loadGroups() {
    if (!selInstance) return;
    setLoadingGroups(true);
    try {
      const { data } = await supabase
        .from('whatsapp_groups')
        .select('*')
        .eq('instance_name', selInstance)
        .order('created_at', { ascending: false });
      setGroups(data || []);
    } catch { setGroups([]); }
    setLoadingGroups(false);
  }

  async function syncFromWA() {
    if (!selInstance) return;
    setSyncing(true);
    try {
      const raw = await fetchGroups(selInstance);
      const waGroups = Array.isArray(raw) ? raw : (raw?.groups || []);

      for (const g of waGroups) {
        const jid   = g.id || g.remoteJid;
        const name  = g.subject || g.name || 'Grupo sem nome';
        const count = g.participants?.length || g.size || 0;

        await supabase.from('whatsapp_groups').upsert({
          tenant_id:         tenantDbId,
          instance_name:     selInstance,
          wa_group_id:       jid,
          name,
          participant_count: count,
          synced_at:         new Date().toISOString(),
        }, { onConflict: 'wa_group_id,instance_name', ignoreDuplicates: false });
      }
      await loadGroups();
    } catch (e) {
      alert('Erro ao sincronizar: ' + (e.message || e));
    }
    setSyncing(false);
  }

  async function handleDelete(g) {
    if (!confirm(`Excluir "${g.name}"? Se o grupo existir no WhatsApp, você será removido.`)) return;
    if (g.wa_group_id) {
      try { await leaveWAGroup(selInstance, g.wa_group_id); } catch { /* ignora */ }
    }
    await supabase.from('whatsapp_groups').delete().eq('id', g.id);
    loadGroups();
  }

  async function handleSaveGroup(form) {
    if (form.id) {
      // Editar
      const updates = { name: form.name, type: form.type, description: form.description, updated_at: new Date().toISOString() };
      if (form.wa_group_id) {
        try { await updateWAGroupSubject(selInstance, form.wa_group_id, form.name); } catch { /* ignora */ }
      }
      await supabase.from('whatsapp_groups').update(updates).eq('id', form.id);
    } else {
      // Criar novo
      let waGroupId = null;
      if (form.participants?.length) {
        try {
          const res = await createWAGroup(selInstance, form.name, form.participants);
          waGroupId = res?.groupJid || res?.id || null;
        } catch { /* WA offline — salva só no banco */ }
      }
      await supabase.from('whatsapp_groups').insert({
        tenant_id:         tenantDbId,
        instance_name:     selInstance,
        wa_group_id:       waGroupId,
        name:              form.name,
        type:              form.type,
        description:       form.description,
        participant_count: form.participants?.length || 0,
      });
    }
    setShowCreate(false);
    setEditGroup(null);
    loadGroups();
  }

  const filtered = groups.filter(g => {
    const matchSearch = !search || g.name.toLowerCase().includes(search.toLowerCase());
    const matchType   = filterType === 'all' || g.type === filterType;
    return matchSearch && matchType;
  });

  return (
    <div>
      {/* Instance selector + Sync */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: 16, background: 'var(--white)', borderRadius: 'var(--r-md)', border: '1px solid var(--g-200)' }}>
        <Icon name="whatsapp" size={18} style={{ color: '#25D366', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          {instances.length === 0 ? (
            <span style={{ fontSize: 13, color: 'var(--g-500)' }}>
              Nenhuma instância WhatsApp cadastrada — configure em Configurações → WhatsApp
            </span>
          ) : (
            <select
              className="input"
              style={{ maxWidth: 280 }}
              value={selInstance}
              onChange={e => setSelInstance(e.target.value)}
            >
              {instances.map(i => (
                <option key={i.instance_name} value={i.instance_name}>
                  {i.instance_name} {i.status === 'connected' ? '● Conectado' : '○ Desconectado'}
                </option>
              ))}
            </select>
          )}
        </div>
        <button className="btn-secondary" onClick={syncFromWA} disabled={syncing || !selInstance} style={{ fontSize: 13 }}>
          <Icon name="refresh" size={13} style={{ animation: syncing ? 'spin 0.8s linear infinite' : 'none' }} />
          {syncing ? 'Sincronizando...' : 'Sincronizar do WA'}
        </button>
        <button className="btn-primary" onClick={() => setShowCreate(true)} disabled={!selInstance} style={{ fontSize: 13 }}>
          <Icon name="plus" size={13} /> Novo grupo
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, maxWidth: 280 }}>
          <div style={{ position: 'relative' }}>
            <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--g-400)' }} />
            <input
              className="input"
              placeholder="Buscar grupos..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ id: 'all', label: 'Todos' }, ...GROUP_TYPES].map(t => (
            <button
              key={t.id}
              onClick={() => setFilterType(t.id)}
              style={{
                padding: '7px 14px', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600,
                background: filterType === t.id ? 'var(--red)' : 'white',
                color: filterType === t.id ? 'white' : 'var(--g-700)',
                border: `1px solid ${filterType === t.id ? 'var(--red)' : 'var(--g-200)'}`,
                cursor: 'pointer',
              }}
            >
              {t.emoji ? `${t.emoji} ` : ''}{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Groups grid */}
      {loadingGroups ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--g-400)', fontSize: 13 }}>Carregando grupos...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--g-400)', fontSize: 14 }}>
          {groups.length === 0
            ? <><div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>Nenhum grupo ainda. Crie um ou sincronize do WhatsApp.</>
            : 'Nenhum grupo encontrado para esta busca.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {filtered.map(g => (
            <GroupCard
              key={g.id}
              group={g}
              onEdit={() => setEditGroup(g)}
              onDelete={() => handleDelete(g)}
              onBroadcast={() => setBroadcastGrp(g)}
              onMembers={() => setMembersGrp(g)}
              instanceName={selInstance}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {(showCreate || editGroup) && (
        <GroupFormModal
          group={editGroup}
          instanceName={selInstance}
          tenantDbId={tenantDbId}
          onClose={() => { setShowCreate(false); setEditGroup(null); }}
          onSave={handleSaveGroup}
        />
      )}
      {broadcastGrp && (
        <BroadcastModal
          group={broadcastGrp}
          instanceName={selInstance}
          onClose={() => setBroadcastGrp(null)}
        />
      )}
      {membersGrp && (
        <MembersModal
          group={membersGrp}
          instanceName={selInstance}
          onClose={() => { setMembersGrp(null); loadGroups(); }}
        />
      )}
    </div>
  );
}

/* ─── GroupCard ───────────────────────────────────────── */
function GroupCard({ group, onEdit, onDelete, onBroadcast, onMembers, instanceName }) {
  const typeInfo = TYPE_MAP[group.type] || TYPE_MAP.geral;
  const hasWA = !!group.wa_group_id;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header stripe */}
      <div style={{ height: 4, background: hasWA ? '#25D366' : 'var(--g-300)' }} />
      <div style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: hasWA ? '#25D36622' : 'var(--g-100)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, flexShrink: 0,
          }}>
            {typeInfo.emoji}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--g-900)' }} className="truncate">{group.name}</div>
              {hasWA && <Icon name="whatsapp" size={12} style={{ color: '#25D366', flexShrink: 0 }} />}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--g-500)', background: 'var(--g-100)', padding: '2px 8px', borderRadius: 9999 }}>
                {typeInfo.emoji} {typeInfo.label}
              </span>
              <span style={{ fontSize: 11, color: 'var(--g-500)' }}>
                {group.participant_count || 0} participantes
              </span>
            </div>
          </div>
        </div>

        {group.description && (
          <p style={{ fontSize: 12, color: 'var(--g-600)', marginBottom: 14, lineHeight: 1.5 }} className="truncate">
            {group.description}
          </p>
        )}

        {group.synced_at && (
          <div style={{ fontSize: 11, color: 'var(--g-400)', marginBottom: 12 }}>
            Sincronizado {new Date(group.synced_at).toLocaleDateString('pt-BR')}
          </div>
        )}

        {!hasWA && (
          <div style={{ fontSize: 11, color: 'var(--warn)', padding: '6px 10px', background: '#fffbeb', borderRadius: 6, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="info" size={12} style={{ color: 'var(--warn)' }} />
            Grupo local — sem JID WhatsApp
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 10px', flex: 1 }} onClick={onMembers}>
            <Icon name="users" size={12} /> Participantes
          </button>
          {hasWA && (
            <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 10px', flex: 1 }} onClick={onBroadcast}>
              <Icon name="send" size={12} /> Mensagem
            </button>
          )}
          <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 10px' }} onClick={onEdit} title="Editar">
            <Icon name="edit" size={13} />
          </button>
          <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 10px', color: 'var(--red)' }} onClick={onDelete} title="Excluir">
            <Icon name="trash" size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── GroupFormModal ──────────────────────────────────── */
function GroupFormModal({ group, instanceName, tenantDbId, onClose, onSave }) {
  const isEdit = !!group;
  const [form, setForm] = useState({
    id:          group?.id          || null,
    wa_group_id: group?.wa_group_id || null,
    name:        group?.name        || '',
    type:        group?.type        || 'geral',
    description: group?.description || '',
  });
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.name.trim()) { setError('Nome é obrigatório.'); return; }
    setSaving(true);
    const phones = selectedContacts.map(c => c.phone);
    await onSave({ ...form, participants: phones });
    setSaving(false);
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ width: 460 }}>
        <ModalHeader title={isEdit ? 'Editar grupo' : 'Novo grupo WhatsApp'} onClose={onClose} />
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>

          <GField label="Nome do grupo *">
            <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Cozinha — Pizzaria do João" autoFocus />
          </GField>

          <GField label="Tipo">
            <select className="input" value={form.type} onChange={e => set('type', e.target.value)}>
              {GROUP_TYPES.map(t => (
                <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: 'var(--g-400)', marginTop: 5 }}>
              Instância: <span style={{ fontFamily: 'ui-monospace, monospace' }}>{instanceName}</span>
            </div>
          </GField>

          <GField label="Descrição">
            <input className="input" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Finalidade do grupo..." />
          </GField>

          {!isEdit && (
            <GField label="Participantes">
              <ContactPicker
                tenantDbId={tenantDbId}
                selected={selectedContacts}
                onChange={setSelectedContacts}
              />
            </GField>
          )}

          {error && <div style={{ fontSize: 12, color: 'var(--red)', padding: '8px 12px', background: 'var(--red-soft)', borderRadius: 6 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar grupo'}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

/* ─── BroadcastModal ──────────────────────────────────── */
function BroadcastModal({ group, instanceName, onClose }) {
  const [text,    setText]    = useState('');
  const [sending, setSending] = useState(false);
  const [result,  setResult]  = useState(null);

  async function handleSend() {
    if (!text.trim() || !group.wa_group_id) return;
    setSending(true);
    setResult(null);
    try {
      await sendGroupTextMessage(instanceName, group.wa_group_id, text.trim());
      setResult({ ok: true });
      setText('');
    } catch (e) {
      setResult({ ok: false, msg: e.message || 'Erro ao enviar' });
    }
    setSending(false);
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ width: 440 }}>
        <ModalHeader title={`Mensagem para "${group.name}"`} onClose={onClose} />
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '10px 14px', background: '#f0fdf4', borderRadius: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
            <Icon name="whatsapp" size={14} style={{ color: '#25D366' }} />
            <span style={{ fontSize: 12, color: '#166534' }}>{group.wa_group_id}</span>
          </div>
          <GField label="Mensagem">
            <textarea
              className="input"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Digite a mensagem para o grupo..."
              rows={4}
              style={{ resize: 'vertical' }}
              autoFocus
            />
          </GField>
          {result?.ok && (
            <div style={{ padding: '8px 12px', background: '#f0fdf4', borderRadius: 6, fontSize: 12, color: '#166534' }}>
              ✓ Mensagem enviada com sucesso!
            </div>
          )}
          {result?.ok === false && (
            <div style={{ padding: '8px 12px', background: 'var(--red-soft)', borderRadius: 6, fontSize: 12, color: 'var(--red)' }}>
              {result.msg}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={onClose}>Fechar</button>
            <button className="btn-primary" onClick={handleSend} disabled={sending || !text.trim()}>
              <Icon name="send" size={13} /> {sending ? 'Enviando...' : 'Enviar para grupo'}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

/* ─── MembersModal ────────────────────────────────────── */
function MembersModal({ group, instanceName, onClose }) {
  const [participants, setParticipants] = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [addPhone,     setAddPhone]     = useState('');
  const [adding,       setAdding]       = useState(false);
  const [error,        setError]        = useState('');

  useEffect(() => {
    if (group.wa_group_id) loadParticipants();
  }, []);

  async function loadParticipants() {
    setLoading(true);
    try {
      const data = await fetchWAGroupParticipants(instanceName, group.wa_group_id);
      const list = Array.isArray(data) ? data : (data?.participants || []);
      setParticipants(list);
    } catch { setParticipants([]); }
    setLoading(false);
  }

  async function handleAdd() {
    const phone = addPhone.replace(/\D/g, '');
    if (phone.length < 10) { setError('Número inválido.'); return; }
    setAdding(true);
    setError('');
    try {
      await addWAGroupParticipants(instanceName, group.wa_group_id, [phone]);
      setAddPhone('');
      await loadParticipants();
    } catch (e) {
      setError(e.message || 'Erro ao adicionar');
    }
    setAdding(false);
  }

  async function handleRemove(jid) {
    if (!confirm(`Remover ${jid.split('@')[0]}?`)) return;
    try {
      await removeWAGroupParticipant(instanceName, group.wa_group_id, [jid]);
      setParticipants(prev => prev.filter(p => (p.id || p) !== jid));
    } catch (e) {
      alert('Erro: ' + e.message);
    }
  }

  const hasWA = !!group.wa_group_id;

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ width: 420 }}>
        <ModalHeader title={`Participantes — ${group.name}`} onClose={onClose} />
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!hasWA ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--g-400)', fontSize: 13 }}>
              <Icon name="info" size={24} style={{ color: 'var(--warn)', marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
              Grupo sem JID WhatsApp. Edite o grupo para adicionar participantes pelo WA.
            </div>
          ) : (
            <>
              {/* Adicionar */}
              <GField label="Adicionar participante">
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="input"
                    placeholder="5511999990001"
                    value={addPhone}
                    onChange={e => setAddPhone(e.target.value)}
                    style={{ flex: 1, fontFamily: 'ui-monospace, monospace' }}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  />
                  <button className="btn-primary" onClick={handleAdd} disabled={adding} style={{ flexShrink: 0 }}>
                    {adding ? '...' : <Icon name="plus" size={14} />}
                  </button>
                </div>
                {error && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{error}</div>}
              </GField>

              {/* Lista */}
              {loading ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--g-400)', fontSize: 13 }}>Carregando...</div>
              ) : participants.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--g-400)', fontSize: 13 }}>
                  Nenhum participante encontrado
                </div>
              ) : (
                <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--g-200)', borderRadius: 8 }}>
                  {participants.map((p, i) => {
                    const jid    = typeof p === 'string' ? p : (p.id || p.jid || '');
                    const num    = jid.split('@')[0];
                    const admin  = p.admin === 'admin' || p.admin === 'superadmin';
                    return (
                      <div key={jid || i} style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                        borderBottom: i < participants.length - 1 ? '1px solid var(--g-100)' : 'none',
                      }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--g-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--g-700)', flexShrink: 0 }}>
                          {num.slice(-2)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-900)', fontFamily: 'ui-monospace, monospace' }}>+{num}</div>
                          {admin && <div style={{ fontSize: 10, color: 'var(--warn)', fontWeight: 700 }}>ADMIN</div>}
                        </div>
                        <button
                          className="btn-ghost"
                          style={{ fontSize: 12, color: 'var(--red)' }}
                          onClick={() => handleRemove(jid)}
                          title="Remover"
                        >
                          <Icon name="x" size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={onClose}>Fechar</button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

/* ─── Tab Canais Internos ─────────────────────────────── */
function TabChannels({ tenantDbId }) {
  const [channels,   setChannels]   = useState([]);
  const [members,    setMembers]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editChan,   setEditChan]   = useState(null);
  const [manageChan, setManageChan] = useState(null);

  useEffect(() => {
    loadChannels();
    loadMembers();
  }, [tenantDbId]);

  async function loadChannels() {
    setLoading(true);
    try {
      const query = supabase
        .from('internal_channels')
        .select('*, channel_members(user_id)')
        .order('created_at', { ascending: false });
      if (tenantDbId) query.or(`tenant_id.eq.${tenantDbId},is_global.eq.true`);
      const { data } = await query;
      setChannels(data || []);
    } catch { setChannels([]); }
    setLoading(false);
  }

  async function loadMembers() {
    try {
      const { data } = await supabase.from('profiles').select('id, full_name, email, avatar_url').order('full_name');
      setMembers(data || []);
    } catch { setMembers([]); }
  }

  async function handleSave(form) {
    if (form.id) {
      await supabase.from('internal_channels').update({ name: form.name, description: form.description, color: form.color, is_global: form.is_global }).eq('id', form.id);
    } else {
      const { data: chan } = await supabase.from('internal_channels').insert({
        name: form.name, description: form.description, color: form.color,
        is_global: form.is_global, tenant_id: tenantDbId,
      }).select().single();

      if (chan && form.memberIds?.length) {
        await supabase.from('channel_members').insert(
          form.memberIds.map(uid => ({ channel_id: chan.id, user_id: uid })),
        );
      }
    }
    setShowCreate(false);
    setEditChan(null);
    loadChannels();
  }

  async function handleDelete(id) {
    if (!confirm('Excluir este canal?')) return;
    await supabase.from('internal_channels').delete().eq('id', id);
    loadChannels();
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--g-400)', fontSize: 13 }}>Carregando canais...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Icon name="plus" size={14} /> Novo canal
        </button>
      </div>

      {channels.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--g-400)', fontSize: 14 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📢</div>
          Nenhum canal criado ainda.
          <br />
          <button className="btn-secondary" style={{ marginTop: 16 }} onClick={() => setShowCreate(true)}>Criar primeiro canal</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {channels.map(c => {
            const memberCount = (c.channel_members || []).length;
            return (
              <div key={c.id} className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, background: c.color || '#2563EB',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <span style={{ fontSize: 18 }}>#</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--g-900)' }}>{c.name}</span>
                    {c.is_global && <span className="badge badge-blue" style={{ fontSize: 10 }}>Global</span>}
                  </div>
                  {c.description && <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 2 }}>{c.description}</div>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--g-500)', flexShrink: 0 }}>{memberCount} membros</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setManageChan(c)}>
                    <Icon name="users" size={12} /> Membros
                  </button>
                  <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setEditChan(c)}>
                    <Icon name="edit" size={13} />
                  </button>
                  <button className="btn-ghost" style={{ fontSize: 12, color: 'var(--red)' }} onClick={() => handleDelete(c.id)}>
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(showCreate || editChan) && (
        <ChannelFormModal
          channel={editChan}
          members={members}
          onClose={() => { setShowCreate(false); setEditChan(null); }}
          onSave={handleSave}
        />
      )}
      {manageChan && (
        <ChannelMembersModal
          channel={manageChan}
          members={members}
          onClose={() => { setManageChan(null); loadChannels(); }}
        />
      )}
    </div>
  );
}

/* ─── ChannelFormModal ────────────────────────────────── */
function ChannelFormModal({ channel, members, onClose, onSave }) {
  const isEdit = !!channel;
  const [form, setForm] = useState({
    id:          channel?.id          || null,
    name:        channel?.name        || '',
    description: channel?.description || '',
    color:       channel?.color       || '#2563EB',
    is_global:   channel?.is_global   || false,
    memberIds:   [],
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function toggleMember(uid) {
    setForm(f => ({
      ...f,
      memberIds: f.memberIds.includes(uid) ? f.memberIds.filter(id => id !== uid) : [...f.memberIds, uid],
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Nome é obrigatório.'); return; }
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ width: 440 }}>
        <ModalHeader title={isEdit ? 'Editar canal' : 'Novo canal interno'} onClose={onClose} />
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <GField label="Nome do canal *">
            <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: marketing, suporte, geral" autoFocus />
          </GField>
          <GField label="Descrição">
            <input className="input" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Finalidade do canal..." />
          </GField>
          <GField label="Cor">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CHAN_COLORS.map(c => (
                <button key={c} onClick={() => set('color', c)} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: form.color === c ? '3px solid var(--g-900)' : '2px solid transparent', boxShadow: form.color === c ? '0 0 0 2px white, 0 0 0 3px var(--g-900)' : 'none' }} />
              ))}
            </div>
          </GField>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="is_global" checked={form.is_global} onChange={e => set('is_global', e.target.checked)} style={{ width: 16, height: 16 }} />
            <label htmlFor="is_global" style={{ fontSize: 13, color: 'var(--g-800)', cursor: 'pointer' }}>
              Canal global (visível em todos os workspaces)
            </label>
          </div>
          {!isEdit && members.length > 0 && (
            <GField label="Adicionar membros">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto', border: '1px solid var(--g-200)', borderRadius: 8, padding: 8 }}>
                {members.map(m => (
                  <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 6px', borderRadius: 6, background: form.memberIds.includes(m.id) ? 'var(--red-soft)' : 'transparent' }}>
                    <input type="checkbox" checked={form.memberIds.includes(m.id)} onChange={() => toggleMember(m.id)} />
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--g-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--g-700)' }}>
                      {(m.full_name || m.email || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--g-800)' }}>{m.full_name || m.email}</span>
                  </label>
                ))}
              </div>
            </GField>
          )}
          {error && <div style={{ fontSize: 12, color: 'var(--red)', padding: '8px 12px', background: 'var(--red-soft)', borderRadius: 6 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar canal'}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

/* ─── ChannelMembersModal ─────────────────────────────── */
function ChannelMembersModal({ channel, members, onClose }) {
  const [currentMembers, setCurrentMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadCurrent(); }, []);

  async function loadCurrent() {
    const { data } = await supabase.from('channel_members').select('user_id').eq('channel_id', channel.id);
    setCurrentMembers((data || []).map(m => m.user_id));
    setLoading(false);
  }

  async function toggle(uid) {
    if (currentMembers.includes(uid)) {
      await supabase.from('channel_members').delete().eq('channel_id', channel.id).eq('user_id', uid);
      setCurrentMembers(prev => prev.filter(id => id !== uid));
    } else {
      await supabase.from('channel_members').insert({ channel_id: channel.id, user_id: uid });
      setCurrentMembers(prev => [...prev, uid]);
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ width: 380 }}>
        <ModalHeader title={`Membros — #${channel.name}`} onClose={onClose} />
        <div style={{ padding: 24 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--g-400)' }}>Carregando...</div>
          ) : members.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--g-400)', fontSize: 13 }}>Nenhum membro na plataforma</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {members.map(m => {
                const active = currentMembers.includes(m.id);
                return (
                  <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '8px 10px', borderRadius: 8, background: active ? 'var(--red-soft)' : 'var(--g-50)', border: `1px solid ${active ? 'var(--red)' : 'var(--g-200)'}` }}>
                    <input type="checkbox" checked={active} onChange={() => toggle(m.id)} style={{ width: 16, height: 16 }} />
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: active ? 'var(--red)' : 'var(--g-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: active ? 'white' : 'var(--g-700)' }}>
                      {(m.full_name || m.email || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-900)' }}>{m.full_name || m.email}</div>
                      {m.email && m.full_name && <div style={{ fontSize: 11, color: 'var(--g-500)' }}>{m.email}</div>}
                    </div>
                    {active && <span className="badge badge-green" style={{ fontSize: 10 }}>Membro</span>}
                  </label>
                );
              })}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn-primary" onClick={onClose}>Fechar</button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

/* ─── ContactPicker ───────────────────────────────────── */
function ContactPicker({ tenantDbId, selected, onChange }) {
  const [search,      setSearch]      = useState('');
  const [results,     setResults]     = useState([]);
  const [searching,   setSearching]   = useState(false);
  const [showDrop,    setShowDrop]    = useState(false);
  const [manualPhone, setManualPhone] = useState('');
  const dropRef = useRef(null);

  useEffect(() => {
    function handler(e) { if (dropRef.current && !dropRef.current.contains(e.target)) setShowDrop(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!search || search.length < 2) { setResults([]); return; }
    const t = setTimeout(doSearch, 280);
    return () => clearTimeout(t);
  }, [search]);

  async function doSearch() {
    setSearching(true);
    try {
      let query = supabase
        .from('customers')
        .select('id, name, phone')
        .or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
        .not('phone', 'is', null)
        .limit(8);
      if (tenantDbId) query = query.eq('tenant_id', tenantDbId);
      const { data } = await query;
      setResults(data || []);
    } catch { setResults([]); }
    setSearching(false);
  }

  function addContact(c) {
    const phone = (c.phone || '').replace(/\D/g, '');
    if (!phone || selected.find(s => s.phone === phone)) return;
    onChange([...selected, { name: c.name, phone }]);
    setSearch('');
    setResults([]);
    setShowDrop(false);
  }

  function addManual() {
    const phone = manualPhone.replace(/\D/g, '');
    if (phone.length < 10) return;
    if (!selected.find(s => s.phone === phone)) onChange([...selected, { name: null, phone }]);
    setManualPhone('');
  }

  function remove(phone) { onChange(selected.filter(s => s.phone !== phone)); }

  return (
    <div>
      {/* Chips dos selecionados */}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {selected.map(s => (
            <span key={s.phone} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'var(--red-soft)', color: 'var(--red)', borderRadius: 9999, fontSize: 12, fontWeight: 600, border: '1px solid var(--red)' }}>
              {s.name ? `${s.name} · ` : ''}<span style={{ fontFamily: 'ui-monospace, monospace' }}>{s.phone}</span>
              <button onClick={() => remove(s.phone)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 0, lineHeight: 1, fontSize: 14, marginLeft: 2 }}>×</button>
            </span>
          ))}
        </div>
      )}

      {/* Campo de busca */}
      <div ref={dropRef} style={{ position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <Icon name="search" size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--g-400)' }} />
          <input
            className="input"
            placeholder="Buscar contato por nome ou número..."
            value={search}
            onChange={e => { setSearch(e.target.value); setShowDrop(true); }}
            onFocus={() => search.length >= 2 && setShowDrop(true)}
            style={{ paddingLeft: 32 }}
          />
          {searching && (
            <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--g-400)' }}>...</div>
          )}
        </div>

        {showDrop && results.length > 0 && (
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--white)', border: '1px solid var(--g-200)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, maxHeight: 220, overflowY: 'auto' }}>
            {results.map(c => {
              const alreadyIn = selected.find(s => s.phone === (c.phone || '').replace(/\D/g, ''));
              return (
                <button
                  key={c.id}
                  onClick={() => addContact(c)}
                  disabled={!!alreadyIn}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 14px', fontSize: 13, textAlign: 'left', background: alreadyIn ? 'var(--g-50)' : 'white', borderBottom: '1px solid var(--g-100)', cursor: alreadyIn ? 'default' : 'pointer' }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--red-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--red)', flexShrink: 0 }}>
                    {(c.name || '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--g-900)' }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--g-500)', fontFamily: 'ui-monospace, monospace' }}>{c.phone}</div>
                  </div>
                  {alreadyIn && <span style={{ fontSize: 10, color: 'var(--success)', fontWeight: 700 }}>✓ Adicionado</span>}
                </button>
              );
            })}
          </div>
        )}
        {showDrop && search.length >= 2 && !searching && results.length === 0 && (
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--white)', border: '1px solid var(--g-200)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--g-500)', zIndex: 50 }}>
            Nenhum contato encontrado para "{search}"
          </div>
        )}
      </div>

      {/* Número manual */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          className="input"
          placeholder="Ou digitar número: 5511999990001"
          value={manualPhone}
          onChange={e => setManualPhone(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addManual()}
          style={{ flex: 1, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
        />
        <button className="btn-secondary" onClick={addManual} style={{ flexShrink: 0, padding: '0 12px' }}>
          <Icon name="plus" size={13} />
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--g-400)', marginTop: 4 }}>
        Deixe vazio para criar apenas no banco (adicione participantes depois)
      </div>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────── */
function ModalOverlay({ onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
      />
      <div style={{
        position: 'relative', zIndex: 1,
        background: 'var(--white)', borderRadius: 'var(--r-lg)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, onClose }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 0' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--g-900)' }}>{title}</div>
      <button className="btn-icon" onClick={onClose}><Icon name="x" size={16} /></button>
    </div>
  );
}

function GField({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--g-500)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
