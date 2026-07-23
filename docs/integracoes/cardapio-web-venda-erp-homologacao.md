# Homologação — Cardápio Web → Venda ERP

Data: 2026-07-23
Ambiente: empresa de homologação da Consult Delivery
Status: Gate 1 aprovado; integração implementada desligada

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

### Atualização de status

Prova adicional, também criada e excluída na homologação:

```text
{"create_http":200,"create_ok":true,"codigo":3,"initial_status":"Aguardando confirmação"}
{"update_http":200,"update_type":"string","update_preview":"PEDIDO 3 MODIFICADO COM SUCESSO!"}
{"search_http":200,"found":true}
{"cleanup_http":200,"cleanup_ok":true}
```

## Conclusões

1. O Venda ERP devolve erros de negócio com `HTTP 200`; sucesso não pode ser
   decidido apenas por `response.ok`.
2. A API não permite criar o cliente genérico sem CPF/CNPJ.
3. O pedido faturado exige plano de contas e um cliente já cadastrado.
4. `SalvarEFaturar` baixa estoque e cria o lançamento financeiro.
5. `ExcluirPedido` reverte pedido, estoque e financeiro.
6. `Pedidos/Salvar` atualiza o status sem refaturar.
7. POST, PUT e DELETE não podem ser repetidos após timeout; a correlação é
   `codigoPedidoCliente` dentro da janela de criação.

Consulta final de segurança:

```text
Pedidos/Pesquisar (origem de homologação): HTTP 200, count 0
Produtos/Pesquisar (CW-HML-001): HTTP 200, count 1
```

## Ativação pendente

- Receber `client_id` e `webhook_token` da Cardápio Web.
- Guardar os segredos no ambiente seguro da VPS.
- Aplicar a migration e concluir OAuth no Sandbox.
- A integração permanece `enabled=false` até essa ativação explícita.
