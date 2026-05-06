import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import Icon from '../../components/Icon.jsx';
import CopiableText from './components/CopiableText.jsx';

export default function CampanhaAprovada({ go, id }) {
  const [campanha, setCampanha] = useState(null);
  const [loja, setLoja] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('campanhas').select('*, loja:loja_id(*)').eq('id',id).single();
      if (data) { setCampanha(data); setLoja(data.loja); }
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) return <div style={{height:'50vh',background:'#1a1a1a',borderRadius:12,animation:'pulse 1.5s infinite'}} />;
  if (!campanha) return <div style={{padding:24,color:'#fff'}}>Campanha não encontrada.</div>;

  const regua = campanha.regua_json || {};

  return (
    <div style={{ padding:24, maxWidth:900, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <button onClick={()=>go('dashboard')} style={{background:'transparent',border:'none',color:'#9ca3af',cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
          <Icon name="chevleft" size={16} /> Voltar
        </button>
        <h1 style={{fontSize:20,fontWeight:700,color:'#fff',margin:0}}>Campanha aprovada</h1>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:24 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, color:'#22c55e', fontSize:14, fontWeight:600 }}>
            <Icon name="checkcircle" size={18} /> Campanha aprovada
          </div>

          <div>
            <label style={{display:'block',fontSize:12,fontWeight:500,color:'#9ca3af',marginBottom:8}}>TEXTO PARA ENVIO</label>
            <CopiableText text={campanha.texto_final || ''} />
          </div>

          <button onClick={()=>go('nova')} style={{ background:'#e63946', border:'none', color:'#fff', padding:'12px 20px', borderRadius:8, cursor:'pointer', fontWeight:600, display:'flex', alignItems:'center', gap:8, width:'fit-content' }}>
            <Icon name="plus" size={16} /> Criar nova campanha
          </button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {campanha.imagem_url && (
            <div style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:12, padding:14 }}>
              <div style={{fontSize:12,fontWeight:500,color:'#9ca3af',marginBottom:10}}>FOTO DO PRATO</div>
              <img src={campanha.imagem_url} alt="Prato" style={{width:'100%',borderRadius:8,objectFit:'cover',marginBottom:10}} />
              <a href={campanha.imagem_url} download style={{color:'#e63946',fontSize:12,textDecoration:'none',fontWeight:600,display:'flex',alignItems:'center',gap:6}}>
                <Icon name="download" size={14} /> Baixar imagem
              </a>
            </div>
          )}

          <div style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:12, padding:14 }}>
            <div style={{fontSize:12,fontWeight:500,color:'#9ca3af',marginBottom:10}}>RÉGUA DE REFERÊNCIA</div>
            <div style={{display:'flex',flexDirection:'column',gap:8,fontSize:13,color:'#d1d5db'}}>
              <div><span style={{color:'#9ca3af'}}>Classificação:</span> {regua.classificacao || '—'}</div>
              <div><span style={{color:'#9ca3af'}}>Gatilho:</span> {regua.gatilho || '—'}</div>
              <div><span style={{color:'#9ca3af'}}>Horário sugerido:</span> {regua.horario || '—'}</div>
              <div><span style={{color:'#9ca3af'}}>Canal:</span> {campanha.canal}</div>
              <div><span style={{color:'#9ca3af'}}>Objetivo:</span> {campanha.tipo}</div>
              <div><span style={{color:'#9ca3af'}}>Oferta:</span> {campanha.oferta || '—'} {campanha.cupom && `(${campanha.cupom})`}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
