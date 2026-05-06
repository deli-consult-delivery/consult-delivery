import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase.js';
import Icon from '../../components/Icon.jsx';

const WEBHOOK_BASE = import.meta.env.VITE_N8N_WEBHOOK_BASE;

export default function CampanhaGerando({ go, id }) {
  const [status, setStatus] = useState('gerando');
  const [erro, setErro] = useState(null);
  const [timedOut, setTimedOut] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    // Timeout client-side de 3 minutos
    timeoutRef.current = setTimeout(() => setTimedOut(true), 3*60*1000);

    const channel = supabase
      .channel(`campanha-${id}`)
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'campanhas', filter:`id=eq.${id}` }, payload => {
        const s = payload.new.status;
        if (s === 'pendente_revisao') { clearTimeout(timeoutRef.current); go('revisar',{id}); }
        else if (s === 'erro_geracao') { clearTimeout(timeoutRef.current); setStatus('erro_geracao'); setErro(payload.new.erro_msg); }
      })
      .subscribe();

    // Verificação inicial
    supabase.from('campanhas').select('status,erro_msg').eq('id',id).single().then(({ data }) => {
      if (data?.status === 'pendente_revisao') { clearTimeout(timeoutRef.current); go('revisar',{id}); }
      else if (data?.status === 'erro_geracao') { clearTimeout(timeoutRef.current); setStatus('erro_geracao'); setErro(data.erro_msg); }
      else if (data?.status === 'aprovada') { clearTimeout(timeoutRef.current); go('aprovada',{id}); }
    });

    return () => { clearTimeout(timeoutRef.current); supabase.removeChannel(channel); };
  }, [id]);

  async function tentarNovamente() {
    setStatus('gerando'); setErro(null); setTimedOut(false);
    timeoutRef.current = setTimeout(() => setTimedOut(true), 3*60*1000);
    const { data } = await supabase.from('campanhas').select('loja:loja_id(slug),tipo,contexto,imagem_url,canal,tom_override').eq('id',id).single();
    if (!data) return;
    if (WEBHOOK_BASE) {
      try {
        await fetch(`${WEBHOOK_BASE}/campanha/gerar`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            campanha_id: id, loja_slug: data.loja?.slug,
            tipo: data.tipo, contexto: data.contexto,
            imagem_url: data.imagem_url, canal: data.canal,
            tom_override: data.tom_override,
          }),
        });
      } catch(err) { console.error('Retry webhook:', err); }
    }
  }

  async function verificarStatus() {
    const { data } = await supabase.from('campanhas').select('status,erro_msg').eq('id',id).single();
    if (data?.status === 'pendente_revisao') { clearTimeout(timeoutRef.current); go('revisar',{id}); }
    else if (data?.status === 'erro_geracao') { setStatus('erro_geracao'); setErro(data.erro_msg); }
    else if (data?.status === 'aprovada') { clearTimeout(timeoutRef.current); go('aprovada',{id}); }
  }

  if (status === 'erro_geracao') {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'70vh', gap:16, textAlign:'center', padding:24 }}>
        <Icon name="warning" size={40} />
        <h2 style={{color:'#fff',margin:0,fontSize:18}}>Erro na geração</h2>
        <p style={{color:'#ef4444',maxWidth:400,margin:0,fontSize:14}}>{erro || 'O Pixel não conseguiu gerar a campanha.'}</p>
        <div style={{display:'flex',gap:12,marginTop:8}}>
          <button onClick={tentarNovamente} style={{background:'#e63946',border:'none',color:'#fff',padding:'10px 18px',borderRadius:8,cursor:'pointer',fontWeight:600}}>Tentar novamente</button>
          <button onClick={()=>go('nova')} style={{background:'transparent',border:'1px solid #2a2a2a',color:'#fff',padding:'10px 18px',borderRadius:8,cursor:'pointer'}}>Voltar e editar</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'70vh', gap:20, textAlign:'center', padding:24 }}>
      <div style={{ width:64, height:64, borderRadius:'50%', border:'3px solid #e63946', borderTopColor:'transparent', animation:'spin 1s linear infinite' }} />
      <h2 style={{color:'#fff',margin:0,fontSize:20,fontWeight:700}}>O Pixel está criando sua campanha...</h2>
      <p style={{color:'#9ca3af',maxWidth:360,margin:0,fontSize:14}}>
        Analisando a loja, o contexto e gerando 3 variações de texto.
      </p>
      <div style={{ width:280, height:4, background:'#2a2a2a', borderRadius:2, overflow:'hidden' }}>
        <div style={{ width:'100%', height:'100%', background:'#e63946', animation:'indeterminate 1.5s infinite' }} />
      </div>

      {timedOut && (
        <div style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:12, padding:20, maxWidth:400, marginTop:12 }}>
          <p style={{color:'#9ca3af',fontSize:13,margin:'0 0 12px'}}>Demorando mais que o esperado. O Pixel pode estar sobrecarregado.</p>
          <div style={{display:'flex',gap:10,justifyContent:'center'}}>
            <button onClick={verificarStatus} style={{background:'#252525',border:'1px solid #2a2a2a',color:'#fff',padding:'8px 14px',borderRadius:6,cursor:'pointer',fontSize:12}}>Verificar status</button>
            <button onClick={tentarNovamente} style={{background:'#e63946',border:'none',color:'#fff',padding:'8px 14px',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:600}}>Tentar novamente</button>
          </div>
        </div>
      )}
    </div>
  );
}
