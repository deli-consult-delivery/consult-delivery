# Discussão — 3 Decisões de Tenancy (revenda)

**Data:** 2026-07-01 · **Status:** discussão (inclinações do Wandson analisadas) · Base: `docs/tenancy-estrutura-estudo.md`

Wandson inclinou: **(1) `parent_tenant_id`** · **(2) domínio próprio** · **(3) preço diferenciado por tenant**.
Resumo do parecer: **concordo com 1 e 3** (com adendos que evitam dívida) e **concordo com o destino da 2, mas com um bloqueio técnico de infra que precisa ser decidido antes**.

---

## Decisão 1 — Hierarquia via `parent_tenant_id` ✅ CONCORDO

**Escolha do Wandson:** agência = um `tenant` com filhos, ligados por `tenants.parent_tenant_id`.

**A favor (por que é a escolha certa agora):**
- Reusa **100%** da infra: `tenant_members`, `roles`, `tenant_modules`, branding, padrões de RLS. Zero reescrita.
- Diff mínimo e **aditivo/reversível** (`ALTER TABLE tenants ADD COLUMN parent_tenant_id uuid REFERENCES tenants(id)`). Cabe no mandato de autonomia.
- Agência, loja e lojista autônomo viram **o mesmo objeto** em níveis diferentes.

**Riscos (e como neutralizar):**
- **Mistura de conceitos** — uma agência não tem "avaliação de cliente", mas herda as colunas de loja. → Adicionar `tenant_type text CHECK (tenant_type IN ('platform','agency','store'))`. O tipo governa o que é válido para cada linha.
- **RLS recursiva pode custar/loopar** — "agência vê descendentes" precisa de cuidado. → Travar a **profundidade em 3 níveis fixos** (platform → agency → store). Sem recursão arbitrária: um `store` tem `parent` = agency; um `agency` tem `parent` = platform. Isso permite RLS por *um join*, não por CTE recursiva.
- **Integridade** — loja órfã, agência apontando pra loja, ciclo. → Constraints: `store.parent_tenant_id` aponta p/ um `agency`; `agency.parent` p/ `platform`; `platform.parent IS NULL`. Trigger simples valida o par (type do pai × type do filho).

**Caminho de fuga (se crescer):** se "agência" ganhar vida própria (faturamento, times, contratos), extrair para tabela `organizations` depois é uma migration de extração — reversível. Começar por `parent_tenant_id` **não** fecha essa porta.

**O que muda no schema (Fase 0):**
```sql
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS parent_tenant_id uuid REFERENCES tenants(id);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tenant_type text
  DEFAULT 'store' CHECK (tenant_type IN ('platform','agency','store'));
-- backfill: cria a agência-raiz "Consult Delivery" e faz os 14 tenants atuais filhos dela.
```

**Veredito:** ✅ `parent_tenant_id` **+ `tenant_type` + profundidade fixa de 3 níveis**. A escolha do Wandson, blindada contra os 3 riscos.

---

## Decisão 2 — Domínio próprio 🟡 CONCORDO NO DESTINO, MAS HÁ UM BLOQUEIO

**Escolha do Wandson:** cada agência revende no **próprio domínio** (ex.: `painel.agenciax.com.br`), white-label total — a marca "Consult Delivery" some da URL.

**A favor:** é o white-label mais forte possível. Para vender para **outras agências**, é um argumento de venda real — elas revendem como se fosse produto delas.

