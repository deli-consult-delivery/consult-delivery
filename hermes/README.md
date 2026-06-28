# hermes/ — Config como código do Hermes Agent (Nous Research)

> Fonte da verdade VERSIONADA da configuração do runtime Hermes que roda na VPS como `hermes-gateway`.
> Doc de arquitetura: `docs/ai-first/BLUEPRINT-AI-FIRST.md` (v2).

## Por que existe

O Hermes guarda config/identidade/skills em `~/.hermes/` na VPS (estado local, hoje sob `root`).
Para reprodutibilidade e para **mitigar lock-in de infra** (recriar a VPS sem perder a org),
versionamos aqui tudo que NÃO é segredo e sincronizamos para `~/.hermes/` via `deploy-hermes.sh`.

**Importante (lock-in de plataforma ≠ infra):** versionar SOUL.md/skills resolve recriar a VPS,
mas NÃO torna esses arquivos executáveis na plataforma CD (React/Supabase/Trigger.dev). Por isso:
- **Nenhuma regra de negócio** em `SOUL.md`/`SKILL.md` — só persona/tom/política. Decisão com efeito
  no mundo (desconto, prazo, escalonamento) = tool MCP determinística no Bridge, nunca markdown.
- **Estado e dado de negócio ficam no Supabase** (lido via MCP), nunca na memória local do Hermes.
- Assim, integrar à plataforma CD depois = trocar o orquestrador, não reescrever a lógica.

## O que é versionado aqui

```
hermes/
├── README.md           # este arquivo
├── config.yaml         # config do gateway (SEM segredos) — endurecida (GATE 0)
├── deploy-hermes.sh    # sincroniza hermes/ → ~/.hermes/ na VPS (rodado pelo Wandson)
├── profiles/           # 1 subpasta por agente: <slug>/SOUL.md (persona/política)
│   └── .gitkeep        #   (criados após o Wandson confirmar os 5 slugs novos — ver Blueprint §6)
└── skills/             # <categoria>/<skill>/SKILL.md (playbooks de persona/tom)
    └── .gitkeep
```

## O que NUNCA é versionado (fica só na VPS)

- `~/.hermes/.env` — tokens (Telegram, etc.). chmod 600.
- `~/.hermes/mcp-tokens/` — tokens OAuth de MCP servers.
- `~/.hermes/state.db`, `~/.hermes/sessions/`, `~/.hermes/memories/` — estado/memória local (efêmero por design).
- Qualquer `SUPABASE_SERVICE_KEY` / `service_role` / chave de API.

Há um gate de secret-scan (gitleaks) recomendado no CI para garantir que nenhum template carregue valor real.

## Profiles (org-chart → Blueprint §6)

A org é montada como **profiles persistentes** do Hermes (`hermes profile create <slug>`), um por função.
Slugs definitivos dos 5 novos (`analista-ifood`, `revisor`, planejamento, estratégia, vendas) são
**pré-condição da FASE 1** e dependem da confirmação do Wandson — por isso `profiles/` está vazio (`.gitkeep`)
até lá. Quando confirmados, cada um ganha `profiles/<slug>/SOUL.md` (só persona/política) e uma linha no
catálogo `agents`/`tenant_agents` (Supabase) de onde o `hermes profile describe` é gerado.

## Deploy (Wandson, na VPS)

```bash
cd /root/consult-delivery && git pull
bash hermes/deploy-hermes.sh        # dry-run por padrão
bash hermes/deploy-hermes.sh --apply
# depois: hermes gateway restart   (recarrega config.yaml)
```
