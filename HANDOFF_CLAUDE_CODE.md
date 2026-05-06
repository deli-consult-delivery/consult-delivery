# 🚀 Handoff pro Claude Code — Implementar LARA Agente Régua

> Este é o prompt que você cola no Claude Code (Antigravity) pra ele aplicar
> os 6 artefatos no repo + subir o agente no OpenClaw.
>
> Os artefatos estão na pasta de handoff entregue em separado.

---

## 📋 PROMPT PARA COLAR NO CLAUDE CODE

```
Tarefa: implementar a LARA (agente régua de disparo) end-to-end.

CONTEXTO:
- Briefing oficial: `docs/handoff/lara/briefing.md` (passei junto)
- Decisões já tomadas: LARA orquestradora + 3 sub-agentes Nexus, comunicação async, 
  loja piloto a definir, pesquisa começa manual.
- Agente vive no OpenClaw (VPS 45.39.210.183:18789).
- Drafts vão pra agent_drafts, nada vai pro cliente sem aprovação humana.

ANTES DE COMEÇAR — CHECAGENS OBRIGATÓRIAS:

1. Confirma que estamos NO branch correto (não em main):
   git branch --show-current
   Se estiver em main, PARA e me pergunta qual branch criar.
   Sugestão: wandson/lara-agente-regua

2. Confirma o número da próxima migration:
   dir supabase/migrations | sort | tail -5
   Se já existe arquivo `20260506_001_*` no diretório, bumpa o sufixo (002, 003...).
   Não sobrescreve nada que já existe.

3. Confirma que existem as tabelas pré-requisito:
   - tenants, tenant_members (RBAC)
   - lojas (memória central)
   - client_facts, client_timeline (memória)
   - audit_log
   - agent_drafts (drafts/DELI)
   Se alguma faltar, PARA e me avisa — significa que migrations anteriores não foram aplicadas.

PASSOS DE IMPLEMENTAÇÃO (em ordem, parar se algum falhar):

PASSO 1 — Aplicar migration
   Copiar `supabase/migrations/20260506_001_lara_regua.sql` (vou te entregar) 
   pra dentro do repo. NÃO MODIFICAR o conteúdo.
   
   Validar sintaxe:
   - rodar `supabase db push --dry-run` se possível
   - se não tiver supabase CLI, copia o conteúdo e me mostra antes de aplicar

PASSO 2 — Criar diagrama de fluxo
   Copiar `docs/fluxos/lara-regua.md` pro repo.

PASSO 3 — Criar pasta do agente LARA
   Criar diretório `.openclaw/agents/lara/` com:
   - system_prompt.md
   - base_regras.yaml
   - nexus_subagents_spec.md
   
   Não inventa conteúdo, copia exatamente o que te entreguei.

PASSO 4 — Criar especificação Bridge Server
   Copiar `bridge-server/docs/lara-endpoints.md` pro repo.

PASSO 5 — Atualizar CLAUDE.md
   Adicionar seção referente à LARA na seção 5 (AGENTES — IDENTIDADES).
   Marcar LARA como "ativa em desenvolvimento" (não mais "Milestone v2").
   Adicionar referência ao briefing e diagrama.

PASSO 6 — Atualizar memória RBAC (seed)
   Adicionar permissões `lara:invoke` e `lara:approve_drafts` para Wélida e Wandson.
   Criar arquivo `supabase/seed/lara_rbac.sql` se não existir um padrão de seed.
   ME MOSTRAR o SQL antes de aplicar.

PASSO 7 — Verificações finais
   - git status (mostra todos arquivos novos)
   - git diff (mostra mudanças no CLAUDE.md)
   - listar todos os arquivos criados em árvore
   - NÃO fazer commit ainda

PASSO 8 — Próximos passos manuais (não fazer, só listar pra mim)
   - Subir LARA no OpenClaw (manual, no terminal SSH da VPS)
   - Implementar endpoints `/invoke/lara`, `/api/nexus-dispatch/:agent`, `/api/nexus-callback` 
     no bridge-server (Yasmin)
   - Implementar 3 sub-agentes no Nexus (equipe Nexus)
   - Criar aba "Agente de Régua/Disparo" no frontend (Yasmin)

REGRAS DURANTE TODA A EXECUÇÃO:
- NÃO inventar conteúdo. Use exatamente o que te entreguei.
- NÃO fazer commit nem push sem minha aprovação.
- Se alguma checagem inicial falhar, PARAR e perguntar.
- Mostrar saída bruta (git status, ls, etc) — não resumir confiante.
- Se um arquivo já existir no repo (raro), me perguntar antes de sobrescrever.

ENTREGAS ESPERADAS NO FINAL:
- 6 arquivos novos no repo (1 migration + 1 doc fluxo + 3 do agente + 1 do bridge)
- CLAUDE.md atualizado
- 1 SQL de seed RBAC mostrado pra mim aprovar
- git status limpo de erros, mostrando só arquivos novos
- Lista de próximos passos manuais
- ZERO commits feitos
```

