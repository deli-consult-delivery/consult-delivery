import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import Icon from '../../components/Icon.jsx';
import StatusBadge from './components/StatusBadge.jsx';
import EmptyState from './components/EmptyState.jsx';

export default function CampanhasDashboard({ go }) {
  const [metrics, setMetrics] = useState({ lojas:0, semana:0, pendentes:0, aprovadasHoje:0 });
  const [pendentes, setPendentes] = useState([]);
  const [erros, setErros] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { count: lojasCount } = await supabase.from('lojas').select('*', { count:'exact', head:true }).eq('status','ativa');

      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      startOfWeek.setHours(0,0,0,0);
      const { count: semanaCount } = await supabase.from('campanhas').select('*',{ count:'exact', head:true }).gte('criado_em', startOfWeek.toISOString());

      const { count: pendentesCount } = await supabase.from('campanhas').select('*',{ count:'exact', head:true }).eq('status','pendente_revisao');

      const today = new Date(); today.setHours(0,0,0,0);
      const { count: aprovadasCount } = await supabase.from('campanhas').select('*',{ count:'exact', head:true }).eq('status','aprovada').gte('aprovado_em', today.toISOString());

      setMetrics({ lojas: lojasCount||0, semana: semanaCount||0, pendentes: pendentesCount||0, aprovadasHoje: aprovadasCount||0 });

      const { data: p } = await supabase.from('campanhas').select('id, loja:loja_id(nome,logo_url), tipo, criado_em').eq('status','pendente_revisao').order('criado_em',{ ascending:false }).limit(10);
      setPendentes(p||[]);

      const { data: e } = await supabase.from('campanhas').select('id, loja:loja_id(nome,logo_url), tipo, erro_msg, criado_em').eq('status','erro_geracao').order('criado_em',{ ascending:false }).limit(10);
      setErros(e||[]);
      setLoading(false);
    }
    load();
  }, []);

  const cards = [
    { label:'Lojas ativas', value:metrics.lojas, icon:'building', color:'#22c55e' },
    { label:'Campanhas esta semana', value:metrics.semana, icon:'chart', color:'#3b82f6' },
    { label:'Pendentes de revisão', value:metrics.pendentes, icon:'bell', color:'#f59e0b' },
    { label:'Aprovadas hoje', value:metrics.aprovadasHoje, icon:'checkcircle', color:'#e63946' },
  ];

  return (
    <div style={{ padding:24, maxWidth:1200, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:700, color:'#fff', margin:0 }}>Campanhas</h1>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={()=>go('lojas')} className="btn-secondary">
            <Icon name="building" size={14} /> Lojas
          </button>
          <button onClick={()=>go('nova')} className="btn-primary"
            style={{ background:'#e63946', border:'none', color:'#fff', padding:'8px 14px', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontWeight:600 }}
          >
            <Icon name="plus" size={14} /> Nova campanha
          </button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px,1fr))', gap:16, marginBottom:32 }}>
        {cards.map(c => (
          <div key={c.label} style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:12, padding:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, color:'#9ca3af', fontSize:13 }}>
              <Icon name={c.icon} size={16} /> {c.label}
            </div>
            <div style={{ fontSize:28, fontWeight:700, color:c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ display:'grid', gap:16 }}>
          {[1,2].map(i=><div key={i} style={{height:120,background:'#1a1a1a',borderRadius:12,animation:'pulse 1.5s infinite'}}/>)}
        </div>
      ) : (
        <>
          <Section title="Pendentes de revisão" empty={!pendentes.length}>
            <Table rows={pendentes} columns={[
              { key:'loja', label:'Loja', render:row=><LojaCell row={row} /> },
              { key:'tipo', label:'Tipo' },
              { key:'criado_em', label:'Criado em', render:r=> new Date(r.criado_em).toLocaleString('pt-BR') },
              { key:'acoes', label:'', render:r=><button onClick={()=>go('revisar',{id:r.id})} style={{background:'#e63946',border:'none',color:'#fff',padding:'6px 12px',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:600}}>Revisar</button> },
            ]} />
          </Section>

          <Section title="Erros de geração" empty={!erros.length}>
            <Table rows={erros} columns={[
              { key:'loja', label:'Loja', render:row=><LojaCell row={row} /> },
              { key:'tipo', label:'Tipo' },
              { key:'erro_msg', label:'Erro', render:r=><span style={{color:'#ef4444',fontSize:12}}>{r.erro_msg||'Erro desconhecido'}</span> },
              { key:'acoes', label:'', render:r=><button onClick={()=>go('gerando',{id:r.id})} style={{background:'#2a2a2a',border:'1px solid #3a3a3a',color:'#fff',padding:'6px 12px',borderRadius:6,cursor:'pointer',fontSize:12}}>Tentar novamente</button> },
            ]} />
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children, empty }) {
  return (
    <div style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:12, marginBottom:24, overflow:'hidden' }}>
      <div style={{ padding:'14px 18px', borderBottom:'1px solid #2a2a2a', fontWeight:600, color:'#fff', fontSize:14 }}>{title}</div>
      {empty ? <EmptyState icon="checkcircle" title="Tudo certo" description={`Nenhum item em ${title.toLowerCase()}.`} /> : children}
    </div>
  );
}

function LojaCell({ row }) {
  const loja = row.loja || {};
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
      {loja.logo_url ? <img src={loja.logo_url} alt="" style={{width:28,height:28,borderRadius:6,objectFit:'cover'}} /> : <div style={{width:28,height:28,borderRadius:6,background:'#2a2a2a'}} />}
      <span style={{color:'#fff',fontSize:13,fontWeight:500}}>{loja.nome || '—'}</span>
    </div>
  );
}

function Table({ rows, columns }) {
  return (
    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
      <thead>
        <tr>
          {columns.map(c=><th key={c.key} style={{textAlign:'left',padding:'10px 14px',color:'#9ca3af',fontWeight:500,borderBottom:'1px solid #2a2a2a'}}>{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row,i)=><tr key={i}>
          {columns.map(c=><td key={c.key} style={{padding:'10px 14px',borderBottom:'1px solid #2a2a2a',color:'#fff'}}>
            {c.render ? c.render(row) : row[c.key]}
          </td>)}
        </tr>)}
      </tbody>
    </table>
  );
}
