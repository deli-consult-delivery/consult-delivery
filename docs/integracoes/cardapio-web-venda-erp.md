# Integração Cardápio Web → Venda ERP

## Escopo da V1

- Fluxo somente Cardápio Web → Venda ERP.
- Inclui pedidos próprios, iFood, 99Food, Keeta e Aiqfome.
- Delivery, retirada e consumo local entram ao receber o webhook.
- Mesa/comanda (`closed_table`) entra somente com status `closed`.
- O Venda ERP recebe pedido faturado, baixa de estoque e lançamento financeiro.
- Cancelamento usa `Pedidos/ExcluirPedido`, revertendo os três efeitos.
- NFC-e, sincronização de catálogo e devolução de status ao Cardápio Web ficam
  fora da V1.

## Endpoints

| Método | Endpoint | Proteção |
|---|---|---|
| GET/POST | `/api/cardapio-web/oauth/start` | formulário público + código one-shot no body |
| GET | `/api/cardapio-web/oauth/start/admin` | JWT admin/owner |
| GET | `/api/cardapio-web/oauth/callback` | `state` PKCE uso único |
| GET/PATCH | `/api/cardapio-web/integration` | JWT + membership do tenant |
| POST | `/api/cardapio-web/webhook` | `X-Webhook-Token` constant-time |

O início público usa exclusivamente a allowlist fixa. O início administrativo
recebe `tenant_id`, `merchant_id` e `venda_empresa` na query. O app fica
`enabled=false` após o callback; a ativação é feita no PATCH autenticado.

## Escopos OAuth obrigatórios

- `orders`: consultar os pedidos e seus status.
- `store`: consultar `GET /api/partner/v1/merchant` e confirmar que a loja
  autorizada é exatamente a loja configurada na allowlist.

O callback não persiste tokens sem os dois escopos, e a ativação também recusa
instalações sem `orders` e `store`. O pedido enviado anteriormente ao suporte
com apenas `orders` precisa ser complementado com `store`.

## Segredos

Configurar somente no Infisical ou `.env` da VPS:

```text
CARDAPIO_WEB_ENV=sandbox
CARDAPIO_WEB_CLIENT_ID=
CARDAPIO_WEB_WEBHOOK_TOKEN=
CARDAPIO_WEB_TOKEN_ENCRYPTION_KEY=
CARDAPIO_WEB_REDIRECT_URI=https://bridge.consultdelivery.com.br/api/cardapio-web/oauth/callback
CARDAPIO_WEB_BOOTSTRAP_TENANT_ID=
CARDAPIO_WEB_BOOTSTRAP_MERCHANT_ID=1650
CARDAPIO_WEB_BOOTSTRAP_VENDA_EMPRESA=
CARDAPIO_WEB_BOOTSTRAP_TOKEN=
CARDAPIO_WEB_VENDA_WRITE_ENABLED=false
```

`CARDAPIO_WEB_TOKEN_ENCRYPTION_KEY` deve conter 32 bytes em base64. Tokens OAuth
são persistidos por tenant com AES-256-GCM; as tabelas não têm acesso
`anon/authenticated`.

O bootstrap só aceita o tenant, merchant e empresa fixos acima. O código deve ser
aleatório, usar 32–128 caracteres Base64 URL-safe, tem uso único persistido no
banco e deve ser rotacionado após a primeira tentativa. Gere, por exemplo, com
`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
O POST limita tentativas por IP e globalmente em janelas de 10 minutos, retornando
`429` com `Retry-After`. O código é digitado no formulário e enviado somente no body
`application/x-www-form-urlencoded`; nunca entra no path, query string,
redirect ou logs. A página e a resposta usam `Cache-Control: no-store` e
`Referrer-Policy: no-referrer`. O callback consulta
`GET /api/partner/v1/merchant` com o token recém-emitido e recusa o vínculo se a
loja autorizada for diferente do merchant configurado. Uma instalação já
vinculada não pode ser sobrescrita pelo bootstrap.

## Processamento

1. O webhook é validado e inserido no inbox com `event_id` único.
2. O Bridge responde HTTP 200 antes de consultar sistemas externos.
3. O worker busca o pedido completo por `order_id`.
4. Produtos e complementos viram itens separados pelo `external_code`/código
   PDV. Código ausente falha antes de tocar o ERP.
5. Sem CPF/CNPJ, usa `Consumidor Final`; com documento válido, pesquisa o
   cliente e só o cadastra quando ainda não existe.
6. O pedido usa `codigoPedidoCliente = CW-{merchant_id}-{order_id}`.
7. Antes de escrever, o Bridge pesquisa a correlação no Venda ERP.
8. `SalvarEFaturar`, `Salvar` e `ExcluirPedido` nunca recebem retry automático.
   Timeout/5xx dispara consulta de reconciliação; resultado não comprovado fica
   com status `reconcile`.

O Venda ERP pode devolver erro de negócio como string em HTTP 200. Sucesso de
faturamento exige objeto com `Pedido.Codigo`; update/delete exigem mensagem de
sucesso.

## Configuração financeira

Cada instalação guarda empresa, depósito, cliente genérico, plano de contas,
forma de pagamento padrão e um de-para opcional `venda_payment_mapping`.
Quando os pagamentos do Cardápio Web não fecham exatamente com o total, a ponte
usa uma única parcela pelo valor total para não criar divergência financeira.

Todos os cálculos usam centavos inteiros. Valores com mais de duas casas usam
arredondamento decimal half-up (`10.075` → `10.08`); notação científica,
`Infinity`, `NaN`, `null`, booleanos, arrays, objetos e strings vazias são
rejeitados. Antes de qualquer write, a ponte exige:

1. soma das linhas PDV mapeadas = subtotal dos itens do Cardápio Web;
2. subtotal + frete + outras despesas = valor final do Venda ERP;
3. subtotal + taxas - descontos = total informado pelo Cardápio Web.

Qualquer diferença de um centavo falha fechado e não cria cliente, pedido,
estoque ou lançamento financeiro.

## Ativação

1. Aplicar `20260723_001_cardapio_web_venda_erp.sql`.
2. Configurar segredos, os três identificadores e o código de bootstrap sem
   imprimi-los em log. Cadastrar exatamente
   `https://bridge.consultdelivery.com.br/api/cardapio-web/oauth/start` como URL
   de instalação pública.
3. Abrir a URL, digitar o código no formulário e rotacioná-lo após a tentativa;
   alternativamente, iniciar OAuth pela rota `/oauth/start/admin` autenticada,
   informando tenant, merchant e empresa Venda ERP.
4. Confirmar que a instalação retornada por `GET /integration` contém
   `orders` e `store` em `scope`.
5. Configurar de-para financeiro, se necessário.
6. Definir `CARDAPIO_WEB_VENDA_WRITE_ENABLED=true` e fazer
   `PATCH /integration` com `enabled=true`, usando usuário `admin` ou `owner`.
7. Criar um pedido Sandbox e conferir evento, pedido, estoque e lançamento.

Evidência do contrato vivo:
`docs/integracoes/cardapio-web-venda-erp-homologacao.md`.
