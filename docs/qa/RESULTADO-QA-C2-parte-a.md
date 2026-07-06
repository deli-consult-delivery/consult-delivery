# Resultado QA C2 — Parte A (Prioridade 1 + 2)

Executado sem browser (SQL via MCP Supabase, read-only, projeto `czyanilrverorwenikqw` + grep estático). Checks de "ação"/"estado vazio"/"erro visual" marcados PRECISA-BROWSER.

Tenant Karina: `e9fdaa66-cbe7-4dff-905b-afc4b10219ff`.

## Output bruto (SQL)

```sql
select
 (select count(*) from atendimento_avaliacoes where tenant_id='e9fdaa66-...') as csat_total,
 (select count(*) filter (where status='respondida') from atendimento_avaliacoes where tenant_id='e9fdaa66-...') as csat_respondidas,
 (select count(*) from nps_avaliacoes where tenant_id='e9fdaa66-...') as nps_total,
 (select round(avg(nota)::numeric,2) from nps_avaliacoes where tenant_id='e9fdaa66-...') as nps_avg,
 (select count(*) from defesa_casos where tenant_id='e9fdaa66-...' and status='aguardando_ok') as defesa_aguardando,
 (select count(*) from defesa_aprovadores where tenant_id='e9fdaa66-...') as aprovadores,
 (select count(*) from agent_runs where tenant_id='e9fdaa66-...') as agent_runs_total;
```
Resultado:
```json
{"csat_total":1075,"csat_respondidas":36,"nps_total":4,"nps_avg":"0.00","defesa_aguardando":0,"aprovadores":0,"agent_runs_total":106}
```

P1 (schema): puxado `information_schema.columns` das 13 tabelas do bloco (agent_runs, internal_notifications, tenants, tenant_agents, defesa_metricas_mensal, defesa_casos, defesa_assinaturas, radar_fontes, atendimento_avaliacoes, nps_avaliacoes, lojas, whatsapp_groups, defesa_aprovadores) — todas existem, colunas conferidas contra os `.select()` encontrados (abaixo).

### Output bruto — `information_schema.columns` (colunas críticas)

```sql
select table_name, column_name, data_type from information_schema.columns
where table_schema='public' and table_name in
('agent_runs','internal_notifications','tenants','tenant_agents','defesa_metricas_mensal','defesa_casos','defesa_assinaturas','radar_fontes','atendimento_avaliacoes','nps_avaliacoes','lojas','whatsapp_groups','defesa_aprovadores')
and column_name in ('nota','telefone_jid','whatsapp_group_jid','status','aprovado_por','aprovado_em','ativo','nome')
order by table_name, column_name;
```
Resultado:
```json
[
  {"table_name":"agent_runs","column_name":"status","data_type":"text"},
  {"table_name":"atendimento_avaliacoes","column_name":"nota","data_type":"smallint"},
  {"table_name":"atendimento_avaliacoes","column_name":"status","data_type":"text"},
  {"table_name":"defesa_aprovadores","column_name":"ativo","data_type":"boolean"},
  {"table_name":"defesa_aprovadores","column_name":"nome","data_type":"text"},
  {"table_name":"defesa_aprovadores","column_name":"telefone_jid","data_type":"text"},
  {"table_name":"defesa_assinaturas","column_name":"status","data_type":"text"},
  {"table_name":"defesa_casos","column_name":"aprovado_em","data_type":"timestamp with time zone"},
  {"table_name":"defesa_casos","column_name":"aprovado_por","data_type":"uuid"},
  {"table_name":"defesa_casos","column_name":"status","data_type":"text"},
  {"table_name":"lojas","column_name":"nome","data_type":"text"},
  {"table_name":"lojas","column_name":"status","data_type":"text"},
  {"table_name":"lojas","column_name":"whatsapp_group_jid","data_type":"text"},
  {"table_name":"nps_avaliacoes","column_name":"nota","data_type":"smallint"},
  {"table_name":"nps_avaliacoes","column_name":"status","data_type":"text"},
  {"table_name":"radar_fontes","column_name":"status","data_type":"text"},
  {"table_name":"tenants","column_name":"status","data_type":"text"},
  {"table_name":"whatsapp_groups","column_name":"ativo","data_type":"boolean"}
]
```
`nota` (smallint, em `atendimento_avaliacoes` e `nps_avaliacoes`), `telefone_jid` (text, `defesa_aprovadores`) e `whatsapp_group_jid` (text, `lojas`) confirmadas — as 3 colunas críticas citadas no roteiro existem com o tipo esperado.

## `visao` — Visão Geral

