import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { mapErro } from '../lib/mapErro.js';
import { GRUPOS } from './moduleCatalog.js';

// ============================================================
// Console v2 — PR9/C1 + PR10: Clientes da plataforma (admin)
// Cria tenant, convida o dono, controla a Defesa (D7) e gera a
// ASSINATURA R$147/mês (fila → task defesa-criar-assinatura →
// Asaas → link de pagamento → sync ativa/desativa sozinho).
// ============================================================

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'http://187.127.25.24:3001';

const inputStyle = { width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: '#fff' };
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--tx2)', margin: '12px 0 5px' };

function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

// ─── Modal: Telas/Módulos visíveis do tenant (tenant_modules) ───
// Semântica: tenant sem linhas = vê tudo; com linhas = allowlist (só enabled=true).
// Salvar grava o estado explícito de TODOS os módulos do catálogo de uma vez.
function TelasModal({ tenant, onClose, onSaved }) {
  const [estado, setEstado] = useState(null); // { module_key: bool }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    supabase.rpc('admin_get_tenant_modules', { p_tenant_id: tenant.id }).then(({ data, error }) => {
      if (error) { setErro(mapErro(error.message)); setLoading(false); return; }
      const rows = data ?? [];
      const temAllowlist = rows.length > 0;
      const byKey = {};
      rows.forEach(r => { byKey[r.module_key] = r.enabled; });
      const map = {};
      GRUPOS.forEach(g => g.items.forEach(it => {
        // sem allowlist: tudo visível. com allowlist: ausente = oculto.
        map[it.id] = it.id in byKey ? byKey[it.id] : !temAllowlist;
      }));
      setEstado(map);
      setLoading(false);
    });
  }, [tenant.id]);

  async function salvar() {
    setSaving(true); setErro(null);
    const p_modules = GRUPOS.flatMap(g => g.items.map(it => ({ module_key: it.id, enabled: !!estado[it.id] })));
    const { error } = await supabase.rpc('admin_set_tenant_modules', { p_tenant_id: tenant.id, p_modules });
    setSaving(false);
    if (error) { setErro(mapErro(error.message)); return; }
    onSaved?.();
    onClose();
  }

  function setGrupo(items, val) {
    setEstado(prev => { const n = { ...prev }; items.forEach(it => { n[it.id] = val; }); return n; });
  }

  const totalOn = estado ? Object.values(estado).filter(Boolean).length : 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,27,26,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, padding: 28, width: 560, maxHeight: '84vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        <h3 style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 700 }}>Telas visíveis · {tenant.name}</h3>
        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--tx2)' }}>
          Marque o que aparece no menu deste cliente. {estado ? `${totalOn} ativos.` : ''}{erro ? ` · erro: ${erro}` : ''}
        </p>
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
          {loading ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--tx2)', fontSize: 13 }}>Carregando…</div> : (
            GRUPOS.map(g => (
              <div key={g.label} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--tx2)' }}>{g.label}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="cv2-btn sec" style={{ padding: '2px 8px', fontSize: 10.5 }} onClick={() => setGrupo(g.items, true)}>todos</button>
                    <button className="cv2-btn sec" style={{ padding: '2px 8px', fontSize: 10.5 }} onClick={() => setGrupo(g.items, false)}>nenhum</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px' }}>
                  {g.items.map(it => (
                    <label key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!estado?.[it.id]} onChange={e => setEstado(prev => ({ ...prev, [it.id]: e.target.checked }))} />
                      <span style={{ color: estado?.[it.id] ? 'var(--tx)' : 'var(--tx2)' }}>{it.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <button className="cv2-btn sec" onClick={onClose}>Cancelar</button>
          <button className="cv2-btn" disabled={saving || loading} onClick={salvar}>{saving ? 'Salvando…' : 'Salvar telas'}</button>
        </div>
      </div>
    </div>
  );
}

export default function Clientes({ userId }) {
  const [telasDe, setTelasDe] = useState(null); // tenant com modal de telas aberto
  const [tenants, setTenants] = useState(null);
  const [defesaMap, setDefesaMap] = useState({});
  const [assinaturaMap, setAssinaturaMap] = useState({});
  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [assinandoDe, setAssinandoDe] = useState(null); // tenant_id com form de pagador aberto
  const [payer, setPayer] = useState({ nome: '', email: '', doc: '' });
  const [salvando, setSalvando] = useState(false);
  const [agindo, setAgindo] = useState(null);
  const [msg, setMsg] = useState(null);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    const { data: ts, error: e1 } = await supabase.from('tenants').select('id, name, slug, created_at').order('created_at', { ascending: false });
    if (e1) { setErro(e1.message); return; }
    setTenants(ts ?? []);
    if (ts?.length) {
      const ids = ts.map(t => t.id);
      const [{ data: tas }, { data: asn }] = await Promise.all([
        supabase.from('tenant_agents').select('tenant_id').eq('agent_id', 'defesa').in('tenant_id', ids),
        supabase.from('defesa_assinaturas').select('tenant_id, status, link_pagamento, valor_centavos, ultima_cobranca_status').in('tenant_id', ids).order('created_at', { ascending: false }),
      ]);
      const dm = {};
      (tas ?? []).forEach(r => { dm[r.tenant_id] = true; });
      setDefesaMap(dm);
      const am = {};
      (asn ?? []).forEach(r => { if (!am[r.tenant_id]) am[r.tenant_id] = r; });
      setAssinaturaMap(am);
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
      const { data: t, error: e1 } = await supabase.from('tenants')
        .insert({ name: nome.trim(), slug: slugFinal, color: '#B70C00' })
        .select('id, name, slug')
        .single();
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('tenant_members').insert({ tenant_id: t.id, user_id: userId, role: 'owner' });
      if (e2) throw e2;
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
      setMsg(`Workspace "${t.name}" criado no plano gratuito — ${convite}.`);
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

  async function gerarAssinatura(t) {
    setErro(null);
    if (payer.nome.trim().length < 2 || String(payer.doc).replace(/\D/g, '').length < 11) {
      setErro('Informe nome e CPF/CNPJ do pagador.');
      return;
    }
    setAgindo(t.id);
    try {
      const { error } = await supabase.from('defesa_assinaturas').insert({
        tenant_id: t.id,
        status: 'pendente',
        payer_nome: payer.nome.trim(),
        payer_email: payer.email.trim() || null,
        payer_cpf_cnpj: String(payer.doc).replace(/\D/g, ''),
      });
      if (error) throw error;
      setMsg(`Assinatura de "${t.name}" entrou na fila — em até 5 minutos o link de pagamento aparece aqui.`);
      setAssinandoDe(null);
      setPayer({ nome: '', email: '', doc: '' });
      await carregar();
    } catch (err) {
      setErro(err?.message || 'falha ao gerar assinatura');
    } finally {
      setAgindo(null);
    }
  }

  function badgeAssinatura(a) {
    if (!a) return null;
    if (a.status === 'ativa') return <span className="cv2-bdg ok">assinatura ativa</span>;
    if (a.status === 'atrasada') return <span className="cv2-bdg err">assinatura atrasada</span>;
    if (a.status === 'cancelada') return <span className="cv2-bdg mut">assinatura cancelada</span>;
    return a.link_pagamento
      ? <a className="cv2-bdg warn" href={a.link_pagamento} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>link de pagamento</a>
      : <span className="cv2-bdg warn">criando no Asaas…</span>;
  }

  return (
    <div>
      <h1>Clientes da plataforma <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>ADMIN</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Cada cliente é um workspace isolado. Plano inicial: gratuito — a Defesa liga sozinha quando o pagamento da assinatura (R$ 147/loja/mês) confirma.{erro ? ` · erro: ${erro}` : ''}</div>

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
          <div className="cv2-tbl-wrap">
          <table>
            <thead><tr><th>Cliente</th><th>Plano</th><th>Assinatura</th><th>Ações</th></tr></thead>
            <tbody>
              {tenants.map(t => {
                const a = assinaturaMap[t.id];
                const aberto = assinandoDe === t.id;
                return (
                  <tr key={t.id}>
                    <td><b>{t.name}</b><div style={{ color: 'var(--tx2)', fontSize: 11 }}>{t.slug}</div></td>
                    <td>{defesaMap[t.id] ? <span className="cv2-bdg ok">Defesa ativa</span> : <span className="cv2-bdg mut">Gratuito</span>}</td>
                    <td>
                      {badgeAssinatura(a) || <span style={{ color: 'var(--tx2)', fontSize: 12 }}>sem assinatura</span>}
                      {aberto && (
                        <div style={{ marginTop: 8, display: 'grid', gap: 6, maxWidth: 260 }}>
                          <input style={inputStyle} placeholder="Nome do pagador" value={payer.nome} onChange={e => setPayer(p => ({ ...p, nome: e.target.value }))} />
                          <input style={inputStyle} placeholder="CPF ou CNPJ" value={payer.doc} onChange={e => setPayer(p => ({ ...p, doc: e.target.value }))} />
                          <input style={inputStyle} placeholder="Email do pagador (opcional)" value={payer.email} onChange={e => setPayer(p => ({ ...p, email: e.target.value }))} />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="cv2-btn" disabled={agindo === t.id} onClick={() => gerarAssinatura(t)}>Confirmar</button>
                            <button className="cv2-btn sec" onClick={() => setAssinandoDe(null)}>Cancelar</button>
                          </div>
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="cv2-btn sec" onClick={() => setTelasDe(t)}>Telas</button>
                        {!a && !aberto && (
                          <button className="cv2-btn" disabled={agindo === t.id} onClick={() => { setAssinandoDe(t.id); setPayer({ nome: t.name, email: '', doc: '' }); }}>Gerar assinatura R$ 147</button>
                        )}
                        <button className={defesaMap[t.id] ? 'cv2-btn danger' : 'cv2-btn sec'} disabled={agindo === t.id} onClick={() => toggleDefesa(t)}>
                          {defesaMap[t.id] ? 'Desabilitar Defesa' : 'Habilitar (override)'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--tx2)', marginTop: 10 }}>Fluxo automático: pagamento confirmado liga a Defesa · 2 cobranças vencidas desligam (volta ao plano gratuito). O toggle manual é o override.</div>
        </div>
      )}
      {tenants && !tenants.length && <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Nenhum workspace visível.</div>}

      {telasDe && <TelasModal tenant={telasDe} onClose={() => setTelasDe(null)} onSaved={() => setMsg(`Telas de "${telasDe.name}" atualizadas.`)} />}
    </div>
  );
}
