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

## Os 10 subagents cd-*

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

---

### `cd-echo`

**Quando é invocado:** ANTES de qualquer implementação — quando user descreve algo que quer fazer.

**Triggers automáticos:**
- "quero implementar X"
- "adicionar feature Y"
- "criar Z no sistema"

**O que garante:**
- Gaps e ambiguidades mapeados antes de gastar tokens implementando errado
- Checklist de 9 pontos específicos da plataforma (multi-tenant, semáforo DELI, draft, etc.)
- Lista de perguntas acionáveis para o Wandson
- Só passa para @cd-compass quando os gaps estão resolvidos

---

### `cd-compass`

**Quando é invocado:** após gaps clarificados, antes de implementar.

**Triggers automáticos:**
- "planejar X"
- "como implementar Y"
- "quebrar em passos"

**O que garante:**
- Plano de 3-6 passos (não mais, não menos)
- Critério de aceite testável por passo (output bruto obrigatório)
- Match no stack real (Trigger.dev, Supabase, React)
- Aprovação explícita do Wandson antes de implementar

---

### `cd-raven`

**Quando é invocado:** antes de implementar plano grande ou mudança de alto risco.

**Triggers automáticos:**
- "critique o plano"
- "o que pode dar errado"
- "valida antes de implementar"
- Qualquer plano com migration, novo agente, ou integração externa

**O que garante:**
- Análise adversarial multi-perspectiva (engenheiro / Wandson / cliente)
- 10 checklist-items específicos da plataforma
- Previsões pré-comprometimento (evita viés de confirmação)
- Veredicto: REJEITAR / REVISAR / ACEITAR-COM-RESSALVAS / ACEITAR

---

### `cd-bolt`

**Quando é invocado:** plano aprovado pelo Wandson, hora de implementar.

**Triggers automáticos:**
- "pode implementar"
- "o plano foi aprovado, vai"
- "implementa o passo X"

**O que garante:**
- Menor diff viável (sem scope creep)
- Lê o arquivo antes de editar (anti-alucinação)
- Verifica com tsc + build após cada passo
- Circuit breaker: 3 falhas → escala para @cd-apex
- Nunca comita em main

---

### `cd-oath`

**Quando é invocado:** após o Claude ou @cd-bolt dizer que terminou.

**Triggers automáticos:**
- "verificar se está pronto"
- "o Claude disse que terminou — confere"
- "posso fazer PR?"
- "audita a entrega"

**O que garante:**
- Verificação em 7 camadas com output bruto
- Mapeamento de cada critério de aceite do plano
- Risco de regressão avaliado
- Nunca aprova sem evidência real

---

### `cd-lens`

**Quando é invocado:** antes de PR ou deploy de feature importante.

**Triggers automáticos:**
- "revisa o código"
- "code review antes de mergear"
- "audita a implementação"

**O que garante:**
- Estágio 1: o código fez o que foi pedido?
- Estágio 2: qualidade, segurança, convenções da plataforma
- Checklist de anti-padrões específicos (Trigger.dev, Supabase, DELI)
- Veredicto: APROVAR / SOLICITAR_MUDANÇAS / COMENTAR

---

### `cd-apex`

**Quando é invocado:** decisões técnicas difíceis, bugs de causa raiz, @cd-bolt com 3 falhas.

**Triggers automáticos:**
- "por que X está acontecendo"
- "como deveria ser arquitetado Y"
- "o Bolt falhou 3 vezes"
- "performance ruim em Z"

**O que garante:**
- Lê arquivos reais antes de opinar (cita arquivo:linha)
- Causa raiz, não sintomas
- Recomendações concretas com tradeoffs explícitos
- Nunca escreve código — passa para @cd-bolt implementar

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

## Fluxo de qualidade completo (novo — ciclo 7 agentes)

Para features novas ou de alto risco:

```
1. @cd-echo    → "Analisa o pedido: [descrição]"
               → lista gaps antes de gastar tokens implementando errado

2. @cd-compass → "Cria plano com os gaps resolvidos"
               → plano de 3-6 passos + critério de aceite

3. @cd-raven   → "Critique o plano antes de implementar"
               → adversarial review — o que vai falhar?

4. Wandson aprova → "pode seguir"

5. @cd-bolt    → implementa passo a passo com verificação
   (ou @cd-task-creator + @cd-migration-creator para tasks/migrations)

6. @cd-oath    → "Verificar se foi 100% implementado"
               → veredicto PASSOU / FALHOU / INCOMPLETO

7. @cd-lens    → "Code review antes do PR"
               → APROVAR / SOLICITAR_MUDANÇAS

8. PR + merge
```

Para bugs:
```
1. @cd-apex  → "Por que [problema] está acontecendo?"
2. @cd-bolt  → implementa a correção recomendada
3. @cd-oath  → confirma que o bug foi corrigido
```

Para mudanças pequenas (1-2 arquivos):
```
1. @cd-bolt  → implementa
2. @cd-validator → audita (7 camadas)
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
