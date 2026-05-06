# Sub-agentes Nexus — Especificação técnica

> Documento de especificação dos 3 sub-agentes que vivem na plataforma Nexus (Evonexus)
> e que são chamados pela LARA via webhook assíncrono.
> Versão: 1.0 — 06/05/2026

---

## Visão geral

```
LARA (OpenClaw)  ──webhook──▶  Nexus
                                ├── Sub-agente 1: Pesquisa
                                ├── Sub-agente 2: Régua
                                └── Sub-agente 3: Mídia

Nexus  ──callback async──▶  https://app.consultdelivery.com.br/api/nexus-callback
```

Cada sub-agente é independente, tem prompt próprio, tem responsabilidade única.
Quem implementa esses sub-agentes **dentro do Nexus** é a equipe Nexus (ou o Wandson se tiver acesso).
A LARA é apenas cliente — define contrato de entrada e saída.

---

## Sub-agente 1 — NEXUS-PESQUISA

### Responsabilidade
Receber dados básicos de uma loja e produzir documento profundo de pesquisa: identidade, tom, presença digital, concorrência, oportunidades.

### Endpoint
`POST {NEXUS_BASE_URL}/agents/pesquisa/run`

### Autenticação
Header `Authorization: Bearer {NEXUS_API_KEY}` (gerenciado via Infisical, secret `NEXUS_API_KEY`).

### Input (request body)
```json
{
  "request_id": "uuid-v4",
  "tenant_id": "uuid",
  "loja_id": "uuid",
  "callback_url": "https://app.consultdelivery.com.br/api/nexus-callback",
  "callback_signature_secret_id": "infisical-secret-id",
  "dados_iniciais": {
    "nome_fantasia": "Salgados da Mônica",
    "razao_social": "...",
    "cnpj": "...",
    "cidade": "Imperatriz",
    "estado": "MA",
    "bairro": "...",
    "telefone_dono": "...",
    "horario_funcionamento": "...",
    "horario_delivery": "...",
    "raio_entrega_km": 5,
    "taxa_entrega": "fixa: 5",
    "link_cardapio_digital": "https://cardapioweb.com/...",
    "produto_carro_chefe": "Coxinha sortida",
    "ticket_medio_brl": 28,
    "categorias_cardapio": ["salgados", "bebidas"],
    "instagram_handle": "@salgadosdamonica",
    "google_maps_url": "https://maps.google.com/...",
    "ifood_url": "https://www.ifood.com.br/..."
  },
  "scope": {
    "fazer_scraping": true,
    "max_posts_instagram": 20,
    "buscar_concorrentes_proximos": true,
    "raio_concorrencia_km": 3
  }
}
```

### Output (callback)
```json
{
  "event": "pesquisa_concluida",
  "request_id": "uuid-v4",
  "tenant_id": "uuid",
  "loja_id": "uuid",
  "documento": {
    "identificacao": {
      "nome_fantasia": "...",
      "razao_social": "...",
      "cnpj": "..."
    },
    "operacao": {
      "horarios": "...",
      "raio_entrega": "...",
      "taxa_entrega": "..."
    },
    "cardapio": {
      "carro_chefe": "...",
      "ticket_medio_brl": 28,
      "produtos_destaque": ["Coxinha de frango", "Kibe"],
      "combos_existentes": [...],
      "categorias": [...]
    },
    "identidade_marca": {
      "logo_url": "...",
      "cores_principais": ["#vermelho", "#dourado"],
      "tom_de_voz": "descontraído regional",
      "slogan": "...",
      "hashtags_usadas": ["#salgadinhos", "#coxinhadafamilia"]
    },
    "presenca_digital": {
      "instagram": {
        "handle": "@salgadosdamonica",
        "seguidores": 1840,
        "engajamento_medio_pct": 3.2,
        "posts_analisados": 20,
        "padroes_de_post": "Posts focados no produto, fundo branco, legenda curta",
        "horario_que_publica": "Quase sempre 11h e 18h"
      },
      "google_maps": {
        "nota": 4.7,
        "qtd_avaliacoes": 132,
        "principais_elogios": ["sabor", "rapidez"],
        "principais_reclamacoes": ["embalagem"]
      },
      "ifood": {
        "nota": 4.8,
        "tempo_aberto_pct": 95
      }
    },
    "concorrencia": [
      {
        "nome": "Salgados X",
        "distancia_km": 0.8,
        "ticket_medio_brl": 25,
        "diferencial": "preço mais baixo",
        "fraqueza": "qualidade variável"
      }
    ],
    "oportunidades_observadas": [
      "Posts no IG sem CTA — oportunidade de melhorar conversão",
      "Horário de pico de busca no Maps é 18h-19h, mas ela publica IG só 11h e 18h"
    ]
  },
  "fontes_consultadas": [
    {"url": "https://cardapioweb.com/...", "type": "cardapio", "scraped_at": "2026-05-06T..."},
    {"url": "https://instagram.com/...", "type": "instagram", "scraped_at": "..."},
    ...
  ],
  "duracao_segundos": 87,
  "status": "ok"
}
```

