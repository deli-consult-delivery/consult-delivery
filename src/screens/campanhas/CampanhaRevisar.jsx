import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import Icon from '../../components/Icon.jsx';

const VARIACOES = [
  { key:'A', label:'A — Direta' },
  { key:'B', label:'B — Emocional' },
  { key:'C', label:'C — Criativa' },
];

export default function CampanhaRevisar({ go, id, userId }) {
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

  async function escolherVariacao(varKey) {
    const texto = campanha[`variacao_${varKey.toLowerCase()}`]?.texto;
    if (!texto) return;
    const { error } = await supabase.from('campanhas').update({
      variacao_escolhida: varKey,
      texto_final: texto,
      status: 'aprovada',
      aprovado_por: userId,
      aprovado_em: new Date().toISOString(),
    }).eq('id', id);
    if (error) { alert('Erro ao aprovar: '+error.message); return; }
    go('aprovada',{id});
  }

  function formatTexto(texto) {
    if (!texto) return '';
    return texto.split('\n').map((line,i) => (
      <span key={i} style={{display:'block',marginBottom:6}}>
        {line.split(/(\*[^*]+\*)/g).map((part, j) => {
          if (part.startsWith('*') && part.endsWith('*')) {
            return <strong key={j} style={{color:'#fff'}}>{part.slice(1,-1)}</strong>;
          }
          return part;
        })}
      </span>
    ));
  }

  if (loading) return <div style={{height:'50vh',background:'#1a1a1a',borderRadius:12,animation:'pulse 1.5s infinite'}} />;
  if (!campanha) return <div style={{padding:24,color:'#fff'}}>Campanha não encontrada.</div>;

  const regua = campanha.regua_json || {};

  return (
    <div style={{ padding:24, maxWidth:1200, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <button onClick={()=>go('dashboard')} style={{background:'transparent',border:'none',color:'#9ca3af',cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
          <Icon name="chevleft" size={16} /> Voltar
        </button>
        <h1 style={{fontSize:20,fontWeight:700,color:'#fff',margin:0}}>Revisar campanha</h1>
      </div>

      <div style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:12, padding:18, marginBottom:24 }}>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'8px 16px', fontSize:13, color:'#9ca3af' }}>
          <span><strong style={{color:'#fff'}}>{loja?.nome || '—'}</strong> · {campanha.tipo}</span>
          {regua.classificacao && <span>{regua.classificacao} · Gatilho: {regua.gatilho}</span>}
          {campanha.oferta && <span>Oferta: {campanha.oferta}</span>}
          {campanha.cupom && <span>Cupom: {campanha.cupom}</span>}
          <span>Canal: {campanha.canal}</span>
          {regua.horario && <span>Horário sugerido: {regua.horario}</span>}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px,1fr))', gap:16, marginBottom:20 }}>
        {VARIACOES.map(v => {
          const varData = campanha[`variacao_${v.key.toLowerCase()}`];
          return (
            <div key={v.key} style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:12, padding:18, display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ background:'#e6394620', color:'#e63946', padding:'4px 10px', borderRadius:999, fontSize:12, fontWeight:700, border:'1px solid #e6394630' }}>{v.label}</span>
              </div>
              <div style={{ color:'#d1d5db', fontSize:14, lineHeight:1.6, whiteSpace:'pre-wrap' }}>
                {formatTexto(varData?.texto)}
              </div>
              {campanha.imagem_url && (
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <img src={campanha.imagem_url} alt="Prato" style={{width:60,height:60,borderRadius:8,objectFit:'cover'}} />
                  <span style={{fontSize:11,color:'#9ca3af'}}>Foto do prato</span>
                </div>
              )}
              <button onClick={()=>escolherVariacao(v.key)} style={{
                width:'100%', background:'#e63946', border:'none', color:'#fff',
                padding:'12px', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:14,
                marginTop:'auto',
              }}>
                Usar esta variação {v.key}
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ textAlign:'center' }}>
        <button onClick={()=>go('nova')} style={{ background:'transparent', border:'1px solid #2a2a2a', color:'#9ca3af', padding:'10px 18px', borderRadius:8, cursor:'pointer', fontSize:13 }}>
          Nenhuma ficou boa — gerar novamente
        </button>
      </div>
    </div>
  );
}
