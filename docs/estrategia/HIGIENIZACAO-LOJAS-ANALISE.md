# ANÁLISE — Higienização `lojas`/`contatos` (Semana 2 · B3)

Status: **PRONTO PARA REVISÃO** — migration escrita e versionada, **NÃO aplicada**.
Branch: `wandson/higienizacao-lojas` | Brief: `.ao/briefs/brief-higienizacao-lojas.md`
Referência: `docs/estrategia/PLANO-CONTINUIDADE-PLATAFORMA-2026-07.md` §3 B3
Migration: `supabase/migrations/20260705_001_higienizacao_lojas_contatos.sql`

---

## 1. O problema

`lojas` guarda **1.178 linhas** (contagem ao vivo, 2026-07-05), mas só uma fração pequena
são lojas de consultoria de verdade. O resto entrou na tabela por sincronização de contatos
de WhatsApp (pessoas, fornecedores, leads, listas de transmissão) — mesma causa-raiz já
documentada no incidente 2026-06-11
(`supabase/migrations/20260611_001_lojas_is_consultoria_ativa.sql`):

> "a tabela `lojas` guarda TODOS os contatos de WhatsApp do Wandson (...), não só os clientes
> de consultoria."

Esse incidente já produziu um remendo pontual (`is_consultoria_ativa`, usado pelos gatilhos da
DELI). Esta análise vai além: separa fisicamente contato de loja com uma tabela nova
(`contatos`), sem apagar nada.

---

## 2. Achado não previsto no brief: `is_real_business` já existe e já está populada

Ao inspecionar o schema real (read-only, `execute_sql` no projeto `czyanilrverorwenikqw`) antes
de escrever o SQL, apareceu uma coluna que **não está em nenhuma migration versionada** deste
repo:

```
lojas.is_real_business boolean — 141 true / 1037 false / 0 null (contagem ao vivo 2026-07-05)
```

Rastro documental: `docs/infra/RUNBOOK-WANDSON.md` linha 76 registra que a coluna "já populado
(141 real / 1033 seed / 0 nulo)" em **2026-06-10**, para alimentar `admin-mcp/src/tools/cd_lojas.js`
(visão CEO do Hermes). `docs/evonexus-replica/FASE-1-mapeamento-multitenant.md` confirma a coluna
no dump de schema de 2026-06-06. **Nenhum arquivo em `supabase/migrations/` faz o
`ALTER TABLE ... ADD COLUMN is_real_business` nem o backfill.**

**Isso é um gap de processo** (viola o princípio "SQL versionado em git ANTES de aplicar" do
CLAUDE.md) cometido em sessão anterior. **Corrigido nesta própria migration** (revisão do
`ecc:database-reviewer` apontou que, sem isso, o arquivo quebra em qualquer ambiente que faça
replay completo das migrations do zero — `supabase db reset`, CI, staging): o SQL agora inclui
`ALTER TABLE lojas ADD COLUMN IF NOT EXISTS is_real_business boolean NOT NULL DEFAULT false`
antes do bloco de classificação. Em prod é **NO-OP** (coluna já existe, valores intocados); em
ambiente novo, cria a coluna com default `false`, tornando o arquivo replayável sem depender de
estado fora do git.

**Importante:** `is_real_business` **não é confiável sozinha** como critério (ver §3) — por
isso o critério final combina ela com sinais de atividade operacional.

---

## 3. Critério loja-real × contato (validado com output bruto em prod)

### 3.1 Por que não um único campo

Testei `is_real_business = false` isolado como critério de "contato" e achei **9 falsos
positivos** — linhas marcadas `is_real_business = false` que têm atividade operacional real:

| id | nome | is_real_business | is_consultoria_ativa | por que não é contato |
|---|---|---|---|---|
| 4307df64-… | LOJA DE TESTE - PLATAFORMA | false | false | linha de teste interna (tem sinal em outra tabela) |
| 47e34d2e-… | CONSULTORIA - Delícias Grill | false | **true** | consultoria ativa, store_tenant vinculado |
| 5899c79e-… | Pizzaria Lá Mazza | false | **true** | consultoria ativa, store_tenant vinculado |
| 793c95c7-… | CONSULTORIA - VILLAS PANELINHAS | false | **true** | consultoria ativa |
| 7706639b-… | CONSULTORIA MIKELLY CONTAINER | false | false | tem sinal operacional (histórico da onda-01) |
| 1d23f2f4-… | EQUIPE - CONSULT DELIVERY | false | false | linha interna com atividade |
| 47ea2d77-… | Smoke Onda 04 | false | false | linha de teste/smoke |
| 18f9563f-… | Smoke Onda 05 | false | false | linha de teste/smoke |
| fe5bca5f-… | Smoke Onda 05 v2 | false | false | linha de teste/smoke |

