/**
 * MsgBubble — balão de mensagem da thread (cv2 redesign / FASE 1)
 *
 * Renderiza:
 *  - separador de dia (.ccv-day) quando a data muda em relação à msg anterior;
 *  - balão entrada (.ccv-msg.in, esquerda) / saída (.ccv-msg.out, direita) /
 *    sistema-automação (.ccv-msg.sys);
 *  - nome do remetente (.ccv-who) só em mensagens de entrada;
 *  - badge "Automação" (.ccv-autobadge) quando o remetente é automação;
 *  - citação/reply (.ccv-quoted) em texto;
 *  - mídia como placeholder "📎 mídia" nesta fase;
 *  - hora + tick de entrega (saída).
 *
 * Props:
 *  - msg: msgShape { id, out, txt, mtype, murl, who, tm, ts, quoted, ds, del }
 *  - prevMsg: msgShape|null  (msg imediatamente anterior, p/ separador de dia)
 *
 * Toda a aparência mora em chat-cv2.css (escopo .cv2-main .ccv-*).
 */

import { formatWA } from './formatWA.jsx';

// remetentes considerados "automação" (badge roxo + estilo sys)
const RE_AUTO = /(deli|lara|vera|breno|cora|sofia|max|bot|autom)/i;
const ehAutomacao = (who) => !!who && RE_AUTO.test(who);

// rótulo do separador de dia: "Hoje" / "Ontem" / DD/MM/AAAA
function rotuloDia(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  const mesmoDia = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (mesmoDia(d, hoje)) return 'Hoje';
  if (mesmoDia(d, ontem)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function mudouDia(ts, prevTs) {
  if (!ts) return false;
  if (!prevTs) return true; // primeira do bloco → mostra a data
  return new Date(ts).toDateString() !== new Date(prevTs).toDateString();
}

// tick de entrega (delivery_status): mesma semântica do legado
function Tick({ s }) {
  if (s === 0) {
    return <span title="erro ao enviar" style={{ color: 'var(--red)', fontWeight: 700 }}>!</span>;
  }
  const cor = s >= 4 ? '#53BDEB' : 'var(--tx2)';
  if (s === null || s === undefined || s === 1) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--tx2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />
      </svg>
    );
  }
  if (s === 2) {
    return (
      <svg width="14" height="12" viewBox="0 0 20 16" fill="none" stroke={cor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 8 8 12 16 4" />
      </svg>
    );
  }
  return (
    <svg width="16" height="12" viewBox="0 0 24 16" fill="none" stroke={cor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 8 7 12 15 4" /><polyline points="9 12 13 16 21 8" />
    </svg>
  );
}

// texto da citação (quoted pode ser string ou objeto { text })
const quotedTexto = (q) =>
  (typeof q === 'string' ? q : q?.text) || '📎 Mídia';

export default function MsgBubble({ msg, prevMsg }) {
  const auto = ehAutomacao(msg.who);
  const sep = mudouDia(msg.ts, prevMsg?.ts);

  // mensagem de automação → balão central de sistema
  if (auto && !msg.out) {
    return (
      <>
        {sep && <div className="ccv-day">{rotuloDia(msg.ts)}</div>}
        <div className="ccv-msg sys">
          <span className="ccv-autobadge">Automação</span>{' '}
          {msg.del ? '🚫 mensagem apagada' : (formatWA(msg.txt) || '📎 mídia')}
        </div>
      </>
    );
  }

  const cls = msg.out ? 'out' : 'in';

  return (
    <>
      {sep && <div className="ccv-day">{rotuloDia(msg.ts)}</div>}
      <div className={`ccv-msg ${cls}`}>
        {!msg.out && msg.who && <div className="ccv-who">{msg.who}</div>}

        {msg.quoted && !msg.del && (
          <div className="ccv-quoted">
            <div className="ccv-quoted-who">{msg.out ? 'Você' : (msg.who || 'Cliente')}</div>
            <div className="ccv-quoted-txt">{quotedTexto(msg.quoted)}</div>
          </div>
        )}

        {msg.del ? (
          <span style={{ fontStyle: 'italic', color: 'var(--tx2)' }}>🚫 mensagem apagada</span>
        ) : (
          <>
            {msg.mtype && (
              <div style={{ color: 'var(--tx2)', fontSize: 12.5, fontWeight: 600 }}>📎 mídia</div>
            )}
            {msg.txt && (
              <div style={{ wordBreak: 'break-word', marginTop: msg.mtype ? 4 : 0 }}>
                {formatWA(msg.txt)}
              </div>
            )}
          </>
        )}

        <div className="ccv-mtime">
          {msg.tm}
          {msg.out && !msg.del && <Tick s={msg.ds} />}
        </div>
      </div>
    </>
  );
}