---

## 📦 ESTRUTURA DOS 6 ARQUIVOS QUE O CLAUDE CODE VAI APLICAR

```
consult-delivery/
├── docs/
│   └── fluxos/
│       └── lara-regua.md ............................. [Artefato 1]
├── supabase/
│   └── migrations/
│       └── 20260506_001_lara_regua.sql ............... [Artefato 2]
├── .openclaw/
│   └── agents/
│       └── lara/
│           ├── system_prompt.md ...................... [Artefato 3]
│           ├── base_regras.yaml ...................... [Artefato 4]
│           └── nexus_subagents_spec.md ............... [Artefato 5]
├── bridge-server/
│   └── docs/
│       └── lara-endpoints.md ......................... [Artefato 6]
└── CLAUDE.md ............................................. [editar]
```

---

## 🔄 FLUXO COMPLETO RECOMENDADO

```
1. Você baixa este zip
2. Cria branch novo:
   git checkout main
   git pull origin main
   git checkout -b wandson/lara-agente-regua

3. Cola o conteúdo do zip dentro do repo (preservando estrutura)
4. Abre Claude Code
5. Cola o PROMPT PARA COLAR NO CLAUDE CODE acima
6. Acompanha a execução
7. Revisa cada arquivo
8. git diff e git status pra conferir
9. Commit e PR pra Yasmin revisar:
   git add .
   git commit -m "feat(lara): handoff completo — agente, migration, fluxos, specs"
   git push -u origin wandson/lara-agente-regua

10. Subir LARA no OpenClaw (próxima sessão, manual)
11. Yasmin implementa endpoints Bridge Server (Sprint próximo)
12. Equipe Nexus implementa sub-agentes lá (paralelo)
13. Frontend cria aba "Agente de Régua" (paralelo)
14. Piloto com 1 loja real (Salgados da Mônica?)
```

---

## ⚠️ PONTOS DE ATENÇÃO

1. **Migration cria 4 tabelas + 2 triggers + RLS.** Antes de aplicar, fazer backup:
   `supabase db dump --schema public > backup_pre_lara.sql`

2. **NEXUS ainda não tem webhook implementado.** Você precisa combinar com a equipe Nexus
   antes do piloto. Endpoints esperados:
   - POST /agents/pesquisa/run
   - POST /agents/regua/run
   - POST /agents/midia/run

3. **Secret HMAC do callback Nexus.** Gerar agora com:
   `openssl rand -hex 32`
   E salvar no Infisical como `NEXUS_CALLBACK_SECRET`. Compartilhar com a equipe Nexus.

4. **Custos.** Régua de 28 campanhas com Nexus = ~R$349/loja (estimativa).
   Dependendo de quantas lojas, isso vai pra orçamento mensal. Confirmar pricing real
   antes do piloto.

5. **Loja piloto.** Você ainda não definiu. Salgados da Mônica é o mais maduro 
   (já tem análise validada na base de regras do analista-ifood).

---

## ✅ CHECKLIST DE ACEITE FINAL

- [ ] 6 arquivos no lugar certo do repo
- [ ] CLAUDE.md atualizado com a LARA
- [ ] Migration aplicada (ou pelo menos validada)
- [ ] Seed de RBAC para Wélida e Wandson aplicado
- [ ] LARA respondendo no OpenClaw (manual)
- [ ] Bridge Server com 3 endpoints (Yasmin)
- [ ] Nexus com 3 sub-agentes (equipe Nexus)
- [ ] Aba frontend criada (Yasmin)
- [ ] Piloto com 1 loja real validado pela Wélida

---

*Handoff pronto. Boa sorte! 🚀*
