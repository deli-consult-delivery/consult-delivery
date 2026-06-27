# Catalog — Introdução (guia)
URL: /pt-BR/docs/guides/modules/catalog/introduction/

## Sidebar do módulo CATALOG (estrutura completa)
Introdução · Como funciona · Fundamentos · Padrões comuns · Gerenciar complementos · Combos · Pizzas · Multi-menu · Gerenciar disponibilidade · Erros e troubleshooting · Endpoints · Critérios de homologação · Versionamento

## Conteúdo
Crie e gerencie o cardápio da loja via API. A API de Catálogo sincroniza categorias, itens e complementos em tempo real com **Entrega, Cardápio Digital e Consumo no Local**, com **preços e disponibilidade independentes por canal**.
Se integra um POS existente: use a API para espelhar o cardápio no iFood e manter preços, status e estoque atualizados.

### Antes de começar
- `merchantId` — ID da loja, fornecido no onboarding.
- `accessToken` — Token Bearer (ver Authentication).

### 5 passos práticos
**Passo 1 — Listar catálogos** (toda loja já tem ≥1 catálogo):
`GET https://merchant-api.ifood.com.br/catalog/v2.0/merchants/{merchantId}/catalogs` → guarde `catalogId`.

**Passo 2 — Criar categoria** `POST /categories`. Campo `template`: `DEFAULT` (itens comuns) ou `PIZZA`.
Body: `{"name":"Lanches","status":"AVAILABLE","template":"DEFAULT"}` → guarde `id` (categoryId).

**Passo 3 — Criar item** `PUT /items`. Hierarquia do payload:
```
item → metadados (id, preço, status, categoryId)
├── products → produtos usados no item e complementos
├── optionGroups → grupos de complementos (bebidas, tamanhos)
└── options → opções dentro dos grupos
```
Todos os 4 campos sempre enviados (mesmo vazios). IDs (`id` de itens/produtos/opções) **gerados por você, padrão UUID v4, únicos por merchant**. ID fora de UUID v4 → erro 404. `externalCode` = identificador customizado para o POS (string arbitrária, recomendado p/ sync bidirecional, evita duplicatas).
Body exemplo: item {id UUID, type DEFAULT, categoryId, status AVAILABLE, price.value 25.00, externalCode BURGER_001}, products[{id,name,description,externalCode}], optionGroups[], options[]. → item aparece no app imediatamente.

**Passo 4 — Adicionar complementos**: `PUT /items` é **idempotente** (cada chamada substitui o item inteiro). Reenviar estrutura completa com optionGroups+options preenchidos. optionGroupType ex: `OFFER_UNIT`; option referencia productId + price.

**Passo 5 — Verificar** `GET /categories/{categoryId}/items`.

### Troubleshooting
- Item não aparece: status AVAILABLE em item+categoria e price.value definido.
- Complementos não salvos: usar PUT /items (não POST), resend estrutura completa.
- **Erro 409 Conflict**: externalCode é único por merchant.

### Próximos passos (sub-páginas)
Como funciona (fluxo + quando chamar cada endpoint + contextModifiers/multi-canal) · Fundamentos (cada campo e tipos) · Pizza · Combo · Gerenciar disponibilidade · Erros e troubleshooting.