Ou seja: **3 lojas de consultoria ativa de verdade estariam sendo classificadas como contato**
se eu confiasse só em `is_real_business`. Isso teria sido um erro grave escondido dentro de uma
migration "aditiva".

Também achei o inverso: **97 linhas sem NENHUM sinal operacional mas marcadas
`is_real_business = true`** — provavelmente leads/prospects em pipeline que ainda não começaram
a operar. Essas **não** são contato (alguém já os classificou como negócio real), só ainda não
têm dado — ficam de fora do critério de movimentação.

### 3.2 Critério final (o que a migration usa)

Uma linha de `lojas` é classificada **`is_contato = true`** (copiada para `contatos`, mantida
em `lojas` só com a flag) **somente se as duas condições valem ao mesmo tempo**:

1. `is_real_business = false`
2. **Zero** sinal de atividade operacional em qualquer uma destas colunas/tabelas (todas
   referenciam `lojas.id`, evidência de origem entre parênteses):
   - `is_consultoria_ativa` (`20260611_001_lojas_is_consultoria_ativa.sql`)
   - `store_tenant_id` (`20260701_010_tenancy_fase1b_lojas_store.sql`)
   - `ifood_portal_nome` / `whatsapp_group_jid` (`20260702_003_lojas_portal_ifood.sql`)
   - `skill_criada` (`20260519_001_alter_lojas_piloto.sql`, módulo Campanhas)
   - `loja_metricas`, `loja_metricas_snapshot` (`20260504_003_memoria_central.sql`,
     `20260519_003_loja_metricas_snapshot.sql`)
   - `tarefas_loja` (`20260520_005_tarefas_loja.sql`)
   - `loja_gpt_conversations` (`20260521_001_loja_gpt_conversations.sql`)
   - `radar_series`, `radar_fontes` (`20260613_001_radar_fontes_metricas_captura.sql`,
     `20260620_001_radar_series.sql`)
   - `analises` (`20260502_analises.sql`)
   - `loja_whatsapp_vinculo` (schema atual, tabela de vínculo loja↔grupo)
   - `avaliacoes_loja_config` (`20260614_002_avaliacoes_config_seed_gate0.sql`)

Colunas descartadas por não discriminarem nada (testadas e rejeitadas com dado real):
- `status` — 1176/1178 linhas têm `status='ativo'` (contato e loja real usam o mesmo valor).
- `client_id` — 1171/1178 linhas têm `client_id` preenchido (toda sincronização de contato do
  WhatsApp cria também uma linha em `customers`; não distingue nada).
- `whatsapp` (coluna texto legada) — só 2 linhas em 1.178 a preenchem; inútil.
- nome parecendo telefone — 0 ocorrências; os nomes já vêm com display-name do WhatsApp.

### 3.3 Resultado (output bruto, `execute_sql` read-only, 2026-07-05)

```sql
-- contagem final do critério
with sinal_real as (
  select l.id from lojas l
  where l.is_consultoria_ativa or l.store_tenant_id is not null
     or l.ifood_portal_nome is not null or l.whatsapp_group_jid is not null
     or l.skill_criada is true
     or l.id in (select loja_id from loja_metricas)
     or l.id in (select loja_id from loja_metricas_snapshot)
     or l.id in (select loja_id from tarefas_loja)
     or l.id in (select loja_id from loja_gpt_conversations)
     or l.id in (select loja_id from radar_series)
     or l.id in (select loja_id from radar_fontes)
     or l.id in (select loja_id from analises)
     or l.id in (select loja_id from loja_whatsapp_vinculo)
     or l.id in (select loja_id from avaliacoes_loja_config)
)
select
  (select count(*) from lojas) as total,                                              -- 1178
  (select count(*) from sinal_real) as com_sinal_real,                                 -- 53
  (select count(*) from lojas l where l.id not in (select id from sinal_real)
     and l.is_real_business = false) as movidas_para_contatos,                        -- 1028
  (select count(*) from lojas l where not (l.id not in (select id from sinal_real)
     and l.is_real_business = false)) as mantidas_em_lojas;                            -- 150
```

