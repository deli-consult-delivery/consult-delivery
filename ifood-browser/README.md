# ifood-browser — Fase 0 do Consultor de iFood

Chromium **headful persistente** na VPS, com **viewer web ao vivo + controle interativo (take-over)**
e **CDP** para o worker Playwright dirigir o portal do iFood. É a fundação do épico "Consultor de
iFood" (plano: subagente Hermes que opera o portal do iFood, com você assistindo ao vivo).

## Decisão de runtime (spike concluído)

Escolhido: **`lscr.io/linuxserver/chromium`** (KasmVNC).

| Critério | linuxserver/chromium | steel-browser | Xvfb+x11vnc+noVNC manual |
|---|---|---|---|
| Viewer ao vivo | ✅ web nativo | ✅ session viewer | ✅ (montar) |
| **Take-over interativo (co-piloto)** | ✅ nativo | ⚠️ não confirmado | ✅ |
| Perfil/sessão 2FA persistente | ✅ volume `/config` | ✅ | ✅ |
| CDP p/ Playwright | ✅ via `--remote-debugging-port` | ✅ `connectOverCDP` | ✅ |
| Licença / custo | ✅ imagem mantida, sem licença | Apache 2.0 (API+UI grande) | sem licença, + trabalho |

O requisito mais difícil é **take-over** + **sessão 2FA persistente**. `linuxserver/chromium` entrega
os dois de fábrica, sem plumbing custom e sem dependência grande. (Fallback documentado: stack
Xvfb+x11vnc+noVNC manual, se algum dia o CDP no KasmVNC der trabalho.)

## Segurança (ler antes de subir)

- **CDP (9222) nunca é publicado no host** — só `expose` na rede interna do compose. CDP = controle
  total do browser **sem autenticação**; expor publicamente é RCE no navegador logado. O worker
  conecta por `http://ifood-browser:9222` (mesma rede docker).
- **Viewer atrás de auth**: `CUSTOM_USER`/`PASSWORD` no container (KasmVNC) **+** recomendado
  basic-auth no Traefik. Publicado só em `127.0.0.1:7470` → o `easypanel-traefik` roteia o subdomínio.
- **Sessão de terceiros** (cookies do portal da loja) vivem no volume `ifood_browser_profile` na VPS.
  Acesso restrito; **nunca** chega ao LLM/MCP — só worker/Bridge.

## Deploy na VPS

A VPS usa **Docker Swarm + EasyPanel** (Traefik = `easypanel-traefik` 3.6.7). Dois caminhos:

**A) EasyPanel (recomendado, igual Open Design):** criar um serviço apontando para
`lscr.io/linuxserver/chromium:latest`, mapear volume `ifood_browser_profile:/config`, env deste
compose, e o domínio `ifood-browser.consultdelivery.com.br` (EasyPanel cria DNS+cert+rota). Garantir
que o serviço fica na **mesma rede do easypanel-traefik** e que **CDP 9222 não é publicado**.

**B) docker compose direto** (este arquivo), com o `easypanel-traefik` na rede `ifood-browser-net`
(ou ajustar as labels para a rede que o Traefik observa). DNS do subdomínio via Cloudflare
(`CLOUDFLARE_API_TOKEN`/`ZONE_ID` no `bridge-server/.env`, zone id `a5adf1fd925b68bb2122a56581f0945a`).

```bash
cp .env.example .env && nano .env        # definir IFOOD_BROWSER_USER/PASSWORD
docker compose config                    # validar (output bruto)
docker compose up -d
```

## Login manual (1ª vez) — passo humano

1. Abrir `https://ifood-browser.consultdelivery.com.br` (auth da web UI).
2. No Chromium ao vivo, logar no **portal do iFood** da loja piloto e **resolver o 2FA**.
3. A sessão fica salva no volume `/config`.

## Critério de aceite da Fase 0 (output bruto)

```bash
docker restart ifood-browser
# reabrir o viewer → o portal continua LOGADO, sem refazer login/2FA
```

## Como o worker conecta (Fase 1)

O `ifood-portal-worker` (Node + Playwright) na mesma rede docker:

```js
const browser = await chromium.connectOverCDP("http://ifood-browser:9222");
```
Tudo que o worker fizer aparece no viewer ao vivo, e você pode assumir o controle a qualquer momento.
