# docs/fluxos — Diagramas Mermaid

Diagramas formais e versionados da Consult Delivery.
Todos em Markdown com blocos ` ```mermaid ` — diff no git, renderização nativa no GitHub.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| [arquitetura.md](arquitetura.md) | Stack completa: React/GitHub Pages, Supabase, VPS, agentes, integrações externas |
| [analise-ifood.md](analise-ifood.md) | Fluxo completo do módulo Análise iFood (consultor → agente → resultado → ações) |
| [rbac.md](rbac.md) | Schema RBAC, fluxo de autorização React + Bridge Server, matriz de permissões |
| [memoria-central.md](memoria-central.md) | Memória compartilhada dos agentes: lojas, client_facts, client_timeline, loja_metricas |
| [whatsapp.md](whatsapp.md) | Modelo WhatsApp: contacts, grupos, membros, mensagens, fluxo do evolution-webhook |
| [deli.md](deli.md) | DELI COO Digital: semáforo Verde/Amarelo/Vermelho, triggers, drafts, fluxo de aprovação |

## Como visualizar

**GitHub** — abre qualquer arquivo `.md` acima e o diagrama renderiza automaticamente.

**VS Code** — instale a extensão [Markdown Preview Mermaid Support](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid):
1. `Ctrl+Shift+X` → buscar "Markdown Preview Mermaid Support" → Install
2. Abra o arquivo `.md` → `Ctrl+Shift+V` para abrir o preview

**Mermaid Live Editor** — cole o bloco em [mermaid.live](https://mermaid.live) para editar visualmente e exportar PNG/SVG.

## Como editar

Os diagramas são texto puro. Qualquer pessoa pode editar diretamente.

```
flowchart TD
    A[Nó A] --> B[Nó B]
    B --> C{Decisão}
    C -->|Sim| D[Resultado 1]
    C -->|Não| E[Resultado 2]
```

Referência completa da sintaxe: [mermaid.js.org/intro](https://mermaid.js.org/intro/)

## Como pedir pro Claude Code atualizar

Basta descrever a mudança em linguagem natural:

> "Adiciona o módulo CORA no diagrama de arquitetura, conectado ao Supabase e à Evolution API"

O Claude edita o `.md` diretamente e commita.

## Rascunhos e brainstorming

Rascunhos visuais ficam em `docs/rascunhos/` (exports PNG/SVG do Excalidraw).
Não substituem o Mermaid — são para ideação. Veja a seção 12 do `CLAUDE.md` para o workflow completo.
