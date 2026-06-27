/**
 * useIA — camada de IA (DELI) do Chat ao Vivo (cv2 redesign / FASE 4 · IA)
 *
 * Porta a lógica testada do ChatScreen.jsx (legado) mantendo as MESMAS URLs e
 * payloads do Bridge:
 *  - aiMode 'humano' | 'hibrido' | 'ia' (persistido por conversa em localStorage,
 *    com fallback global; try/catch sempre).
 *  - triggerHibridoSuggestion(conv, msgs): POST /chat/ai {command:'/resposta'} →
 *    retorna a sugestão (NÃO envia). Estado em `sugestao` (por conversa ativa).
 *  - triggerIaAutoReply(conv, msgs): POST /chat/ai {command:'/resposta'} → ENVIA
 *    automático via sendTextMessage. SÓ quando aiMode='ia' e nunca em canais
 *    internos ('chan-').
 *  - copilot(comando, conv, msgs): POST /chat/ai {command} p/ /resumir, /traduzir,
 *    /tom, /proxima, /livre. Retorna texto pronto p/ exibir.
 *
 * Padrões CLAUDE.md:
 *  - Sem console.log: erro tratado via .catch / try-catch e retorno explícito.
 *  - Imutabilidade: novo estado sempre.
 *  - localStorage com try/catch.
 *  - Multi-tenant: o Bridge resolve a loja pela conversation_id; o tenant_id vai
 *    no payload quando disponível (mesmo contrato do legado).
 *
 * Contrato: useIA({ instancia, userId }) → {
 *   aiMode, setModoConversa, getModo,
 *   sugestao, limparSugestao,
 *   triggerHibridoSuggestion, triggerIaAutoReply,
 *   copilot,
 * }
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../../../lib/supabase.js';
import { sendTextMessage } from '../../../lib/evolution.js';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || '';
const LS_KEY = 'cv2_ai_mode'; // mapa { [convId]: 'humano'|'hibrido'|'ia' }
const MODOS = ['humano', 'hibrido', 'ia'];
const MSG_LIMIT = 20;

// ── persistência do modo por conversa (mapa em localStorage, try/catch) ───────
function lerMapaModos() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function gravarMapaModos(mapa) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(mapa));
  } catch {
    /* storage indisponível: o estado em memória ainda vale nesta sessão */
  }
}

// ── últimas N mensagens da conversa no formato que o Bridge espera ────────────
async function carregarMsgsRecentes(convId) {
  const { data } = await supabase
    .from('messages')
    .select('direction, content, sender_name')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: false })
    .limit(MSG_LIMIT);
  return (data || []).reverse();
}

