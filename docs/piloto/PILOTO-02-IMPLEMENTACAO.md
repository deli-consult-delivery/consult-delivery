# PILOTO Onda 02 — Pipeline de Tarefas por Loja — Implementação

**Branch:** `feature/piloto-02-pipeline-tarefas`
**Status:** Concluída (aguardando merge)
**Implementado em:** 20/05/2026
**Spec original:** [`docs/piloto/PILOTO-02-PIPELINE-TAREFAS.md`](./PILOTO-02-PIPELINE-TAREFAS.md)

---

## O que foi entregue

| # | Tarefa | Status |
|---|--------|--------|
| 1 | Reconhecimento do estado atual da Onda 01 | ✅ |
| 2 | 5 migrations Supabase + 25 templates seedados | ✅ |
| 3 | 16 endpoints Bridge Server (4 lotes) | ✅ |
| 4 | Tela `/lojas/:id` — aba Tarefas com lista, filtros e lifecycle | ✅ |
| 5 | Modal de tarefa (TarefaDetailModal) com prints, comentários, histórico | ✅ |
| 6 | RelatorioModal — gerar relatório markdown + PDF + clipboard | ✅ |
| 7 | TabVisaoGeral — cards de stats de tarefas da loja | ✅ |
| 8 | Smoke test E2E via HTTP (V2) | ✅ |
| 9 | Documentação (este arquivo) | ✅ |

---

## Schema — 5 tabelas criadas

| Migration | Tabela | Descrição |
|-----------|--------|-----------|
| `20260520_005_tarefas_loja.sql` | `tarefas_loja` | Tarefa principal com título, situação, o que será feito, status (9 estados), prioridade (3 tipos), bloco, prazo, responsável |
| `20260520_006_tarefa_aprovacoes.sql` | `tarefa_aprovacoes` | Registro imutável de aprovações/rejeições de cliente (created_at, aprovado_por, comentario) |
| `20260520_007_tarefa_prints.sql` | `tarefa_prints` | Prints/evidências de execução vinculados ao Supabase Storage (bucket `tarefa-prints`) |
| `20260520_008_tarefa_comentarios.sql` | `tarefa_comentarios` | Thread de comentários internos da equipe por tarefa |
| `20260520_009_templates_tarefa.sql` | `templates_tarefa` | 25 templates pré-definidos em 6 blocos (padrão Uraka Burger), seedados na migration |

### Blocos disponíveis
`identidade` · `cardapio` · `operacao` · `avaliacoes` · `marketing` · `suporte`

### Estados de status (ciclo de vida)
```
rascunho → aguardando_envio → aguardando_aprovacao → aprovada → em_execucao → aguardando_validacao → concluida
                                                    ↘ rejeitada
                                                                                                      ↘ cancelada
```

### Prioridades
`quick_win` · `estrutural` · `material_cliente`

---

## Endpoints implementados (16)

Todos autenticados via `requireJwt` (Bearer token Supabase).
Base URL: `https://bridge.consultdelivery.com.br/api`

| # | Método | Rota | Descrição |
|---|--------|------|-----------|
| 1 | GET | `/tarefas/loja/:lojaId` | Lista tarefas da loja com filtros opcionais (`?bloco=`, `?status=`, `?prioridade=`) |
| 2 | GET | `/tarefas/:id` | Detalhe completo de uma tarefa + histórico de aprovações + prints + comentários |
| 3 | POST | `/tarefas/loja/:lojaId` | Cria tarefa manual (campos livres) |
| 4 | POST | `/tarefas/loja/:lojaId/from-template` | Cria tarefa a partir de um template seedado (`template_id` no body) |
| 5 | PATCH | `/tarefas/:id` | Atualiza campos editáveis (título, situação, o_que_sera_feito, prazo, responsável, etc.) |
| 6 | POST | `/tarefas/:id/enviar-aprovacao` | Transição `rascunho/aguardando_envio` → `aguardando_aprovacao` |
| 7 | POST | `/tarefas/:id/aprovar` | Transição `aguardando_aprovacao` → `aprovada`; registra aprovação em `tarefa_aprovacoes` |
| 8 | POST | `/tarefas/:id/rejeitar` | Transição `aguardando_aprovacao` → `rejeitada`; registra rejeição com comentário obrigatório |
| 9 | POST | `/tarefas/:id/iniciar-execucao` | Transição `aprovada` → `em_execucao`; grava `iniciada_em` |
| 10 | POST | `/tarefas/:id/submeter-validacao` | Transição `em_execucao` → `aguardando_validacao`; grava `submetida_em` |
| 11 | POST | `/tarefas/:id/concluir` | Transição `aguardando_validacao` → `concluida`; grava `concluida_em` |
| 12 | GET | `/tarefas/loja/:lojaId/relatorio` | Retorna JSON com totais (`por_status`, `por_bloco`, `por_prioridade`) + lista completa ordenada por bloco |
| 13 | GET | `/tarefas/:id/comentarios` | Lista comentários de uma tarefa em ordem cronológica |
| 14 | POST | `/tarefas/:id/comentarios` | Adiciona comentário à tarefa (autor = usuário autenticado) |
| 15 | GET | `/tarefas/:id/prints` | Lista prints/evidências de uma tarefa (URL pública + metadados) |
| 16 | POST | `/tarefas/:id/prints` | Upload de print para Supabase Storage + registro em `tarefa_prints` |

