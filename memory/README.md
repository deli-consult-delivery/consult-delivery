# memory/ — Memória Persistente do Projeto

Arquivos de contexto que Claude lê automaticamente no início de cada sessão.
Funciona em **qualquer máquina** que tenha o repositório clonado (local, VPS, CI).

## Como usar

**Claude:** Ao iniciar uma sessão, ler os arquivos relevantes desta pasta antes de responder.
Ao descobrir algo novo e não-óbvio sobre infra, configuração ou decisões do projeto → atualizar o arquivo correto e commitar.

**Wandson:** Não precisa fazer nada. Claude mantém esses arquivos automaticamente.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `vps-infra.md` | VPS 187.127.25.24 — dois repos, PM2, Bridge Server, como reiniciar |
| `bom-dia-feature.md` | Feature BomDia completa — schema, UI, Trigger.dev, diagnóstico |

## Regras

- Só informações **não-óbvias** que não estão no código ou no CLAUDE.md
- Sem dados sensíveis (tokens, senhas, UUIDs de produção) — ficam no Infisical
- Cada arquivo tem seção de diagnóstico para bugs conhecidos
- Atualizar após cada sessão que muda algo relevante