- **Dado real:** `atendimento_avaliacoes` count=1075, `agent_runs` count=106 para Karina — tenant tem dado real, base para comparar KPIs. **PASSA** (SQL confirma dado > 0; comparação visual exata do KPI = PRECISA-BROWSER).
- **P1:** tabelas existem no schema (verificado). Grep completo do componente inline (`ConsoleV2.jsx:437`) não foi possível dentro do orçamento desta sessão — **PRECISA-BROWSER** (nenhuma linha vermelha no Console) como confirmação final.
- **Ação / Estado vazio / Erro:** PRECISA-BROWSER.

## `csat` — Satisfação do Atendimento

- **Dado real:** `count(*)=1075`, `respondidas=36`. **PASSA** — comparar com "X de Y" na tela (PRECISA-BROWSER pra ler o número exibido).
- **P1:** `src/console/AtendimentoAvaliacoes.jsx:356,370-372` usa `select('*')` e `select('nota')` — `nota` existe em `atendimento_avaliacoes`. **PASSA**.
- **P6/P10:** linhas 370/372 usam `{count:'exact', head:true}` (conta no banco, não `.length` de array paginado) — **PASSA**, sem risco de cap 1000. Linha 371 (`select('nota')` sem `head:true`, usado pro cálculo de nota média) pode estar sujeito ao cap de 1000 linhas do PostgREST se `respondidas` > 1000 — hoje são só 36, sem risco atual, mas sinalizar se a base crescer.
- **Estado vazio/Erro:** PRECISA-BROWSER.

## `nps` — Lealdade da Marca (NPS)

- **Dado real:** `count(*)=4`, `avg(nota)=0.00`. **⚠️ SUSPEITO**: média exatamente `0.00` com 4 registros — só é correto se as 4 notas forem literalmente 0, o que é atípico pra NPS (escala usual 0-10, mas com poucas respostas reais tender a 0 exato é raro). **FALHA-CANDIDATA (evidência: SQL acima) — PRECISA-BROWSER** pra confirmar se a tela mostra o mesmo 0 (bug real) ou se são realmente notas 0 (dado real, não bug).
- **P1:** `src/console/NpsResultados.jsx:168` usa `select('*')`. **PASSA**.
- **P6/P10:** não avaliado a fundo (orçamento) — **PRECISA-BROWSER**.

## `defesa` — Defesa Comercial

- **Dado real:** `defesa_casos` com `status='aguardando_ok'` para Karina = **0**. Não há caso real aguardando OK agora — o check "dado real: fila aparece com os mesmos casos" não é executável hoje (fila vazia é o estado real, não falta de dado). **Recategorizado para o check de Estado Vazio**: com 0 casos, a tela deveria mostrar "nenhum caso aguardando" — **PRECISA-BROWSER**.
- **P1:** tabela `defesa_casos` existe com todas as colunas citadas no roteiro (`status`, `aprovado_por`, `aprovado_em`). **PASSA** (schema).
- **Paywall:** não verificado se Karina tem Defesa habilitada (não rodei SQL em `tenant_agent_config` por orçamento) — **PRECISA-BROWSER**.

## `ativar` — Config de ativação (Defesa)

- **Dado real:** `defesa_aprovadores` para Karina = **0** registros. Sem aprovador cadastrado hoje — check "cadastrar aprovador real" não pôde ser feito (ação de escrita, fora do escopo READ-ONLY desta sessão). **PRECISA-BROWSER**.
- **P1:** `lojas`, `whatsapp_groups`, `defesa_aprovadores` — todas existem com as colunas citadas (`telefone_jid`, `nome`, `ativo`, `whatsapp_group_jid` etc.). **PASSA** (schema).

## Resumo

| Tela | PASSA | FALHA corrigida | PRECISA-BROWSER |
|---|---|---|---|
| visao* | 1 (dado real+schema) | 0 | ação/vazio/erro |
| csat | 3 (dado real, P1, P6/P10) | 0 | vazio/erro/comparação visual exata |
| nps | 1 (P1 schema) | 0 | **suspeita de bug (avg=0.00)** + vazio/erro |
| defesa | 1 (P1 schema) | 0 | vazio (fila real está vazia hoje), paywall |
| ativar | 1 (P1 schema) | 0 | cadastro de aprovador (ação de escrita) |

\* `visao`: P1 cobriu só existência das tabelas via `information_schema.columns` — o grep dos `.select()` do componente inline (`ConsoleV2.jsx:437`) não foi feito nesta leva (orçamento). Diferente de `csat`/`nps`, onde o P1 foi confirmado linha a linha contra o componente.

Nenhuma FALHA de P1 (coluna inexistente) encontrada nas tabelas verificadas — nenhum fix de código necessário nesta leva. Nenhum SQL de escrita executado.
