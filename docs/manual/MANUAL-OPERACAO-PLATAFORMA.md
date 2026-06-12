# 📖 MANUAL DE OPERAÇÃO DA PLATAFORMA — Consult Delivery

> **Pra quem é:** Wandson e Lorena. Linguagem de operador — sem jargão de programador.
> **O que é:** o nível operacional ABAIXO do plano M2 (`docs/estrategia/M2-plano-90-dias.md`). O M2 diz *o que* fazer nos 90 dias; este manual diz *como apertar os botões*.
> **Base factual:** auditoria M1 (`docs/auditoria/AUDITORIA-PLATAFORMA-2026-06.md`, 2026-06-11) + leitura direta do código em 2026-06-12. Cada recurso aponta a tela/arquivo real.
> **Regra de honestidade:** se algo está parado, quebrado ou é só casca, está escrito aqui. Nada enfeitado.
> **Limite herdado da auditoria:** a verificação foi por código + banco de dados, não clicando cada tela num navegador logado. O que está marcado "✅ funcionando" tem evidência de runs/dados reais; o que está "⚠️" tem ressalva explícita.

**Onde tudo acontece:** `https://app.consultdelivery.com.br` → Console v2 (menu lateral). Cada tela tem um "id de seção" (ex.: `aprovacoes`) — é assim que ela é citada neste manual. O mapa completo das ~41 telas está cabeado em `src/console/ConsoleV2.jsx:566-605`.

**Horários:** os robôs agendados (crons) rodam em UTC. Neste manual todo horário já está convertido pra **Brasília (UTC−3)**, com o cron literal ao lado como evidência.

---

## ÍNDICE

