import { useState, useEffect } from 'react';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { INADIMPLENTES } from '../data.js';

const STATUS = {
  trying:      { label: 'CORA tentando',  cls: 'badge-yellow', pulse: 'pulse-amber' },
  negotiating: { label: 'Negociando',     cls: 'badge-blue',   pulse: '' },
  paid:        { label: 'Pago',           cls: 'badge-green',  pulse: '' },
  critical:    { label: 'Crítico',        cls: 'badge-red',    pulse: 'pulse-red' },
};

export default function CoraScreen({ tenant }) {
  const data = INADIMPLENTES[tenant] || { kpis: { total: '—', recebido: '—', taxa: '—', reguas: 0 }, rows: [], liveActions: [] };
  const [tab, setTab] = useState('inad');
  const [openDrawer, setOpenDrawer] = useState(false);
  const [liveTick, setLiveTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setLiveTick(t => t + 1), 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="route-enter" style={{ padding: 32, maxWidth: 1400, margin: '0 auto', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <AgentAvatar id="cora" size={56} />
          <div>
            <h1 className="page-h1">CORA — Cobrança Inteligente</h1>
            <p className="page-sub">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, background: 'var(--success)', borderRadius: '50%' }} className="pulse-green" />
                <strong style={{ color: 'var(--success)' }}>Ativa agora</strong> · Trabalhando em 3 conversas em paralelo
              </span>
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary"><Icon name="gear" size={14} /> Configurar CORA</button>
          <button className="btn-primary"><Icon name="plus" size={14} /> Nova régua</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="kpi">
          <div className="kpi-label">Total a receber</div>
          <div className="kpi-value accent" style={{ marginTop: 8 }}>{data.kpis.total}</div>
          <div className="kpi-delta down" style={{ marginTop: 10 }}><Icon name="info" size={11} />Em aberto</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Recebido este mês</div>
          <div className="kpi-value" style={{ marginTop: 8, color: 'var(--success)' }}>{data.kpis.recebido}</div>
          <div className="kpi-delta up" style={{ marginTop: 10 }}><Icon name="arrowup" size={11} />CORA recuperou</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Taxa de recuperação</div>
          <div className="kpi-value" style={{ marginTop: 8 }}>{data.kpis.taxa}</div>
          <div className="kpi-delta up" style={{ marginTop: 10 }}><Icon name="arrowup" size={11} />+4% vs mês passado</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Réguas ativas</div>
          <div className="kpi-value" style={{ marginTop: 8 }}>{data.kpis.reguas}</div>
          <div className="kpi-delta neutral" style={{ marginTop: 10 }}><Icon name="info" size={11} />Todas funcionando</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
        {/* Main */}
        <div>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 16, borderBottom: '1px solid var(--g-200)' }}>
            {[
              { id: 'inad',   label: 'Inadimplentes', count: data.rows.length },
              { id: 'reguas', label: 'Réguas de cobrança', count: data.kpis.reguas },
              { id: 'hist',   label: 'Histórico' },
              { id: 'config', label: 'Config' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '12px 16px', fontSize: 13,
                  fontWeight: tab === t.id ? 700 : 500,
                  color: tab === t.id ? 'var(--red)' : 'var(--g-600)',
                  borderBottom: tab === t.id ? '2px solid var(--red)' : '2px solid transparent',
                  marginBottom: -1,
                  transition: 'all 150ms',
                }}
              >
                {t.label}
                {t.count != null ? <span style={{ marginLeft: 6, color: 'var(--g-500)', fontSize: 12 }}>{t.count}</span> : null}
              </button>
            ))}
          </div>

          {tab === 'inad' && (
            <div className="card" style={{ overflow: 'hidden' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Valor</th>
                    <th>Atraso</th>
                    <th>Última ação</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(r => {
                    const s = STATUS[r.status];
                    return (
                      <tr key={r.id} onClick={() => setOpenDrawer(r.id)}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <UserAvatar name={r.avatar} size={32} />
                            <span style={{ fontWeight: 600 }}>{r.name}</span>
                          </div>
                        </td>
                        <td style={{ fontWeight: 700, color: r.status === 'critical' ? 'var(--red)' : 'var(--g-900)', fontVariantNumeric: 'tabular-nums' }}>{r.value}</td>
                        <td>
                          <span style={{
                            fontSize: 12, fontWeight: 600,
                            color: r.days > 30 ? 'var(--red)' : r.days > 10 ? 'var(--warn)' : 'var(--g-700)',
                          }}>
                            {r.days} {r.days === 1 ? 'dia' : 'dias'}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--g-600)' }}>{r.last}</td>
                        <td>
                          <span className={`badge ${s.cls}`} style={{ position: 'relative' }}>
                            {r.status === 'trying' && <span style={{ width: 6, height: 6, background: 'var(--warn)', borderRadius: '50%', display: 'inline-block' }} className="pulse-amber" />}
                            {s.label}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn-ghost"
                            style={{ fontSize: 12 }}
                            onClick={(e) => { e.stopPropagation(); setOpenDrawer(r.id); }}
                          >
                            <Icon name="eye" size={12} /> Ver conversa
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--g-500)' }}>
                        🎉 Sem inadimplentes por aqui!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab !== 'inad' && (
            <div className="card" style={{ padding: 60, textAlign: 'center' }}>
              <AgentAvatar id="cora" size={64} />
              <div style={{ marginTop: 16, fontSize: 15, fontWeight: 600, color: 'var(--g-900)' }}>Em desenvolvimento</div>
              <div style={{ fontSize: 13, color: 'var(--g-500)', marginTop: 6 }}>Esta aba estará disponível no próximo release do MVP.</div>
            </div>
          )}
        </div>

        {/* Right — CORA ao vivo */}
        <div>
          <div className="card" style={{ padding: 20, background: 'linear-gradient(to bottom, #0D0D0D, #1A1A1A)', border: 'none', color: 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span className="live-dot" />
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>CORA em ação agora</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data.liveActions.map((a, i) => (
                <div key={`${liveTick}-${i}`} style={{
                  padding: 12,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                }} className="slide-right">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'white' }}>{a.client}</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{a.time}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.45 }}>{a.action}</div>
                </div>
              ))}
              {data.liveActions.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                  Nada acontecendo agora.
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: 20, marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Icon name="sparkles" size={14} style={{ color: 'var(--success)' }} />
              <span className="label">Insights da CORA</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Insight text="Clientes de R$ 300-500 pagam 3x mais rápido que os maiores." />
              <Insight text="Tom amigável converte melhor que lembrete formal." />
              <Insight text="Melhor horário pra 1ª cobrança: 10h-11h." />
            </div>
          </div>
        </div>
      </div>

      {/* Drawer */}
      {openDrawer && data.transcript && (
        <CoraDrawer
          transcript={data.transcript}
          row={data.rows.find(r => r.id === openDrawer)}
          onClose={() => setOpenDrawer(false)}
        />
      )}
    </div>
  );
}

