# Texto para o ticket de homologação — App "Avaliações" (Merchant + Review)

> **Uso:** copiar o bloco abaixo (a partir de "## Texto para colar") direto no formulário/ticket
> de homologação do portal do desenvolvedor iFood. Preencher os `<placeholders>` antes de enviar.
> Fontes: `docs/dossie/checklist-homologacao.md`, `docs/integracoes/ifood/homologacao-checklist-avaliacoes.md`,
> `docs/integracoes/ifood/homologacao-matriz-cobertura.md` (10/11 critérios Review ✅, Merchant
> M3/M4/M6/M7 ✅ + M5 leitura, único risco de conteúdo: R9).

---

## ⚠️ Antes de enviar (2 pendências, não são bloqueio de código)

1. **Confirmar a URL real da "Política de Avaliações"** no portal do desenvolvedor e corrigir
   `src/console/AvaliacoesReviewApi.jsx:15` se a URL hoje no código estiver errada (nunca foi
   confirmada contra a fonte oficial — matriz de cobertura, R9).
2. **Rodar o smoke live** listado no fim deste doc pelo menos 1x contra o merchant de teste antes
   da sessão com o analista (a matriz marca isso como pendente — sandbox de reviews estava vazio
   em 05/07).

---

## Texto para colar

**Nome do aplicativo:** Consult Delivery — Avaliações
**Categoria solicitada:** Avaliações (Merchant + Review)
**Ambiente:** Sandbox/teste (app de produção será criado após aprovação nesta categoria)
**Merchant de teste vinculado:** `92a0ec17-6951-4a9b-9c02-ee12963be5f1` ("Teste - CONSULT DELIVERY LTDA")

### Módulos e endpoints utilizados

**Merchant**
- `GET /merchant/v1.0/merchants/{merchantId}/status` — status da loja (aberta/fechada/interrupção),
  consumido com polling de 30s.
- `GET/POST /merchant/v1.0/merchants/{merchantId}/interruptions` , `DELETE .../interruptions/{id}`
  — consultar, criar e remover pausas da loja.
- `GET/PUT /merchant/v1.0/merchants/{merchantId}/opening-hours` — horários de funcionamento (hoje só
  leitura na interface; escrita já implementada no serviço).

**Review**
- `GET /review/v2.0/merchants/{merchantId}/reviews` — listagem paginada, com filtro por período.
- `GET /review/v2.0/merchants/{merchantId}/reviews/{reviewId}` — detalhe de uma avaliação.
- `POST /review/v2.0/merchants/{merchantId}/reviews/{reviewId}/answers` — resposta à avaliação
  (texto 10–300 caracteres).
- `GET /review/v2.0/merchants/{merchantId}/summary` — resumo (nota média e contagem), exibido na
  Visão Geral.

Todas as chamadas passam por um serviço próprio (Bridge) com client OAuth2, tratamento uniforme de
erros (400/401/403/404/409/429 com respeito a `Retry-After`) e fluxo de aprovação humana antes de
qualquer escrita (rascunho → aprovação, nunca escrita direta e automática).

### Telas da interface para a sessão de homologação

Ambiente de teste dedicado (tenant "Homologação iFood", sem branding de outros agentes):

- **Lojas** — status da loja em tempo quase-real (polling 30s), pausar/despausar (com motivo e
  janela), horários de funcionamento (leitura).
- **Avaliações** — listagem paginada com filtro por data, detalhe de avaliação, resposta com
  validação de tamanho (10–300 caracteres) e tratamento de erro visível (ex.: avaliação já
  respondida, texto inválido), link para a Política de Avaliações.
- **Visão Geral** — resumo consolidado (nota média, total de avaliações) alimentado pelo endpoint
  de summary.

**Acesso:** `https://app.consultdelivery.com.br` — usuário e senha de teste serão enviados por
canal seguro separado (não incluídos neste ticket).

### Contato técnico

- **Nome:** Wandson Silva
- **E-mail:** wandson@consultdelivery.com.br
- **CNPJ:** `<CNPJ_CONSULT_DELIVERY>`
- **Telefone:** `<TELEFONE_DE_CONTATO>`

---

## Checklist de smoke live antes da sessão (não faz parte do texto do ticket)

Rodar contra o merchant de teste `92a0ec17-6951-4a9b-9c02-ee12963be5f1` e registrar o resultado:

- [ ] Status da loja retorna `state` válido
- [ ] Criar 1 pausa (interruption) → 201 → aparece na listagem → remover → 204
- [ ] Ler horários de funcionamento
- [ ] Listar avaliações (com e sem filtro de data)
- [ ] Abrir detalhe de 1 avaliação
- [ ] Responder 1 avaliação (texto válido) → 201
- [ ] Tentar responder texto < 10 ou > 300 caracteres → 400 tratado na UI
- [ ] `/summary` com e sem avaliações cadastradas (loja de teste hoje tem 0 — deve mostrar "Sem
      avaliações ainda.", não erro — já corrigido no PR #763)
- [ ] Confirmar a URL da Política de Avaliações abre a página correta