**Resultado:** `total=1178` · `movidas_para_contatos=1028` · `mantidas_em_lojas=150`
(141 `is_real_business=true` + 9 seed-com-sinal protegidas pela regra 2).

⚠️ **Este número muda todo dia** (novos contatos de WhatsApp entram, novas lojas são
cadastradas). **Rode o bloco acima de novo em prod imediatamente antes de aplicar** a
migration e compare com este valor — se a diferença for grande (>5%), pare e investigue antes
de aplicar.

---

## 4. Consumidores de `lojas` no código (arquivo:linha, output bruto de grep)

Grep usado: `from('lojas')` / `from("lojas")` em `src/`, `bridge-server/`, `trigger/`.
`bridge-server/` — **zero ocorrências** (não consome `lojas` diretamente).

Como a migration **não apaga nenhuma linha** (só copia + marca `is_contato`), **nada quebra
hoje**. A tabela abaixo existe para o próximo passo (fora do escopo desta migration): decidir
quais telas devem passar a filtrar `is_contato = false` para não misturar contato com loja na
UI.

### 4.1 Já filtram por sinal real (não misturam contato hoje)

| Arquivo:linha | Filtro usado |
|---|---|
| `src/lib/api.js:215` (`listClientes`) | `is_consultoria_ativa = true` |
| `src/lib/api.js:639` (`listLojasConsultoria`) | `is_consultoria_ativa = true` |
| `src/lib/api.js:697` | `is_consultoria_ativa = true` |
| `src/lib/api.js:732`, `:760` | update por `id` — não lista |
| `src/console/Gestor.jsx:163` | `is_consultoria_ativa = true` |
| `src/console/GestorDashboard.jsx:71` | `is_consultoria_ativa = true` |
| `src/console/MiaAudit.jsx:30` | `is_consultoria_ativa = true` |
| `src/screens/ChatScreen.jsx:3982`, `:3987` | `is_consultoria_ativa = true` |
| `trigger/deli/orchestrator-5min.ts:120` (`metrica_caiu_20pct`) | `is_consultoria_ativa = true` (correção pós-incidente) |
| `trigger/gestor/coleta-diaria.ts:86` | `is_consultoria_ativa = true` |
| `trigger/gestor/relatorio-semanal.ts:108` | `is_consultoria_ativa = true` |
| `src/screens/campanhas/CampanhaForm.jsx:53` | `skill_criada=true` + `status='ativa'` (valor distinto de `'ativo'`) |
| `src/screens/campanhas/CampanhasDashboard.jsx:16` | `status='ativa'` |
| `src/screens/campanhas/LojaForm.jsx:24,83,86` | por `slug`/insert — módulo Campanhas separado |
| Lookups por `id`/`client_id` já conhecido (não listam, não afetados por volume): `trigger/max/escalonar.ts:42`, `trigger/max/diagnostico.ts:55`, `trigger/analise-loja/processar.ts:46`, `trigger/analise/gerar-relatorio.ts:91`, `trigger/estudio/gerar.ts:122`, `trigger/breno/responder.ts:115`, `trigger/breno/triagem-offhours.ts:113`, `trigger/_shared/loja-contexto.ts:68`, `trigger/deli/orchestrator-5min.ts:293`, `src/screens/lojas/LojaWorkspace.jsx:89`, `src/screens/lojas/TabAnalises.jsx:544` | — |

### 4.2 Listam/contam `lojas` sem filtrar sinal operacional (hoje misturam contato)

Nenhum destes quebra com a migration (nada é apagado). São o mapa para a decisão futura de
app (filtrar `is_contato = false`) — **fora do escopo desta migration**:

