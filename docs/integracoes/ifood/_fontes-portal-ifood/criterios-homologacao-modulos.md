# iFood — Critérios de homologação por módulo (PDV/restaurante) — capturado 2026-06-27
(Extração truncada em ~1900 chars/página pelo browser; núcleo dos requisitos preservado.)

## Catalog — /guides/modules/catalog/homologation
A API de Catálogo gerencia o cardápio completo. Homologação garante tratamento correto de criação de itens, preços, disponibilidade e operações multi-contexto. TODOS que usam a API de Catálogo devem homologar.
**Pré-requisitos** (pedidos que não cumprem são rejeitados no agendamento ou na reunião):
- Aplicação pronta para produção. Homologação NÃO testa chamadas isoladas — testa a aplicação completa. Demonstrar a **interface final** (painel admin, app, PDV ou produto p/ o lojista) criando, atualizando e exibindo dados reais do catálogo.
- (continua: cobre criação de itens, preços, disponibilidade, multi-contexto)

## Order — /guides/modules/order/homologation
Valida que a integração Order atende requisitos de produção. Lojas que falham em receber/confirmar pedidos geram cancelamentos.
**Pré-requisitos:** Conta Profissional (CNPJ) · App completo pronto p/ testes · Dados da loja de teste (ID e nome) · Conexão estável.
**Checklist de requisitos obrigatórios:**
- **Consumo de eventos:** consultar `/events:polling` a cada 30 segundos OU processar webhooks; responder `/acknowledgment` para TODOS os eventos.
- **Confirmação:** confirmar pedidos DELIVERY e TAKEOUT (imediatos e agendados) dentro do SLA.
- **Cancelamento:** exibir motivos de `/cancellationReasons` e processar solicitações.
- **Pagamento:** exibir bandeira do cartão e troco em dinheiro.
- **Cupons:** exibir valor e responsabilidade (continua).

## Events — /guides/modules/events/homologation
Testes feitos no APP como um todo, não só nas chamadas. **Conta CNPJ obrigatória** (CPF não aceito).
Critérios específicos por método (Polling vs Webhook):
**Polling:**
- Enviar requests no `Get New Events` (`/events:polling`) a cada **30 segundos** para não perder pedidos.
- Usar header `x-polling-merchants` para filtrar eventos por merchant.
- Filtrar eventos por tipo e grupo, se necessário.
- Enviar `Acknowledge Events` para TODOS os eventos recebidos (código 200) imediatamente após o polling.
- Apps de Integradora Logística: enviar `excludeHeartbeat=true` (continua).
**Webhook:** (critérios próprios — coletar)

## Demais módulos PDV (coletar critérios se necessário)
- Merchant → /guides/modules/merchant/homologacao
- Review → /guides/modules/review/homologation
- Shipping → /guides/modules/shipping/homologacao