- **[Parte 1A](#parte-1a--catálogo-de-telas-console-v2)** — Catálogo de telas (Console v2)
- **[Parte 1B](#parte-1b--catálogo-de-agentes)** — Catálogo de agentes (quem roda sozinho, quando, e o que produz)
- **[Parte 2](#parte-2--automação-por-processo)** — Automação por processo (tabela: manual hoje → automatizado)
- **[Parte 3](#parte-3--receitas-ponta-a-ponta)** — Receitas ponta a ponta (playbooks)
- **[Parte 4](#parte-4--o-que-não-dá-ainda-lista-honesta)** — O que NÃO dá ainda (lista honesta)

---

# PARTE 1A — CATÁLOGO DE TELAS (Console v2)

As telas estão agrupadas por uso, não pela ordem do menu. Formato de cada item:
**O que é** → **Como eu uso** → **Estado real** → **Exemplo na CD**.

## Grupo 1 — As 4 telas do dia a dia (80% da operação)

### `aprovacoes` — Aprovações Unificadas
- **O que é:** a fila única de TUDO que os agentes propuseram e está esperando um humano dizer sim ou não — mensagens de BRENO/LARA/MIA (tabela `agent_drafts`) e casos da Defesa (`defesa_casos`) no mesmo lugar.
- **Como eu uso:** Console → Aprovações. Cada item mostra o texto proposto; dá pra **aprovar**, **editar antes de aprovar** ou **rejeitar**. Aprovou → o sistema envia; rejeitou → morre ali.
- **Estado real:** ✅ funcionando (`src/console/CvNovas.jsx:176-274`). É o coração da regra de ouro: **nenhuma mensagem sai pra cliente sem passar aqui** (exceção: canal interno Telegram/painel, que vai direto porque é pra equipe).
- **Exemplo na CD:** rotina das 08h do M2 — Wandson abre, revisa o lote da noite (respostas do BRENO fora de horário, sugestões da MIA), aprova em sequência. 10–15 min.

### `visao` — Visão Geral
- **O que é:** painel de KPIs dos últimos 30 dias — execuções de agentes, casos de Defesa, sinais do Radar.
- **Como eu uso:** primeira tela depois das aprovações. Olhar se os números estão no padrão (runs rodando, nada vermelho).
- **Estado real:** ✅ funcionando (`src/console/ConsoleV2.jsx:333-376`, lê `agent_runs` + defesa + radar).
- **Exemplo na CD:** "o BRENO rodou 807 vezes essa semana?" — se o número despencar, algo quebrou (foi assim que se pegou o apagão de créditos de 29/05).

### `tarefas` — Tarefas (kanban por loja)
- **O que é:** o gerenciador de tarefas da operação (tabela `tenant_tarefas`) — o que precisa ser feito em qual cliente, com status.
- **Como eu uso:** criar/editar/concluir tarefa pela tela (CRUD completo). As tarefas também nascem sozinhas: o BRENO extrai pendências das conversas de WhatsApp a cada 30 min (`trigger/breno/task-extractor.ts:8`).
- **Estado real:** ✅ funcionando (CRUD via `CrudTela` em `src/console/CvNovas.jsx`). O fluxo completo de execução com validação (aprovar → iniciar → submeter → concluir, inclusive revisão pelo celular) existe no Bridge (`bridge-server/routes/tarefas.js`) — 61 tarefas reais já passaram por ele (auditoria, sessão 35).
- **Exemplo na CD:** segunda-feira de planejamento (M2 §2.3): listar tarefas da semana por loja e distribuir.

### `chat` — Chat ao Vivo (WhatsApp)
- **O que é:** a central de atendimento WhatsApp dentro do Console — todas as conversas que entram pela Evolution API.
- **Como eu uso:** responder cliente direto (texto, mídia, áudio), etiquetar conversa, transferir, fixar. Comandos `/tarefa` e `/handoff` dentro do chat criam tarefa/passagem a partir da conversa.
- **Estado real:** ✅ funcionando (ChatScreen completo, reaproveitado do console clássico; comandos cabeados no Bridge `bridge-server/index.js:473` `/chat/ai`).
- **Exemplo na CD:** durante o dia, só entrar no que o BRENO escalou — o resto ele triou sozinho.

## Grupo 2 — Defesa Comercial iFood (o produto F1, R$147/loja/mês)

### `defesa` — Defesa (fila de casos)
- **O que é:** fila de contestações iFood (cancelamentos, avaliações ruins) que o robô-vigia detectou e preparou defesa.
- **Como eu uso:** casos chegam com status "aguardando ok" → revisar o texto da defesa → **aprovar** ou **descartar** → marcar como **enviado** e depois **ganho/perdido com o valor em R$** (isso alimenta o KPI de dinheiro recuperado).
- **Estado real:** ✅ funcionando (`src/console/ConsoleV2.jsx:378-535`). Se o tenant não tem Defesa habilitada em `tenant_agents`, a tela vira paywall (R$147/loja/mês).
- **Exemplo na CD:** cancelamento injusto numa loja → caso aparece em ~5 min (vigia roda `*/5`, `trigger/defesa/vigia.ts:40`) → aprovar a defesa → enviar no iFood → registrar "ganho R$ 87".
- **Atalho WhatsApp:** dentro do grupo da loja, quem está na lista de aprovadores pode responder **`@defesa ok`** (aprova) ou **`@defesa descartar`** — sem abrir o Console.

### `ativar` — Ativar Loja (onboarding de loja)
- **O que é:** o assistente de entrada de uma loja nova na operação.
- **Como eu uso:** preencher dados da loja → o sistema qualifica pra Defesa (critério: ≥300 pedidos ou ≥6 cancelamentos) → vincular o grupo de WhatsApp da loja → definir quem pode aprovar via `@defesa`.
- **Estado real:** ✅ funcionando (`src/console/AtivarLoja.jsx:26-226`).
- **Exemplo na CD:** ver a Receita 1 (cliente novo) na Parte 3.

## Grupo 3 — Conteúdo e marketing (frente da Lorena)

### `estudio` — Estúdio (geração de arte)
- **O que é:** fábrica de artes com IA: você escreve um brief, a IA gera a imagem + legenda.
- **Como eu uso:** escrever o brief → entra na fila (`estudio_criacoes`) → o robô processa a cada 2 min (`trigger/estudio/gerar.ts:91`) → a tela atualiza sozinha (poll de 5s) → revisar → **aprovar/enviar como rascunho**. O Brand Guard força PT-BR, zero emoji e "oferta" (nunca "promoção"). **Nunca publica direto.**
- **Estado real:** ✅ religado (B-04 corrigido, PR #195 — model `openai/gpt-5.4-image-2`). ⚠️ **Depende do saldo OpenRouter, que está em $2.81 (abaixo do piso $5) — recarga pendente.** Sem crédito, a geração de imagem para de novo.
- **Exemplo na CD:** "arte de oferta de quinta pra loja X, hambúrguer artesanal, fundo escuro" → 2–4 min depois a arte está pronta pra Lorena revisar (`src/console/Estudio.jsx:39-289`).

### Telas de apoio ao conteúdo
- **`modelos`** — templates de mensagem/post reutilizáveis (CRUD ✅).
- **`topicos`** — pauta de assuntos por tenant (CRUD ✅, tabela `tenant_topicos`).
- **`arquivos`** — arquivos por tenant com upload pro storage (`tenant_files` + bucket `tenant-files`, CRUD ✅).
- **`links`** — links úteis por tenant (CRUD ✅, `tenant_links`).

## Grupo 4 — Análise de loja iFood (frente consultiva)

### `radar` — Radar
- **O que é:** o monitor de saúde das lojas — métricas e anomalias (queda de pedidos, avaliação caindo).
- **Como eu uso:** olhar no ritual das 08h15. Sinal vermelho = ligar pro cliente ANTES dele reclamar (a consultoria que liga antes é a que renova — M2 F1).
- **Estado real:** ✅ funcionando (`src/console/RadarReal.jsx:24-125`). Diagnóstico semanal automático toda segunda 5h (`trigger/radar/diagnostico-semanal.ts:26`).

### `importar` — Importar Relatórios
- **O que é:** a porta de entrada de dados do iFood: você sobe planilha ou print do portal do parceiro.
- **Como eu uso:** upload → arquivo vira registro em `radar_fontes` → um robô processa a cada 5 min (`trigger/radar/processar-fontes.ts:169`) e transforma em métricas (`radar_metricas`) que alimentam o Radar.
- **Estado real:** ✅ funcionando.
- **Exemplo na CD:** quarta-feira de revisão de métricas (M2 §2.3): subir o relatório semanal do iFood de cada conta Performance → 15 min/cliente com os números prontos.

### Aba "Análises" da loja (fora do Console v2)
- **O que é:** dentro do workspace de cada loja (console clássico, aba 7 "Análises" — `src/screens/lojas/TabAnalises.jsx`, 1380 linhas) ficam as análises completas de loja: criar análise nova, enviar por WhatsApp, sessão de aprovação do cliente, relatório em markdown, vídeo Loom embutido.
- **Estado real:** ✅ provado em produção: 15 análises (3 enviadas a cliente) e **137 aprovações/rejeições de clientes processadas via WhatsApp** (auditoria sessão 35).

## Grupo 5 — Gestão dos agentes

### `catalogo` — Painel de Agentes
- **O que é:** o catálogo global de agentes com liga/desliga por tenant (`tenant_agents`) + configuração fina (prompt customizado, modelo de IA, tamanho de resposta).
- **Como eu uso:** habilitar um agente pra um cliente = 1 toggle. Agente desabilitado fica invisível pro tenant.
- **Estado real:** ✅ funcionando.

### `config` — Configuração de Agente (modo de autonomia)
- **O que é:** define POR AGENTE o modo de operação: **Humano** (agente não responde nada), **Híbrido** (agente propõe, humano aprova) ou **IA** (agente responde sozinho — só onde for seguro).
- **Como eu uso:** o BRENO lê isso antes de cada resposta (`tenant_agent_config`).
- **Estado real:** ✅ funcionando.
- **Exemplo na CD:** BRENO em Híbrido = toda resposta dele vira draft na fila de aprovações.

### `acesso` — Acesso de Usuários
- **O que é:** quem da equipe pode invocar cada agente, ver histórico e aprovar drafts (`user_agent_access`: can_invoke / can_view_history / can_approve_drafts).
- **Estado real:** ✅ funcionando.
- **Exemplo na CD:** dar à Lorena o poder de aprovar drafts da LARA e do Estúdio, sem acesso à Defesa.

### `atividade` — Execuções
- **O que é:** o histórico bruto de tudo que os agentes rodaram (`agent_runs`), com filtros e expansão do que entrou/saiu de cada run.
- **Como eu uso:** quando algo parece errado ("o BomDia não saiu hoje?"), olhar aqui primeiro: o run existe? deu `success` ou `failed`? O erro está no output.
- **Estado real:** ✅ funcionando. ⚠️ Pegadinha conhecida: o orquestrador da DELI loga como `agent_id='deli'` (não "orchestrator").

### `custos` — Custos de IA
- **O que é:** quanto cada agente está gastando de IA.
- **Como eu uso:** revisão mensal (M2 §2.3) — custo por agente vs. valor entregue.
- **Estado real:** ✅ funcionando.

### `gatilhos` — Gatilhos da DELI
- **O que é:** as regras que a DELI vigia (ex.: "cliente sumiu 7 dias", "métrica caiu 20%") — tabela `tenant_gatilhos`/`deli_triggers`.
- **Como eu uso:** ligar/desligar regra, ajustar limiar. A DELI avalia a cada 30 min e o que disparar vira pendência de aprovação.
- **Estado real:** ✅ CRUD funcionando. ⚠️ Os gatilhos monitoram só lojas marcadas `is_consultoria_ativa` (correção do incidente dos 1000 contatos, PR #308) — **loja de consultoria nova precisa dessa marcação, senão a DELI não a vigia** (ver Receita 1).

### `habilidades` — Habilidades de agentes
- **O que é:** skills extras por agente (`agent_skills`, CRUD ✅).

## Grupo 6 — Plataforma e clientes de revenda

### `clientesplat` — Clientes da Plataforma
- **O que é:** gestão de tenants (clientes que usam a plataforma): criar tenant, convidar usuário (e-mail de convite via Bridge `POST /api/users/invite`), ligar Defesa, vincular assinatura Asaas.
- **Estado real:** ✅ funcionando. Hoje só existe o tenant da CD — o segundo tenant real é meta da onda 3 do M2.

### `cobranca` — Cobrança / Inadimplentes
- **O que é:** painel de inadimplência (tela `InadimplentesScreen`), alimentado pelo Asaas: a sincronização de cobranças roda a cada 2h (`trigger/asaas/sync-charges.ts:15`) e o webhook do Asaas atualiza status na hora (pagamento confirmado → "em dia"; vencido → "atrasado"; `bridge-server/routes/asaas-webhook.js`).
- **Estado real:** ✅ os dados entram sozinhos. ⚠️ A **ação** de cobrar é manual hoje: a CORA (agente de cobrança) está **parada desde 15/05** (POC — decisão de produto pendente; M2 recomenda religar só em modo propõe-e-aprova).

### Telas que são só casca (não usar ainda)
- **`provedores`, `integracoes`, `sistemas`** — existem no menu mas são **somente leitura / estado vazio**, sem CRUD (`src/console/CvNovas.jsx:442-481`). Não há o que operar nelas hoje.

## Grupo 7 — Telas de visão e memória (reaproveitadas do console clássico)

| Tela (id) | O que é | Estado |
|---|---|---|
| `deli` | Painel da DELI — feed de pendências e ações da orquestradora | ✅ |
| `crm` | Pipeline CRM (leads/prospects — frente SOFIA/Lorena) | ✅ |
| `lojas` | Lista/workspace das lojas (inclui aba Análises — Grupo 4) | ✅ |
| `mia` | Sugestões da MIA sobre conversas monitoradas | ✅ |
| `memoria` | Memória central por loja (`client_facts` / `client_timeline`) — o histórico imutável de tudo que foi feito; munição de renovação | ✅ |
| `conhecimento` | Base de conhecimento (alimenta BRENO/MAX) | ✅ |
| `metas` | Metas por loja | ✅ |
| `heartbeats` | Pulso de rotinas automáticas | ✅ |
| `inbox` | Caixa de notificações internas (o "sino" — é aqui que chega o alerta de saldo OpenRouter) | ✅ |
| `configsys` / `construtor` | Configurações do sistema / construtor de agentes | ⚠️ uso avançado, mexer só com contexto |

> ⚠️ As descrições deste Grupo 7 vêm do mapeamento de código; algumas dessas telas legadas não tiveram cada botão verificado um a um na auditoria. Na dúvida, o estado de verdade é o que a tela mostra + a tela `atividade`.

---

# PARTE 1B — CATÁLOGO DE AGENTES

Formato: **o que faz** → **quando roda** → **estado real (com números)** → **como eu uso**.

### DELI — COO digital (orquestradora)
- **O que faz:** vigia os gatilhos (`deli_triggers`) e transforma o que disparou em pendência de aprovação (`deli_pending_approvals`) — com trava anti-spam (dedup + máximo 5 itens por gatilho por ciclo). **Nunca fala com cliente.** Semáforo: verde = executa e reporta; amarelo = propõe e você aprova com `ok`; vermelho = aprovação explícita.
- **Quando roda:** a cada 30 min (`trigger/deli/orchestrator-5min.ts:295`, cron `*/30 * * * *`; kill-switch de emergência `DELI_ORCHESTRATOR_DISABLED`).
- **Estado real:** ✅ NO AR — 50 runs success/36h (B-01 fechado). ⚠️ Dois rituais dela estão **PAUSADOS de propósito** desde o incidente de spam de 26/05: `deli-revisao-matinal` e `deli-briefing-7h` (cron impossível `0 0 29 2 1` — `trigger/deli/revisao-matinal.ts:30`, `trigger/deli/briefing-7h.ts:24`). Religar é decisão GATED.
- **Como eu uso:** não uso "a DELI" diretamente — eu uso a tela `deli`/`aprovacoes` onde as propostas dela aparecem, e a tela `gatilhos` pra ajustar o que ela vigia.

### BRENO — atendimento e suporte (o cavalo de batalha)
- **O que faz:** responde/tria conversas de WhatsApp. Respeita o modo Humano/Híbrido/IA da tela `config`. Tem plantão fora de horário (`triagem-offhours`, gate de horário em `trigger/_shared/offhours.ts` — fuso America/Belem), monitor de renovações (diário 8h, `trigger/breno/renewal-monitor.ts:9`) e extrator de tarefas das conversas (a cada 30 min, `trigger/breno/task-extractor.ts:8`).
- **Estado real:** ✅ o agente mais ativo da casa — **807 runs success/7d** (auditoria).
- **Como eu uso:** deixo rodar. Minha parte é aprovar os drafts dele (modo Híbrido) e atender só o que ele escalar.

### VERA — BI e relatórios
- **O que faz:** snapshot diário das métricas (6h, `trigger/vera/snapshot-diario.ts:32`), relatório diário (7h, `trigger/vera/relatorio-diario.ts:40`), **relatório semanal toda segunda 8h** (`trigger/vera/relatorio-semanal.ts:41`) e detector de anomalias a cada 4h (`trigger/vera/detectar-anomalia.ts:54` → grava em `vera_anomalias`).
- **Estado real:** ✅ rodando — 83 runs/7d. ⚠️ O relatório existe; o que falta é o **ritual de entregar ao cliente** (onda 1 do M2: 3 clientes piloto).
- **Como eu uso:** segunda de manhã o resumo da semana anterior já existe → revisar → transformar em mensagem de valor pro cliente (sexta, M2 §2.3) → aprovar e enviar.

### BomDia — resumo matinal automático por loja
- **O que faz:** gera arte + mensagem de bom dia e envia pros grupos das lojas. Dois passos: gera a imagem 8h55 (seg–sex, `trigger/bom-dia/gerar-imagem.ts:877`; sáb 7h55, `:890`) e envia 9h (seg–sex, `trigger/bom-dia/envio-agendado.ts:326`; sáb 8h, `:355`). Envio passa pelo Bridge (`bridge-server/index.js:773`).
- **Estado real:** ✅ rodando (6 runs + 10 do scheduler/7d). ⚠️ Atenção: o plano M2 cita "~07h", mas o cron real em produção é **9h Brasília** (12h UTC). ⚠️ A imagem depende do saldo OpenRouter ($2.81 — recarga pendente).
- **Como eu uso:** não preciso fazer nada — conferir no grupo se saiu, e na tela `atividade` se falhou.

### Encerramento — fechamento do dia por loja
- **O que faz:** mensagem de fechamento do dia nos grupos. Roda **18h Brasília** seg–sex (`trigger/encerramento/envio-agendado.ts:296`, cron `0 21 * * 1-5` UTC) e sábado 12h (`:325`). Pula feriados (lista fixa no código). Envio via Bridge (`bridge-server/index.js:838`).
- **Estado real:** ✅ rodando (6 runs + 12 scheduler/7d). ⚠️ M2 cita "~21h", mas o cron real é 18h Brasília. ⚠️ Mesmo risco de saldo OpenRouter.

### Estúdio — fábrica de arte (ver tela `estudio` no Grupo 3)
- **O que faz:** processa a fila de briefs a cada 2 min (`trigger/estudio/gerar.ts:91`). Brand Guard: PT-BR, zero emoji, "oferta" (não "promoção"). Nunca publica direto.
- **Estado real:** ✅ religado pós B-04; ⚠️ refém do saldo OpenRouter.

### MIA — monitora de conversas
- **O que faz:** a cada 15 min (`trigger/agents/monitor-conversas-15min.ts:111`) lê as conversas dos grupos marcados pra monitorar (`loja_whatsapp_vinculo.monitorar=true`, mínimo 3 mensagens novas) e gera sugestões (`sugestoes_ia`). Tudo auditado (`mia_audit_log`). Usa Ollama Cloud com fallback Anthropic.
- **Estado real:** ✅ rodando.
- **Como eu uso (Lorena):** revisar as sugestões marcadas como relevantes a cada ciclo — tela `mia`.

### SOFIA — SDR / prospecção
- **O que faz:** pesquisa prospects com IA + busca na web (`trigger/sofia/pesquisar-prospect.ts` → tabela `prospects`), roda batch diário 9h seg–sex (`trigger/sofia/sofia-prospect.ts:37`), gera abordagem e qualifica.
- **Estado real:** ✅ código rodando (5 runs/7d). ⚠️ **Falta o que o M2 chama de "feature pequena": fonte de leads + cadência configurada.** Hoje ela produz pesquisa/abordagem, mas o pipeline contínuo não está armado.
- **Como eu uso:** ver Receita 8. As abordagens dela viram drafts — nada sai sem aprovação.

### LARA — CRM food service + régua de relacionamento
- **O que faz:** gera conteúdo de relacionamento (2–3 variações com CTA, sempre como draft), com agenda editorial seg/qua/sex 9h (`trigger/lara/lara-gerar-conteudo.ts:24`), pesquisa de loja e análise de tendência. Endpoints de revisão/publicação no Bridge (`bridge-server/routes/lara.js` — aprovar draft → `content_published`).
- **Estado real:** ✅ código no ar. ⚠️ **A régua (drip por cliente) existe mas não está configurada em nenhum tenant** — é o item 4 da onda 1 do M2 (configurar 1 tenant piloto). Refs: `docs/fluxos/lara-regua.md`.

### CORA — cobrança inteligente
- **O que faz (quando ligada):** analisa devedor, gera mensagem de cobrança (Claude Haiku), cria cobrança, escalona.
- **Estado real:** 🔴 **PARADA desde 15/05** (POC — esperado; auditoria). Decisão de produto pendente. M2 recomenda religar **só leitura + draft** (propõe cobrança, humano envia). Enquanto isso, cobrança é manual via tela `cobranca` + Asaas.

### Defesa (vigia + analista) — o robô do produto F1
- **O que faz:** o vigia roda a cada 5 min (`trigger/defesa/vigia.ts:40`) detectando menção `@defesa`, cancelamentos e avaliações ruins → abre caso em `defesa_casos`; o analista monta a defesa. Comandos no grupo: `@defesa ok` / `@defesa descartar` (só quem está na lista `defesa_aprovadores`). Assinaturas Asaas do produto sincronizam sozinhas (`trigger/asaas/defesa-sync-assinaturas.ts:16` a cada 15 min; criação `defesa-criar-assinatura.ts:16` a cada 5 min).
- **Estado real:** ✅ rodando (3 runs/7d).

### MAX — consultor técnico (suporte aos sistemas revendidos)
- **O que faz:** diagnóstico técnico consultando a base `max_knowledge_base` + Claude, gera tutorial, escalona.
- **Estado real:** ⚠️ código existe (`trigger/max/`), mas é da fileira "futuro" — sem runs relevantes na auditoria. A frente F2 do M2 (BRENO respondendo nível 1 de sistemas revendidos) depende de **alimentar a base de conhecimento**, não de código novo.

### Outros robôs de bastidor (rodam sozinhos, ninguém opera)
| Robô | Quando | O que faz |
|---|---|---|
| `radar-processar-fontes` | a cada 5 min (`trigger/radar/processar-fontes.ts:169`) | transforma upload em métrica |
| `radar-diagnostico-semanal` | seg 5h (`trigger/radar/diagnostico-semanal.ts:26`) | diagnóstico semanal das lojas |
| `analise-loja` / `cardapio` / `multicanal` | a cada 5 min (filas) | processam pedidos de análise/cardápio/multicanal (1 run cada/7d — pouco usados ainda) |
| `onboarding-verificar-marcos` | diário 6h (`trigger/onboarding/automacao.ts:118`) | acompanha marcos de onboarding |
| `asaas-sync-charges` | a cada 2h (`trigger/asaas/sync-charges.ts:15`) | sincroniza cobranças Asaas |
| `heartbeat-runner` | a cada 1 min | pulso das rotinas (tela `heartbeats`) |
| `supabase-backup-diario` | 2h da manhã | backup do banco |
| NOVA (discovery/estimate/blueprint) | sob demanda | gera escopo/orçamento/blueprint de projeto |
| loja-gpt-responder | sob demanda | responde como "GPT da loja" |

### Hermes — copiloto do CEO no Telegram
- **O que faz hoje (3A ✅):** conversas de gestão no Telegram (@DeliConsultBot).
- **O que NÃO faz ainda (3B 🔴):** "enxergar" a CD — status das lojas, runs, inadimplência via admin MCP. O código do MCP está pronto e testado offline (`admin-mcp/`, 6 tools de leitura + 1 de propor draft), **mas o registro no gateway depende de credencial que só o Wandson pode colocar** (2 comandos no `admin-mcp/README.md`; lembrete: handshake "7 tools" não prova credencial — provar com `npm run live-smoke`).

---

# PARTE 2 — AUTOMAÇÃO POR PROCESSO

A tabela que importa: pra cada processo da CD, como é manual hoje, o que a plataforma já automatiza e o que falta apertar.

| Processo | Como faço hoje (manual) | Como a plataforma automatiza | Recurso/agente (evidência) | O que falta |
|---|---|---|---|---|
| **Atendimento/suporte (horário comercial)** | Responder WhatsApp no celular, um a um | BRENO tria e responde conforme modo Humano/Híbrido/IA; você só pega o escalado | BRENO (`trigger/breno/responder*`), tela `chat`, modo na tela `config` | Nada — escolher o modo por agente e rodar |
| **Atendimento fora de horário** | Cliente espera até o dia seguinte (ou você responde de madrugada) | Triagem off-hours automática com gate de fuso (`America/Belem`) | `trigger/breno/triagem-offhours` + `trigger/_shared/offhours.ts:1`; Bridge `index.js:1546` | Nada |
| **Gestão de tarefas por loja + lembretes + histórico** | Lembrar de cabeça / anotar fora do sistema | Kanban por loja; BRENO extrai tarefas das conversas a cada 30 min; fluxo aprovar→executar→validar com histórico; timeline imutável por loja | telas `tarefas` + `memoria`; `trigger/breno/task-extractor.ts:8`; `bridge-server/routes/tarefas.js` | Disciplina de uso (alimentar timeline em toda interação — onda 1 M2) |
| **Análise de loja iFood + dashboards** | Abrir portal do iFood, montar análise na mão | Upload do relatório → métricas automáticas → Radar com anomalias → análise completa com envio e aprovação do cliente por WhatsApp | telas `importar`/`radar`; `trigger/radar/processar-fontes.ts:169`; aba Análises (`src/screens/lojas/TabAnalises.jsx`) | Nada estrutural — virar ritual de quarta (M2 §2.3) |
| **Follow-up / régua WhatsApp / ofertas / fidelização** | Mandar mensagem avulsa quando lembra | LARA gera conteúdo de régua (drafts, agenda seg/qua/sex 9h); DELI vigia "cliente sumiu 7d" e propõe ação a cada 30 min | LARA (`trigger/lara/lara-gerar-conteudo.ts:24`); gatilhos DELI (`trigger/deli/orchestrator-5min.ts:295`) | **Configurar a régua em 1 tenant piloto** (onda 1 M2 item 4) + marcar `is_consultoria_ativa` nas lojas certas |
| **Conteúdo: posts, legendas, artes** | Canva na mão / encomendar arte | Estúdio gera arte+legenda de um brief em ~2–4 min; LARA gera variações de copy; BomDia gera arte diária sozinho | telas `estudio`/`modelos`; `trigger/estudio/gerar.ts:91`; `trigger/bom-dia/*` | **Recarregar OpenRouter ($2.81 < $5)** — sem isso a frente de imagem toda para |
| **Vídeo** | Gravar Loom na mão | Só embute Loom na análise (TabAnalises) — **não gera vídeo** | — | Geração de vídeo não existe (HEYGEN_API_KEY está no Infisical, mas sem fluxo cabeado — não prometer) |
| **Prospecção** | Procurar lead no Google/Instagram, abordar na mão | SOFIA pesquisa prospect com IA+web, qualifica e redige abordagem (draft); batch diário 9h | SOFIA (`trigger/sofia/sofia-prospect.ts:37`, `pesquisar-prospect.ts`) ; tela `crm` | **Fonte de leads + cadência** (feature pequena, G7) |
| **Cobrança / inadimplência** | Olhar Asaas, cobrar no WhatsApp manualmente | Dados entram sozinhos (sync 2h + webhook em tempo real); painel pronto. A ação de cobrar seria da CORA | tela `cobranca`; `trigger/asaas/sync-charges.ts:15`; `bridge-server/routes/asaas-webhook.js` | **Decisão de produto: religar CORA em modo propõe-e-aprova** (parada desde 15/05) |
| **Reuniões e resumo semanal pro cliente** | Montar resumo na mão (ou não mandar — valor invisível = churn) | VERA gera o resumo toda segunda 8h; timeline da loja vira "o que fizemos em 90 dias" | VERA (`trigger/vera/relatorio-semanal.ts:41`); tela `memoria` | **Ritual de entrega**: revisar→aprovar→enviar a 3 pilotos (onda 1 M2) |
| **Base de conhecimento + especialistas** | Saber de cabeça / perguntar pro Wandson | Tela `conhecimento` alimenta BRENO; analise-loja é o especialista iFood; MAX é o esqueleto do especialista técnico | telas `conhecimento`/`topicos`/`arquivos`; `trigger/max/` | **Alimentar a base com FAQs dos sistemas revendidos** (F2 M2); especialistas novos = Oracle (só spec aprovada, sem código) |
| **Suporte aos sistemas que a CD revende** | Wandson responde tudo | BRENO nível 1 lendo a base de conhecimento; MAX pra diagnóstico técnico | BRENO + `max_knowledge_base` | Mesma de cima: conteúdo na base, não código |
| **Cobrança do produto Defesa (assinaturas)** | — | 100% automática: cria e sincroniza assinatura Asaas sozinha | `trigger/asaas/defesa-criar-assinatura.ts:16` (5 min) e `defesa-sync-assinaturas.ts:16` (15 min) | Nada |

---

# PARTE 3 — RECEITAS PONTA A PONTA

## Receita 1 — Cliente novo de consultoria entrou
1. **Console → `ativar` (Ativar Loja):** cadastrar a loja; o assistente qualifica pra Defesa (≥300 pedidos ou ≥6 cancelamentos) — `src/console/AtivarLoja.jsx:26-226`.
2. **Vincular o grupo de WhatsApp** da loja (na mesma tela) e definir os aprovadores `@defesa`.
3. **Marcar a loja como consultoria ativa** (`lojas.is_consultoria_ativa`) — sem isso a DELI **não vigia** essa loja (gatilhos filtram por essa flag). Hoje a marcação segue a convenção de nome `CONSULTORIA -`/`CST`; confirmar na tela `lojas`.
4. **Console → `catalogo`:** habilitar os agentes pra esse contexto (BRENO, MIA, Defesa se qualificou).
5. **Console → `config`:** definir o modo do BRENO (recomendado começar em **Híbrido**).
6. **Console → `gatilhos`:** conferir os gatilhos ativos pra loja.
7. **(Régua) tela `crm`/LARA:** configurar a régua quando for o tenant piloto (onda 1 M2 — ainda não configurada em ninguém).
8. **Primeiro relatório:** subir o relatório iFood em `importar` → na quarta, a revisão de métricas já sai com dados; na segunda seguinte, a VERA já inclui a loja no semanal.
9. Conferir em `atividade` que os runs da loja começaram a aparecer.

## Receita 2 — A manhã de operação (rotina das 08h, ~30–40 min)
1. `aprovacoes` — esvaziar a fila (drafts BRENO/LARA/MIA + casos Defesa). Aprovar/editar/rejeitar.
2. `visao` — KPIs 30d no padrão? (runs do BRENO, casos Defesa, Radar)
3. `radar` — alguma loja com queda? Se sim, contato proativo HOJE (antes do cliente reclamar).
4. `tarefas` — o dia por loja; o que o task-extractor criou da noite.
5. `inbox` (sino) — alertas internos (ex.: saldo OpenRouter baixo).
6. O resto do dia: só o que o BRENO escalar no `chat`.
- **Conferência passiva:** BomDia saiu 9h sozinho; Encerramento sai 18h sozinho.

## Receita 3 — Pedir uma arte e mandar pro cliente
1. `estudio` → escrever o brief ("arte de oferta de quinta, hambúrguer artesanal, fundo escuro, loja X").
2. Aguardar 2–4 min (fila roda a cada 2 min; a tela atualiza sozinha).
3. Revisar a arte + legenda (Brand Guard já forçou PT-BR / sem emoji / "oferta").
4. Aprovar → vira rascunho de envio → enviar pelo fluxo de aprovação (nunca publica direto).
- ⚠️ Se a geração falhar, 1º suspeito: saldo OpenRouter (`inbox` mostra o alerta; hoje $2.81).

## Receita 4 — Análise de loja iFood do zero
1. Baixar o relatório no portal do iFood (planilha ou print).
2. `importar` → upload → o robô processa em ≤5 min → métricas no `radar`.
3. Tela `lojas` → abrir a loja → **aba "Análises"** → criar análise nova (`TabAnalises.jsx`).
4. Revisar o relatório gerado (markdown), anexar Loom se quiser.
5. **Enviar por WhatsApp** pela própria aba → o cliente aprova/rejeita itens respondendo no WhatsApp (137 aprovações de clientes já processadas assim).

## Receita 5 — Caso de Defesa ponta a ponta (cancelamento injusto)
1. O vigia detecta sozinho em ≤5 min (cancelamento, avaliação ruim ou alguém mencionando `@defesa` no grupo).
2. O caso aparece em `aprovacoes`/`defesa` com a defesa redigida.
3. Aprovar (no Console, ou direto no grupo: `@defesa ok`).
4. Enviar a contestação no portal iFood (passo manual — a plataforma não envia no iFood por você).
5. Voltar em `defesa` → marcar **enviado** → quando sair o resultado, marcar **ganho/perdido + R$**. Esse R$ é o argumento de renovação.

## Receita 6 — Resumo semanal de valor pro cliente (anti-churn)
1. Segunda 8h: a VERA já gerou o semanal de cada loja (`relatorio-semanal.ts:41`).
2. Revisar e enriquecer com a timeline (`memoria`): o que foi FEITO na semana.
3. Transformar em mensagem de valor → fica como draft.
4. Sexta (ritual M2): aprovar em `aprovacoes` → sistema envia.
5. Meta da onda 1: 3 clientes piloto recebendo TODA semana; medir reação.

## Receita 7 — Cliente sumido reaparece no radar da DELI
1. Gatilho `cliente_sumiu_7d` dispara (DELI avalia a cada 30 min — só lojas `is_consultoria_ativa`).
2. Vira pendência no painel `deli`/`aprovacoes` (verde = ela executa e reporta; amarelo = você aprova).
3. Aprovar a ação proposta (ex.: mensagem de reengajamento da LARA) → envia.
4. Registrar o contato na timeline da loja (`memoria`).

## Receita 8 — Prospecção com a SOFIA
1. Tela `crm` → cadastrar o prospect (ou esperar o batch diário das 9h).
2. SOFIA pesquisa (IA + busca na web) e qualifica → `prospects`.
3. Ela redige a abordagem → vira draft.
4. Lorena revisa/aprova → envia → acompanhar no pipeline do `crm`.
- ⚠️ Limite atual: sem fonte de leads automática + cadência, o motor não gira sozinho — é semi-manual.

## Receita 9 — Cobrar um inadimplente (estado atual, sem CORA)
1. `cobranca` — o painel já está atualizado sozinho (sync 2h + webhook Asaas em tempo real).
2. Escolher o devedor, decidir o tom (1º aviso ≠ escalonado).
3. **Hoje a mensagem é manual** (CORA parada desde 15/05). Enviar pelo `chat` ou pelo Asaas.
4. Registrar na timeline da loja.
- Quando a CORA religar (modo propõe-e-aprova), os passos 2–3 viram "aprovar draft".

## Receita 10 — "Algo não rodou" (diagnóstico em 3 passos)
1. `atividade` — o run existe? `failed`? O erro está no output expandido. (Lembrete: DELI loga como `agent_id='deli'`.)
2. `inbox` — tem alerta do sino? (saldo OpenRouter é a causa nº 1 de parada de imagem)
3. `heartbeats` — o pulso das rotinas está batendo?
- Se nada disso explicar → é nível Wandson/Claude (Bridge/PM2/Trigger.dev), não nível operador.

---

# PARTE 4 — O QUE NÃO DÁ AINDA (lista honesta)

## Não existe (feature grande — não prometer a cliente)
| O quê | Detalhe |
|---|---|
| **G8 — Multi-plataforma** | A análise/Radar/Defesa é **só iFood**. Rappi, Aiqfome, 99Food: nada. Decisão G8 vs G9 é da onda 3 do M2 (council). |
| **G9 — Venda direta WhatsApp** | Cardápio próprio/pedido direto pelo WhatsApp não existe. |
| **Geração de vídeo** | Só embute Loom gravado na mão. (HEYGEN_API_KEY existe no Infisical, mas nenhum fluxo usa.) |
| **Oracle (agente que cria agentes)** | Só a spec aprovada (GO 2026-06-12, #313). Zero código — MVP é onda 2. |
| **Enviar a contestação NO iFood** | A Defesa redige e controla o caso; o clique no portal do iFood é seu. |

## Existe mas está desligado/parado (decisão pendente)
| O quê | Desde | O que destrava |
|---|---|---|
| **CORA (cobrança)** | 15/05 (POC) | Decisão de produto do Wandson — recomendação M2: religar só leitura+draft |
| **DELI revisão matinal + briefing 7h** | 26/05 (incidente de spam) | Decisão GATED de religar (cron está em data impossível de propósito) |
| **Hermes 3B (enxergar a CD)** | — | 2 comandos com credencial que só o Wandson coloca (`admin-mcp/README.md`) + provar com `npm run live-smoke` |

## Existe mas precisa de configuração/insumo antes de valer
| O quê | O que falta |
|---|---|
| **Régua LARA** | Configurar em 1 tenant piloto (onda 1 M2, item 4) — hoje zero tenants configurados |
| **SOFIA pipeline contínuo** | Fonte de leads + cadência (feature pequena, G7) |
| **BRENO suporte de sistemas revendidos** | Alimentar a base de conhecimento com FAQs (conteúdo, não código) |
| **Resumo semanal como entrega ritual** | A VERA gera; falta o hábito de revisar→aprovar→enviar (onda 1: 3 pilotos) |
| **Imagens (BomDia/Estúdio/Encerramento)** | ⚠️ **Recarregar OpenRouter — saldo $2.81 < piso $5** (alerta B-08 já disparou; risco de repetir o apagão de 29/05) |

## Telas que são só casca
- `provedores`, `integracoes`, `sistemas` — menu existe, conteúdo é leitura/vazio (`src/console/CvNovas.jsx:442-481`). Não operar nelas.

## Backlog de segurança aberto (não bloqueia a rotina)
_Atualizado em 12/06 após a sessão 39: B-05, B-07 e B-09 foram fechados (PRs #323/#324/#325, advisors = 0 ERROR), e o bucket `contratos` virou privado. Resta:_
- **B-06** — ativar proteção de senha vazada (HIBP) no dashboard Supabase: Authentication → Passwords. É um toggle, só o Wandson tem acesso — não há SQL/automação pra isso.
- WARNs residuais mapeados na auditoria (funções SECURITY DEFINER executáveis por anon/authenticated, policies always-true de canais internos) — análise caso a caso, sem urgência.

## Divergências encontradas escrevendo este manual (corrigir nos docs, não no código)
1. **Horários do M2 §2.1:** BomDia não é "~7h" — o cron real envia **9h Brasília** (`bom-dia/envio-agendado.ts:326`, 12h UTC). Encerramento não é "~21h" — é **18h Brasília** (`encerramento/envio-agendado.ts:296`, 21h UTC).
2. **Tracker dizia que as telas novas do CvNovas eram "estado-vazio":** a maioria tem CRUD real funcionando (tarefas, gatilhos, topicos, arquivos, links, modelos, habilidades). Só `provedores`/`integracoes`/`sistemas` continuam casca.

---

*Manual gerado em 2026-06-12 a partir de leitura de código (`src/console/`, `trigger/`, `bridge-server/`), da auditoria M1 e do plano M2. Qualquer recurso citado tem arquivo:linha ou id de tela como evidência. Quando a plataforma mudar, este manual muda junto — ou mente.*