// ── POST /chat/ai com JWT (contrato idêntico ao legado) ───────────────────────
async function postChatAi(body) {
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token;
  if (!jwt) return null;
  const r = await fetch(`${BRIDGE_URL}/chat/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(body),
  });
  // 4xx/5xx (JWT expirado, gateway timeout, body não-JSON): retorna null. data?.ok
  // fica falsy → nada é enviado e o guard de duplicado (iaPend/hibridoPend) já
  // protege contra re-entrada — quebra o loop de requests a cada inbound.
  if (!r.ok) return null;
  return r.json();
}

// ── extrai o texto exibível de uma resposta do copilot ────────────────────────
// /livre → body; demais comandos → title + bullets. Erro → mensagem amigável.
function textoCopilot(data) {
  if (!data) return 'Não foi possível falar com a DELI. Tente novamente.';
  if (!data.ok) return data.error || 'Ocorreu um erro. Tente novamente.';
  if (data.body) return [data.title, data.body].filter(Boolean).join('\n\n');
  const linhas = [data.title, ...((data.bullets || []).map((b) => `• ${b}`))].filter(Boolean);
  return linhas.length ? linhas.join('\n') : (data.text || 'Pronto.');
}

const ehCanal = (id) => typeof id === 'string' && id.startsWith('chan-');

export function useIA({ instancia, userId } = {}) {
  void userId; // reservado (auditoria de envio automático); o Bridge já loga o run

  // mapa de modos por conversa + modo da conversa ativa exposto p/ a UI
  const [mapaModos, setMapaModos] = useState(() => lerMapaModos());
  const [convAtiva, setConvAtiva] = useState(null);
  const [sugestao, setSugestao] = useState(null); // { convId, texto } | null

  // refs estáveis p/ uso dentro de callbacks de realtime (não recriam handler)
  const mapaRef = useRef(mapaModos);
  useEffect(() => { mapaRef.current = mapaModos; }, [mapaModos]);
  const instanciaRef = useRef(instancia);
  useEffect(() => { instanciaRef.current = instancia; }, [instancia]);
  // conversa ativa em ref: o auto-reply roda após setTimeout — se o atendente
  // trocar de conversa nesse intervalo, não enviar para a conversa abandonada.
  const convAtivaRef = useRef(convAtiva);
  useEffect(() => { convAtivaRef.current = convAtiva; }, [convAtiva]);

  // guardas de concorrência (1 disparo por conversa em voo)
  const hibridoPend = useRef(new Set());
  const iaPend = useRef(new Set());

  // FASE 5 — guarda anti-leak: a sugestão híbrida resolve async; ao desmontar,
  // não aplicar setState (evita warning + estado órfão após sair do chat).
  const vivoRef = useRef(true);
  useEffect(() => () => { vivoRef.current = false; }, []);

  const aiMode = convAtiva ? (mapaModos[convAtiva] || 'humano') : 'humano';

  const getModo = useCallback((convId) => mapaRef.current[convId] || 'humano', []);

  // define o modo de UMA conversa (persistido) — usado pelo seletor do header
  const setModoConversa = useCallback((convId, modo) => {
    if (!convId || !MODOS.includes(modo)) return;
    setMapaModos((prev) => {
      const next = { ...prev, [convId]: modo };
      gravarMapaModos(next);
      return next;
    });
  }, []);

  const limparSugestao = useCallback(() => setSugestao(null), []);

  // ── HÍBRIDO: gera sugestão (não envia) ─────────────────────────────────────
  const triggerHibridoSuggestion = useCallback(async (conv, msgs) => {
    const convId = conv?.id;
    if (!convId || ehCanal(convId) || hibridoPend.current.has(convId)) return;
    hibridoPend.current.add(convId);
    try {
      const lista = Array.isArray(msgs) && msgs.length ? msgs : await carregarMsgsRecentes(convId);
      const data = await postChatAi({ command: '/resposta', messages: lista, conversation_id: convId });
      if (vivoRef.current && data?.ok && data.text) {
        setSugestao({ convId, texto: data.text });
      }
    } catch {
      /* silent: sugestão é best-effort; humano segue respondendo normalmente */
    } finally {
      hibridoPend.current.delete(convId);
    }
  }, []);

  // ── IA TOTAL: gera e ENVIA a resposta automaticamente ──────────────────────
  const triggerIaAutoReply = useCallback(async (conv, msgs) => {
    const convId = conv?.id;
    const chatId = conv?.chatId;
    const inst = instanciaRef.current;
    if (!convId || ehCanal(convId) || !chatId || iaPend.current.has(convId)) return;
    // o atendente pode ter trocado de conversa durante o setTimeout do inbound;
    // só envia auto-reply se esta ainda for a conversa ativa.
    if (convAtivaRef.current !== convId) return;
    iaPend.current.add(convId);
    try {
      const lista = Array.isArray(msgs) && msgs.length ? msgs : await carregarMsgsRecentes(convId);
      const data = await postChatAi({ command: '/resposta', messages: lista, conversation_id: convId });
      if (data?.ok && data.text && inst?.instance_name) {
        await sendTextMessage(
          inst.instance_name,
          chatId,
          data.text,
          null,
          inst.evolution_url,
          inst.api_key,
        ).catch(() => { /* Evolution offline: nada a fazer, sem reenvio automático */ });
      }
    } catch {
      /* silent: auto-reply é best-effort */
    } finally {
      iaPend.current.delete(convId);
    }
  }, []);

  // ── COPILOT: /resumir, /traduzir, /tom, /proxima, /livre ───────────────────
  // `opts`: { conv, msgs, prompt, tenantId }. Para /livre, `prompt` é a pergunta
  // livre do atendente. O Bridge resolve a loja pela conversation_id; tenant_id
  // segue no payload quando disponível (mesmo contrato do legado).
  const copilot = useCallback(async (comando, opts = {}) => {
    if (!comando) return '';
    const { conv, msgs, prompt, tenantId } = opts;
    try {
      const lista = Array.isArray(msgs) ? msgs.slice(-30) : [];
      const data = await postChatAi({
        command: comando,
        prompt: prompt || undefined,
        messages: lista,
        conversation_id: conv?.id,
        tenant_id: tenantId,
      });
      return textoCopilot(data);
    } catch {
      return 'Erro de conexão com a DELI. Tente novamente.';
    }
  }, []);

  return {
    aiMode,
    setConvAtiva,      // o container informa a conversa ativa (p/ aiMode da UI)
    setModoConversa,
    getModo,
    sugestao,
    limparSugestao,
    triggerHibridoSuggestion,
    triggerIaAutoReply,
    copilot,
  };
}
