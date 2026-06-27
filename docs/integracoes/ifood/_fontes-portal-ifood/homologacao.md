# iFood — Homologação (onboarding) — capturado do portal logado 2026-06-27

## Conta / contexto
- Wandson logado como **Super integradora** no portal developer.ifood.com.br.
- Base de TODAS as APIs: https://merchant-api.ifood.com.br

## Slugs reais descobertos (getting-started)
- /pt-BR/docs/getting-started/first-steps/create-account — Criar uma conta
- /pt-BR/docs/getting-started/first-steps/create-app — Criar um aplicativo
- /pt-BR/docs/getting-started/first-steps/generate-test-order — Gerar pedido de teste
- /pt-BR/docs/getting-started/first-steps/request-access — Solicitar acessos
- /pt-BR/docs/getting-started/homologation/categories — Política de homologação
- /pt-BR/docs/getting-started/homologation/criteria — Critérios de homologação

Fluxo de integração (ordem do menu): Fluxo de integração → Criar conta → Criar aplicativo → Gerar pedido de teste → Solicitar acessos → Política de homologação → Critérios de homologação.

## Política de homologação (texto integral)
- Homologue o app ANTES de liberar para clientes (garante que a integração funciona).
- **Pré-requisitos:** desenvolvimento completo · conta **Profissional (CNPJ)** · app funcional completo.
- iFood testa o **aplicativo completo**, não apenas chamadas individuais da API. **Contas Pessoal/Estudante (CPF) NÃO são aceitas.**
- Crie o app de PRODUÇÃO somente APÓS homologar o app de TESTE.

### Categorias de aplicativo × módulos disponíveis
| Categoria | Módulos disponíveis |
|-----------|---------------------|
| **PDV**       | Merchant, Events, Order, Catalog, Review, Shipping |
| Groceries     | Merchant, Events, Order, Catalog, Item, Picking, Shipping, Financial |
| Catálogo      | Merchant, Catalog |
| Logística     | Merchant, Events, Logistics |
| Avaliações    | Merchant, Review |
| Finanças      | Merchant, Events, Financial |

- **Módulo Order é exclusivo para PDVs em tempo real. Aplicativos de BI NÃO são homologados com Order.**
- => Para RESTAURANTE operar pedidos: app categoria **PDV**. Para só BI/relatórios (sem receber pedido): categorias Catálogo/Avaliações/Finanças.

## Critérios de homologação — POR MÓDULO (cada um tem checklist próprio)
Página criteria lista os módulos, cada um com URL de critérios detalhados:
- Merchant  → /pt-BR/docs/guides/modules/merchant/homologacao
- Order     → /pt-BR/docs/guides/modules/order/homologation
- Events    → /pt-BR/docs/guides/modules/events/homologation
- Catalog   → /pt-BR/docs/guides/modules/catalog/homologation
- Logistics → /pt-BR/docs/guides/modules/logistics/homologation
- Financial → /pt-BR/docs/guides/modules/financial/homologation
- Review    → /pt-BR/docs/guides/modules/review/homologation
- Shipping  → /pt-BR/docs/guides/modules/shipping/homologacao
- (Item/Picking = Groceries, fora do escopo restaurante)

iFood descreve cada módulo:
- Merchant = Gestão de lojas · Order = Gestão de pedidos · Events = Gestão e entrega de eventos de pedidos
- Catalog = Gestão de cardápios/produtos/itens · Logistics = Gestão operacional de entregas
- Financial = (financeiro) · Review = Gestão de avaliações · Shipping = Serviços de entrega

## Estrutura técnica do site da doc (para coleta automatizada futura)
- Site **Gatsby** (SPA, client-routing). Conteúdo embutido no HTML (sem fetch de conteúdo).
- WebFetch externo = 403 (Cloudflare). Só acessível via browser.
- Extração confiável do corpo do artigo: seletor CSS `[class*="Content-sc-1aq4f23"]` → innerText.
- Navegação no menu = `<button>` router (sem href); clicar via JS `.click()` por texto. Menu é CONTEXTUAL (muda por seção).
- javascript_tool limita output ~1900 chars; get_page_text tem limite maior mas às vezes pega callout errado em getting-started.
