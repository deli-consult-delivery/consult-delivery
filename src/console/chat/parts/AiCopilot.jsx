/**
 * AiCopilot — drawer da IA copiloto DELI na thread (cv2 redesign / FASE 4 · IA)
 *
 * Porta o AiSidePanel do legado p/ o redesign cv2:
 *  - Chat livre com a DELI (comando /livre via copilot()).
 *  - Quick actions: /resumir, /traduzir, /tom, /proxima.
 *  - Histórico local da sessão (pergunta do atendente + resposta da DELI).
 *
 * Abre por botão no header da Thread; o container injeta `copilot` (de useIA),
 * `conv`, `msgs` (msgShape da thread) e `tenantId`. As mensagens são mapeadas p/
 * o formato do Bridge ({ direction, content, sender_name }) antes do POST.
 *
 * Padrões CLAUDE.md: sem console.log; imutabilidade; CSS escopado .cv2-main .ccv-*.
 *
 * Props:
 *  - conv: convShape|null
 *  - msgs: msgShape[]   (mensagens em tela, p/ contexto da DELI)
 *  - tenantId: string
 *  - copilot: (comando, { conv, msgs, prompt, tenantId }) => Promise<string>
 *  - onClose: () => void
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Ico } from '../../CvIcons.jsx';

// quick actions exibidas no estado vazio do drawer
const QUICK = [
  { cmd: '/resumir',  ico: 'i-list',   label: 'Resumir conversa' },
  { cmd: '/proxima',  ico: 'i-target', label: 'Sugerir próxima ação' },
  { cmd: '/tom',      ico: 'i-chat',   label: 'Analisar tom' },
  { cmd: '/traduzir', ico: 'i-eye',    label: 'Traduzir mensagens' },
];

// msgShape (thread) → formato do Bridge
const paraBridge = (m) => ({
  direction: m.out ? 'outbound' : 'inbound',
  content: m.txt || '',
  sender_name: m.who || null,
});

export default function AiCopilot({ conv, msgs, tenantId, copilot, onClose }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]); // [{ role:'user'|'ai', text }]
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [history, loading]);

  // contexto p/ a DELI no formato do Bridge (memoizado p/ dependência estável)
  const contexto = useMemo(() => (msgs || []).map(paraBridge), [msgs]);

  // executa um comando do copilot (quick action ou /livre) e anexa ao histórico
  const rodar = useCallback(async (comando, prompt, rotuloUser) => {
    if (loading) return;
    setHistory((h) => [...h, { role: 'user', text: rotuloUser }]);
    setLoading(true);
    const texto = await copilot(comando, { conv, msgs: contexto, prompt, tenantId });
    setHistory((h) => [...h, { role: 'ai', text: texto }]);
    setLoading(false);
  }, [loading, copilot, conv, contexto, tenantId]);

  const enviarLivre = useCallback(() => {
    const texto = input.trim();
    if (!texto || loading) return;
    setInput('');
    rodar('/livre', texto, texto);
  }, [input, loading, rodar]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarLivre(); }
  };

  const vazio = history.length === 0;

  return (
    <div className="ccv-copilot" role="complementary" aria-label="DELI IA Copiloto">
      {/* ── header ─────────────────────────────────────────────────────────── */}
      <div className="ccv-copilot-head">
        <span className="ccv-copilot-av" aria-hidden="true"><Ico name="i-bot" size={16} /></span>
        <div className="ccv-copilot-htxt">
          <div className="ccv-copilot-tit">DELI · IA Copiloto</div>
          <div className="ccv-copilot-sub">{loading ? 'Gerando resposta…' : 'Consult Delivery'}</div>
        </div>
        <button type="button" className="ccv-cbtn" onClick={onClose} title="Fechar copiloto" aria-label="Fechar copiloto">
          <span style={{ fontSize: 16, lineHeight: 1 }}>✕</span>
        </button>
      </div>

      {/* ── corpo ──────────────────────────────────────────────────────────── */}
      <div className="ccv-copilot-body">
        {vazio && (
          <>
            <div className="ccv-copilot-hello">
              Olá! Sou a DELI, sua IA copiloto.
              {conv?.nome ? <> Estou analisando a conversa com <strong>{conv.nome}</strong>.</> : ' Como posso ajudar?'}
            </div>
            <div className="ccv-copilot-qlabel">Ações rápidas</div>
            <div className="ccv-copilot-quick">
              {QUICK.map((q) => (
                <button
                  key={q.cmd}
                  type="button"
                  className="ccv-copilot-qbtn"
                  disabled={loading}
                  onClick={() => rodar(q.cmd, undefined, q.label)}
                >
                  <Ico name={q.ico} size={14} />
                  <span>{q.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {history.map((m, i) => (
          <div key={i} className={`ccv-copilot-msg ${m.role}`}>
            {m.role === 'ai' && <span className="ccv-copilot-mav" aria-hidden="true"><Ico name="i-bot" size={11} /></span>}
            <div className="ccv-copilot-bubble">{m.text}</div>
          </div>
        ))}

        {loading && (
          <div className="ccv-copilot-typing" aria-hidden="true">
            <span /><span /><span />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── input ──────────────────────────────────────────────────────────── */}
      <div className="ccv-copilot-foot">
        <textarea
          ref={inputRef}
          className="ccv-copilot-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Pergunte qualquer coisa à DELI…"
          rows={1}
          aria-label="Pergunta para a DELI"
        />
        <button
          type="button"
          className="ccv-cbtn send"
          onClick={enviarLivre}
          disabled={!input.trim() || loading}
          title="Enviar"
          aria-label="Enviar pergunta"
        >
          <Ico name="i-reply" size={16} />
        </button>
      </div>
    </div>
  );
}