### Prompt (referência para implementação no Nexus)

```
Você é o NEXUS-PESQUISA, sub-agente especializado em pesquisar profundamente
uma marca de food service (delivery brasileiro) e produzir um documento estruturado.

Recebe: dados básicos da loja + scope (até onde pesquisar)
Entrega: JSON estruturado com identidade, presença digital, concorrência, oportunidades.

Regras:
1. Nunca inventa dado. Se não conseguiu encontrar, marque como null com explicação
   no campo "fontes_consultadas".
2. Sempre respeita scope.fazer_scraping (se false, não acessa Instagram/Maps).
3. Cita fonte de cada afirmação.
4. Foca em achar OPORTUNIDADES (não só descrever).
5. Tom da pesquisa é prático: "o que isso permite à LARA fazer agora?"
6. Tempo limite: 5 minutos. Se não conseguiu, retorna parcial com status="parcial".
```

---

## Sub-agente 2 — NEXUS-RÉGUA

### Responsabilidade
Receber pesquisa profunda + parâmetros de cobertura e produzir régua de 25-40 campanhas estruturadas (sem mídias ainda).

### Endpoint
`POST {NEXUS_BASE_URL}/agents/regua/run`

### Input (request body)
```json
{
  "request_id": "uuid-v4",
  "tenant_id": "uuid",
  "loja_id": "uuid",
  "pesquisa_id": "uuid",
  "documento_pesquisa": { /* mesmo formato do output da pesquisa */ },
  "callback_url": "...",
  "parametros": {
    "cobertura_dias": 90,
    "estagios_obrigatorios": [
      "lead_frio", "primeiro_pedido", "recorrente_novo", "recorrente_fiel",
      "inativo_recente", "inativo_medio", "cliente_perdido", "aniversariante",
      "pesquisa_satisfacao"
    ],
    "preferir_categoria_meta": "utility",
    "incluir_cupons": true,
    "tom_de_voz_override": null,
    "foco_estrategico": null
  }
}
```

### Output (callback)
```json
{
  "event": "regua_concluida",
  "request_id": "uuid-v4",
  "tenant_id": "uuid",
  "loja_id": "uuid",
  "regua": {
    "cobertura_dias": 90,
    "total_campanhas": 28,
    "campanhas": [
      {
        "ordem": 1,
        "nome_campanha": "Boas-vindas — Lead Frio",
        "estagio_funil": "lead_frio",
        "objetivo": "vendas",
        "tipo_campanha": "gatilho_evento",
        "publico_alvo": "Cadastrou nos últimos 7 dias E nunca pediu",
        "publico_excluir": "Já recebeu boas-vindas",
        "dia_envio": "D+1 após cadastro",
        "horario_envio": "12:00",
        "justificativa_horario": "Pico de busca por almoço",
        "canal": "whatsapp_oficial",
        "categoria_meta": "utility",
        "usa_cupom": true,
        "cupom": {
          "nome": "BEMVINDO15",
          "tipo": "percentual",
          "valor": 15,
          "pedido_minimo": 30,
          "validade_dias": 7
        },
        "como_criar": "No Repediu, ir em Réguas > Nova > Gatilho de Cadastro > Configurar Filtro...",
        "kpi_sucesso": "8% de conversão em 48h"
      }
    ]
  },
  "duracao_segundos": 22,
  "status": "ok"
}
```

### Prompt (referência)

```
Você é o NEXUS-RÉGUA. Recebe documento de pesquisa profunda de uma marca
e produz régua estruturada com 25-40 campanhas cobrindo 9 estágios do funil
de vida do cliente (definidos em parametros.estagios_obrigatorios).

Regras:
1. NUNCA usa palavra "promoção" — sempre "oferta".
2. Distribui campanhas pelos 9 estágios (mínimo 1 por estágio).
3. Cada campanha precisa ter justificativa (público, horário, cupom).
4. Tenta enquadrar como categoria_meta='utility' sempre que possível.
5. Cupons devem ser progressivos: lead_frio menor, cliente_perdido maior.
6. Horários devem usar dados de pesquisa (ex: "Maps mostra pico 18h").
7. Não gera legenda nem mídia (isso é responsabilidade do NEXUS-MÍDIA).
8. Saída ordenada por estágio do funil + dia de envio.
```