**⚠️ Bloqueio técnico (o ponto mais importante desta discussão):**
Hoje o frontend é **deploy em GitHub Pages** (CLAUDE.md → "Deploy: GitHub Actions → GitHub Pages"). **GitHub Pages suporta apenas UM domínio custom por site** e **não** emite TLS para domínios de terceiros sob demanda. Ou seja: **domínio próprio por agência é incompatível com o hosting atual.** Para servir `painel.agenciax.com.br`, `gestao.outraagencia.com`, etc., você precisa de:
- Roteamento por **Host header** (o app descobre a agência pelo domínio de entrada);
- **Emissão automática de TLS** para domínios de terceiros (Let's Encrypt on-demand / SSL for SaaS);
- **Verificação de domínio** (a agência aponta CNAME/A e você confirma posse).

Isso exige **trocar o hosting do frontend** para uma plataforma que faça "SSL for SaaS" — **Cloudflare Pages/SaaS**, **Netlify**, **Vercel** (proibido na stack ❌), ou um **proxy próprio na VPS** (Caddy com `on-demand TLS` — você já tem VPS Ubuntu). Caddy na VPS é o caminho mais alinhado à stack atual e sem custo de plataforma nova.

**Recomendação — fazer em 2 tempos (e isso alimenta a Decisão 3):**
1. **Fase 3a — Subdomínio primeiro** (`agenciax.consultdelivery.com.br`): wildcard DNS `*.consultdelivery.com.br` + wildcard TLS resolvem **todas as agências de uma vez**, roteando por subdomínio. Barato, rápido, já habilita revenda. Cobre ~90%.
2. **Fase 3b — Domínio próprio como upgrade PREMIUM**: quem quiser a URL própria paga mais (casa direto com "preço diferenciado" da Decisão 3). Requer o proxy Caddy na VPS com on-demand TLS + verificação de domínio.

**Veredito:** 🟡 destino = domínio próprio (concordo), **mas** como **tier premium na Fase 3b**, com **subdomínio na 3a** cobrindo o grosso. **Antes da 3b é preciso decidir o hosting** (recomendo **Caddy on-demand TLS na VPS** — usa o que você já tem, respeita a proibição da Vercel). Sub-decisão a travar: *migrar hosting agora ou só quando a primeira agência pedir domínio próprio?*

---

## Decisão 3 — Preço diferenciado por tenant ✅ CONCORDO (com um catálogo por trás)

**Escolha do Wandson:** cobrar um **preço personalizado por cada tenant** — nada de plano único engessado.

**A favor:** é exatamente o DNA de consultoria — cada cliente negocia. Captura valor de add-ons (domínio próprio, agentes extras, mais lojas). Flexível.

**Risco:** preço **100% custom** não escala e vira planilha manual — difícil de automatizar cobrança, comparar margem, dar desconto rastreável.

**Recomendação — híbrido (catálogo + override):** planos-base **como default**, com **preço custom por tenant sobrepondo** quando você negocia. O melhor dos dois mundos: escala por padrão, flexível quando precisa.
```sql
-- catálogo (defaults): ex. Essencial, Pro, White-label
CREATE TABLE plans (id uuid PK, name text, base_price numeric, features jsonb, ...);
-- assinatura por tenant, com override opcional de preço
CREATE TABLE tenant_subscriptions (
  tenant_id uuid REFERENCES tenants(id),
  plan_id uuid REFERENCES plans(id),
  custom_price numeric NULL,          -- se preenchido, sobrepõe base_price (o "preço diferenciado")
  billing_cycle text,                 -- monthly/yearly
  asaas_subscription_id text,         -- assinatura recorrente Asaas
  status text, ...
);
```
Preço efetivo = `COALESCE(custom_price, plan.base_price)`. Substitui o **R$147 hardcoded** de `Clientes.jsx:108`.

**Sub-decisão que falta travar — o fluxo do dinheiro (quem cobra quem):**
- **(A) Plataforma → cobra cada loja** (você fatura direto a loja/tenant). Simples, mas atropela a agência revendedora.
- **(B) Plataforma → cobra a agência** (soma dos tenants dela, com preço possivelmente custom por tenant); a **agência cobra a loja** por fora. Mais fiel à revenda: a agência é sua cliente, a loja é cliente da agência.
- **(C) Revenue-share**: agência cobra a loja, você retém um %.
- Recomendação inicial: **(B)** — a Plataforma fatura a agência por tenant-loja ativo (preço custom por tenant permitido), a agência precifica a loja como quiser. É o que sustenta revenda de verdade.

**Veredito:** ✅ preço por tenant, **implementado como `custom_price` sobre um catálogo de planos** + assinatura recorrente Asaas. Travar o fluxo do dinheiro (recomendo B).

---

## Placar e próximos passos

| Decisão | Inclinação do Wandson | Parecer | Adendo-chave |
|---|---|---|---|
| 1 · Hierarquia | `parent_tenant_id` | ✅ Concordo | + `tenant_type` + 3 níveis fixos |
| 2 · Domínio | Domínio próprio | 🟡 Concordo no destino | Bloqueio: GitHub Pages não serve; subdomínio na 3a, domínio próprio premium na 3b (Caddy/VPS) |
| 3 · Billing | Preço por tenant | ✅ Concordo | Catálogo + `custom_price` override; travar fluxo do dinheiro (recomendo B) |

**Travas resolvidas (2026-07-01):**
- **T-2a → RESOLVIDA:** migrar hosting **só quando a 1ª agência revendedora pedir domínio próprio**. Até lá, subdomínio (`agenciax.consultdelivery.com.br`) cobre a revenda. Domínio próprio (Caddy on-demand TLS na VPS) fica **sob demanda**, como gatilho de venda premium — não se antecipa infra.
- **T-3a → RESOLVIDA (modelo B, por nível):** **cada nível cobra o nível de baixo com quem tem relação comercial.**
  - **Agência revendedora** (cliente da Plataforma) → **ela** cobra as próprias lojas (fora da plataforma; ela precifica como quiser).
  - **Consult Delivery como agência-raiz** → cobra **diretamente** os clientes que ela mesma contrata na consultoria.
  - Ou seja: a Plataforma cobra a agência; a agência cobra a loja; e a Consult Delivery, acumulando o papel de agência-raiz, cobra suas lojas diretas.

**T-3b → RESOLVIDA (2026-07-01):** cobrança **por loja** (por tenant-loja ativo), **preço-base R$ 149,99**. É o default do catálogo de planos, com `custom_price` sobrepondo por acordo. Substitui o **R$147 hardcoded** de `Clientes.jsx:108`. Preço efetivo = `COALESCE(custom_price, 149.99)`.

**Próximo passo:** com 1, 3, T-2a e T-3a fechados, dá para abrir o **`/spec` da Fase 0 (hierarquia: `parent_tenant_id` + `tenant_type` + backfill dos 14 tenants sob a agência-raiz)** já — não depende de T-3b.
