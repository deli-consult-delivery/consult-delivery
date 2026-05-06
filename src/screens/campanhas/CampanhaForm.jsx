import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import Icon from '../../components/Icon.jsx';
import CustomSelect from '../../components/CustomSelect.jsx';
import EmptyState from './components/EmptyState.jsx';

const WEBHOOK_BASE = import.meta.env.VITE_N8N_WEBHOOK_BASE;

const TIPOS = [
  { group:'Jornada do cliente', items:[
    { value:'boas-vindas', label:'Boas-vindas (M1)' },
    { value:'primeira-compra', label:'Primeira compra (M2)' },
    { value:'reativacao-30', label:'Reativação 30 dias (M5)' },
    { value:'reativacao-45', label:'Reativação 45+ dias (M5)' },
    { value:'aniversario', label:'Aniversário (M6)' },
    { value:'fidelizacao-vip', label:'Fidelização VIP (M4)' },
  ]},
  { group:'Rotina', items:[
    { value:'cardapio-dia', label:'Cardápio do dia (M3)' },
    { value:'pizza-sexta', label:'Pizza de sexta (M3)' },
    { value:'combo-familia', label:'Combo família (M3)' },
  ]},
  { group:'Especial', items:[
    { value:'lancamento-produto', label:'Lançamento de produto (M7)' },
    { value:'data-comemorativa', label:'Data comemorativa (M6)' },
    { value:'nps-feedback', label:'NPS / Feedback (G3)' },
  ]},
  { group:'Outro', items:[
    { value:'generico', label:'Genérico (G1)' },
  ]},
];

const CANAIS = ['Delivery','WhatsApp','Salão','Encomendas'];

