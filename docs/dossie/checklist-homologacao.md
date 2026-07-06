# Checklist de Homologação iFood — Consult Delivery

> STATUS: DRAFT — revisar antes de publicar

Checklist binário contra os critérios reais do portal iFood, capturados em `docs/integracoes/ifood/_fontes-portal-ifood/homologacao.md` e `criterios-homologacao-modulos.md`. Escopo MVP decidido: **Merchant + Review + Financial + Catalog** (Order fora do MVP — decisão travada, `docs/estrategia/PLANO-CONTINUIDADE-PLATAFORMA-2026-07.md` §2 A1). Falta é declarado como falta — nada aqui é otimista.

Categoria de aplicativo alvo: como o produto não opera pedidos em tempo real (Order fora de escopo), a categoria correta é **BI/Avaliações/Finanças/Catálogo**, não PDV completo — confirmar com o iFood qual categoria de app cobre exatamente Merchant+Review+Financial+Catalog combinados (fonte indica categorias separadas: Avaliações = Merchant+Review; Finanças = Merchant+Events+Financial; Catálogo = Merchant+Catalog — pode exigir mais de um app ou uma categoria combinada a confirmar com o iFood).

## Pré-requisitos gerais (política de homologação)

- [ ] Conta **Profissional (CNPJ)** no portal iFood — Conta Pessoal/Estudante (CPF) não é aceita
- [ ] Aplicativo de **teste/sandbox** criado e homologado ANTES de criar o app de produção
- [ ] "Aplicação pronta para produção" demonstrável — iFood testa o **produto completo** (interface final: Console v2), não chamadas isoladas de API
- [x] CNAE compatível já confirmado (`docs/estrategia/PLANO-CONTINUIDADE-PLATAFORMA-2026-07.md` §0.4: "CNAE ok")
- [ ] Loja piloto (candidata: uma das 14 lojas do GESTOR) designada para o teste de homologação

## Estado da integração hoje (linha de base)

- [ ] **Nenhuma linha de integração oficial com a API iFood existe no repo hoje** — toda coleta atual (Merchant/Review/Financial/Catalog) é via **browser** no `ifood-portal-worker` (confirmado em `docs/estrategia/PLANO-CONTINUIDADE-PLATAFORMA-2026-07.md` §0.4: "Nenhuma linha de integração oficial no repo — tudo é browser"). Client OAuth2 oficial (`bridge-server/lib/ifood-api.js`) ainda não foi construído — é a etapa A3.1 (Sandbox) do plano, ainda não iniciada nesta sessão

## Módulo Merchant (status da loja)

- [ ] Client OAuth2 (`bridge-server/lib/ifood-api.js`) implementado e testado no sandbox
- [ ] Consumo de status da loja (aberta/fechada, interrupções) refletido no Console v2
- [x] Tabela de destino já existe: `ifood_merchants` (citada em `docs/estrategia/PLANO-CONTINUIDADE-PLATAFORMA-2026-07.md` §2 A2 arquitetura, "existe")
- [ ] Feature flag por loja (`lojas.fonte_dados = 'portal' | 'api'`) implementada para migração gradual

## Módulo Review (avaliações)

- [x] Coleta e resposta de avaliações **já funciona em produção** — via browser, com IA gerando sugestão e consultor aprovando (`supabase/migrations/20260614_001_avaliacoes.sql`, feature "editar resposta aprovada antes da publicação" #723)
- [ ] Coleta via **API oficial** (não browser) implementada — etapa A3.2 do plano, ainda não iniciada
- [ ] Comparação API × browser em produção paralela (critério de aceite da Frente A: divergência < 1% por 7 dias) — não iniciada, depende do item acima
- [x] RLS de isolamento entre tenants já corrigida e validada nesta mesma superfície (vazamento encontrado e corrigido: `supabase/migrations/20260701_003_bloquear_resp_avaliacoes_leak_consult_delivery.sql`, `20260701_004`)

## Módulo Financial (faturamento/repasses)

- [x] Dado de faturamento já coletado hoje via browser (GESTOR, `loja_metricas`)
- [ ] Coleta via API oficial (Financial) implementada — etapa A3.3, não iniciada
- [ ] Conciliação/repasses tratados — não mapeado no código hoje

## Módulo Catalog (cardápio/itens)

- [x] Itens pausados/cardápio já coletados hoje via browser (parte da coleta GESTOR)
- [ ] Coleta via API oficial (Catalog) implementada — etapa A3.3, não iniciada
- [ ] Demonstração de criação/atualização/exibição de dados reais de catálogo na interface final (Console v2) — requisito explícito do iFood para este módulo, não verificado ainda

## Módulo Order — FORA DO ESCOPO (decisão travada)

- [x] Decisão registrada: Order fica fora do MVP de homologação (`docs/estrategia/PLANO-CONTINUIDADE-PLATAFORMA-2026-07.md` §2 A1) — plataforma não opera pedidos em tempo real, é produto de BI/consultoria, não PDV
- Consequência: confirmar com o iFood que a categoria de app escolhida não exige Order/Events de polling 30s (o critério de Events é PDV-específico)

## Requisitos técnicos gerais de app (se Events/Order entrarem no futuro)

- [ ] Polling `/events:polling` a cada 30s ou processamento de webhook — **não aplicável ao MVP atual** (Order fora de escopo), documentar como não-requisito nesta fase
- [ ] `Acknowledge Events` para 100% dos eventos — idem, não aplicável ao MVP

## Governança e prontidão organizacional

- [x] Governança de mudança (branch+PR, SQL aprovado antes de aplicar) já em vigor e auditável (`docs/deli-memory/principles/git-workflow.md`)
- [x] Dossiê LGPD/segurança/termos em elaboração (este conjunto de documentos, drafts)
- [ ] Dossiê revisado e aprovado pelo Wandson (critério de aceite explícito da Frente A)
- [ ] Homologação agendada — só deve ser feita **após checklist interno 100%** (regra travada do plano; reprova = 15 dias de espera para reagendar)

## Resumo binário (visão executiva)

| Módulo | Coleta hoje | Via API oficial | Pronto p/ homologar |
|---|:---:|:---:|:---:|
| Merchant | ✅ (browser) | ❌ | ❌ |
| Review | ✅ (browser) | ❌ | ❌ |
| Financial | ✅ (browser) | ❌ | ❌ |
| Catalog | ✅ (browser) | ❌ | ❌ |
| Order | — (fora de escopo) | — | — |

**Conclusão honesta:** o produto funciona e entrega valor real hoje via coleta por browser, mas **nenhum módulo tem integração oficial via API do iFood ainda** — pré-requisito inegociável para agendar homologação. Etapa A3.1 (Sandbox OAuth2) é o próximo passo técnico concreto, ainda não iniciado nesta sessão.
