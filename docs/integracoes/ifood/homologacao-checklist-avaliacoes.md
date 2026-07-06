# Checklist de Homologação — App "Avaliações" (Merchant + Review)

> Coletado do portal do desenvolvedor iFood (logado) em 2026-07-06.
> Fontes: `developer.ifood.com.br/pt-BR/docs/guides/modules/merchant/homologacao` e `/review/homologation`.
> Contexto: plano aprovado em 2026-07-06 (sessão orquestradora) — App 1 da trilha Avaliações → Finanças → Catálogo.

## Pré-requisitos gerais

- [ ] Aplicativo completamente pronto para teste (o analista navega a interface final em sessão remota ~45 min)
- [ ] Conta Profissional (CNPJ) — CPF não é aceito
- [ ] Token de acesso válido fornecido durante onboarding
- [ ] Ticket de homologação aberto (fila corre em paralelo ao build)
- [ ] Confirmar categoria do app de teste no portal (alvo: **Avaliações**; o app antigo era PDV — verificar/criar)

## Módulo Merchant — endpoints e critérios de aprovação

| Endpoint | Método | Critério |
|---|---|---|
| `/merchants` | GET | Array de lojas com `id`, `name`, `corporateName` |
| `/merchants/{merchantId}` | GET | Objeto com operações e endereço completo |
| `/merchants/{merchantId}/status` | GET | `state` (OK/WARNING/CLOSED/ERROR) com validações |
| `/merchants/{merchantId}/interruptions` | GET | Array vazio ou com interrupções ativas |
| `/merchants/{merchantId}/interruptions` | POST | Cria pausa com `id`, `start`, `end` → **201** |
| `/merchants/{merchantId}/interruptions/{id}` | DELETE | Remove pausa → **204** sem conteúdo |
| `/merchants/{merchantId}/opening-hours` | GET | Array de turnos com `dayOfWeek`, `start`, `duration` |
| `/merchants/{merchantId}/opening-hours` | PUT | Atualiza horários |

⚠️ **Implicação de escopo**: Merchant exige demonstrar **escrita** (criar/remover pausa, atualizar horários) pela interface. Na CD isso entra pelo fluxo padrão draft→aprovação (`/ifood/acao` → `/ifood/aprovar`). A tela `lojas` do tenant de homologação precisa expor pausar/despausar loja e horários.

### Cenários de teste Merchant
- Autenticação · Listagem de lojas · Status da loja · Pausas (Interrupções) · Horários

### Tratamento de erros exigido (Merchant)
| Código | Cenário | Verificação |
|---|---|---|
| 400 | Parâmetros inválidos | Corpo inclui `code` e `message` |
| 401 | Token inválido/expirado | Mensagem clara sobre autenticação |
| 403 | Sem acesso à loja | Erro indica permissão insuficiente |
| 409 | Recurso em conflito | Código específico (ex.: `InterruptionOverlap`) |
| 429 | Rate limit | Respeitar header `Retry-After` |

### Considerações finais (Merchant)
- Retry com backoff exponencial para erros 5xx
- Respeitar limite de 1000 req/s
- **Polling mínimo de 30 segundos para status**
- Validar tokens antes de usar em produção

## Módulo Review — endpoints e critérios de aprovação

### Listar avaliações
- [ ] Lista básica: 200 · campos obrigatórios `id`, `status`, `replies[]`, `version`, `visibility` · paginação `page`, `size`, `total`, `pageCount` corretos
- [ ] Filtro por data: retorna apenas reviews do período
- [ ] Limite de página: `pageSize > 50` → **400** · lista vazia → `reviews: []`

### Obter detalhes
- [ ] Detalhes completos: 200 · todos os campos V2 · `replies[].from` é `MERCHANT` ou `CUSTOMER`
- [ ] ID inexistente → **404**

### Responder avaliação
- [ ] Texto válido (10–300 chars) → **201** · response contém `createdAt`, `reviewId`, `text`
- [ ] Status ≠ `NOT_REPLIED` → **409 ou 422**
- [ ] Texto < 10 ou > 300 chars → **400**

### Obter resumo (`/summary`)
- [ ] 200 · `totalReviewsCount` ≥ nº de reviews listadas · `validReviewsCount` ≤ total (exclui antigas e privadas) · `score` = média das reviews válidas

### Checklist final (Review — como o analista avalia)
- [ ] Lista de avaliações retorna todas as reviews
- [ ] Filtro por data funciona
- [ ] Paginação correta
- [ ] Detalhes completos de uma review
- [ ] Resposta criada com sucesso (201)
- [ ] Rejeição de status inválido (409)
- [ ] Rejeição de texto inválido (400)
- [ ] Summary com cálculo correto
- [ ] **Link de Política de Avaliações visível na UI**
- [ ] Tratamento de erros 401/403/404
- [ ] Tratamento de rate limit 429

## Itens de build derivados (sprint)

1. Tela `resp-avaliacoes` (T-HOMOLOG): reply via Review API sandbox no fluxo draft→aprovação, com validação de 10–300 chars no front e tratamento visível de 409/400.
2. Tela `lojas` (T-HOMOLOG): status por loja (polling ≥30s), pausar/despausar via draft→aprovação, horários (leitura no mínimo; PUT via draft se exigido na sessão).
3. **Link "Política de Avaliações" visível** na tela de avaliações (exigência literal do checklist).
4. Tratamento de erro uniforme: mensagens claras para 401/403/404/429 (com respeito a `Retry-After`).
5. Summary da Review API alimentando o "BI de notas" da Visão Geral do T-HOMOLOG.
