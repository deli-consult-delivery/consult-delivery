/**
 * useEnvio — engine de envio de MÍDIA e ÁUDIO (cv2 redesign / FASE 2)
 *
 * Estende a FASE 1 (que só enviava texto): centraliza o envio de arquivos e a
 * gravação de áudio PTT, espelhando a lógica já testada de ChatAoVivo.jsx
 * (enviarMidia / gravarAudio) na stack do redesign.
 *
 * Para cada envio:
 *  1. base64 do arquivo/blob (FileReader);
 *  2. INSERT em messages (tenant_id, conversation_id, direction='outbound',
 *     media_type, content=caption|nome) — o realtime de useThread reflete o balão;
 *  3. dispara Evolution (sendMediaMessage / sendAudioMessage) com .catch — se a
 *     Evolution estiver offline, a mensagem já está no banco/realtime.
 *
 * Padrões CLAUDE.md:
 *  - Toda query .eq('tenant_id', tenantDbId) implícito no INSERT (coluna tenant_id);
 *  - INSERT com .select('id') para detectar silent-fail de RLS (Padrão P1);
 *  - sem console.log (erros via try/catch → retorno { error });
 *  - imutabilidade; cleanup do stream/interval no unmount.
 *
 * Assinatura:
 *   useEnvio({ tenantDbId, userId, instancia }) → {
 *     enviarMidia(file, conv), iniciarGravacao(), pararGravacaoEEnviar(conv),
 *     cancelarGravacao(), gravando, segundos, enviandoMidia
 *   }
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../../../lib/supabase.js';
import { sendMediaMessage, sendAudioMessage } from '../../../lib/evolution.js';

// limite de serialização base64 no main thread (acima disso, recusa o envio
// para não travar a UI / estourar a heap da aba — ver code-review FASE 2)
const MAX_MEDIA_BYTES = 16 * 1024 * 1024; // 16 MB

// file.type (MIME) → media_type do schema messages
const mediaTipo = (mime) =>
  /^image\//.test(mime) ? 'image'
    : /^video\//.test(mime) ? 'video'
      : /^audio\//.test(mime) ? 'audio'
        : 'document';

// File/Blob → data-URI completo (data:<mime>;base64,<...>)
const toDataUri = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });

// data-URI → base64 puro (sem o prefixo data:...;base64,) p/ a Evolution
const base64Puro = (dataUri) => String(dataUri).split(',')[1] || '';

export function useEnvio({ tenantDbId, userId, instancia }) {
  void userId; // reservado (futuro: sender_name / autoria do operador)

  const [enviandoMidia, setEnviandoMidia] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);

  const recRef = useRef(null);     // MediaRecorder
  const chunksRef = useRef([]);    // pedaços do áudio
  const streamRef = useRef(null);  // MediaStream (p/ parar as tracks)
  const timerRef = useRef(null);   // setInterval do contador
  const gravandoRef = useRef(false); // espelho síncrono de `gravando` (evita stale closure)

  // mantém o ref sincronizado com o estado p/ leitura síncrona em callbacks
  useEffect(() => { gravandoRef.current = gravando; }, [gravando]);

  // cleanup: ao desmontar, parar tracks e timer pendentes
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const pararTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  // ── envio de mídia (imagem / vídeo / áudio-arquivo / documento) ─────────────
  const enviarMidia = useCallback(async (file, conv) => {
    if (!file || !conv || !tenantDbId) return { error: 'parâmetros inválidos' };
    if (file.size > MAX_MEDIA_BYTES) {
      return { error: `Arquivo muito grande (máx. ${MAX_MEDIA_BYTES / (1024 * 1024)} MB).` };
    }
    setEnviandoMidia(true);
    try {
      const tipo = mediaTipo(file.type || '');
      const dataUri = await toDataUri(file);
      const b64 = base64Puro(dataUri);

      const { error } = await supabase
        .from('messages')
        .insert({
          tenant_id: tenantDbId,
          conversation_id: conv.id,
          direction: 'outbound',
          content: file.name || null,
          media_type: tipo,
          media_url: dataUri, // balão exibível na hora, sem depender da Evolution
          sender_name: null,
          created_at: new Date().toISOString(),
        })
        .select('id');
      if (error) return { error: error.message };

      if (instancia && conv.chatId) {
        await sendMediaMessage(
          instancia.instance_name,
          conv.chatId,
          b64,
          tipo,
          file.type || '',
          '',          // caption (nome já vai no content)
          file.name || '',
        ).catch(() => { /* Evolution offline: msg já no banco/realtime */ });
      }
      return {};
    } catch (err) {
      return { error: err?.message || String(err) };
    } finally {
      setEnviandoMidia(false);
    }
  }, [tenantDbId, instancia]);

  // ── gravação de áudio PTT ───────────────────────────────────────────────────
  const iniciarGravacao = useCallback(async () => {
    if (gravando) return { error: 'já gravando' };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      recRef.current = rec;
      rec.ondataavailable = (ev) => { if (ev.data.size) chunksRef.current.push(ev.data); };
      rec.start();
      setGravando(true);
      setSegundos(0);
      pararTimer();
      timerRef.current = setInterval(() => setSegundos((s) => s + 1), 1000);
      return {};
    } catch (err) {
      return { error: err?.message || 'Microfone indisponível.' };
    }
  }, [gravando, pararTimer]);

  // para as tracks/timer e zera o estado de gravação (uso interno)
  const encerrarStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
    pararTimer();
    setGravando(false);
    setSegundos(0);
  }, [pararTimer]);

  // ── parar gravação e enviar o áudio ─────────────────────────────────────────
  const pararGravacaoEEnviar = useCallback((conv) =>
    new Promise((resolve) => {
      const rec = recRef.current;
      if (!rec || !gravandoRef.current) { encerrarStream(); resolve({ error: 'sem gravação ativa' }); return; }

      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/ogg; codecs=opus' });
        encerrarStream();
        if (!blob.size || !conv || !tenantDbId) { resolve({ error: 'áudio vazio' }); return; }

        setEnviandoMidia(true);
        try {
          const dataUri = await toDataUri(blob);
          const b64 = base64Puro(dataUri);
          const { error } = await supabase
            .from('messages')
            .insert({
              tenant_id: tenantDbId,
              conversation_id: conv.id,
              direction: 'outbound',
              content: 'Áudio',
              media_type: 'audio',
              media_url: dataUri, // player exibível na hora, sem depender da Evolution
              sender_name: null,
              created_at: new Date().toISOString(),
            })
            .select('id');
          if (error) { resolve({ error: error.message }); return; }

          if (instancia && conv.chatId) {
            await sendAudioMessage(instancia.instance_name, conv.chatId, b64)
              .catch(() => { /* Evolution offline: msg já no banco/realtime */ });
          }
          resolve({});
        } catch (err) {
          resolve({ error: err?.message || String(err) });
        } finally {
          setEnviandoMidia(false);
        }
      };

      try { rec.stop(); }
      catch (err) { encerrarStream(); resolve({ error: err?.message || String(err) }); }
    }), [tenantDbId, instancia, encerrarStream]);

  // ── cancelar gravação (descarta o áudio) ────────────────────────────────────
  const cancelarGravacao = useCallback(() => {
    const rec = recRef.current;
    if (rec) { rec.onstop = null; try { rec.stop(); } catch { /* ignore */ } }
    chunksRef.current = [];
    encerrarStream();
  }, [encerrarStream]);

  return {
    enviarMidia,
    iniciarGravacao,
    pararGravacaoEEnviar,
    cancelarGravacao,
    gravando,
    segundos,
    enviandoMidia,
  };
}
