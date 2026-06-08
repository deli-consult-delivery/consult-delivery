import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

// ============================================================
// Console v2 — PR9/C1: Clientes da plataforma (admin)
// Cria tenant novo (workspace do lojista beta), insere você como
// owner, convida o dono por email (bridge /users/invite) e controla
// a habilitação da Defesa (D7: Radar grátis até pagar — tenant novo
// nasce SEM defesa; habilitação manual aqui até o PR10 automatizar
// via assinatura Asaas).
// ============================================================

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'http://187.127.25.24:3001';

const inputStyle = { width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: '#fff' };
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--tx2)', margin: '12px 0 5px' };

function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export default function Clientes({ userId }) {
  const [tenants, setTenants] = useState(null);
  const [defesaMap, setDefesaMap] = useState({});
  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [agindo, setAgindo] = useState(null);
  const [msg, setMsg] = useState(null);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    const { data: ts, error: e1 } = await supabase.from('tenants').select('id, name, slug, created_at').order('created_at', { ascending: false });
    if (e1) { setErro(e1.message); return; }
    setTenants(ts ?? []);
    if (ts?.length) {
      const { data: tas } = await supabase.from('tenant_agents').select('tenant_id').eq('agent_id', 'defesa').in('tenant_id', ts.map(t => t.id));
      const map = {};
      (tas ?? []).forEach(r => { map[r.tenant_id] = true; });
      setDefesaMap(map);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function criar() {
    setErro(null); setMsg(null);
    if (nome.trim().length < 2) { setErro('Informe o nome do cliente.'); return; }
    const slugFinal = slug.trim() || slugify(nome);
    if (!slugFinal) { setErro('Slug inválido.'); return; }
    setSalvando(true);
    try {
      // 1. Cria o tenant
      const { data: t, error: e1 } = await supabase.from('tenants')
        .insert({ name: nome.trim(), slug: slugFinal, color: '#B70C00' })
        .select('id, name, slug')
        .single();
      if (e1) throw e1;
      // 2. Você vira owner (necessário p/ administrar e convidar)
      const { error: e2 } = await supabase.from('tenant_members').insert({ tenant_id: t.id, user_id: userId, role: 'owner' });
      if (e2) throw e2;
      // 3. Convite do dono por email (fluxo oficial do bridge) — opcional
      let convite = 'sem convite (adicione depois)';
      if (email.trim()) {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${BRIDGE_URL}/api/users/invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ email: email.trim(), role: 'admin', tenant_id: t.id }),
        });
        const json = await res.json().catch(() => ({}));
        convite = res.ok ? `convite enviado para ${email.trim()}` : `falha no convite: ${json.error || res.status} (reenvie depois)`;
      }
      // 4. D7: defesa NÃO é habilitada — nasce no Radar grátis
      setMsg(`Workspace "${t.name}" criado no plano Radar grátis — ${convite}. Habilite a Defesa quando a assinatura estiver ativa.`);
      setNome(''); setSlug(''); setEmail('');
      await carregar();
    } catch (err) {
      setErro(err?.message || 'falha ao criar workspace');
    } finally {
      setSalvando(false);
    }
  }

  async function toggleDefesa(t) {
    setAgindo(t.id); setErro(null);
    try {
      if (defesaMap[t.id]) {
        const { error } = await supabase.from('tenant_agents').delete().eq('tenant_id', t.id).eq('agent_id', 'defesa');
        if (error) throw error;
      } else {
        const { error } = await supabase.from('tenant_agents').insert({ tenant_id: t.id, agent_id: 'defesa' });
        if (error) throw error;
      }
      await carregar();
    } catch (err) {
      setErro(err?.message || 'falha ao alternar Defesa');
    } finally {
      setAgindo(null);
    }
  }

  return (
    <div>
      <h1>Clientes da plataforma <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>ADMIN</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Cada cliente é um workspace isolado (loja A nunca vê loja B). Plano inicial: Radar grátis — a Defesa é habilitada com a assinatura de R$ 147/loja/mês (D7).{erro ? ` · erro: ${erro}` : ''}</div>

      {msg && <div className="cv2-card" style={{ borderLeft: '3px solid var(--green)', color: 'var(--green)', fontWeight: 600 }}>{msg}</div>}

      <div className="cv2-card" style={{ maxWidth: 560 }}>
        <h3>Novo cliente</h3>
        <label style={labelStyle}>Nome do cliente/empresa</label>
        <input style={inputStyle} value={nome} onChange={e => { setNome(e.target.value); setSlug(slugify(e.target.value)); }} placeholder="Ex.: Pizzaria Bella Massa" />
        <label style={labelStyle}>Slug (endereço interno)</label>
        <input style={inputStyle} value={slug} onChange={e => setSlug(slugify(e.target.value))} placeholder="pizzaria-bella-massa" />
        <label style={labelStyle}>Email do dono (recebe o convite — opcional)</label>
        <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="dono@loja.com.br" />
        <div style={{ marginTop: 16 }}>
          <button className="cv2-btn" disabled={salvando} onClick={criar}>{salvando ? 'Criando…' : 'Criar workspace'}</button>
        </div>
      </div>

      <h1 style={{ fontSize: 15, marginTop: 22 }}>Workspaces</h1>
      <div className="cv2-rule" />
      {tenants && (
        <div className="cv2-card">
          <table>
            <thead><tr><th>Cliente</th><th>Slug</th><th>Plano</th><th>Ação</th></tr></thead>
            <tbody>
              {tenants.map(t => (
                <tr key={t.id}>
                  <td><b>{t.name}</b></td>
                  <td style={{ color: 'var(--tx2)' }}>{t.slug}</td>
                  <td>{defesaMap[t.id] ? <span className="cv2-bdg ok">Defesa ativa · R$ 147/mês</span> : <span className="cv2-bdg mut">Radar grátis</span>}</td>
                  <td>
                    <button className={defesaMap[t.id] ? 'cv2-btn danger' : 'cv2-btn'} disabled={agindo === t.id} onClick={() => toggleDefesa(t)}>
                      {defesaMap[t.id] ? 'Desabilitar Defesa' : 'Habilitar Defesa'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 11.5, color: 'var(--tx2)', marginTop: 10 }}>No PR10 a habilitação passa a seguir a assinatura Asaas automaticamente; este toggle vira o override manual.</div>
        </div>
      )}
      {tenants && !tenants.length && <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Nenhum workspace visível.</div>}
    </div>
  );
}
