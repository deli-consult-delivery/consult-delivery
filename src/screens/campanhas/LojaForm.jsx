import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import Icon from '../../components/Icon.jsx';
import CustomSelect from '../../components/CustomSelect.jsx';
import LogoUpload from './components/LogoUpload.jsx';

const TIPOS = ['restaurante','pizzaria','doceria','hamburgueria','açaiteria','outro'];
const TONS = ['caloroso e familiar','divertido e jovem','sofisticado','informal e direto','premium'];
const DIAS = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

export default function LojaForm({ go, mode, slug }) {
  const [form, setForm] = useState({
    nome:'', slug:'', tipo:'restaurante', whatsapp:'', nome_fantasia:'',
    link_delivery:'', link_wa:'', instagram:'', cor_principal:'#e63946', cor_secundaria:'#ffffff',
    estilo_imagens:'', tom_base:'caloroso e familiar', bordoes:'', palavras_proibidas:'', emojis:'',
    prefixo_cupom:'', abertura:'', fechamento:'', dias_funcionamento: [],
    regua:[], observacoes:'', logo_url:'',
  });
  const [openSections, setOpenSections] = useState({ identidade:true, contato:false, visual:false, tom:false, cupom:false, horarios:false, regua:false, obs:false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode==='edit' && slug) {
      supabase.from('lojas').select('*').eq('slug',slug).single().then(({ data }) => {
        if (data) {
          const d = data.dados_skill || {};
          setForm({
            nome:data.nome, slug:data.slug, tipo:data.tipo, whatsapp:data.whatsapp||'', nome_fantasia:d.nome_fantasia||'',
            link_delivery:d.link_delivery||'', link_wa:d.link_wa||'', instagram:d.instagram||'',
            cor_principal:d.cor_principal||'#e63946', cor_secundaria:d.cor_secundaria||'#ffffff',
            estilo_imagens:d.estilo_imagens||'', tom_base:d.tom_base||'caloroso e familiar',
            bordoes:(d.bordoes||[]).join('\n'), palavras_proibidas:(d.palavras_proibidas||[]).join('\n'),
            emojis:(d.emojis||[]).join(' '), prefixo_cupom:d.prefixo_cupom||'',
            abertura:d.abertura||'', fechamento:d.fechamento||'', dias_funcionamento:d.dias_funcionamento||[],
            regua:d.regua||[], observacoes:d.observacoes||'', logo_url:data.logo_url||'',
          });
        }
      });
    }
  }, [mode, slug]);

  function set(k,v) { setForm(f=>({...f,[k]:v})); }

  function slugify(s) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  }

  function toggleSection(k) { setOpenSections(p=>({...p,[k]:!p[k]})); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nome || !form.slug || !form.tipo || !form.whatsapp) { alert('Preencha os campos obrigatórios.'); return; }
    setSaving(true);

    const dados_skill = {
      nome_fantasia: form.nome_fantasia,
      link_delivery: form.link_delivery,
      link_wa: form.link_wa,
      instagram: form.instagram,
      cor_principal: form.cor_principal,
      cor_secundaria: form.cor_secundaria,
      estilo_imagens: form.estilo_imagens,
      tom_base: form.tom_base,
      bordoes: form.bordoes.split('\n').filter(Boolean),
      palavras_proibidas: form.palavras_proibidas.split('\n').filter(Boolean),
      emojis: form.emojis.split(/\s+/).filter(Boolean),
      prefixo_cupom: form.prefixo_cupom.toUpperCase(),
      abertura: form.abertura,
      fechamento: form.fechamento,
      dias_funcionamento: form.dias_funcionamento,
      regua: form.regua,
      observacoes: form.observacoes,
    };

    const payload = {
      nome: form.nome, slug: form.slug, tipo: form.tipo,
      whatsapp: form.whatsapp, logo_url: form.logo_url,
      dados_skill, status: 'ativa', skill_criada: false,
    };

    let lojaId;
    if (mode==='edit' && slug) {
      const { data } = await supabase.from('lojas').update(payload).eq('slug',slug).select('id').single();
      lojaId = data?.id;
    } else {
      const { data } = await supabase.from('lojas').insert(payload).select('id').single();
      lojaId = data?.id;
    }

    setSaving(false);
    go('lojas');
  }

  function addRegua() { setForm(f=>({...f, regua:[...f.regua, { gatilho:'', oferta:'', cupom:'', horario:'' }]})); }
  function setRegua(i,k,v) { setForm(f=>({...f, regua:f.regua.map((r,idx)=> idx===i?{...r,[k]:v}:r)})); }
  function removeRegua(i) { setForm(f=>({...f, regua:f.regua.filter((_,idx)=> idx!==i)})); }

  function Section({ id, title, children }) {
    const open = openSections[id];
    return (
      <div style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:12, marginBottom:16, overflow:'hidden' }}>
        <button type="button" onClick={()=>toggleSection(id)} style={{
          width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'14px 18px', background:'none', border:'none', color:'#fff', fontSize:14, fontWeight:600,
          cursor:'pointer',
        }}
        >
          {title}
          <Icon name={open?'chevdown':'chevright'} size={16} />
        </button>
        {open && <div style={{ padding:'0 18px 18px' }}>{children}</div>}
      </div>
    );
  }

  function Field({ label, required, children, hint }) {
    return (
      <div style={{ marginBottom:14 }}>
        <label style={{ display:'block', fontSize:12, fontWeight:500, color:'#9ca3af', marginBottom:6 }}>{label}{required && <span style={{color:'#ef4444'}}> *</span>}</label>
        {children}
        {hint && <span style={{fontSize:11,color:'#6b7280',marginTop:4,display:'block'}}>{hint}</span>}
      </div>
    );
  }

  return (
    <div style={{ padding:24, maxWidth:800, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
        <button onClick={()=>go('lojas')} className="btn-secondary" style={{background:'transparent',border:'none',color:'#9ca3af',cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
          <Icon name="chevleft" size={16} /> Voltar
        </button>
        <h1 style={{fontSize:22,fontWeight:700,color:'#fff',margin:0}}>{mode==='edit'?'Editar loja':'Nova loja'}</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <Section id="identidade" title="Identidade da loja">
          <Field label="Nome oficial" required>
            <input value={form.nome} onChange={e=>{set('nome',e.target.value); if(mode!=='edit') set('slug',slugify(e.target.value));}} style={inputStyle} placeholder="Ex: Varanda's Burguer" />
          </Field>
          <Field label="Slug" required hint="Identificador único, usado nas URLs e na skill.">
            <input value={form.slug} onChange={e=>set('slug',e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''))} style={inputStyle} placeholder="varandas-burguer" />
          </Field>
          <Field label="Tipo" required>
            <CustomSelect value={form.tipo} onChange={v=>set('tipo',v)} options={TIPOS} />
          </Field>
          <Field label="Nome fantasia" hint="Como aparece nas campanhas.">
            <input value={form.nome_fantasia} onChange={e=>set('nome_fantasia',e.target.value)} style={inputStyle} placeholder="Varanda's" />
          </Field>
        </Section>

        <Section id="contato" title="Contato e canais">
          <Field label="WhatsApp" required hint="Com DDI, ex: 5594992255748">
            <input value={form.whatsapp} onChange={e=>set('whatsapp',e.target.value)} style={inputStyle} placeholder="5594992255748" />
          </Field>
          <Field label="Link delivery">
            <input value={form.link_delivery} onChange={e=>set('link_delivery',e.target.value)} style={inputStyle} placeholder="https://..." />
          </Field>
          <Field label="Link WhatsApp Business">
            <input value={form.link_wa} onChange={e=>set('link_wa',e.target.value)} style={inputStyle} placeholder="https://wa.me/..." />
          </Field>
          <Field label="Instagram">
            <input value={form.instagram} onChange={e=>set('instagram',e.target.value)} style={inputStyle} placeholder="@handle" />
          </Field>
        </Section>

        <Section id="visual" title="Identidade visual">
          <Field label="Logo">
            <LogoUpload value={form.logo_url} onUpload={u=>set('logo_url',u)} />
          </Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <Field label="Cor principal">
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="color" value={form.cor_principal} onChange={e=>set('cor_principal',e.target.value)} style={{ width:36, height:36, borderRadius:6, border:'none', padding:0, cursor:'pointer' }} />
                <input value={form.cor_principal} onChange={e=>set('cor_principal',e.target.value)} style={inputStyle} placeholder="#e63946" />
              </div>
            </Field>
            <Field label="Cor secundária">
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="color" value={form.cor_secundaria} onChange={e=>set('cor_secundaria',e.target.value)} style={{ width:36, height:36, borderRadius:6, border:'none', padding:0, cursor:'pointer' }} />
                <input value={form.cor_secundaria} onChange={e=>set('cor_secundaria',e.target.value)} style={inputStyle} placeholder="#ffffff" />
              </div>
            </Field>
          </div>
          <Field label="Estilo das imagens" hint="Descreva como devem ser as fotos dos pratos.">
            <textarea value={form.estilo_imagens} onChange={e=>set('estilo_imagens',e.target.value)} style={{...inputStyle, minHeight:80}} placeholder="Fotos bem iluminadas, fundo escuro, ângulo 45°..." />
          </Field>
        </Section>

        <Section id="tom" title="Tom de voz">
          <Field label="Tom base" required>
            <CustomSelect value={form.tom_base} onChange={v=>set('tom_base',v)} options={TONS} />
          </Field>
          <Field label="Bordões da casa" hint="Frases que a loja usa, uma por linha.">
            <textarea value={form.bordoes} onChange={e=>set('bordoes',e.target.value)} style={{...inputStyle, minHeight:80}} placeholder="A melhor pizza da cidade\nDesde 1995..." />
          </Field>
          <Field label="Palavras proibidas" hint="O que jamais usar, uma por linha.">
            <textarea value={form.palavras_proibidas} onChange={e=>set('palavras_proibidas',e.target.value)} style={{...inputStyle, minHeight:80}} placeholder="barato\ncupom\ndesconto" />
          </Field>
          <Field label="Emojis preferidos" hint="Separados por espaço.">
            <input value={form.emojis} onChange={e=>set('emojis',e.target.value)} style={inputStyle} placeholder="🥘 🍕 ❤️" />
          </Field>
        </Section>

        <Section id="cupom" title="Padrão de cupom">
          <Field label="Prefixo" required hint="Ex: VARANDAS">
            <input value={form.prefixo_cupom} onChange={e=>set('prefixo_cupom',e.target.value.toUpperCase())} style={inputStyle} placeholder="VARANDAS" />
          </Field>
          <div style={{ background:'#111', border:'1px solid #2a2a2a', borderRadius:8, padding:12, fontSize:13, color:'#9ca3af' }}>
            Exemplo: <strong style={{color:'#fff'}}>{form.prefixo_cupom||'PREFIXO'}</strong> + 10 = <strong style={{color:'#fff'}}>{(form.prefixo_cupom||'PREFIXO')+'10'}</strong>
          </div>
        </Section>

        <Section id="horarios" title="Horários">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <Field label="Abertura">
              <input type="time" value={form.abertura} onChange={e=>set('abertura',e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Fechamento">
              <input type="time" value={form.fechamento} onChange={e=>set('fechamento',e.target.value)} style={inputStyle} />
            </Field>
          </div>
          <Field label="Dias de funcionamento">
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {DIAS.map(d => (
                <label key={d} style={{ display:'flex', alignItems:'center', gap:6, background:'#252525', padding:'6px 10px', borderRadius:6, cursor:'pointer', color:'#fff', fontSize:12 }}>
                  <input type="checkbox" checked={form.dias_funcionamento.includes(d)} onChange={()=>{
                    set('dias_funcionamento', form.dias_funcionamento.includes(d)
                      ? form.dias_funcionamento.filter(x=>x!==d)
                      : [...form.dias_funcionamento, d]);
                  }} /> {d}
                </label>
              ))}
            </div>
          </Field>
        </Section>

        <Section id="regua" title="Régua de campanhas">
          {form.regua.map((r,i) => (
            <div key={i} style={{ background:'#111', border:'1px solid #2a2a2a', borderRadius:8, padding:12, marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <span style={{ fontSize:12, fontWeight:600, color:'#fff' }}>Momento M{i+1}</span>
                <button type="button" onClick={()=>removeRegua(i)} style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:12}}>Remover</button>
              </div>
              <div style={{ display:'grid', gap:8 }}>
                <input value={r.gatilho} onChange={e=>setRegua(i,'gatilho',e.target.value)} style={inputStyle} placeholder="Gatilho" />
                <input value={r.oferta} onChange={e=>setRegua(i,'oferta',e.target.value)} style={inputStyle} placeholder="Oferta padrão" />
                <input value={r.cupom} onChange={e=>setRegua(i,'cupom',e.target.value)} style={inputStyle} placeholder="Cupom padrão" />
                <input type="time" value={r.horario} onChange={e=>setRegua(i,'horario',e.target.value)} style={inputStyle} />
              </div>
            </div>
          ))}
          <button type="button" onClick={addRegua} style={{ width:'100%', padding:10, background:'#252525', border:'1px dashed #3a3a3a', color:'#fff', borderRadius:8, cursor:'pointer', fontSize:13 }}>
            + Adicionar momento
          </button>
        </Section>

        <Section id="obs" title="Observações livres">
          <textarea value={form.observacoes} onChange={e=>set('observacoes',e.target.value)} style={{...inputStyle, minHeight:120}} placeholder="Qualquer informação adicional que o Pixel deva saber..." />
        </Section>

        <div style={{ display:'flex', gap:12, justifyContent:'flex-end', marginTop:24 }}>
          <button type="button" onClick={()=>go('lojas')} style={{ background:'transparent', border:'1px solid #2a2a2a', color:'#fff', padding:'10px 18px', borderRadius:8, cursor:'pointer' }}>Cancelar</button>
          <button type="submit" disabled={saving} style={{ background:'#e63946', border:'none', color:'#fff', padding:'10px 24px', borderRadius:8, cursor:'pointer', fontWeight:600, opacity: saving?0.7:1 }}>
            {saving ? 'Salvando...' : mode==='edit' ? 'Salvar alterações' : 'Criar loja'}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputStyle = {
  width:'100%', background:'#252525', border:'1px solid #2a2a2a',
  color:'#fff', borderRadius:8, padding:'10px 12px', fontSize:14,
  outline:'none', boxSizing:'border-box',
};
