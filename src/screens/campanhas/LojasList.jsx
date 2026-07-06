import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import Icon from '../../components/Icon.jsx';
import SkillBadge from './components/SkillBadge.jsx';
import EmptyState from './components/EmptyState.jsx';

export default function LojasList({ go }) {
  const [lojas, setLojas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('lojas').select('*').eq('is_contato', false).order('created_at',{ ascending:false });
      setLojas(data||[]); setLoading(false);
    }
    load();
  }, []);

  async function toggleStatus(id, current) {
    const next = current==='ativa' ? 'inativa' : 'ativa';
    await supabase.from('lojas').update({ status:next }).eq('id',id);
    setLojas(prev => prev.map(l => l.id===id ? {...l, status:next} : l));
  }

  return (
    <div style={{ padding:24, maxWidth:1200, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:700, color:'#fff', margin:0 }}>Lojas</h1>
        <button onClick={()=>go('loja-nova')} style={{ background:'#e63946', border:'none', color:'#fff', padding:'8px 14px', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontWeight:600 }}
        >
          <Icon name="plus" size={14} /> Nova loja
        </button>
      </div>

      {loading ? (
        <div style={{ display:'grid', gap:12 }}>
          {[1,2,3].map(i=><div key={i} style={{height:64,background:'#1a1a1a',borderRadius:12,animation:'pulse 1.5s infinite'}}/>)}
        </div>
      ) : lojas.length===0 ? (
        <EmptyState icon="building" title="Nenhuma loja cadastrada" description="Cadastre sua primeira loja para começar a criar campanhas."
          action={<button onClick={()=>go('loja-nova')} style={{background:'#e63946',border:'none',color:'#fff',padding:'8px 16px',borderRadius:8,cursor:'pointer',fontWeight:600}}>Cadastrar loja</button>
          } />
      ) : (
        <div style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:12, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ color:'#9ca3af' }}>
                <th style={{padding:'12px 14px',textAlign:'left',fontWeight:500}}>Logo</th>
                <th style={{padding:'12px 14px',textAlign:'left',fontWeight:500}}>Nome</th>
                <th style={{padding:'12px 14px',textAlign:'left',fontWeight:500}}>Tipo</th>
                <th style={{padding:'12px 14px',textAlign:'left',fontWeight:500}}>Skill</th>
                <th style={{padding:'12px 14px',textAlign:'left',fontWeight:500}}>Status</th>
                <th style={{padding:'12px 14px',textAlign:'left',fontWeight:500}}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lojas.map(l => (
                <tr key={l.id} style={{ borderTop:'1px solid #2a2a2a' }}>
                  <td style={{padding:'10px 14px'}}>
                    {l.logo_url ? <img src={l.logo_url} alt="" style={{width:36,height:36,borderRadius:8,objectFit:'cover'}} /> : <div style={{width:36,height:36,borderRadius:8,background:'#2a2a2a'}} />}
                  </td>
                  <td style={{padding:'10px 14px',color:'#fff',fontWeight:500}}>{l.nome}</td>
                  <td style={{padding:'10px 14px',color:'#9ca3af'}}>{l.tipo}</td>
                  <td style={{padding:'10px 14px'}}><SkillBadge criada={l.skill_criada} /></td>
                  <td style={{padding:'10px 14px'}}>
                    <span style={{ color: l.status==='ativa'?'#22c55e':'#9ca3af', fontSize:12, fontWeight:600 }}>
                      {l.status==='ativa'?'Ativa':'Inativa'}
                    </span>
                  </td>
                  <td style={{padding:'10px 14px'}}>
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={()=>go('nova',{ lojaId: l.id })} title="Nova campanha" style={iconBtn}><Icon name="plus" size={14} /></button>
                      <button onClick={()=>go('loja-editar',{ slug: l.slug })} title="Editar" style={iconBtn}><Icon name="edit" size={14} /></button>
                      <button onClick={()=>toggleStatus(l.id,l.status)} title={l.status==='ativa'?'Desativar':'Ativar'} style={iconBtn}>
                        <Icon name={l.status==='ativa'?'x':'check'} size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const iconBtn = {
  background:'#252525', border:'1px solid #2a2a2a', color:'#fff',
  borderRadius:6, padding:6, cursor:'pointer', display:'inline-flex', alignItems:'center',
};
