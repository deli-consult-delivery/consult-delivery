# Feature 3 — ReportsScreen Real por Loja

**Status:** Planejada | **Onda:** 07 | **Branch:** `feature/piloto-07-reports-real`
**Estimativa:** ~7h (~2 dias de trabalho a 2-4h/dia)
**Gerada por:** Feature Discovery Swarm — 2026-05-24

---

## Objetivo

Trocar os dados mockados de `ReportsScreen` por dados reais do Bridge Server,
adicionando seletor de loja, tabela de tarefas navegável e exportação CSV.
Zero infraestrutura nova necessária — o endpoint já existe e retorna dados reais.

## Problema atual

`ReportsScreen` importa `REPORTS_DATA` e `REPORTS_DATA_EXTRA` de `data.js` —
dados mockados hardcoded. O endpoint `GET /api/tarefas/loja/:lojaId/relatorio`
já existe no Bridge Server e retorna dados reais (`por_status`, `por_bloco`,
`por_prioridade`) mas não é usado pelo frontend.

## Infraestrutura já existente

```
Bridge Server:
  GET /api/tarefas/loja/:lojaId/relatorio
  Query params: data_inicio (ISO), data_fim (ISO)
  Retorna: { loja, totais: { por_status, por_bloco, por_prioridade }, tarefas: [...] }
```

Nenhuma migration ou endpoint novo necessário.

## Tasks

### F3-T1 — Hook useReportsData (2h)
**Arquivo:** `src/screens/hooks/useReportsData.js` (novo)

```javascript
export function useReportsData(lojaId, period = '30d') {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  const load = useCallback(async () => {
    if (!lojaId) { setState({ data: null, loading: false, error: null }); return; }
    const { data: { session } } = await supabase.auth.getSession();
    const { data_inicio, data_fim } = periodToDates(period); // '7d', '30d', '90d'
    const res = await fetch(
      `${BRIDGE_URL}/api/tarefas/loja/${lojaId}/relatorio?data_inicio=${data_inicio}&data_fim=${data_fim}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } }
    );
    const json = await res.json();
    // KPIs derivados:
    const total = json.totais.por_status.reduce((s, i) => s + i.count, 0);
    const concluidas = json.totais.por_status.find(i => i.status === 'concluida')?.count ?? 0;
    setState({
      loading: false,
      error: null,
      data: {
        loja: json.loja,
        totais: json.totais,
        tarefas: json.tarefas,
        kpis: {
          total,
          concluidas,
          taxaConclusao: total > 0 ? Math.round((concluidas / total) * 100) : 0,
          em_andamento: json.totais.por_status.find(i => i.status === 'em_execucao')?.count ?? 0,
          pendentes: json.totais.por_status.find(i => i.status === 'pendente')?.count ?? 0,
        }
      }
    });
  }, [lojaId, period]);

  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}
```

Helper `periodToDates(period)` converte `'30d'` → `{ data_inicio: 'YYYY-MM-DD', data_fim: 'YYYY-MM-DD' }`.

**Critério de aceite:** Hook retorna KPIs reais para uma loja com period '30d'.

---

### F3-T2 — LojaSelector (1h)
**Arquivo:** `src/screens/lojas/LojaSelector.jsx` (novo)

```jsx
export function LojaSelector({ value, onSelect }) {
  const [lojas, setLojas] = useState([]);
  useEffect(() => {
    supabase.from('lojas').select('id,nome').eq('is_active', true).order('nome')
      .then(({ data }) => setLojas(data ?? []));
  }, []);
  return (
    <select value={value ?? ''} onChange={e => onSelect(e.target.value || null)}>
      <option value="">Selecione uma loja...</option>
      {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
    </select>
  );
}
```

Estilizado com TailwindCSS consistente com outros dropdowns da plataforma.

**Critério de aceite:** Dropdown lista lojas ativas em ordem alfabética; seleção chama `onSelect` com o id.

---

### F3-T3 — Conectar ReportsScreen (1h)
**Arquivo:** `src/screens/ReportsScreen.jsx`

1. Remover imports de `REPORTS_DATA` / `REPORTS_DATA_EXTRA` de `data.js`
2. Adicionar estado `lojaId` e `period`
3. Chamar `useReportsData(lojaId, period)`
4. Conectar cards KPI a `data.kpis.total`, `data.kpis.taxaConclusao`, etc.
5. Adicionar `<LojaSelector>` no header da tela
6. Loading state enquanto `loading === true`
7. Empty state quando `lojaId === null`

**Critério de aceite:** Tela mostra loading → dados reais após seleção de loja; cards KPI exibem valores corretos.

---

### F3-T4 — TarefasTable (2h)
**Arquivo:** `src/screens/ReportsScreen.jsx` — nova aba "Tarefas"

Componente interno `TarefasTable`:
- Grid CSS 5 colunas: Título | Bloco | Status | Prioridade | Data Criação
- Filtros client-side: status (select), bloco (select), prioridade (select)
- Ordenação por data criação (desc default)
- Paginação simples: 20 items/página com controles Anterior/Próximo
- Badges coloridos por status (consistente com `TarefasClientesScreen`)

**Critério de aceite:** Tabela exibe tarefas com filtros funcionais; paginação funciona com >20 items.

---

### F3-T5 — exportarCSV (1h)
**Arquivo:** `src/screens/ReportsScreen.jsx`

```javascript
function exportarCSV(tarefas, nomeLoja, period) {
  const BOM = '﻿'; // UTF-8 BOM para Excel
  const headers = ['Título','Bloco','Status','Prioridade','Data Criação','Data Conclusão'];
  const rows = tarefas.map(t => [
    `"${t.titulo}"`, t.bloco ?? '', t.status, t.prioridade ?? '',
    t.created_at?.slice(0,10) ?? '', t.concluida_em?.slice(0,10) ?? ''
  ]);
  const csv = BOM + [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `relatorio_${nomeLoja}_${period}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

Botão "Exportar CSV" só habilitado quando há dados e `lojaId` selecionado.

**Critério de aceite:** CSV abre corretamente no Excel com acentos legíveis; nome do arquivo inclui loja e período.

---

## Critério de aceite da feature completa

1. `ReportsScreen` com loja selecionada exibe dados reais (não mockados)
2. KPI cards refletem os valores reais do endpoint
3. Aba "Tarefas" lista todas as tarefas com filtros e paginação
4. Botão "Exportar CSV" gera arquivo com BOM UTF-8 legível no Excel
5. Trocar período (7d/30d/90d) recarrega os dados

## Pontos de atenção

- `BRIDGE_URL` deve ser lido de `import.meta.env.VITE_BRIDGE_URL` (já usado no projeto)
- O endpoint retorna `tarefas` como array completo — paginação é client-side
- Sem período passado na query, o endpoint pode retornar todas as tarefas — sempre passar `data_inicio` e `data_fim`