export default function CampanhaForm({ go, params }) {
  const [lojas, setLojas] = useState([]);
  const [form, setForm] = useState({
    loja_id: params?.lojaId || '', tipo:'boas-vindas', canal:'Delivery',
    contexto:'', imagem_url:'', tom_override:'',
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    supabase.from('lojas').select('id,nome,slug,skill_criada').eq('skill_criada',true).eq('status','ativa').then(({ data }) => setLojas(data||[]));
  }, []);

  function set(k,v) { setForm(f=>({...f,[k]:v})); }

  async function handleImage(file) {
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { alert('Formato inválido. Use JPG, PNG ou WEBP.'); return; }
    if (file.size > 5*1024*1024) { alert('Máximo 5MB.'); return; }
    setUploading(true);
    const path = `campanhas/${Date.now()}_${file.name}`;
    const { data, error } = await supabase.storage.from('imagens-campanhas').upload(path, file, { cacheControl:'3600', upsert:false });
    if (error) { alert('Erro no upload: '+error.message); setUploading(false); return; }
    const { data:{ publicUrl } } = supabase.storage.from('imagens-campanhas').getPublicUrl(data.path);
    set('imagem_url', publicUrl);
    setPreview(publicUrl);
    setUploading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.loja_id || !form.contexto || form.contexto.length < 20) { alert('Preencha os campos obrigatórios. Contexto mínimo 20 caracteres.'); return; }
    setSaving(true);

    const loja = lojas.find(l=>l.id===form.loja_id);

    const { data, error } = await supabase.from('campanhas').insert({
      loja_id: form.loja_id, tipo: form.tipo, canal: form.canal,
      contexto: form.contexto, imagem_url: form.imagem_url,
      tom_override: form.tom_override || null,
      status: 'gerando',
    }).select('id').single();

    if (error || !data) { alert('Erro ao criar campanha: '+(error?.message||'desconhecido')); setSaving(false); return; }

    const campanhaId = data.id;

    if (WEBHOOK_BASE) {
      try {
        await fetch(`${WEBHOOK_BASE}/campanha/gerar`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            campanha_id: campanhaId,
            loja_slug: loja?.slug,
            tipo: form.tipo,
            contexto: form.contexto,
            imagem_url: form.imagem_url,
            canal: form.canal,
            tom_override: form.tom_override || null,
          }),
        });
      } catch(err) { console.error('Webhook gerar:', err); }
    }

    setSaving(false);
    go('gerando', { id: campanhaId });
  }

  const hasSkillLojas = lojas.length > 0;

  return (
    <div style={{ padding:24, maxWidth:720, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
        <button onClick={()=>go('dashboard')} style={{background:'transparent',border:'none',color:'#9ca3af',cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
          <Icon name="chevleft" size={16} /> Voltar
        </button>
        <h1 style={{fontSize:22,fontWeight:700,color:'#fff',margin:0}}>Nova campanha</h1>
      </div>

      {!hasSkillLojas && (
        <div style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:12, padding:20, marginBottom:20 }}>
          <EmptyState icon="building" title="Nenhuma loja pronta"
            description="Cadastre uma loja e aguarde a skill ser criada no EvoNexus antes de gerar campanhas."
            action={<button onClick={()=>go('loja-nova')} style={{background:'#e63946',border:'none',color:'#fff',padding:'8px 16px',borderRadius:8,cursor:'pointer',fontWeight:600}}>Cadastrar loja</button>
            } />
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:12, padding:20, marginBottom:16 }}>
          <Field label="Loja" required>
            <CustomSelect
              value={form.loja_id}
              onChange={v=>set('loja_id',v)}
              options={lojas.map(l=>({ value:l.id, label:l.nome }))}
              placeholder="Selecione uma loja..."
              disabled={!hasSkillLojas}
            />
          </Field>

          <Field label="Tipo de campanha" required>
            <CustomSelect
              value={form.tipo}
              onChange={v=>set('tipo',v)}
              options={TIPOS.map(g=>({ label:g.group, items:g.items }))}
              groups
            />
          </Field>

          <Field label="Canal" required>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              {CANAIS.map(c=>(
                <label key={c} style={{ display:'flex', alignItems:'center', gap:8, background:form.canal===c?'#e6394620':'#252525', border:`1px solid ${form.canal===c?'#e63946':'#2a2a2a'}`, padding:'10px 14px', borderRadius:8, cursor:'pointer', color:'#fff', fontSize:13 }}>
                  <input type="radio" name="canal" value={c} checked={form.canal===c} onChange={()=>set('canal',c)} /> {c}
                </label>
              ))}
            </div>
          </Field>

          <Field label="Contexto da campanha" required hint="Mínimo 20 caracteres.">
            <textarea value={form.contexto} onChange={e=>set('contexto',e.target.value)} style={{...inputStyle, minHeight:120}} minLength={20}
              placeholder="Descreva o objetivo, a oferta, o público e qualquer informação relevante para o Pixel criar a campanha. Ex: Clientes que não pediram há 30 dias. Oferta de R$10 OFF com cupom VOLTOU10. Tom saudosista." />
          </Field>

          <Field label="Foto do prato" hint="Opcional. JPG, PNG, WEBP — máx 5MB.">
            <div
              onDragOver={e=>e.preventDefault()}
              onDrop={e=>{ e.preventDefault(); handleImage(e.dataTransfer.files[0]); }}
              onClick={()=>document.getElementById('campanha-img')?.click()}
              style={{
                border:'2px dashed #2a2a2a', borderRadius:12, padding:24,
                display:'flex', flexDirection:'column', alignItems:'center', gap:8,
                cursor:'pointer', background:'#151515', textAlign:'center',
              }}
            >
              {preview ? (
                <img src={preview} alt="Preview" style={{maxHeight:160,borderRadius:8,objectFit:'cover'}} />
              ) : (
                <>
                  <Icon name="image" size={28} />
                  <span style={{color:'#9ca3af',fontSize:13}}>Arraste uma imagem ou clique para selecionar</span>
                </>
              )}
              {uploading && <span style={{color:'#fff',fontSize:12}}>Enviando...</span>}
              <input id="campanha-img" type="file" accept="image/jpeg,image/png,image/webp" style={{display:'none'}}
                onChange={e=>{ handleImage(e.target.files[0]); e.target.value=''; }} />
            </div>
          </Field>

          <Field label="Tom override" hint="Opcional.">
            <input value={form.tom_override} onChange={e=>set('tom_override',e.target.value)} style={inputStyle} placeholder="Ex: hoje mais urgente / tom mais formal / incluir emoji de pizza" />
          </Field>
        </div>

        <button type="submit" disabled={saving || !hasSkillLojas} style={{
          width:'100%', background:'#e63946', border:'none', color:'#fff',
          padding:'14px', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:15,
          opacity: saving?0.7:1,
        }}>
          {saving ? 'Criando campanha...' : <><Icon name="sparkles" size={16} /> Gerar campanha</>}
        </button>
      </form>
    </div>
  );
}

function Field({ label, required, children, hint }) {
  return (
    <div style={{ marginBottom:18 }}>
      <label style={{ display:'block', fontSize:12, fontWeight:500, color:'#9ca3af', marginBottom:6 }}>{label}{required && <span style={{color:'#ef4444'}}> *</span>}</label>
      {children}
      {hint && <span style={{fontSize:11,color:'#6b7280',marginTop:4,display:'block'}}>{hint}</span>}
    </div>
  );
}

const inputStyle = {
  width:'100%', background:'#252525', border:'1px solid #2a2a2a',
  color:'#fff', borderRadius:8, padding:'10px 12px', fontSize:14,
  outline:'none', boxSizing:'border-box',
};