function Insight({ text }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <div style={{ width: 6, height: 6, background: 'var(--red)', borderRadius: '50%', marginTop: 7, flexShrink: 0 }} />
      <div style={{ fontSize: 12, color: 'var(--g-700)', lineHeight: 1.5 }}>{text}</div>
    </div>
  );
}

function CoraDrawer({ transcript, row, onClose }) {
  const t = transcript;
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(13,13,13,0.4)',
        zIndex: 200,
        display: 'flex', justifyContent: 'flex-end',
        animation: 'fadeIn 200ms ease',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="slide-right"
        style={{
          width: 900, maxWidth: '95vw', background: 'var(--white)', height: '100vh',
          display: 'grid', gridTemplateColumns: '1fr 340px',
          boxShadow: '-20px 0 40px rgba(0,0,0,0.2)',
        }}
      >
        {/* Transcript side */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, background: '#F0F2F5' }}>
          <div style={{ padding: '16px 20px', background: '#075E54', color: 'white', display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn-icon" style={{ color: 'white' }} onClick={onClose}><Icon name="chevleft" size={18} /></button>
            <UserAvatar name={(row || {}).avatar || t.client.split(' ').map(w => w[0]).join('').slice(0, 2)} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{(row || {}).name || t.client}</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>Conversando com CORA · via WhatsApp</div>
            </div>
            <AgentAvatar id="cora" size={32} />
          </div>

          <div className="scroll" style={{
            flex: 1, overflowY: 'auto', padding: 20,
            backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><circle cx='20' cy='20' r='1' fill='%23d4d4d4' opacity='0.3'/></svg>")`,
          }}>
            <div style={{ textAlign: 'center', margin: '8px 0 16px' }}>
              <span style={{ background: '#E1F3FB', color: '#0C3C64', fontSize: 11, padding: '4px 10px', borderRadius: 6, fontWeight: 500 }}>
                CORA iniciou a conversa — {t.days} dias de atraso
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {t.messages.map((m, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: m.from === 'bot' ? 'flex-end' : 'flex-start',
                }} className="slide-up">
                  <div style={{
                    maxWidth: '75%',
                    padding: '8px 12px 6px',
                    background: m.from === 'bot' ? '#DCF8C6' : 'white',
                    borderRadius: 8,
                    boxShadow: '0 1px 1px rgba(0,0,0,0.05)',
                    fontSize: 13, lineHeight: 1.4, color: 'var(--g-900)',
                  }}>
                    {m.from === 'bot' && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--success)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="sparkles" size={10} /> CORA
                      </div>
                    )}
                    {m.text}
                    <div style={{ fontSize: 10, color: 'var(--g-500)', marginTop: 4, textAlign: 'right' }}>{m.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: 12, background: '#F0F2F5', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, padding: '8px 12px', background: 'var(--white)', borderRadius: 20, fontSize: 12, color: 'var(--g-400)' }}>
              CORA está monitorando esta conversa…
            </div>
            <button className="btn-icon" style={{ background: '#075E54', color: 'white' }}><Icon name="send" size={14} /></button>
          </div>
        </div>

        {/* AI analysis side */}
        <div style={{ borderLeft: '1px solid var(--g-200)', background: 'var(--white)', padding: 24, overflowY: 'auto' }} className="scroll">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <div className="label" style={{ color: 'var(--success)' }}>Análise CORA</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--g-900)', marginTop: 4 }}>Tempo real</div>
            </div>
            <button className="btn-icon" onClick={onClose}><Icon name="x" size={16} /></button>
          </div>

          <Meter label="Sentimento do cliente" value={t.sentiment} color="var(--success)" descriptor={['Hostil', 'Neutro', 'Positivo']} />
          <div style={{ height: 20 }} />
          <Meter label="Probabilidade de pagamento" value={t.payProb} color="var(--red)" descriptor={['Baixa', 'Média', 'Alta']} />

          <div style={{ marginTop: 24, padding: 16, background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.01))', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Icon name="sparkles" size={12} style={{ color: 'var(--success)' }} />
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--success)' }}>Próxima ação sugerida</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--g-900)', fontWeight: 600, lineHeight: 1.4 }}>{t.nextAction}</div>
            <button className="btn-primary" style={{ marginTop: 12, width: '100%', justifyContent: 'center', padding: '8px 12px', fontSize: 12 }}>
              Executar agora <Icon name="arrowright" size={12} />
            </button>
          </div>

          <div style={{ marginTop: 24 }}>
            <div className="label" style={{ marginBottom: 10 }}>Régua executada</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
              {[
                { day: 'D+3',  text: 'Lembrete amigável',          done: true },
                { day: 'D+7',  text: 'Oferta de parcelamento',      done: true },
                { day: 'D+12', text: 'Conversa ativa (agora)',       done: true, current: true },
                { day: 'D+20', text: 'Última oferta + cortesia',     done: false },
                { day: 'D+30', text: 'Escalar para Wandson',         done: false },
              ].map((s, i, a) => (
                <div key={i} style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: i < a.length - 1 ? 14 : 0 }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%',
                    background: s.current ? 'var(--red)' : s.done ? 'var(--success)' : 'var(--g-200)',
                    border: '2px solid white',
                    boxShadow: s.current ? '0 0 0 3px rgba(183,12,0,0.25)' : '0 0 0 1px var(--g-300)',
                    flexShrink: 0, zIndex: 1, marginTop: 2,
                  }} className={s.current ? 'pulse-red' : ''} />
                  {i < a.length - 1 && (
                    <div style={{ position: 'absolute', left: 6, top: 16, width: 2, height: '100%', background: s.done ? 'var(--success)' : 'var(--g-200)' }} />
                  )}
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--g-500)', fontWeight: 600 }}>{s.day}</div>
                    <div style={{ fontSize: 13, color: s.current ? 'var(--red)' : 'var(--g-900)', fontWeight: s.current ? 700 : 500 }}>{s.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Meter({ label, value, color, descriptor }) {
  const desc = value > 66 ? descriptor[2] : value > 33 ? descriptor[1] : descriptor[0];
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-700)' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}% · {desc}</span>
      </div>
      <div style={{ height: 8, background: 'var(--g-100)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${value}%`,
          background: color, borderRadius: 4,
          transition: 'width 600ms var(--ease-out)',
        }} />
      </div>
    </div>
  );
}
