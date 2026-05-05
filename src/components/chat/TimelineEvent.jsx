/**
 * Evento do sistema na timeline da conversa.
 * Renderiza centralmente com formato: "dd de mmm. HH:mm — {texto}"
 */

const MONTH_NAMES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function fmtEventTs(ts) {
  const d = new Date(ts);
  const day = d.getDate();
  const mon = MONTH_NAMES[d.getMonth()];
  const hh  = String(d.getHours()).padStart(2, '0');
  const mm  = String(d.getMinutes()).padStart(2, '0');
  return `${day} de ${mon}. ${hh}:${mm}`;
}

function getEventText(event) {
  const actor = event.actor_name ?? 'Sistema';
  switch (event.event_type) {
    case 'created':   return 'Conversa iniciada';
    case 'closed':    return `${actor} finalizou o atendimento`;
    case 'reopened':  return `${actor} reabriu o atendimento`;
    case 'assigned':  return `${actor} assumiu a conversa`;
    case 'unassigned':return `${actor} desatribuiu a conversa`;
    case 'transferred': {
      const { dept_from, dept_to } = event.metadata ?? {};
      if (dept_from && dept_to) return `${actor} transferiu de ${dept_from} para ${dept_to}`;
      if (dept_to) return `${actor} moveu para o departamento ${dept_to}`;
      return `${actor} transferiu a conversa`;
    }
    case 'tagged':    return `${actor} adicionou tag: ${event.metadata?.tag_name ?? ''}`;
    case 'untagged':  return `${actor} removeu tag: ${event.metadata?.tag_name ?? ''}`;
    case 'note_added':return `${actor} adicionou uma nota`;
    case 'automation_executed': return `Automação executada: ${event.metadata?.automation_name ?? ''}`;
    default:          return event.event_type;
  }
}

export default function TimelineEvent({ event }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      padding: '6px 16px',
    }}>
      <span style={{
        fontSize: 11,
        color: 'var(--g-500)',
        background: 'var(--g-100)',
        borderRadius: 99,
        padding: '2px 10px',
        whiteSpace: 'nowrap',
      }}>
        {fmtEventTs(event.ts)} — {getEventText(event)}
      </span>
    </div>
  );
}