---

## Sub-agente 3 — NEXUS-MÍDIA

### Responsabilidade
Receber UMA campanha estruturada + dados da marca e gerar 3 variações de legenda + 3 variações de imagem.

### Endpoint
`POST {NEXUS_BASE_URL}/agents/midia/run`

### Input (request body)
```json
{
  "request_id": "uuid-v4",
  "tenant_id": "uuid",
  "loja_id": "uuid",
  "campanha_id": "uuid",
  "campanha": { /* objeto campanha completo */ },
  "marca": {
    "nome_fantasia": "...",
    "logo_url": "...",
    "cores_principais": ["#hex1", "#hex2"],
    "tom_de_voz": "descontraído regional",
    "produto_destaque": "Coxinha sortida"
  },
  "callback_url": "...",
  "parametros": {
    "qtd_variacoes": 3,
    "tipo_midia": "imagem",
    "proporcao": "1:1",
    "incluir_cupom_visual": true
  }
}
```

### Output (callback)
```json
{
  "event": "midia_concluida",
  "request_id": "uuid-v4",
  "tenant_id": "uuid",
  "loja_id": "uuid",
  "campanha_id": "uuid",
  "ativos": [
    {
      "variacao": 1,
      "legenda": "Oi {nome_cliente}! 👋 Que tal conhecer nossa Coxinha que tá fazendo a galera de Imperatriz pirar? *15% off* na primeira compra com BEMVINDO15. Válido até DD/MM. 🍗",
      "midia_url": "https://cdn.evonexus.../variacao-1.jpg",
      "tipo_midia": "imagem",
      "metadata": {
        "tamanho_caracteres": 178,
        "categoria_meta": "utility",
        "elementos_visuais": ["produto centralizado", "selo de cupom", "logo no canto"]
      }
    },
    {
      "variacao": 2,
      "legenda": "...",
      "midia_url": "...",
      "tipo_midia": "imagem"
    },
    {
      "variacao": 3,
      "legenda": "...",
      "midia_url": "...",
      "tipo_midia": "imagem"
    }
  ],
  "duracao_segundos": 45,
  "status": "ok"
}
```

### Prompt (referência)

```
Você é o NEXUS-MÍDIA. Recebe UMA campanha estruturada e dados da marca,
e gera 3 variações de (legenda + imagem) que possam ser disparadas por
WhatsApp Business API.

Regras de copy:
- NUNCA usa "promoção" — sempre "oferta".
- Limite 600 caracteres.
- Estrutura: gancho → benefício → CTA → cupom destacado.
- Negrito em *cupom* e benefícios chave.
- Personalização com {nome_cliente}, {produto_preferido} quando aplicável.

Regras de imagem:
- Produto centralizado, fundo limpo, boa iluminação.
- Cupom destacado VISUALMENTE (selo/badge).
- Logo da marca presente.
- Cores da marca aplicadas.
- Proporção definida em parametros.proporcao.

3 variações precisam ser DIFERENTES entre si:
- Variação 1: foco no produto + emoção
- Variação 2: foco no benefício/desconto
- Variação 3: foco no escassez/urgência

Tempo limite: 90 segundos por chamada.
```

---

## Validação no callback (Bridge Server)

Toda chamada de callback DEVE validar:

1. **Assinatura HMAC-SHA256** no header `X-Nexus-Signature`
   - Secret compartilhado armazenado no Infisical
   - Algoritmo: `hmac_sha256(secret, body)` em hex
2. **request_id existe** em estado `aguardando_callback`
3. **tenant_id e loja_id batem** com o request original
4. **Estado de transição válido** (não aceitar callback de pesquisa se já tem régua)

Se qualquer validação falhar: log em `audit_log` com `action='nexus_callback_rejected'` e retornar 401.

---

## Tratamento de erros

### Nexus retorna `status="parcial"`
LARA aceita mas avisa Wélida: "A pesquisa retornou parcial: {detalhes}. Quer prosseguir mesmo assim ou tentar de novo?"

### Nexus retorna `status="erro"`
LARA registra em `audit_log` e tenta novamente até 3 vezes com backoff (30s, 60s, 120s).

### Callback nunca chega (timeout > 5min)
LARA marca request como `timeout` em `audit_log` e avisa Wélida: "O Nexus não respondeu em tempo. Posso tentar de novo?"

---

*Especificação para handoff. A equipe Nexus implementa os 3 sub-agentes seguindo este contrato.*
