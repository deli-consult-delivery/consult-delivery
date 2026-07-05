# PENDÊNCIAS DO WANDSON — Consolidado 2026-07-05

**Contexto:** o `WikiBrain/wiki/PLANO-MESTRE — Tracker.md` (handoff entre sessões de IA, 1271 linhas) e o `PLANO-MESTRE.md` (raiz) acumularam **40 + 6 = 46 marcações "⚠️"** ao longo de ~2 meses de sessões (jun–jul/2026), cada uma sinalizando algo que só o Wandson pode fazer (credencial, VPS, decisão, teste visual) ou um achado que precisava de atenção. Muitas são a MESMA pendência repetida sessão após sessão até ser resolvida ou dispensada; outras já foram resolvidas por sessões posteriores sem que a marcação antiga fosse removida. Este doc lê as 46 ocorrências, verifica no próprio Tracker (e no `git log`) se cada uma segue aberta, agrupa as repetidas e entrega **uma lista única e acionável** — pedida em `docs/estrategia/PLANO-CONTINUIDADE-PLATAFORMA-2026-07.md` §4 item 3.

**Resultado da varredura:** 46 ocorrências brutas → **11 pendências vivas** (deduplicadas) → **~20 ocorrências descartadas** por já resolvidas/dispensadas/superadas + ~9 que eram notas técnicas para as próprias sessões de IA (não ações do Wandson).

---

## Tabela consolidada

