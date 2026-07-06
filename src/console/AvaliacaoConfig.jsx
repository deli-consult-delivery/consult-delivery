import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3001';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function apiFetch(url, opts = {}) {
  const headers = await getAuthHeaders();
  const r = await fetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || json.erro || `HTTP ${r.status}`);
  return json;
}

function ColorInput({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        type="color"
        value={value || '#B70C00'}
        onChange={e => onChange(e.target.value)}
        style={{ width: 40, height: 32, border: 'none', padding: 0, cursor: 'pointer', borderRadius: 4 }}
      />
      <input
        type="text"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder="#B70C00"
        maxLength={7}
        style={fieldStyle}
      />
      <div style={{
        width: 32, height: 32, borderRadius: 6, flexShrink: 0,
        background: value || '#B70C00', border: '1px solid var(--line)',
      }} />
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="cv2-field-wrap" style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}</label>
      {hint && <p style={hintStyle}>{hint}</p>}
      {children}
    </div>
  );
}

// ── Seção: Identidade Visual ──────────────────────────────────────────────────

function SecaoIdentidade({ tenantDbId, brandAtual }) {
  const [logoUrl,    setLogoUrl]    = useState(brandAtual?.logo_url    || '');
  const [color,      setColor]      = useState(brandAtual?.theme_color || brandAtual?.color || '');
  const [salvando,   setSalvando]   = useState(false);
  const [feedback,   setFeedback]   = useState('');
  const [logoPreviewOk, setLogoOk] = useState(false);
  const [enviandoLogo, setEnviandoLogo] = useState(false);

  useEffect(() => {
    setLogoUrl(brandAtual?.logo_url    || '');
    setColor(brandAtual?.theme_color   || brandAtual?.color || '');
  }, [brandAtual]);

  async function onPickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite reescolher o mesmo arquivo
    if (!file) return;
    if (file.size > 1_400_000) {
      setFeedback('Erro: imagem maior que 1,4 MB. Use uma menor.');
      return;
    }
    setEnviandoLogo(true); setFeedback('');
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('falha ao ler o arquivo'));
        reader.readAsDataURL(file);
      });
      const resp = await apiFetch(`${BRIDGE_URL}/api/tenant/branding/logo`, {
        method: 'POST',
        body: JSON.stringify({
          tenant_id:      tenantDbId,
          content_type:   file.type,
          content_base64: String(dataUrl),
        }),
      });
      setLogoUrl(resp.logo_url || '');
      setLogoOk(false);
      setFeedback('Logo enviada e salva! Já aparece nos links de avaliação.');
    } catch (err) {
      setFeedback(`Erro ao enviar logo: ${err.message}`);
    } finally {
      setEnviandoLogo(false);
    }
  }

  async function salvar() {
    setSalvando(true); setFeedback('');
    try {
      await apiFetch(`${BRIDGE_URL}/api/tenant/branding`, {
        method: 'PATCH',
        body: JSON.stringify({ tenant_id: tenantDbId, logo_url: logoUrl || null, theme_color: color || null }),
      });
      setFeedback('Identidade visual salva!');
    } catch (err) {
      setFeedback(`Erro: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="cv2-card" style={{ marginBottom: 20 }}>
      <h2 style={sectionTitleStyle}>Identidade Visual</h2>
      <p style={descStyle}>Logo e cor que aparecem nas páginas públicas de avaliação (CSAT e NPS).</p>

      <Field label="Logo" hint="Envie um arquivo do seu computador (PNG, JPG ou WEBP, até 1,4 MB) ou cole uma URL pública HTTPS.">
        <div style={{ marginBottom: 8 }}>
          <label className="cv2-btn" style={{ cursor: enviandoLogo ? 'wait' : 'pointer', display: 'inline-block' }}>
            {enviandoLogo ? 'Enviando…' : '📤 Enviar imagem do computador'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={onPickFile}
              disabled={enviandoLogo}
              style={{ display: 'none' }}
            />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <input
            type="text"
            value={logoUrl}
            onChange={e => { setLogoUrl(e.target.value); setLogoOk(false); }}
            placeholder="https://exemplo.com/logo.png"
            style={{ ...fieldStyle, flex: 1 }}
          />
          {logoUrl && (
            <img
              src={logoUrl}
              alt="preview"
              onLoad={() => setLogoOk(true)}
              onError={() => setLogoOk(false)}
              style={{
                height: 40, width: 'auto', maxWidth: 120,
                borderRadius: 6, border: '1px solid var(--line)',
                objectFit: 'contain', padding: 2,
                display: logoPreviewOk ? 'block' : 'none',
              }}
            />
          )}
        </div>
        {logoUrl && !logoPreviewOk && (
          <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 4 }}>Imagem não carregou — verifique a URL.</p>
        )}
      </Field>

      <Field label="Cor principal" hint="Cor do cabeçalho e botão de envio nas páginas de avaliação.">
        <ColorInput value={color} onChange={setColor} />
      </Field>

      <button className="cv2-btn" onClick={salvar} disabled={salvando} style={{ marginTop: 8 }}>
        {salvando ? 'Salvando…' : 'Salvar identidade visual'}
      </button>
      {feedback && <p style={{ marginTop: 8, fontSize: 13, color: feedback.startsWith('Erro') ? 'var(--red)' : 'var(--green)' }}>{feedback}</p>}
    </div>
  );
}

// ── Seção genérica de mensagens (CSAT ou NPS) ─────────────────────────────────

function SecaoMensagens({ tenantDbId, tipo, config, onSaved }) {
  const prefix = tipo === 'csat' ? 'csat' : 'nps';
  const label  = tipo === 'csat' ? 'Satisfação do Atendimento (CSAT)' : 'Lealdade da Marca (NPS)';

  const defaults = tipo === 'csat'
    ? { titulo: 'Como foi seu atendimento?', subtitulo: 'Sua opinião nos ajuda a melhorar.', agradecimento: 'Obrigado pelo seu feedback!' }
    : { titulo: 'De 0 a 10, qual a probabilidade de você nos indicar?', subtitulo: '', agradecimento: 'Sua opinião é muito importante para nós!' };

  const [titulo,        setTitulo]        = useState('');
  const [subtitulo,     setSubtitulo]     = useState('');
  const [agradecimento, setAgradecimento] = useState('');
  const [template,      setTemplate]      = useState('');
  const [salvando,      setSalvando]      = useState(false);
  const [feedback,      setFeedback]      = useState('');

  useEffect(() => {
    setTitulo(config?.[`${prefix}_titulo`]        ?? '');
    setSubtitulo(config?.[`${prefix}_subtitulo`]  ?? '');
    setAgradecimento(config?.[`${prefix}_agradecimento`] ?? '');
    setTemplate(config?.[`${prefix}_mensagem_template`]  ?? '');
  }, [config, prefix]);

  async function salvar() {
    setSalvando(true); setFeedback('');
    try {
      await apiFetch(`${BRIDGE_URL}/api/tenant/avaliacao-config`, {
        method: 'PATCH',
        body: JSON.stringify({
          tenant_id: tenantDbId,
          [`${prefix}_titulo`]:            titulo        || null,
          [`${prefix}_subtitulo`]:         subtitulo     || null,
          [`${prefix}_agradecimento`]:     agradecimento || null,
          [`${prefix}_mensagem_template`]: template      || null,
        }),
      });
      setFeedback('Mensagens salvas!');
      onSaved?.();
    } catch (err) {
      setFeedback(`Erro: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="cv2-card" style={{ marginBottom: 20 }}>
      <h2 style={sectionTitleStyle}>Mensagens {label}</h2>

      <Field label="Título da página" hint={`Padrão: "${defaults.titulo}"`}>
        <input
          type="text"
          value={titulo}
          onChange={e => setTitulo(e.target.value)}
          placeholder={defaults.titulo}
          maxLength={200}
          style={fieldStyle}
        />
      </Field>

      <Field label="Subtítulo" hint={`Padrão: "${defaults.subtitulo || '(sem subtítulo)'}"`}>
        <input
          type="text"
          value={subtitulo}
          onChange={e => setSubtitulo(e.target.value)}
          placeholder={defaults.subtitulo || 'Subtítulo opcional'}
          maxLength={300}
          style={fieldStyle}
        />
      </Field>

      <Field
        label="Mensagem de envio (WhatsApp)"
        hint="Template enviado ao cliente. Use {nome_cliente} e {link_avaliacao} (CSAT) ou {link_nps} (NPS)."
      >
        <textarea
          value={template}
          onChange={e => setTemplate(e.target.value)}
          placeholder={
            tipo === 'csat'
              ? 'Olá {nome_cliente}! Avalie seu atendimento: {link_avaliacao}'
              : 'Olá {nome_cliente}! Responda nossa pesquisa: {link_nps}'
          }
          rows={3}
          maxLength={1000}
          style={textareaStyle}
        />
      </Field>

      <Field label="Mensagem de agradecimento" hint={`Padrão: "${defaults.agradecimento}"`}>
        <input
          type="text"
          value={agradecimento}
          onChange={e => setAgradecimento(e.target.value)}
          placeholder={defaults.agradecimento}
          maxLength={300}
          style={fieldStyle}
        />
      </Field>

      <button className="cv2-btn" onClick={salvar} disabled={salvando} style={{ marginTop: 8 }}>
        {salvando ? 'Salvando…' : `Salvar mensagens ${label}`}
      </button>
      {feedback && <p style={{ marginTop: 8, fontSize: 13, color: feedback.startsWith('Erro') ? 'var(--red)' : 'var(--green)' }}>{feedback}</p>}
    </div>
  );
}

// ── Seção: Alerta de Detrator (WhatsApp) ──────────────────────────────────────

function SecaoAlertaDetrator({ tenantDbId, config, onSaved }) {
  const [notificar, setNotificar] = useState(false);
  const [wppJid,    setWppJid]    = useState('');
  const [salvando,  setSalvando]  = useState(false);
  const [feedback,  setFeedback]  = useState('');

  useEffect(() => {
    setNotificar(config?.detrator_notificar ?? false);
    setWppJid(config?.detrator_wpp_jid      ?? '');
  }, [config]);

  async function salvar() {
    setSalvando(true); setFeedback('');
    try {
      await apiFetch(`${BRIDGE_URL}/api/tenant/avaliacao-config`, {
        method: 'PATCH',
        body: JSON.stringify({
          tenant_id:          tenantDbId,
          detrator_notificar: notificar,
          detrator_wpp_jid:   wppJid.trim() || null,
        }),
      });
      setFeedback('Alerta de detrator salvo!');
      onSaved?.();
    } catch (err) {
      setFeedback(`Erro: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="cv2-card" style={{ marginBottom: 20 }}>
      <h2 style={sectionTitleStyle}>Alerta de Detrator (WhatsApp)</h2>
      <p style={descStyle}>
        Quando um cliente dá nota baixa (detrator CSAT ou NPS), envia um aviso via WhatsApp
        para o grupo ou contato configurado abaixo.
      </p>

      <Field label="Notificar detrator via WhatsApp">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <input type="checkbox" checked={notificar} onChange={e => setNotificar(e.target.checked)} />
          Ativado
        </label>
      </Field>

      <Field
        label="Grupo ou contato destino"
        hint="JID do WhatsApp: grupo termina em @g.us, contato em @s.whatsapp.net. Copie do link do grupo ou peça ao suporte."
      >
        <input
          type="text"
          value={wppJid}
          onChange={e => setWppJid(e.target.value)}
          placeholder="120363422466462172@g.us"
          maxLength={50}
          style={fieldStyle}
        />
      </Field>

      <button className="cv2-btn" onClick={salvar} disabled={salvando} style={{ marginTop: 8 }}>
        {salvando ? 'Salvando…' : 'Salvar alerta de detrator'}
      </button>
      {feedback && <p style={{ marginTop: 8, fontSize: 13, color: feedback.startsWith('Erro') ? 'var(--red)' : 'var(--green)' }}>{feedback}</p>}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function AvaliacaoConfig({ tenantDbId }) {
  const [config,   setConfig]  = useState(null);
  const [brand,    setBrand]   = useState(null);
  const [loading,  setLoading] = useState(true);
  const [erro,     setErro]    = useState('');

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    setLoading(true); setErro('');
    try {
      const [cfg, brd] = await Promise.all([
        apiFetch(`${BRIDGE_URL}/api/tenant/avaliacao-config?tenant_id=${encodeURIComponent(tenantDbId)}`),
        apiFetch(`${BRIDGE_URL}/api/tenant/branding?tenant_id=${encodeURIComponent(tenantDbId)}`).catch(() => null),
      ]);
      setConfig(cfg);
      setBrand(brd);
    } catch (err) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantDbId]);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) return <div className="cv2-card" style={{ color: 'var(--tx2)', textAlign: 'center' }}>Carregando…</div>;
  if (erro)    return <div className="cv2-card" style={{ color: 'var(--red)' }}>Erro: {erro}</div>;

  return (
    <div>
      <h1>Configurações de Avaliação</h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">
        Personalize a identidade visual e as mensagens das pesquisas CSAT e NPS enviadas aos clientes.
      </div>

      <SecaoIdentidade tenantDbId={tenantDbId} brandAtual={brand} />
      <SecaoMensagens tenantDbId={tenantDbId} tipo="csat" config={config} onSaved={carregar} />
      <SecaoMensagens tenantDbId={tenantDbId} tipo="nps"  config={config} onSaved={carregar} />
      <SecaoAlertaDetrator tenantDbId={tenantDbId} config={config} onSaved={carregar} />
    </div>
  );
}

// ── Estilos locais ────────────────────────────────────────────────────────────
const sectionTitleStyle = { fontSize: 16, fontWeight: 700, margin: '0 0 4px' };
const descStyle         = { fontSize: 13, color: 'var(--tx2)', margin: '0 0 16px' };
const labelStyle        = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--tx1)', marginBottom: 4 };
const hintStyle         = { fontSize: 12, color: 'var(--tx2)', margin: '0 0 6px' };
const fieldStyle        = {
  width: '100%', padding: '8px 10px', borderRadius: 6,
  border: '1px solid var(--line)', fontFamily: 'inherit',
  fontSize: 14, outline: 'none', boxSizing: 'border-box',
};
const textareaStyle     = {
  ...fieldStyle, resize: 'vertical', minHeight: 72,
};