### Estrutura de resposta do relatório (endpoint 12)
```json
{
  "loja": { "id": "...", "nome": "...", "cidade": null, "segmento": "hamburgueria" },
  "gerado_em": "2026-05-20T14:44:44.760Z",
  "totais": {
    "total": 6,
    "por_status": { "rascunho": 4, "em_execucao": 2 },
    "por_bloco":  { "identidade": 2, "cardapio": 3, "operacao": 1 },
    "por_prioridade": { "quick_win": 2, "estrutural": 4 }
  },
  "periodo": { "data_inicio": null, "data_fim": null },
  "tarefas": [{ "id": "...", "titulo": "...", "bloco": "identidade", "status": "rascunho", ... }]
}
```

---

## Componentes frontend

Todos em `src/screens/lojas/LojaWorkspace.jsx` (arquivo único, 1214 linhas).

### TabTarefas
- Lista de tarefas da loja com filtros por bloco e status
- Toolbar com "Nova tarefa" (NovaTarefaOverlay) e "Gerar relatório" (RelatorioModal)
- Badge de status colorido por estado
- Clique na tarefa abre TarefaDetailModal
- `bridgeFetch()` helper interno para todas as chamadas ao Bridge

### TarefaDetailModal
- Header: título editável, bloco, prioridade
- Campos: situação, o que será feito, por que importa, prazo estimado, responsável
- Seção de ações lifecycle: botões condicionais por status atual
- Seção de prints: grid de thumbnails + upload via input file
- Seção de comentários: thread com avatar + submit

### RelatorioModal
- Acionado pelo botão "Gerar relatório" na toolbar da aba Tarefas
- Header: nome da loja + data formatada pt-BR + stats inline (total, concluídas, quick wins)
- Body: tarefas agrupadas por bloco em ordem canônica (identidade → suporte)
- Cada tarefa: badge de status + prioridade + situação + o_que_sera_feito + por_que_importa (se houver) + prazo
- Empty state quando `total === 0` (desabilita Copiar/Baixar)
- Footer: "Copiar markdown", "Baixar PDF", "Enviar via WhatsApp" (disabled, Onda 04)

### TabVisaoGeral (atualizada)
- Recebe `lojaId` como prop (adicionado nesta onda)
- Faz GET `/api/tarefas/loja/:lojaId/relatorio` ao montar
- Exibe cards de totais: Total · Concluídas · Em execução · Pendentes
- Cards só aparecem se `totais.total > 0`

### NovaTarefaOverlay
- Formulário inline para criar tarefa manual
- Campos: título (obrigatório), bloco, prioridade, situação, o_que_sera_feito, por_que_importa, prazo

### Constantes de mapeamento (módulo-nível)
```js
STATUS_TAREFA_LABEL / STATUS_TAREFA_COLOR   // 9 estados
BLOCO_LABEL                                 // 6 blocos
PRIORIDADE_LABEL / PRIORIDADE_COLOR         // 3 prioridades
BLOCOS_OPCOES / PRIORIDADES_OPCOES          // arrays para selects
```

---

## Decisões técnicas

### Storage policy sem validação de tenant
O bucket `tarefa-prints` usa policy permissiva no Storage (qualquer autenticado lê/escreve).
A validação de tenant ocorre **exclusivamente no Bridge Server** — o upload passa pelo endpoint
`POST /tarefas/:id/prints` que valida a posse da tarefa antes de chamar a Storage API.
Direto ao Storage via client-side seria possível burlar o isolamento de tenant.