| # | Categoria | Pendência (resumo) | Ação concreta | Destrava | Origem (linha) |
|---|-----------|---------------------|----------------|----------|----------------|
| 1 | 🔑 | Hermes/AI-First — pacote de ativação GATE 0 (root→`claudedev`, 2 segredos, MCPs de ação) | Na VPS: (a) mover `hermes-gateway`+`admin-mcp` de root para o usuário `claudedev` (systemd); (b) setar `TELEGRAM_BOT_TOKEN`+`CEO_TELEGRAM_CHAT_ID` no Trigger.dev (notificação real ao CEO); (c) setar `INTERNAL_BRIDGE_TOKEN`+`BRIDGE_URL` no Trigger.dev (efeito-real do Revisor); (d) `hermes mcp add {ifood,asaas,evolution}` + `hermes gateway restart` + `npm run live-smoke` em cada; (e) `bash hermes/deploy-hermes.sh --apply` | Hermes 100% operacional: 12 agentes/especialistas + fluxo C (autorização CEO) + Revisor com efeito-real verificado, não fail-closed | Tracker 64,66,68,70,74,76,490 · PLANO-MESTRE.md T4 (linha ~172) |
| 2 | 🔑 | Rotacionar `VENDAERP_TOKEN` (token de leitura vazado no chat) | Gerar novo token no ERP, atualizar no `.env` do Bridge/Infisical, invalidar o antigo | Fecha o único segredo confirmadamente vazado ainda vivo | Tracker 54,64,70,74,490,786 |
| 3 | 🔑 | VendaERP Fluxo C — E2E de escrita real no Telegram | Rodar `erp_propor_lancamento` → receber código OOB → `erp_confirmar` no chat com o DELI/agente e confirmar que o erro 417 sumiu (fix PascalCase já em prod, PR #640); depois apagar a proposta de teste `dc1ddd27-3533-4104-b6ca-ed7303d46ede` | Prova que a escrita real no ERP funciona ponta-a-ponta antes de liberar para uso contínuo | Tracker 52,54,60,62,786 |
| 4 | 🔑 | Recarregar créditos OpenRouter (saldo $2.81, abaixo do piso $5) | Recarregar a conta OpenRouter usada como fallback do runtime multi-provider | Evita repetir o apagão de 29/05 em Encerramento/Estúdio (hoje o risco é menor pois Ollama Cloud virou primário e OpenRouter é só fallback, mas o piso de alerta segue disparando) | Tracker 227,421,424,994 |
| 5 | 🔑 | Confirmar aplicação da migration `20260628_003` (roster Hermes: `revisor`/`pedro`/`estela`/`vitor` em `agents`+`tenant_agents`) | 1 `SELECT id FROM agents WHERE id IN ('revisor','pedro','estela','vitor')` — se vazio, aplicar a migration (Supabase MCP caiu no meio da sessão original e não há confirmação posterior) | Sem ela o despachador do loop não roteia para esses 4 agentes | Tracker 72 |
| 6 | 🔑 | Religar os 2 gatilhos da DELI (`cliente_sumiu_7d`, `metrica_caiu_20pct`) — **confiança baixa, verificar antes de agir** | Validar a lista das 38 lojas marcadas `is_consultoria_ativa` → `npx trigger.dev@4.4.6 deploy` → `UPDATE deli_triggers SET enabled=true WHERE name IN ('cliente_sumiu_7d','metrica_caiu_20pct')` | Reativa o monitoramento automático de "cliente sumiu"/"métrica caiu" da DELI (hoje só `config_critical_change` está ativo) | Tracker 420,431,450,1020,1026,1028 |
| 7 | 👀 | Painel Avaliações — confirmar envio real da próxima leva | Na próxima leva de avaliações, conferir que o envio ao grupo WhatsApp da loja certa acontece sem intervenção manual (Wandson já higienizou manualmente esta leva) | Fecha em definitivo o fix de ponta-a-ponta do envio por loja (#715–#721) | Tracker 46 (sessão mais recente, 2026-07-03) |
| 8 | 👀 | CSAT — integração CRM externo: teste real do webhook + validação visual do link | Gerar 1 token real do CRM externo (plaintext via Infisical), disparar `POST /webhooks/crm/atendimento-finalizado`, e conferir no WhatsApp do cliente que o link `/avaliacao/<token>` chega com a marca certa | Fecha a 100%-em-produção do CSAT com CRM externo (depende do CRM do cliente disparar o webhook — pode não ser acionável até o 1º cliente real usar) | Tracker 131,402,452 |
| 9 | 👀 | Karina Doceria (1º cliente restrito real) — smoke visual como admin | Logar como admin do tenant `karina-doceria` e confirmar CSAT + NPS + Visão Geral carregando sem "Acesso negado" | Fecha o onboarding do 1º cliente vendido só com o módulo de Avaliação | Tracker 115,117 · PLANO-MESTRE.md linha 218 |
| 10 | 👀 | Backlog histórico de validações visuais (CORA / NPS / Cobrança, jun/2026) | 1 passada rápida de conferência nas telas CORA (dashboard, extrato, envio de teste) e NPS (`/nps/:token`) — **não precisa re-testar do zero**: o próprio Wandson já reportou bugs novos via screenshot em sessões posteriores a quase todos esses itens, o que prova uso ativo contínuo das telas | Fecha formalmente ~13 marcações "pendente validação visual" que na prática já foram superadas pelo uso | Tracker 114,127,129,133,135,137,139,141,143,404,406,646,657 |
| 11 | 🧹 | Merge da branch `wandson/cora-situacao-dashboard` (dashboard "Situação das cobranças", 4 cards Asaas) | Abrir e mergear o PR da branch (ainda existe em `origin/`, nunca foi mergeada — confirmado via `git log`/`git branch -a`) + `pm2 restart bridge-server` | Coloca em produção o painel de cobrança por status que já está codado e validado (`node --check` limpo) | Tracker 106 |
| 12 | 🧹 | CI/CD: auto-deploy de `main` sobrescreve deploys manuais · branches da VPS divergem de origin | Auditar o pipeline (GitHub Actions → Pages) vs. deploys manuais na VPS e reconciliar as branches locais da VPS com `origin` (`git log` + `diff origin` antes de mexer, por enquanto é regra manual) | Elimina o risco de um deploy manual ser silenciosamente sobrescrito pelo auto-deploy, ou de a VPS rodar código divergente do que está em `main` | PLANO-MESTRE.md linha 216 |

---

## Detalhe por item

### 1. 🔑 Hermes/AI-First — pacote de ativação GATE 0
Recorrente em quase toda sessão da "Ativação AI-First" (2026-06-28/29): sessões de `Cowork`/VPS construíram GATE 0 fatias A–D, os 3 MCPs de ação (ifood/asaas/evolution), o Revisor (2 camadas) e a notificação ao CEO — tudo aditivo, tudo testado offline, mas tudo **fail-closed até o Wandson configurar a VPS**. As 5 sub-tarefas (root→`claudedev`, 2 segredos, MCPs, deploy-hermes.sh) aparecem repetidas em quase idênticas em Tracker linhas 64, 66, 68, 70, 74, 76 e 490, e em `PLANO-MESTRE.md` T4 (item 3C, linha ~172). **Evidência de que segue aberto:** nenhuma sessão posterior a 2026-06-29 (inclusive as de GESTOR em 07-02/07-03, que usam o Bridge e a VPS extensivamente) menciona `hermes gateway restart` como usuário `claudedev`, nem confirma os 2 segredos setados no Trigger.dev — o item de `claudedev` mencionado em sessões de 2026-06-09/10 (linha 1088 do Tracker) é só a **criação da conta**, não a migração dos serviços que hoje rodam como root (confirmado explicitamente linha 1095: "`hermes mcp add` como `claudedev`" estava errado — precisa ser root porque o gateway systemd vive em `/root`).

### 2. 🔑 Rotação do `VENDAERP_TOKEN` vazado
Aparece em quase toda sessão de VendaERP desde 2026-06-28 como reservado ao Wandson (linhas 54, 64, 70, 74, 490, 786). Diferente do `VENDAERP_WRITE_TOKEN` (que foi configurado e confirmado funcionando — ver descartadas), este é o token de **leitura** que vazou no chat em sessão anterior e nunca foi rotacionado.

### 3. 🔑 VendaERP Fluxo C — E2E de escrita real
Linhas 52, 54 (sessões 2026-07-02): "E2E escrita ERP no Telegram (417)" ainda listado como pendente mesmo após o fix de PascalCase (PR #640, linha 60/62, 2026-06-29) que corrigiu a causa-raiz do erro 417. Nenhuma sessão posterior confirma ter rodado o teste real. Ação de limpeza: apagar a proposta de teste `dc1ddd27-3533-4104-b6ca-ed7303d46ede` citada na linha 786.

### 4. 🔑 Recarga OpenRouter
Aberta desde a sessão 37 (2026-06-12, linhas 227/421/424) e nunca mencionada como resolvida depois. Mitigado parcialmente: sessões mais recentes (ex. linha 466, GESTOR) usam Ollama Cloud como provider primário e OpenRouter como fallback — reduz a urgência mas o alerta automático (`job ativo — checagem a cada 6h, mínimo $5`) segue disparando com saldo baixo.

### 5. 🔑 Migration `20260628_003` (roster Hermes)
Linha 72 (2026-06-28): "2 migrations PENDENTES DE APLICAÇÃO (Supabase MCP caiu nesta sessão)" — a `20260628_002` foi confirmada aplicada na mesma sessão, mas a `20260628_003` (cabeamento de `revisor`/`pedro`/`estela`/`vitor`) ficou marcada como "falta aplicar". Sessões posteriores (GESTOR, 07-02) voltaram a usar o Supabase MCP com sucesso para outras migrations, então é provável que isso tenha sido resolvido de passagem — mas não há confirmação explícita citando esse arquivo. Verificação de 1 linha resolve a dúvida.

### 6. 🔑 Religar os 2 gatilhos da DELI
A saga mais antiga da lista: sessão ~34 (2026-06-11, linhas 1020/1026/1028) — o gatilho `cliente_sumiu_7d` despejou ~1000 contatos no feed por falta de filtro; a correção (`lojas.is_consultoria_ativa`, PR #308) foi mergeada, mas os 2 gatilhos ficaram **desligados no banco** (`deli_triggers.enabled=false`) até o Wandson validar a lista de 38 lojas e rodar o deploy. Essa mesma pendência ainda aparece nas seções "Próxima ação" (linha 420) e "Status por track" (linha 450), que foram atualizadas até sessões de meados de junho. **Incerteza:** a FASE 3.2 (2026-06-24, linha 104) reativou `notifyBridge` com um mecanismo de dedup diferente (por semáforo), o que pode ter tornado a reativação destes 2 gatilhos específicos menos urgente ou até redundante — recomenda-se **conferir o estado atual de `deli_triggers` antes de religar às cegas**.

### 7. 👀 Painel Avaliações — envio real da próxima leva
Item mais recente da lista (Tracker linha 46, sessão 2026-07-03): a cadeia de causa-raiz do envio por loja foi fechada de ponta a ponta (PRs #715–#721: ConfigGrupos restaurado, matching por nome corrigido 14/14 lojas), mas o teste request explicitamente diz "Pendente: teste de envio real pelo Wandson na próxima leva de avaliações". É o mesmo item citado como exemplo no `PLANO-CONTINUIDADE-PLATAFORMA-2026-07.md` §4.3 ("envio real de avaliações").

### 8. 👀 CSAT — CRM externo, teste real do webhook
Linhas 131 (sessão 84/85, 2026-06-22) e 402/452 (mesma pendência ecoada em "Próxima ação" e "Status por track"): a integração está 100% codada e com testes automatizados de browser passando (DOM branded, POST nota 5, anti-dupla-submissão, detrator), mas falta o teste com um token **real** do CRM do cliente e a confirmação visual de que o link chega branded no WhatsApp disparado pelo CRM dele — isso só é acionável quando um cliente com CRM externo estiver ativo.

### 9. 👀 Karina Doceria — smoke visual do 1º cliente restrito
Linha 115 (sessão 86, 2026-06-23: onboarding restrito construído) → linha 117 (sessão 92, 2026-06-24: 4 defeitos de RBAC/branding corrigidos, mas "⚠️ Pendente do Wandson: smoke visual no browser como admin do cliente"). Mesma pendência em `PLANO-MESTRE.md` linha 218. Nenhuma sessão entre 2026-06-24 e 2026-07-03 menciona este smoke ter sido feito.

### 10. 👀 Backlog histórico de validações visuais (CORA/NPS/Cobrança)
13 ocorrências entre 2026-06-14 e 2026-06-22 (linhas 114, 127, 129, 133, 135, 137, 139, 141, 143, 404, 406, 646, 657), quase todas da forma "⚠️ Pendente do Wandson: validação visual no browser". A prova de que isso não está "no escuro": a maioria dessas telas recebeu **feedback com screenshot do próprio Wandson em sessões posteriores** (ex.: sessão 76/77 revisão de 8 reclamações da CORA → sessão 80/81 revisão rodada 2 → sessão 82/83 mais 2 fixes visuais → sessão "ajuste-cora" mais recente com 4 ajustes, commit já em `main`) — ou seja, ele visualizou e usou essas telas ativamente, só nunca houve uma sessão que voltasse e marcasse formalmente "✅ confirmado" no item antigo. Tratado aqui como debt de bookkeeping, não como risco funcional.

### 11. 🧹 Branch `wandson/cora-situacao-dashboard` nunca mergeada
Confirmado via `git log --all --oneline | grep cora-situacao-dashboard` (só aparece o commit de doc do Tracker, nenhum merge) e `git branch -a` (a branch `remotes/origin/wandson/cora-situacao-dashboard` ainda existe). Linha 106 do Tracker (sessão 2026-06-24): código pronto (`node --check` limpo), só faltou abrir o PR porque `gh auth status` não estava logado na sessão.

### 12. 🧹 CI/CD sobrescrevendo deploys manuais + branches VPS divergentes
`PLANO-MESTRE.md` linha 216, dentro do checklist T8 (ainda `[ ]` não marcado). Não há evidência de resolução — a "Regra dura" do Tracker ("antes de mexer em branch da VPS: `git log` + `diff origin`") trata o sintoma (checar antes de mexer) mas não resolve a causa (por que elas divergem / por que o auto-deploy pode sobrescrever manual).

---

## Pendências descartadas (já resolvidas)

- **Rotação da chave Evolution** (citada em Tracker 52, 54, 76) — **DISPENSADA por decisão do Wandson** ("risco residual aceito"), Tracker linha 50 (sessão 2026-07-03).
- **`GESTOR_COLETA_ATIVA=true`** (Tracker 52, 68, 454) — ativada e validada E2E nas 14 lojas com dados reais (Tracker linha 50, sessão 2026-07-03, run `run_cmr4dr884...` COMPLETED).
- **Desambiguação dos 4 nomes de lojas do GESTOR** (VILLAS CALDOS, CST CAFÉ COM PÃO, Uraka Burger — Tracker linha 52) — resolvida sem precisar do Wandson: mapeamento por endereço no modal (Tracker linha 50, PR #705, migration `20260702_015`).
- **Login único do Portal iFood** (Tracker 52, 54, 56, 58) — decisão do Wandson: "e-mail atual serve para as 16 lojas por ora, troca depois" (memória `gestor-login-portal-ifood`).
- **Probe do modal "Escolher loja" + `garantirLoja` ao vivo** (Tracker 52, 54, 56, 58) — resolvido, PR #702 (causa-raiz: aba `/login` estagnada).
- **Túnel SSH porta 7470** (Tracker 54) — identificado como viewer KasmVNC (contexto já esclarecido, memória do usuário).
- **Bridge-server "crash-loop"** (Tracker 377, 452) — falso positivo: `↺` no `pm2` é contador cumulativo, não taxa atual; confirmado `unstable_restarts=0`/`status=online` (Tracker linha 452, verificado 2026-06-09).
- **Bucket `tenant-files` sem RLS** (Tracker 307) — resolvido e mergeado em produção, PR #261 (mesma linha do Tracker confirma "✅ RESOLVIDO verificado sessão 28").
- **`VENDAERP_WRITE_TOKEN` não configurado** (Tracker 74) — já setado: o 1º write real do Fluxo C chegou ao ERP e retornou erro de dado (417 — data de vencimento), não erro de autenticação/503 (Tracker linha 60), prova de que o token estava configurado.
- **`pm2 restart bridge-server` como pendência recorrente** (Tracker 135, 139, 646 e outras) — virou rotina que as próprias sessões executam autonomamente (mandato D5 v3); não é mais uma ação que espera pelo Wandson.
- **Tela preta "Nenhum workspace"** (Tracker 127, 452) — causa-raiz de banco corrigida em produção (PRs #482+#485) e uso subsequente ativo do Wandson (screenshots de novos bugs em sessões posteriores) confirma acesso normal restabelecido.
- **D6 reaberta pelo fundador** (`PLANO-MESTRE.md` linha 56) — não é uma pendência: é uma decisão que o próprio Wandson já tomou (partir para a plataforma completa sem esperar o gate D+90), só documentada com ⚠️ por ser uma reversão consciente de uma regra anterior.
- **Notas técnicas para as próprias sessões de IA** (não são ações do Wandson): `agent_drafts.content` vs `body` (Tracker 393); "usar `customers`, `clientes` não existe" (`PLANO-MESTRE.md` 130); inserir agent antes de `logAgentRun` por causa da FK (`PLANO-MESTRE.md` 116); gotcha de query `agentSlug` vs `agent_id ilike '%orchestrator%'` (Tracker 1006); risco de `grep -v claude-debug` apagar a chave certa por engano (Tracker 1166); protocolo de `ao send` truncando mensagens longas (Tracker 50).
