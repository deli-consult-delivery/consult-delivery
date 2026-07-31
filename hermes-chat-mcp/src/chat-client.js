// chat-client.js — ponte com um agente de conversa do Hermes (DELI/Ana), molde Deli.jsx.
//
// Fluxo (igual ao Console, src/console/Deli.jsx):
//   1. login (conta de serviço) -> session.access_token
//   2. POST {BRIDGE}/agents/<agentSlug>-conversa/run  (dispara, não retorna a resposta)
//   3. escuta INSERT em deli_messages (role=assistant, tenant_id=tenantId) via Supabase
//      Realtime até chegar a linha nova, com timeout
'use strict';

const { createClient } = require('@supabase/supabase-js');

class ChatTimeoutError extends Error {
  constructor(agentSlug, timeoutMs) {
    super(`Sem resposta de ${agentSlug} em ${timeoutMs}ms (Realtime não trouxe INSERT novo em deli_messages).`);
    this.name = 'ChatTimeoutError';
  }
}

function makeChatClient({ supabaseUrl, supabaseAnonKey, serviceEmail, servicePassword, bridgeUrl, tenantId, timeoutMs, realtimeTimeoutMs }) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  let sessionPromise = null;

  // Login é feito uma vez por processo (o wrapper stdio vive só durante a sessão MCP) e
  // reusado entre chamadas de tool; se o token expirar no meio, o supabase-js renova sozinho.
  async function ensureSession() {
    if (!sessionPromise) {
      sessionPromise = supabase.auth
        .signInWithPassword({ email: serviceEmail, password: servicePassword })
        .then(({ data, error }) => {
          if (error) throw new Error(`login da conta de serviço falhou: ${error.message}`);
          return data.session;
        })
        .catch((e) => { sessionPromise = null; throw e; }); // não cachear falha de login (transiente)
    }
    return sessionPromise;
  }

  /**
   * @param {string} agentSlug ex.: 'deli', 'ana'
   * @param {string} message
   * @returns {Promise<{content:string, createdAt:string}>}
   */
  async function talkTo(agentSlug, message) {
    const session = await ensureSession();
    const since = new Date().toISOString();

    const sinceMs = Date.parse(since);
    let timer;
    let channel;
    const cleanup = () => { clearTimeout(timer); if (channel) supabase.removeChannel(channel); };

    const waitForReply = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        cleanup();
        reject(new ChatTimeoutError(agentSlug, realtimeTimeoutMs));
      }, realtimeTimeoutMs);

      channel = supabase
        .channel(`hermes-chat-mcp-${agentSlug}-${Date.now()}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'deli_messages',
          filter: `tenant_id=eq.${tenantId}`,
        }, (payload) => {
          const msg = payload.new;
          if (msg.role !== 'assistant') return;
          if (Date.parse(msg.created_at) < sinceMs) return; // eco de mensagem antiga
          cleanup();
          resolve({ content: msg.content, createdAt: msg.created_at });
        })
        .subscribe();
    });
    // erro no dispatch nunca deve deixar o listener/timer do Realtime pendurado
    waitForReply.catch(() => {});

    try {
      const resp = await fetch(`${bridgeUrl.replace(/\/$/, '')}/agents/${agentSlug}-conversa/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          payload: { user_id: session.user.id, message },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || `Bridge retornou ${resp.status} em /agents/${agentSlug}-conversa/run`);
      }
    } catch (e) {
      cleanup();
      throw e;
    }

    return waitForReply;
  }

  return { talkTo, supabase };
}

module.exports = { makeChatClient, ChatTimeoutError };
