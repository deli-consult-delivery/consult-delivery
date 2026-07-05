import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import Icon from '../../components/Icon.jsx';
import CustomSelect from '../../components/CustomSelect.jsx';
import StatusBadge from './components/StatusBadge.jsx';
import EmptyState from './components/EmptyState.jsx';

const STATUS_OPTIONS = ['Todas','Gerando','Pendente revisão','Aprovada','Erro'];
const STATUS_MAP_VALUE = { 'Gerando':'gerando', 'Pendente revisão':'pendente_revisao', 'Aprovada':'aprovada', 'Erro':'erro_geracao' };

export default function HistoricoCampanhas({ go }) {
  const [lojas, setLojas] = useState([]);
  const [campanhas, setCampanhas] = useState([]);
  const [filters, setFilters] = useState({ loja:'', tipo:'', status:'Todas', start:'', end:'' });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    async function load() {
      const { data: ls } = await supabase.from('lojas').select('id,nome,logo_url').eq('is_contato', false);
      setLojas(ls||[]);
      await fetchCampanhas();
    }
    load();
  }, []);

  async function fetchCampanhas() {
    setLoading(true);
    let q = supabase.from('campanhas').select('*, loja:loja_id(nome,logo_url)').order('criado_em',{ ascending:false });
    const s = STATUS_MAP_VALUE[filters.status];
    if (s) q = q.eq('status', s);
    if (filters.loja) q = q.eq('loja_id', filters.loja);
    // Período padrão: últimos 7 dias
    const end = filters.end || new Date().toISOString();
    const start = filters.start || new Date(Date.now()-7*24*60*60*1000).toISOString();
    q = q.gte('criado_em', start).lte('criado_em', end);
    const { data } = await q;
    setCampanhas(data||[]); setLoading(false);
  }

  const lojaMap = Object.fromEntries(lojas.map(l=>[l.id,l]));

  return (
    <div style={{ padding:24, maxWidth:1200, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:700, color:'#fff', margin:0 }}>Histórico de campanhas</h1>
        <button onClick={()=>go('nova')} style={{ background:'#e63946', border:'none', color:'#fff', padding:'8px 14px', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontWeight:600 }}>
          <Icon name="plus" size={14} /> Nova
        </button>
      </div>

      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:20, background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:12, padding:14 }}>
        <div style={{ minWidth: 180 }}>
          <CustomSelect
            value={filters.loja}
            onChange={v=>setFilters(f=>({...f,loja:v}))}
            options={[{ value:'', label:'Todas as lojas' }, ...lojas.map(l=>({ value:l.id, label:l.nome }))]}
          />
        </div>
        <div style={{ minWidth: 180 }}>
          <CustomSelect
            value={filters.status}
            onChange={v=>setFilters(f=>({...f,status:v}))}
            options={STATUS_OPTIONS.map(s=>({ value:s, label:s }))}
          />
        </div>
        <input type="date" value={filters.start ? filters.start.slice(0,10) : ''} onChange={e=>setFilters(f=>({...f,start:e.target.value?e.target.value+'T00:00:00':''}))} style={filterStyle} />
        <input type="date" value={filters.end ? filters.end.slice(0,10) : ''} onChange={e=>setFilters(f=>({...f,end:e.target.value?e.target.value+'T23:59:59':''}))} style={filterStyle} />
        <button onClick={fetchCampanhas} style={{ background:'#252525', border:'1px solid #2a2a2a', color:'#fff', padding:'8px 14px', borderRadius:8, cursor:'pointer', fontSize:13 }}>
          <Icon name="refresh" size={14} /> Filtrar
        </button>
      </div>

      {loading ? (
        <div style={{ display:'grid', gap:12 }}>
          {[1,2,3].map(i=><div key={i} style={{height:56,background:'#1a1a1a',borderRadius:12,animation:'pulse 1.5s infinite'}}/>)}
        </div>
      ) : campanhas.length===0 ? (
        <EmptyState icon="paper" title="Nenhuma campanha encontrada" description="Ajuste os filtros ou crie uma nova campanha." />
      ) : (
        <div style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:12, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ color:'#9ca3af' }}>
                <th style={{padding:'12px 14px',textAlign:'left',fontWeight:500}}>Data/hora</th>
                <th style={{padding:'12px 14px',textAlign:'left',fontWeight:500}}>Loja</th>
                <th style={{padding:'12px 14px',textAlign:'left',fontWeight:500}}>Tipo</th>
                <th style={{padding:'12px 14px',textAlign:'left',fontWeight:500}}>Variação</th>
                <th style={{padding:'12px 14px',textAlign:'left',fontWeight:500}}>Status</th>
                <th style={{padding:'12px 14px',textAlign:'left',fontWeight:500}}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {campanhas.map(c => (
                <tr key={c.id} style={{ borderTop:'1px solid #2a2a2a' }}>
                  <td style={{padding:'10px 14px',color:'#9ca3af'}}>{new Date(c.criado_em).toLocaleString('pt-BR')}</td>
                  <td style={{padding:'10px 14px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      {(c.loja?.logo_url || lojaMap[c.loja_id]?.logo_url) ? <img src={c.loja?.logo_url || lojaMap[c.loja_id]?.logo_url} alt="" style={{width:28,height:28,borderRadius:6,objectFit:'cover'}} /> : <div style={{width:28,height:28,borderRadius:6,background:'#2a2a2a'}} />}
                      <span style={{color:'#fff',fontSize:13,fontWeight:500}}>{c.loja?.nome || lojaMap[c.loja_id]?.nome || '—'}</span>
                    </div>
                  </td>
                  <td style={{padding:'10px 14px',color:'#fff'}}>{c.tipo}</td>
                  <td style={{padding:'10px 14px',color:'#fff'}}>{c.variacao_escolhida || '—'}</td>
                  <td style={{padding:'10px 14px'}}><StatusBadge status={c.status} /></td>
                  <td style={{padding:'10px 14px'}}>
                    <div style={{display:'flex',gap:6}}>
                      <button onClick={()=>setSelected(c)} style={{background:'#252525',border:'1px solid #2a2a2a',color:'#fff',padding:'6px 10px',borderRadius:6,cursor:'pointer',fontSize:12}}>Ver detalhes</button>
                      <button onClick={()=>go('nova',{ lojaId: c.loja_id })} style={{background:'transparent',border:'1px solid #2a2a2a',color:'#9ca3af',padding:'6px 10px',borderRadius:6,cursor:'pointer',fontSize:12}}>Criar similar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && <DetailModal campanha={selected} loja={lojaMap[selected.loja_id]} onClose={()=>setSelected(null)} go={go} />}
    </div>
  );
}

function DetailModal({ campanha, loja, onClose, go }) {
  const [showLog, setShowLog] = useState(false);
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:24 }}>
      <div style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:12, maxWidth:600, width:'100%', maxHeight:'80vh', overflow:'auto', padding:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{margin:0,color:'#fff',fontSize:16}}>Detalhes da campanha</h3>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#9ca3af',cursor:'pointer'}}><Icon name="x" size={18} /></button>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          {loja?.logo_url ? <img src={loja.logo_url} alt="" style={{width:36,height:36,borderRadius:8,objectFit:'cover'}} /> : null}
          <div>
            <div style={{color:'#fff',fontWeight:600,fontSize:14}}>{loja?.nome || '—'}</div>
            <div style={{color:'#9ca3af',fontSize:12}}>{campanha.tipo} · {new Date(campanha.criado_em).toLocaleString('pt-BR')}</div>
          </div>
        </div>

        {campanha.texto_final && (
          <div style={{ background:'#111', border:'1px solid #2a2a2a', borderRadius:8, padding:14, marginBottom:16 }}>
            <div style={{fontSize:12,fontWeight:500,color:'#9ca3af',marginBottom:8}}>TEXTO APROVADO</div>
            <pre style={{margin:0,color:'#d1d5db',whiteSpace:'pre-wrap',fontFamily:'Inter, sans-serif',fontSize:13,lineHeight:1.6}}>{campanha.texto_final}</pre>
          </div>
        )}

        <div style={{ marginBottom:16 }}>
          <button onClick={()=>setShowLog(!showLog)} style={{background:'transparent',border:'none',color:'#9ca3af',cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',gap:6}}>
            <Icon name={showLog?'chevdown':'chevright'} size={14} /> Log do EvoNexus
          </button>
          {showLog && (
            <pre style={{background:'#111',border:'1px solid #2a2a2a',borderRadius:8,padding:12,marginTop:8,color:'#6b7280',fontSize:11,overflow:'auto',maxHeight:200}}>
              {campanha.log_evonexus || 'Sem log registrado.'}
            </pre>
          )}
        </div>

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={()=>{ onClose(); go('nova',{ lojaId: campanha.loja_id }); }} style={{background:'#e63946',border:'none',color:'#fff',padding:'8px 16px',borderRadius:8,cursor:'pointer',fontWeight:600,fontSize:13}}>Criar campanha similar</button>
        </div>
      </div>
    </div>
  );
}

const filterStyle = {
  background:'#252525', border:'1px solid #2a2a2a', color:'#fff',
  borderRadius:8, padding:'8px 12px', fontSize:13, outline:'none',
};