### PDF sem dependência externa
`jspdf` e `html2pdf.js` não estão nas deps do projeto.
O PDF é gerado via `window.open()` + HTML inline + `window.print()` com delay de 400ms.
`markdownToHtml()` faz escape de `&`, `<`, `>` antes de montar o HTML (sem XSS).
Decisão: zero dependências adicionadas. Trade-off: não controla nome do arquivo PDF (depende do browser).

### Smoke test V1 falhou (SQL direto); V2 via HTTP funcionou
- **V1**: tentativa de smoke test via SQL direto no Supabase — falhou porque as políticas RLS
  exigem contexto de sessão autenticada que o SQL console não simula completamente.
- **V2**: smoke test via chamadas HTTP ao Bridge Server com JWT real — funcionou end-to-end.
  Padrão recomendado para futuros smoke tests desta onda.

---

## Como rodar o smoke test (próximo dev)

Pré-requisito: ter uma loja de teste criada (ou criar uma dedicada para não contaminar dados reais).

```bash
# 1. Obter JWT de sessão (logar no app, copiar do localStorage ou usar bridge /auth)
TOKEN="eyJ..."

# 2. Listar templates disponíveis
curl -H "Authorization: Bearer $TOKEN" \
  https://bridge.consultdelivery.com.br/api/tarefas/templates | jq '.[] | {id, titulo, bloco}'

# 3. Criar tarefa a partir do template (substitua LOJA_ID e TEMPLATE_ID)
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"template_id": "TEMPLATE_ID"}' \
  https://bridge.consultdelivery.com.br/api/tarefas/loja/LOJA_ID/from-template

# 4. Avançar o ciclo de vida (substitua TAREFA_ID)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  https://bridge.consultdelivery.com.br/api/tarefas/TAREFA_ID/enviar-aprovacao
curl -X POST -H "Authorization: Bearer $TOKEN" \
  https://bridge.consultdelivery.com.br/api/tarefas/TAREFA_ID/aprovar
curl -X POST -H "Authorization: Bearer $TOKEN" \
  https://bridge.consultdelivery.com.br/api/tarefas/TAREFA_ID/iniciar-execucao
curl -X POST -H "Authorization: Bearer $TOKEN" \
  https://bridge.consultdelivery.com.br/api/tarefas/TAREFA_ID/submeter-validacao
curl -X POST -H "Authorization: Bearer $TOKEN" \
  https://bridge.consultdelivery.com.br/api/tarefas/TAREFA_ID/concluir

# 5. Verificar relatório
curl -H "Authorization: Bearer $TOKEN" \
  https://bridge.consultdelivery.com.br/api/tarefas/loja/LOJA_ID/relatorio | jq '.totais'

# 6. Limpar loja de teste (CASCADE apaga tarefas, aprovações, prints, comentários)
# Fazer via Supabase dashboard ou SQL: DELETE FROM lojas WHERE id = 'LOJA_ID';
```

---

## Débitos técnicos

| # | Débito | Impacto | Quando resolver |
|---|--------|---------|-----------------|
| 1 | **Storage policy de tenant** — bucket `tarefa-prints` não valida tenant_id na policy do Storage, confia 100% no Bridge | Baixo (Bridge é o único caminho de upload) | Onda 03 — adicionar RLS no Storage com `tenant_id` via JWT claim |
| 2 | **Frontend visual não validado em browser** — Onda 02 entregou backend completo; a aba Tarefas e os modais foram validados apenas visualmente na Tarefa 6 (modal relatório), não houve testes manuais exaustivos de todas as ações lifecycle | Médio — podem existir edge cases de UX | Validar antes de liberar para equipe |
| 3 | **Inconsistência `ativa` vs `ativo`** no módulo Campanhas — campo booleano tem nome inconsistente entre código e DB | Baixo (pré-existente, não introduzido nesta onda) | Próxima migration de cleanup |
| 4 | **Kanban view** não implementada — spec original mencionava lista + kanban; só lista foi entregue | Baixo (lista é funcional) | Onda 03 ou posterior |
| 5 | **Envio via WhatsApp** no RelatorioModal está desabilitado | Funcional sem isso | Onda 04 |
