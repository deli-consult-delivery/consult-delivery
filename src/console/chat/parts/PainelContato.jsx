/**
 * PainelContato — coluna 3 do Chat ao Vivo (cv2 redesign / FASE 1)
 *
 * Cabeçalho (avatar + nome + sub) · bloco "Ações" (+ Adicionar negócio /
 * + Executar automação — placeholders) · collapses Perfil / Negócio. Some em
 * telas <=1100px (regra no CSS). Dados do contato vêm do convShape e do
 * registro `customer` (lookup no container).
 *
 * Props:
 *  - conv: convShape|null
 *  - customer: { name, phone, email, segment } | null
 *    (apenas colunas que existem em `customers` — Padrão P1: notas/endereço/
 *     pipeline não existem na tabela, então não são exibidos.)
 *
 * Toda a aparência mora em chat-cv2.css (escopo .cv2-main .ccv-*).
 */

import { useState } from 'react';
import { Ico } from '../../CvIcons.jsx';
import { corAvatar, inicial } from './avatar.js';

const Caret = () => (
  <svg className="ccv-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 6 15 12 9 18" />
  </svg>
);

function Collapse({ titulo, aberto, onToggle, children }) {
  return (
    <div className={`ccv-collapse${aberto ? ' open' : ''}`}>
      <button type="button" className="ccv-collapse-hd" onClick={onToggle} aria-expanded={aberto}>
        <span>{titulo}</span>
        <Caret />
      </button>
      {aberto && <div className="ccv-collapse-body">{children}</div>}
    </div>
  );
}

function Linha({ rotulo, valor }) {
  return (
    <div className="ccv-kv">
      <span>{rotulo}</span>
      <b>{valor || '—'}</b>
    </div>
  );
}

export default function PainelContato({ conv, customer, transfer }) {
  const tr = transfer || {};
  const [abertos, setAbertos] = useState({ perfil: true, negocio: false });
  const toggle = (k) => setAbertos((s) => ({ ...s, [k]: !s[k] }));

  if (!conv) {
    return (
      <div className="ccv-col3">
        <div className="ccv-panel">
          <div className="ccv-empty">Selecione uma conversa.</div>
        </div>
      </div>
    );
  }

  const nome = customer?.name || conv.nome;
  const telefone = customer?.phone || conv.telefone || '';
  const podeTransferir = !conv.isChan && Array.isArray(tr.deps) && tr.deps.length > 0;
  const deptAtual = (tr.deps || []).find((d) => d.id === conv.deptId)?.name || null;

  return (
    <div className="ccv-col3">
      <div className="ccv-panel">
        {/* cabeçalho */}
        <div className="ccv-panel-av">
          <div className="ccv-av" style={{ background: corAvatar(nome), width: 56, height: 56, minWidth: 56, fontSize: 20 }}>
            {conv.foto
              ? <img className="ccv-av-img" src={conv.foto} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              : inicial(nome)}
          </div>
          <div className="ccv-panel-name">{nome}</div>
          {telefone && <div className="ccv-panel-sub">{telefone}</div>}
        </div>

        {/* ações */}
        <div className="ccv-acoes">
          {podeTransferir && (
            <label className="ccv-transfer-field">
              <span className="ccv-transfer-lb"><Ico name="i-users" size={13} /> Transferir para departamento</span>
              <select
                className="ccv-transfer"
                value=""
                disabled={tr.transferindo}
                onChange={(e) => { const v = e.target.value; e.target.value = ''; if (v) tr.transferir?.(v); }}
              >
                <option value="">{deptAtual ? `Atual: ${deptAtual}` : 'Selecione…'}</option>
                {tr.deps.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className="ccv-acao-btn" title="Adicionar negócio (em breve)" disabled>
            <Ico name="i-folder" size={15} /> Adicionar negócio
          </button>
          <button type="button" className="ccv-acao-btn" title="Executar automação (em breve)" disabled>
            <Ico name="i-bot" size={15} /> Executar automação
          </button>
        </div>

        {/* collapses */}
        <Collapse titulo="Perfil" aberto={abertos.perfil} onToggle={() => toggle('perfil')}>
          <Linha rotulo="Nome" valor={nome} />
          <Linha rotulo="Telefone" valor={telefone} />
          <Linha rotulo="E-mail" valor={customer?.email} />
        </Collapse>

        <Collapse titulo="Negócio" aberto={abertos.negocio} onToggle={() => toggle('negocio')}>
          <Linha rotulo="Segmento" valor={customer?.segment} />
        </Collapse>
      </div>
    </div>
  );
}
