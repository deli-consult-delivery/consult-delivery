// ============================================================
// Console v2 · telas do protótipo ainda sem backend dedicado.
// Renderer fiel ao generic() do protótipo (docs/prototipo/console-v2.html).
// Estado real = vazio até a tabela própria entrar (Onda 2/3). Sem dado fake.
// ============================================================
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';

function Tela({ titulo, sub, kpis, cols, rows, acao, nota }) {
  return (
    <div>
      <h1>{titulo}</h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">{sub}</div>
      {kpis && <div className="cv2-kpis">{kpis}</div>}
      <div className="cv2-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="cv2-spread" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
          <b style={{ fontSize: 13 }}>{titulo}</b>
          {acao && <button className="cv2-btn sec" disabled title="Disponível na próxima atualização">{acao}</button>}
        </div>
        <table className="cv2-tbl">
          <thead><tr>{cols.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
          <tbody>
            {(rows && rows.length) ? rows.map((r, i) => (
              <tr key={i}>{r.map((cell, j) => <td key={j} dangerouslySetInnerHTML={{ __html: cell }} />)}</tr>
            )) : (
              <tr><td colSpan={cols.length} style={{ textAlign: 'center', color: 'var(--tx2)', padding: 28 }}>— nenhum registro ainda —</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {nota && <div className="cv2-sub" style={{ marginTop: 10, fontSize: 11.5 }}>{nota}</div>}
    </div>
  );
}

const NOTA = 'Estrutura no padrão do protótipo. A persistência desta tela entra na próxima atualização do Console v2.';

export function Gatilhos() {
  return <Tela titulo="Gatilhos" sub="Reações automáticas a eventos externos (WhatsApp, Asaas, iFood)." cols={['Gatilho', 'Fonte', 'Ação', 'Execuções 7d']} rows={[]} acao="+ Novo gatilho" nota={NOTA} />;
}
export function Topicos() {
  return <Tela titulo="Tópicos" sub="Fila de trabalho — quem cuida do quê." cols={['Título', 'Prioridade', 'Responsável', 'Status']} rows={[]} acao="+ Novo tópico" nota={NOTA} />;
}
export function TarefasAgendadas() {
  return <Tela titulo="Tarefas agendadas" sub="Ações únicas com hora marcada." cols={['Tarefa', 'Agente', 'Quando', 'Status']} rows={[]} acao="+ Nova tarefa" nota={NOTA} />;
}
export function Links() {
  return <Tela titulo="Links compartilhados" sub="Links públicos com validade e contagem de acessos." cols={['Arquivo', 'Link', 'Expira', 'Acessos']} rows={[]} acao="+ Novo link" nota={NOTA} />;
}
export function Provedores() {
  return <Tela titulo="Provedores de IA" sub="Cada cliente pode usar a própria chave (BYO-key via cofre)." cols={['Provider', 'Modelo padrão', 'Chave', 'Status']}
    rows={[
      ['Anthropic', 'claude-sonnet-4-6', '•••• cofre', '<span class="cv2-bdg ok">ativo</span>'],
      ['OpenRouter', 'gpt-image (Estúdio)', '•••• cofre', '<span class="cv2-bdg ok">ativo</span>'],
      ['Ollama Cloud', 'kimi-k2.6', '—', '<span class="cv2-bdg mut">fallback</span>'],
    ]} nota="Leitura — a edição de chaves é feita pela equipe Consult Delivery (cofre Infisical)." />;
}
export function Integracoes() {
  return <Tela titulo="Integrações" sub="Conexões do cliente — credenciais no cofre." cols={['Integração', 'Status', 'Usada por']}
    rows={[
      ['WhatsApp (Evolution)', '<span class="cv2-bdg ok">conectada</span>', 'BRENO · MIA · Bom Dia'],
      ['Asaas', '<span class="cv2-bdg ok">conectada</span>', 'CORA · Defesa'],
      ['iFood (planilhas)', '<span class="cv2-bdg ok">via Importar</span>', 'Radar · Análise'],
      ['Telegram interno', '<span class="cv2-bdg ok">conectada</span>', 'DELI · alertas'],
    ]} nota="Leitura — a conexão é feita pela equipe Consult Delivery." />;
}
export function Sistemas() {
  return <Tela titulo="Sistemas externos" sub="Atalhos e referências dos sistemas do cliente." cols={['Sistema', 'Endereço', 'Tipo']}
    rows={[
      ['Painel iFood', 'portal.ifood.com.br', 'canal'],
      ['Asaas', 'asaas.com', 'pagamento'],
    ]} acao="+ Registrar" nota={NOTA} />;
}

// Arquivos: lê de forma defensiva uma eventual tabela de arquivos; senão estado vazio real.
export function Arquivos({ tenantDbId }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.from('tenant_files').select('name, folder, size_bytes, updated_at').eq('tenant_id', tenantDbId).limit(50);
        if (alive && Array.isArray(data)) {
          setRows(data.map(d => [d.name, d.folder || '/', d.size_bytes ? `${Math.round(d.size_bytes / 1024)} KB` : '—', d.updated_at ? new Date(d.updated_at).toLocaleDateString('pt-BR') : '—']));
        }
      } catch { /* tabela ainda não existe — estado vazio */ }
    })();
    return () => { alive = false; };
  }, [tenantDbId]);
  return <Tela titulo="Arquivos" sub="Workspace do cliente — cada um enxerga só a sua pasta." cols={['Arquivo', 'Pasta', 'Tamanho', 'Modificado']} rows={rows} acao="Enviar arquivo" nota={NOTA} />;
}
