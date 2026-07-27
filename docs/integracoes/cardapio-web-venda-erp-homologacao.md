# Homologação — Cardápio Web → Venda ERP

Data: 2026-07-26
Ambiente: Sandbox Cardápio Web + empresa de homologação Venda ERP
Status: E2E aprovado; integração desligada em estado seguro

## Objetivo

Provar o contrato real de `Pedidos/SalvarEFaturar` antes de implementar o
webhook, especialmente criação, correlação, baixa de estoque, contas a receber,
retry ambíguo e cancelamento/estorno.

## Evidências brutas sanitizadas

### Preparação

- `Empresas/GetTodasEmpresas`: `200`, uma empresa disponível.
- `Depositos/GetTodosDepositos`: `200`, depósito padrão disponível.
- `FormasPagamento/GetTodasFormasPagamento`: `200`, formas de pagamento
  disponíveis.
- `Produtos/Pesquisar`: nenhum produto inicial.
- `Pessoas/Pesquisar`: nenhum cliente `Consumidor Final`.

### Produto de teste

- `Produtos/Salvar`: `200`.
- Produto criado com código `CW-HML-001`.
- `ProdutosEstoque/Salvar`: `200`.
- Saldo confirmado por `Produtos/Pesquisar`: `10`.

### Cliente genérico

`Pessoas/Salvar` sem CPF/CNPJ:

```text
HTTP 417
"NÃO FOI POSSÍVEL SALVAR OS DADOS DA PESSOA, OBRIGATÓRIO INFORMAR UM CPF OU CNPJ"
```

### Pedido faturado

`Pedidos/SalvarEFaturar?retornarPedido=true` sem plano de contas:

```text
HTTP 200
"Pedidos faturados precisam de um PLANO DE CONTAS válido."
```

Após informar `VENDA DE MERCADORIAS`, sem cliente:

```text
HTTP 200
"NÃO FOI POSSÍVEL SALVAR o pedido 0. É preciso informar O NOME DO CLIENTE."
```

Após informar `Consumidor Final`, ainda não cadastrado:

```text
HTTP 200
"NÃO FOI POSSÍVEL SALVAR o pedido 0. O cliente Consumidor Final NÃO EXISTE."
```

### Gate aprovado após cadastro do cliente

Com `Consumidor Final` cadastrado e o corpo mínimo validado:

```text
SalvarEFaturar: HTTP 200, pedido Codigo 3
CodigoPedidoCliente: CW-GATE1-20260723-001
Estoque CW-HML-001: 10 -> 9
Lançamento: Codigo 626, R$ 10,00, EhDespesa false
ExcluirPedido [3]: HTTP 200, "Vendas Excluídas com sucesso!"
Pedido/estoque/financeiro: revertidos
```

O corpo vencedor não envia `categoria` nem `origemVenda`. Ele usa:
`Consumidor Final`, depósito `PADRÃO`, plano `VENDA DE MERCADORIAS` e
`À vista - Dinheiro`.

### E2E Cardápio Web

```text
Loja Sandbox: 11973 — Teste Consult Delivery
OAuth: ativo, scopes orders store
Pedido Cardápio Web: 53385
Correlação: CW-11973-53385
Pedido Venda ERP: Codigo 3
Item: CW-HML-001, quantidade 1, R$ 10,00
Cliente: Consumidor Final
Lançamento: Codigo 626, R$ 10,00, EhDespesa false
Status Cardápio Web: confirmed
Descrição Venda: CW-11973-53385 | catalog | Em preparação
```

O evento `ORDER_CREATED` foi processado em uma tentativa. O evento
`ORDER_STATUS_UPDATED` também foi processado em uma tentativa.

### Atualização de status faturado

`Pedidos/Salvar` alterou a descrição, mas devolveu o pedido com `Lancado=false`.
O endpoint correto para preservar o faturamento é:

```text
PUT Pedidos/SalvarEFaturar?retornarPedido=true
Finalizado: true
Lancado: true
```

Dois PUTs controlados sobre o pedido `3` mantiveram o estoque em `8` e
exatamente um lançamento financeiro, código `626`. A correlação persistida foi
normalizada para o objeto `Pedido`, sem wrapper aninhado.

## Conclusões

1. O Venda ERP devolve erros de negócio com `HTTP 200`; sucesso não pode ser
   decidido apenas por `response.ok`.
2. A API não permite criar o cliente genérico sem CPF/CNPJ.
3. O pedido faturado exige plano de contas e um cliente já cadastrado.
4. `SalvarEFaturar` baixa estoque e cria o lançamento financeiro.
5. `ExcluirPedido` reverte pedido, estoque e financeiro.
6. `Pedidos/Salvar` não preserva `Lancado`; mudança de status usa
   `PUT Pedidos/SalvarEFaturar` com `Finalizado=true` e `Lancado=true`.
7. PUT e DELETE compartilham um fence atômico por pedido; concorrência e
   `HTTP 429` seguem para reconciliação sem repetição automática.
8. POST, PUT e DELETE não podem ser repetidos após timeout; a correlação é
   `codigoPedidoCliente` dentro da janela de criação.

Estado final sanitizado:

```text
Pedido Venda 3: Finalizado true, Lancado true
Produtos/Pesquisar (CW-HML-001): estoque 8
Lançamentos: somente Codigo 626 para o pedido controlado
Instalação 11973: auth_mode oauth, scope orders store, status active, enabled false
VPS: CARDAPIO_WEB_VENDA_WRITE_ENABLED=false, bridge health HTTP 200
Produto Sandbox: pausado (EM FALTA; ação disponível Ativar)
```

## Estado seguro

- Segredos permanecem somente no `.env` modo `600`, fora do Git e deste
  documento.
- Migrations `20260723_001`, `20260726_001` e `20260726_002` foram aplicadas;
  a última consta no banco como `cardapio_web_venda_write_fence`.
- A instalação OAuth permanece `enabled=false` e a chave geral de escrita
  permanece `false`.
- A ativação para novos pedidos exige decisão operacional explícita após a
  homologação.
