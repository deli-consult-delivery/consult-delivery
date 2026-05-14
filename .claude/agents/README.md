# Subagents — Consult Delivery

Subagents customizados específicos da plataforma Consult Delivery. Complementares aos 33 agents GSD globais (que ficam em `~\.claude\agents\`).

## Convenção de prefixo

| Prefixo | Onde fica | Propósito |
|---|---|---|
| `gsd-*` | Global (`~\.claude\agents\`) | Metodologia GSD genérica, multi-projeto |
| `cd-*` | Repo (`consult-delivery\.claude\agents\`) | Específico da Consult Delivery (Trigger.dev, Supabase, RESTRUCTURE.md) |

Quando aparecer alucinação, você sabe na hora qual subagent corrigir.

## Instalação

Esta pasta `.claude/agents/` fica na **raiz do repo `consult-delivery`** e é versionada em Git.

Estrutura:
```
consult-delivery/
├── .claude/
│   └── agents/
│       ├── README.md
│       ├── cd-task-creator.md
│       ├── cd-migration-creator.md
│       └── cd-validator.md
├── src/
├── trigger/
├── supabase/
└── RESTRUCTURE.md
```

Depois de colocar, commit:

```powershell
git add .claude/agents/
git commit -m "feat: subagents cd-* específicos da plataforma"
git push
```

## Os 3 subagents

### `cd-task-creator`

**Quando é invocado:** ao criar ou editar tasks Trigger.dev (`trigger/**/*.ts`).

**Triggers automáticos:**
- "criar task X"
- "adicionar agente Y"
- "implementar fluxo Z" em Trigger.dev

**O que garante:**
- Toda task tem Zod InputSchema e OutputSchema
- Audit log via `logAgentRun()` sempre
- Multi-tenant (tenant_id no audit)
- Retry configurado
- Sem credenciais hardcoded
- TypeScript compila antes de devolver

**Invocação manual:**
```
@cd-task-creator crie a task cora-analisar-devedor
```

---

### `cd-migration-creator`

**Quando é invocado:** ao criar ou editar migrations Supabase (`supabase/migrations/*.sql`).

**Triggers automáticos:**
- "criar migration"
- "adicionar coluna"
- "mudar schema"
- "alterar tabela X"

**O que garante:**
- Numeração sequencial correta
- Cabeçalho com Data/Autor/Motivo/Risco/Reversão
- `BEGIN; ... COMMIT;` sempre
- RLS em tabelas novas com dados de cliente
- `ON DELETE` explícito em FKs
- Não roda em prod sem aprovação

**Invocação manual:**
```
@cd-migration-creator adicione coluna last_login_at em tenants
```

---

### `cd-validator`

**Quando é invocado:** antes de declarar feature pronta ou mergear PR.

**Triggers automáticos:**
- "está pronto?"
- "posso mergear?"
- "validar feature X"
- "auditar entrega"
- Após qualquer outro subagent declarar conclusão

**O que faz:**
- Audita em 7 camadas:
  1. Sanidade básica (git status, branch)
  2. Build (`npm run build`)
  3. TypeScript (`tsc --noEmit`)
  4. Schema / migrations
  5. Padrões do projeto (Zod, audit, credenciais)
  6. Smoke test (execução real)
  7. Critério de aceite da feature

- Devolve relatório estruturado com evidência (output bruto) de cada camada
- Recomendação: mergear / mergear com ressalva / não mergear

**É anti-yes-man:** se algo não foi executado em ambiente real, marca como ⚠️ no mínimo, nunca ✅.

**Invocação manual:**
```
@cd-validator audita a feature LARA antes de mergear na main
```

---

## Fluxo recomendado pra criar agente novo

```
1. "criar task cora-analisar-devedor"
   → Claude principal invoca cd-task-creator
   → arquivo trigger/cora/analisar-devedor.ts criado seguindo padrão

2. "preciso de uma tabela pra registrar análises CORA"
   → Claude principal invoca cd-migration-creator
   → arquivo supabase/migrations/NNNN_create_cora_analyses.sql criado

3. "validar essa feature antes de mergear"
   → Claude principal invoca cd-validator
   → relatório de 7 camadas

4. Se relatório ✅ ou ⚠️ aceitável → mergear
   Se ❌ → corrigir, voltar pro passo 3
```

## Coexistência com os 33 GSD

Você pode chamar AMBOS na mesma sessão:

```
@gsd-planner faz o plano de implementação do CORA
@cd-task-creator implementa cada task do plano
@cd-validator audita o resultado
```

Os GSD planejam de forma genérica; os `cd-*` executam seguindo padrões específicos da plataforma.

## Princípios que TODOS os subagents `cd-*` respeitam

1. **Output bruto > resumo confiante.** Sempre mostrar evidência objetiva.
2. **Anti-alucinação.** Ler arquivo real antes de afirmar API/schema.
3. **Doc autoritativo > memória.** RESTRUCTURE.md vence sempre.
4. **Anti-yes-man.** Reportar problema é melhor que dizer "tudo ok".
5. **Multi-tenant é obrigatório.** Toda feature de dados de cliente respeita tenant_id + RLS.

## Atualização ao longo do tempo

Quando aprender lição nova ("Claude Code alucinou X de novo"), edita o `.md` correspondente e adiciona regra anti-alucinação. Commita.

Cada commit no histórico do Git é uma lição aprendida.
