# VendaERP — endpoints de ESCRITA verificados no swagger (Fase 2)

Data: 2026-06-14 · Fonte: **swagger LIVE do ERP** — `https://consultdelivery.vendaerp.com.br/api/swagger/v1/swagger.json` (HTTP 200, OpenAPI 3.0.1, 95 paths, baixado e inspecionado em 2026-06-14).

> GATE anti-alucinação (anti-padrão #2). Cada caminho, método e campo abaixo foi extraído do JSON cru, não da memória.
>
> **Observações estruturais comuns a todos os POST:**
> - Todos os endpoints de escrita ficam sob o prefixo `/api/request/<Recurso>/<Acao>`.
> - **Auth: 3 headers obrigatórios em TODO endpoint** — `Authorization-Token`, `User`, `App` (confirmado no swagger; bate com a memória `vendaerp-api-reference`). O Bridge já injeta esses headers; as tools não os recebem.
> - Limite: 1.000 requests/hora por chave de API.
> - Content-types aceitos no corpo: `application/json` (usar este), `application/json-patch+json`, `text/json`, `application/*+json`.
> - **Nenhum campo do corpo é marcado `required` no swagger** (todos os schemas vêm sem `required[]`). A obrigatoriedade real é regra de negócio do ERP, não do contrato — validar empiricamente na Task de cada domínio antes de marcar campo como obrigatório no Zod `inputShape`. Abaixo, "obrigatório (negócio)" = inferência conservadora, a confirmar com 1 POST real.

---

## CRM — criar oportunidade  ✅ CONFIRMADO

- **Caminho ERP:** `POST /api/request/Oportunidades/Cadastrar`
- **Summary swagger:** "Cadastra uma nova oportunidade no sistema"
- **Schema do corpo:** `Oportunidade` (corpo JSON; sem parâmetros de query/path além dos headers)
- **Campos do corpo:**
  - `codigo` : int32 — (saída/ID; não enviar ao criar)
  - `empresa` : string nullable
  - `cliente` : string nullable
  - `categoriaFunil` : string nullable
  - `statusFunil` : string nullable
  - `responsavel` : string nullable
  - `descricao` : string nullable
  - `dataAbertura` : date-time
  - `previsaoFechamentoNegocio` : date-time
  - `probabilidadeFechamento` : float
  - `valorNegocio` : double
  - `contato` : string nullable
  - `telefoneContato` : string nullable
  - `emailContato` : string nullable
  - `origem` : enum `OrigemOportunidade` (int, valores 0–11)
  - `nomeOrigem` : string nullable
  - `situacaoNegociacao` : enum `SituacaoNegociacao` (int, valores 0–2)
  - `dataEncerramento` : date-time
  - `motivoCancelamento` : string nullable
  - `campanha` : string nullable
  - `interacoes` : array<`Interacao`> nullable
- **Corpo mínimo proposto (negócio, a confirmar):** `{ cliente, descricao, valorNegocio, responsavel }`
- **Sub-path Bridge:** `/oportunidade`
- **Reversível?** Não há DELETE no swagger; existe `Oportunidades/Atualizar` (correção) e `Oportunidades/AdicionarInteracoes`. Criar oportunidade é aditivo/baixo risco — não destrutivo.

---

## Financeiro — lançamento / boleto

### Lançamento  ✅ CONFIRMADO
- **Caminho ERP:** `POST /api/request/Lancamentos/Criar`
- **Summary swagger:** "Método para criar um novo lançamento financeiro"
- **Schema do corpo:** `Lancamento`
- **Campos do corpo:**
  - `codigo` : int32 (saída/ID)
  - `dataCompetencia` : date-time
  - `dataVencimento` : date-time
  - `empresa` : string nullable
  - `cliente` : string nullable
  - `numeroDocumento` : string nullable
  - `descricao` : string nullable
  - `observacoes` : string nullable
  - `quitado` : boolean
  - `dataQuitacao` : date-time
  - `conciliado` : boolean
  - `ehDespesa` : boolean  ← define receita (false) vs despesa (true)
  - `planoDeConta` : string nullable
  - `centroDeCusto` : string nullable
  - `contaBancaria` : string nullable
  - `formaPagamento` : string nullable
  - `lancamentoGrupo` : string nullable
  - `valor` : double
  - `totalRecebido` : double
  - `pagamentos` : array<`Pagamento`> nullable
  - `modoParcelamento` : enum `ModoParcelamento` (int 0–3)
  - `intervalo` : enum `IntervaloParcelamento` (int 1–3)
  - `diasIntervalo` : int32
  - `juro` : double
  - `jurosCompostos` : boolean
  - `numeroParcelas` : int32
  - `parcelas` : array<`ParcelamentoManual`> nullable
- **Corpo mínimo proposto (negócio, a confirmar):** `{ cliente, descricao, valor, dataVencimento, ehDespesa }`
- **Sub-path Bridge:** `/lancamento`
- **Reversível?** Sem DELETE no swagger; existe `Lancamentos/Atualizar`. Criar é aditivo.

### Boleto / cobrança  ✅ CONFIRMADO (não existe `Boletos/...`; há 2 caminhos reais)
**Não existe endpoint `Boletos/...`** no swagger. Boleto é gerado por uma destas vias:

1. **`POST /api/request/Lancamentos/GerarCobrancaIntegracao`** (recomendado p/ Fase 2 — granular, por lançamento)
   - **Summary:** "Cria uma nova cobrança para um lançamento utilizando as integrações de pagamento do ERP"
   - **Schema do corpo:** `DadosPagamentoCobrancaInput`
     - `codigoLancamento` : int32
     - `formaPagamento` : enum `FormaPagamentoCobranca` (int 0–2)
   - **Sub-path Bridge:** `/cobranca`
   - **Reversível?** Aditivo (gera cobrança). Depende de um lançamento já existir → fluxo natural: criar lançamento → gerar cobrança.

2. **`POST /api/request/Contratos/GerarBoletos`** (em massa, por contrato — **assíncrono**)
   - **Summary:** "Gera os boletos de todos os lançamentos financeiros do contrato. Processo é executado de forma assíncrona."
   - **SEM corpo.** Parâmetro **em query:** `codigo` (double, required) = código do contrato.
   - Por ser em massa + assíncrono, **fora do MVP propor→confirmar** (efeito amplo, sem retorno síncrono confiável). Documentado, não cabeado na Fase 2 inicial.

---

## Fiscal — NFE  ✅ CONFIRMADO (sem corpo; parâmetro em query)

- **Caminho ERP:** `POST /api/request/Fiscal/EmitirNFE`
- **Summary swagger:** "Este método destina-se a emitir NFe a partir do código da venda"
- **SEM requestBody.** Parâmetro **em query:** `CodigoVenda` (int64, required).
- (Relacionado, fora do MVP: `POST /api/request/Fiscal/EmitirNFCE`.)
- **Sub-path Bridge:** `/nfe`
- **Reversível?** **NÃO.** Emitir nota fiscal é ato fiscal-legal irreversível (cancelamento é outro processo, não exposto aqui). → **Risco alto: exige confirmação Telegram obrigatória** e, idealmente, gate Vermelho. A máquina propor→confirmar é o mínimo; tratar NFE como o caso mais sensível do MVP.

---

## Estoque — movimentação  ✅ CONFIRMADO

- **Caminho ERP:** `POST /api/request/ProdutosEstoque/Salvar`
- **Summary swagger:** "Salva uma nova movimentação de estoque"
- **Schema do corpo:** `EstoqueMovimentacao`
  - `produtoCodigo` : string nullable
  - `depositoNome` : string nullable
  - `quantidade` : double
  - `ehEntrada` : boolean  ← entrada (true) vs saída (false)
  - `data` : date-time nullable
- **Corpo mínimo proposto (negócio, a confirmar):** `{ produtoCodigo, quantidade, ehEntrada }`
- **Sub-path Bridge:** `/estoque`
- **Reversível?** Sem DELETE; correção = movimentação inversa (`ehEntrada` oposto). Aditivo, mas afeta saldo → confirmação Telegram recomendada.

---

## Enums referenciados (valores int crus — swagger não traz rótulos)

O swagger expõe só os inteiros; os rótulos NÃO estão no JSON. Mapear rótulo↔valor empiricamente (ou via UI do ERP) antes de expor no `inputShape`:

| Enum | Valores |
|------|---------|
| `OrigemOportunidade` | 0,1,2,3,4,5,6,7,8,9,10,11 |
| `SituacaoNegociacao` | 0,1,2 |
| `FormaPagamentoCobranca` | 0,1,2 |
| `ModoParcelamento` | 0,1,2,3 |
| `IntervaloParcelamento` | 1,2,3 |

---

## Domínios SEM escrita na API (cortados do escopo)

**Nenhum domínio do MVP foi cortado** — os 5 têm POST de escrita confirmado:

| Domínio | Status | Endpoint |
|---------|--------|----------|
| Oportunidade | ✅ confirmado | `POST /api/request/Oportunidades/Cadastrar` (corpo `Oportunidade`) |
| Lançamento | ✅ confirmado | `POST /api/request/Lancamentos/Criar` (corpo `Lancamento`) |
| Boleto/cobrança | ✅ confirmado | `POST /api/request/Lancamentos/GerarCobrancaIntegracao` (corpo `DadosPagamentoCobrancaInput`) |
| NFE | ✅ confirmado | `POST /api/request/Fiscal/EmitirNFE` (query `CodigoVenda`, sem corpo) |
| Estoque | ✅ confirmado | `POST /api/request/ProdutosEstoque/Salvar` (corpo `EstoqueMovimentacao`) |

**Ajustes de escopo (não cortes):**
- **Boleto:** preferir `Lancamentos/GerarCobrancaIntegracao` (granular, síncrono). `Contratos/GerarBoletos` (em massa, assíncrono, sem corpo) fica fora do MVP propor→confirmar.
- **NFE:** sem corpo — a tool recebe `CodigoVenda` e o Bridge monta a query. Caso mais sensível (irreversível) → confirmação Telegram obrigatória.

---

## Pendências para as tasks de código (não bloqueiam a máquina propor→confirmar)
1. Confirmar empiricamente os campos realmente obrigatórios (swagger não marca `required`) com 1 POST real por domínio.
2. Mapear rótulos dos enums (valores int → texto).
3. Decidir entre query vs body por endpoint no Bridge: NFE e Contratos/GerarBoletos usam **query**; os demais usam **body JSON**.
