---
name: ifood-responder-avaliacao
description: >-
  Responder avaliações de clientes no Portal do Parceiro do iFood operando o navegador ao vivo
  (épico "Consultor de iFood"), via o worker ifood-portal-worker + container ifood-browser.
  Use quando o Wandson pedir para responder/avaliar/comentar avaliações do iFood, testar o
  envio ao vivo, listar avaliações pendentes da loja piloto (Café Container), ou dar
  continuidade ao Consultor de iFood. Fluxo SUPERVISIONADO (semáforo amarelo): nunca publica
  sem "ok" explícito do Wandson para o texto específico.
---

# Consultor de iFood — responder avaliações via navegador

Operar o Portal do Parceiro do iFood pelo navegador headful na VPS (container `ifood-browser`,
KasmVNC) dirigido por CDP/Playwright a partir do worker `ifood-portal-worker/` (na main).
Responder UMA avaliação por vez, com aprovação humana antes de preencher e antes de publicar.

## Estado / referências
- **Memória do épico (ler sempre primeiro):** `/root/.claude/projects/-root-consult-delivery/memory/consultor-ifood-epico.md`
- **Worker:** `/root/consult-delivery/ifood-portal-worker/` — `index.js` (`listarAvaliacoesPendentes`,
  `preencherResposta`, `enviarResposta`), `gerarResposta.js` (texto por IA).
- **Loja piloto:** "Café Container - Lanches e Salgados".
- **Viewer (Wandson assiste/loga):** `ssh -L 7470:127.0.0.1:7470 vps` → http://localhost:7470
  (user `consultor`, senha em `/root/ifood-browser/.env`).

## GUARDAS — invioláveis
1. **UMA avaliação por vez.** Nunca em massa.
2. **Nunca publicar sem "ok" explícito** do Wandson para AQUELE texto (semáforo amarelo).
3. **Parar e perguntar** se algo parecer diferente (avaliação trocada, texto no lugar errado,
   modal inesperado). Não forçar.
4. **Não tocar `bridge-server/`. Não mexer em outra loja.** Output bruto sempre.

## Pré-requisito de execução (CDP) — repetir em TODO comando
O Chromium do `ifood-browser` escuta CDP **só em `127.0.0.1:9222`** (ignora `0.0.0.0`). Por isso o
worker roda **dentro de um container na MESMA rede**:
```
docker run --rm --network container:ifood-browser \
  -v /root/consult-delivery/ifood-portal-worker:/app -w /app \
  node:20-alpine sh -c "npm install --silent --no-audit --no-fund && node <runner>.js"
```
(`npm install` só na 1ª vez; `node_modules` persiste no dir montado.)

## Gotchas conhecidos (não repetir os erros)
- **CDP trava entre sessões** (conexões mortas presas) → `connectOverCDP` dá Timeout. Fix:
  `docker restart ifood-browser` (perfil/login PERSISTEM). Confirmar a aba depois:
  `docker run --rm --network container:ifood-browser node:20-alpine sh -c "wget -qO- http://127.0.0.1:9222/json | grep -E '\"url\"|\"title\"'"`
- **Sessão do iFood EXPIRA** (~diária). Sintoma: aba em `/login` ou `/logout`; worker dá
  "Tabela não carregou (sessão deslogada...)". **Relogin é MANUAL (2FA) pelo Wandson no viewer** —
  PARAR e pedir; não dá para automatizar o 2FA.
- **A conta tem ~75 lojas** → ao entrar abre o modal **"Escolher loja"**
  (`data-testid="choose-restaurant-modal-list"`) antes da tabela. Hoje a seleção da loja é
  **MANUAL** pelo Wandson no viewer (worker ainda não seleciona). Se o probe mostrar esse modal,
  PARAR e pedir para ele selecionar "Café Container". (TODO F3: automatizar a seleção.)
- **Diagnóstico read-only do DOM:** `node probe-dom.js` (mostra URL, se há tabela, testids, texto).

## Fluxo passo a passo (com PARADAS)
1. **Confirmar ambiente.** `docker ps --filter name=ifood-browser`; checar aba via `/json`. Se CDP
   travar → restart. Se aba em `/login`/`/logout` ou modal de loja → PARAR, pedir relogin/seleção.
2. **Listar pendentes (read-only).** `node run-listar.js` → avaliações com comentário e status
   "para responder". Apresentar a lista (pedido, nota, comentário, prazo). **PARAR** → Wandson
   escolhe UMA.
3. **Gerar resposta (IA, Ollama Cloud kimi-k2.6).** Precisa do bridge `.env` montado:
   ```
   docker run --rm \
     -v /root/consult-delivery/ifood-portal-worker:/app -w /app \
     -v /root/consult-delivery/bridge-server/.env:/root/consult-delivery/bridge-server/.env:ro \
     -e AVALIACAO_JSON='{"nota":5,"comentario":"...","autor":null}' \
     node:20-alpine sh -c "node run-gerar.js"
   ```
   Mostrar o texto. **PARAR** → só seguir com "ok" para AQUELE texto (Wandson pode dar o texto dele,
   pedir ajuste, ou "regenera").
4. **Preencher (NÃO envia).** Gravar o texto aprovado em `ifood-portal-worker/texto-resposta.txt`
   (gitignored — pode conter nome de cliente), depois:
   ```
   docker run --rm --network container:ifood-browser \
     -v /root/consult-delivery/ifood-portal-worker:/app -w /app \
     -e PEDIDO=<nº> node:20-alpine sh -c "node run-preencher.js"
   ```
   Resultado tem `preenchido:true, enviado:false` + `reviewId`/`orderId`. Conferir o textarea via
   `probe-dom.js` ou leitura direta. **PARAR** → pedir ao Wandson para CONFERIR no viewer (avaliação
   certa + texto certo).
5. **Publicar.** Só após "ok, publicar" explícito:
   ```
   docker run --rm --network container:ifood-browser \
     -v /root/consult-delivery/ifood-portal-worker:/app -w /app \
     -e CONFIRMAR_ENVIO=1 node:20-alpine sh -c "node run-enviar.js"
   ```
   (`enviarResposta` clica o botão **"Enviar resposta"** do drawer aberto+preenchido; não envia vazio.)
6. **Confirmar.** Recarregar `/reviews/search` e ler a linha do pedido: status deve virar
   **"Resposta enviada"** e `run-listar.js` → `TOTAL_PENDENTES` cair. Reportar output bruto.
7. **Atualizar a memória do épico** com qualquer descoberta nova.

## Runners no worker (já commitados)
- `run-listar.js` — lista pendentes (read-only).
- `run-gerar.js` — gera texto (env `AVALIACAO_JSON`).
- `run-preencher.js` — preenche (env `PEDIDO` + `texto-resposta.txt`), não envia.
- `run-enviar.js` — publica (env `CONFIRMAR_ENVIO=1`), semáforo amarelo.
- `probe-dom.js` — diagnóstico read-only do DOM.
