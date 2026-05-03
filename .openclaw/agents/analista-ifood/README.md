# 🦞 Co-piloto Delivery — Agente Analista de Lojas iFood

Agente de IA especializado em análise de lojas iFood, parte da stack da **Consult Delivery**.

## O que faz

- Recebe dados/prints do Portal do Parceiro iFood
- Gera análise técnica completa (9 blocos: identidade visual, desempenho, operação, funil, cardápio, concorrência, marketing, avaliações, configurações)
- Devolve mensagem WhatsApp pronta pra enviar pro dono da loja
- Aprende com cada análise (memória persistente por loja)
- Trabalha de forma proativa (análises diárias e semanais automáticas)

## Estrutura

```
analista-ifood/
├── README.md              ← este arquivo
├── AGENTS.md              ← regras e fluxo do agente
├── SOUL.md                ← personalidade
├── USER.md                ← sobre os consultores
├── system_prompt.md       ← prompt completo (referência detalhada)
├── base_regras.yaml       ← base de conhecimento técnica (benchmarks)
├── transcricoes/          ← exemplos reais de análise (referência de tom)
│   └── salgados_da_monica.txt
└── DEPLOY.md              ← instruções de deploy na VPS
```

## Como usar

### Localmente (testes)

Usar como Project no Claude.ai:
1. Criar Project novo
2. Subir todos os arquivos como Knowledge
3. System prompt = conteúdo de `system_prompt.md`

### Em produção (OpenClaw)

Ver instruções completas em [`DEPLOY.md`](./DEPLOY.md).

Resumo:
1. Transferir arquivos pra VPS via SCP
2. Criar agente no OpenClaw apontando pro workspace
3. Configurar roteamento do Telegram
4. Reiniciar gateway
5. Testar no `@DeliConsultBot`

## Stack envolvida

- **Modelo:** Claude Sonnet 4.6
- **Runtime:** OpenClaw (na VPS)
- **Canal:** Telegram (`@DeliConsultBot`)
- **Banco:** Supabase (lojas, análises, histórico)
- **Pipeline:** n8n (puxa dados do Portal iFood automaticamente)

## Quem usa

Apenas consultores da **Consult Delivery**:
- Yan (admin)
- Yasmin
- (outros consultores aprovados)

## Princípios

1. **Direto, sem rodeios** — cliente é dono de loja, não acadêmico
2. **NUNCA usar "promoção"** — usar "oferta" sempre
3. **Nunca inventar números** — se faltou dado, dizer "não coletado"
4. **Recomendações específicas** — não "melhore as fotos" mas "trocar foto da Coxinha por uma com fundo branco"
5. **Memória ativa** — recomendação repetida é sinal pra ser mais enfático

## Roadmap

- [x] Estrutura inicial dos arquivos
- [ ] Deploy na VPS
- [ ] Primeira análise teste
- [ ] Cadastro de lojas piloto em `lojas-ativas.yaml`
- [ ] Integração com n8n (puxar dados automaticamente)
- [ ] Análises diárias automáticas funcionando
- [ ] Análises semanais com comparativo histórico
- [ ] Adicionar mais transcrições de referência

## Contribuindo

Mudanças vão direto no main (projeto privado). Quando refinar prompts ou regras:

1. Edita o arquivo localmente
2. `git commit -am "feat(agente): <descrição da mudança>"`
3. `git push`
4. Re-deploy na VPS via SCP

## Links úteis

- VPS: `45.39.210.183`
- OpenClaw docs: https://docs.openclaw.ai
- Bot Telegram: `@DeliConsultBot`