| Arquivo:linha | Filtro atual | Efeito hoje |
|---|---|---|
| `src/screens/campanhas/LojasList.jsx:13` | nenhum (`select('*')`, ordenado por `created_at`) | lista completa — o mais exposto, ~1000 contatos aparecem |
| `src/screens/campanhas/HistoricoCampanhas.jsx:20` | nenhum | idem |
| `src/screens/lojas/LojasListView.jsx:50` | `tenant_id` + `is_active=true` (quase todas têm `is_active=true`) | tela "Lojas" principal mistura contato |
| `src/screens/MiaAuditScreen.jsx:31` | `status='ativo'` (quase todas) | versão **legado** da tela — diverge de `src/console/MiaAudit.jsx` (já corrigida) |
| `src/console/AgenteAnalise.jsx:21` | `tenant_id` só | picker de loja mistura contato |
| `src/console/AnaliseLoja.jsx:23` | `tenant_id` só | idem |
| `src/console/AtivarLoja.jsx:51` | `tenant_id` só, `limit(30)` | picker de ativação |
| `src/console/ConsoleV2.jsx:129` | `tenant_id` + `ilike nome` | busca global pode achar contato como "loja" |
| `src/console/Estudio.jsx:58` | `is_active=true` (quase todas) | picker do Estúdio |
| `src/console/ImportarRelatorios.jsx:32` | `tenant_id` só | picker |
| `src/console/Lara.jsx:316` / `src/screens/LaraScreen.jsx:316` | `tenant_id` só (duplicado legado+cv2) | picker |
| `src/console/TarefasGlobais.jsx:97` | `tenant_id` só | picker |
| `src/console/PainelAvaliacoesConsultor.jsx:242` | `tenant_id` + `ilike nome`, `limit(1)` | risco baixo (busca por nome aproximado) |
| `src/screens/TasksScreen.jsx:97` | `tenant_id` só | picker |
| `src/screens/WhatsappVinculosScreen.jsx:36` | `status='ativo'` (quase todas) | tela de vínculo WhatsApp mistura contato hoje |

---

## 5. O que a migration faz (100% aditivo)

1. `CREATE TABLE contatos` (RLS por `accessible_tenant_ids()`, padrão atual do projeto) —
   cópia das linhas classificadas, com `loja_origem_id` apontando de volta pra `lojas.id`.
2. `ALTER TABLE lojas ADD COLUMN is_real_business ... DEFAULT false` (NO-OP em prod, fecha o
   gap do §2) + `ADD COLUMN is_contato boolean DEFAULT false` — só marca, não apaga.
3. `INSERT INTO contatos SELECT ...` das ~1.028 linhas do critério §3.2.
4. `UPDATE lojas SET is_contato = true` nas mesmas linhas.

**Nenhum `DELETE`/`DROP`/`TRUNCATE` de dado real.** Qualquer FK existente para `lojas.id`
continua íntegra porque a linha original nunca sai de `lojas`.

### Rollback (documentado também no cabeçalho do .sql)

```sql
DELETE FROM contatos;
DROP TABLE contatos;
UPDATE lojas SET is_contato = false;
ALTER TABLE lojas DROP COLUMN is_contato;
```

---

## 6. Plano de aplicação (Semana 2 — não executar ainda)

1. Rodar o bloco de diagnóstico §3.3 em prod de novo (dado muda todo dia) e comparar com
   1028/150 — se divergir muito, revisar o critério antes de seguir.
2. Revisar com o Wandson a lista dos 9 casos-fronteira (§3.1) e os 97 leads sem atividade —
   confirmar que nenhum deveria ir para `contatos`.
3. Aplicar a migration (1 arquivo, output bruto do `INSERT`/`UPDATE`).
4. Validar pós-aplicação: `select count(*) from contatos`, `select count(*) from lojas where
   is_contato` (devem bater), e que nenhuma das 16 lojas piloto/GESTOR ficou com
   `is_contato=true`.
5. **Fora desta migration** (decisão separada, Semana 3+): decidir quais telas da §4.2 passam
   a filtrar `is_contato = false` — é mudança de app, não de banco.

---

## 7. Riscos

- **Critério pode ficar desatualizado** entre esta análise e a aplicação (novos contatos
  entram todo dia via sync de WhatsApp) → mitigado pelo passo 1 do plano de aplicação.
- **`is_real_business` sem migration de origem** (§2) — gap de processo pré-existente,
  registrado, não corrigido aqui para não misturar escopo.
- **Falso-negativo residual**: uma loja real sem NENHUM sinal operacional e com
  `is_real_business` incorretamente `false` ficaria classificada como contato. Mitigado por
  ser meramente aditivo (a linha original continua em `lojas`; reverter é um `UPDATE
  is_contato=false` + `DELETE` da cópia em `contatos`, não uma restauração de backup).
