/**
 * useTranscricao — transcrição de áudio (Whisper) + tradução por mensagem
 * (cv2 redesign / FASE 4 · IA)
 *
 * Porta a lógica testada do ChatScreen.jsx (legado), MESMAS URLs/payloads do Bridge:
 *  - transcrever(msg): POST /api/whisper/transcribe (FormData p/ data: URI;
 *    JSON { mediaUrl } p/ URL HTTP). Estado por msgId: { loading, text, error }.
 *  - Auto-transcrição de áudio/vídeo inbound quando a flag autoTranscribe está
 *    ligada (persistida em localStorage, try/catch). Chame autoTranscrever(msg)
 *    no realtime de mensagem nova — ela respeita a flag e deduplica por id.
 *  - traduzir(msg): POST /chat/ai { command:'/traduzir' }. Estado por msgId em
 *    translations: { loading, text, lang, error }.
 *
 * Padrões CLAUDE.md:
 *  - Sem console.log: erro tratado via try/catch e estado { error: true }.
 *  - Imutabilidade: sempre novo objeto de estado.
 *  - localStorage com try/catch.
 *
 * Contrato: useTranscricao() → {
 *   transcriptions, translations,
 *   transcrever, traduzir, autoTranscrever,
 *   autoTranscribe, toggleAutoTranscribe,
 * }
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../../../lib/supabase.js';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || '';
const LS_AUTO = 'cv2_auto_transcribe';

// tipos de mídia transcritíveis (áudio/PTT/vídeo)
const ehTranscritivel = (mtype) => !!mtype && (mtype.includes('audio') || mtype === 'video');

function lerAuto() {
  try {
    return localStorage.getItem(LS_AUTO) === '1';
  } catch {
    return false;
  }
}

function gravarAuto(v) {
  try {
    localStorage.setItem(LS_AUTO, v ? '1' : '0');
  } catch {
    /* storage indisponível: a flag em memória ainda vale nesta sessão */
  }
}

// header de auth (transcrição funciona sem JWT em alguns ambientes; envia se houver)
async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export function useTranscricao() {
  const [transcriptions, setTranscriptions] = useState({}); // { msgId: { loading, text, error } }
  const [translations, setTranslations] = useState({});     // { msgId: { loading, text, lang, error } }
  const [autoTranscribe, setAutoTranscribe] = useState(() => lerAuto());

  // refs estáveis p/ uso dentro do realtime
  const autoRef = useRef(autoTranscribe);
  useEffect(() => { autoRef.current = autoTranscribe; }, [autoTranscribe]);
  // ids já enviados p/ transcrição (evita duplo-envio em INSERT + UPDATE do realtime)
  const transcritosRef = useRef(new Set());

  // ── transcrição via Whisper (Bridge) ───────────────────────────────────────
  const transcrever = useCallback(async (msg) => {
    const msgId = msg?.id;
    const mediaUrl = msg?.murl;
    if (!msgId || !mediaUrl) return;
    setTranscriptions((t) => ({ ...t, [msgId]: { loading: true } }));
    try {
      const head = await authHeader();
      let r;
      if (mediaUrl.startsWith('data:')) {
        // data: URI (base64 inline) — o browser vira blob sem CORS
        const blob = await (await fetch(mediaUrl)).blob();
        const form = new FormData();
        form.append('audio', blob, 'audio.ogg');
        r = await fetch(`${BRIDGE_URL}/api/whisper/transcribe`, { method: 'POST', headers: head, body: form });
      } else {
        // URL HTTP — o Bridge busca server-side (evita CORS do browser)
        r = await fetch(`${BRIDGE_URL}/api/whisper/transcribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...head },
          body: JSON.stringify({ mediaUrl }),
        });
      }
      if (!r.ok) throw new Error(`status ${r.status}`);
      const data = await r.json();
      setTranscriptions((t) => ({ ...t, [msgId]: { loading: false, text: data.text || '' } }));
    } catch {
      setTranscriptions((t) => ({ ...t, [msgId]: { loading: false, error: true } }));
    }
  }, []);

  // ── auto-transcrição de inbound (respeita a flag + deduplica) ──────────────
  const autoTranscrever = useCallback((msg) => {
    if (!autoRef.current) return;
    const msgId = msg?.id;
    if (!msgId || !msg?.murl || !ehTranscritivel(msg?.mtype)) return;
    if (transcritosRef.current.has(msgId)) return;
    transcritosRef.current.add(msgId);
    transcrever(msg);
  }, [transcrever]);

  // ── tradução por mensagem (Bridge /chat/ai /traduzir) ──────────────────────
  const traduzir = useCallback(async (msg) => {
    const msgId = msg?.id;
    const texto = msg?.txt;
    if (!msgId || !texto) return;
    setTranslations((t) => ({ ...t, [msgId]: { loading: true } }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${BRIDGE_URL}/chat/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ command: '/traduzir', messages: [{ direction: 'inbound', content: texto }] }),
      });
      const data = await r.json();
      if (data?.ok && data.bullets?.length) {
        const trad = (data.bullets[0] || '').replace(/^Tradu[çc][ãa]o:\s*/i, '');
        const lang = (data.bullets[1] || '').replace(/^Idioma detectado:\s*/i, '');
        setTranslations((t) => ({ ...t, [msgId]: { loading: false, text: trad, lang } }));
      } else {
        setTranslations((t) => ({ ...t, [msgId]: { loading: false, error: true } }));
      }
    } catch {
      setTranslations((t) => ({ ...t, [msgId]: { loading: false, error: true } }));
    }
  }, []);

  const toggleAutoTranscribe = useCallback(() => {
    setAutoTranscribe((v) => {
      const next = !v;
      gravarAuto(next);
      return next;
    });
  }, []);

  return {
    transcriptions,
    translations,
    transcrever,
    traduzir,
    autoTranscrever,
    autoTranscribe,
    toggleAutoTranscribe,
  };
}
