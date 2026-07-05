# LGPD — Consult Delivery

> STATUS: DRAFT — revisar antes de publicar (draft técnico, não é parecer jurídico — advogado deve revisar antes de publicar)

Base para conformidade com a Lei 13.709/2018 (LGPD), ancorada no que a plataforma **realmente faz** hoje (ver `fluxo-retencao-dados.md` para o detalhe tabela a tabela). Consult Delivery atua como **operadora** dos dados dos clientes finais das lojas (titulares: donos de loja, clientes que avaliam, contatos de WhatsApp) e como **controladora** dos dados de seus próprios usuários (consultores, admins).

## 1. Bases legais por tratamento

| Tratamento | Dado | Base legal (art. 7º LGPD) | Justificativa |
|---|---|---|---|
| Coleta de avaliações iFood e geração de resposta | Nota, comentário, nome do cliente (`avaliacoes`) | Execução de contrato (VII) / Legítimo interesse (IX) | Serviço contratado pela loja é justamente gerir e responder avaliações — dado já é público no Portal iFood |
| Métricas de desempenho da loja | Faturamento, pedidos, status (`loja_metricas`, `radar_series`) | Execução de contrato (V) | Consultoria contratada existe para analisar esses números |
| Mensagens de WhatsApp (grupos/PV) | Conteúdo de mensagem, JID, nome (`whatsapp_messages`) | Execução de contrato (V) / Legítimo interesse (IX) | Canal de atendimento acordado com o cliente da loja |
| Fatos e timeline por cliente (memória dos agentes) | `client_facts`, `client_timeline` | Execução de contrato (V) | Necessário para o agente IA prestar o serviço com contexto |
| Drafts de mensagem e aprovação humana | `agent_drafts` | Execução de contrato (V) | Controle de qualidade do próprio serviço prestado |
| Auditoria de ações | `audit_log` | Cumprimento de obrigação legal (II) / Legítimo interesse (IX) | Rastreabilidade e segurança da informação |
| Cadastro de usuários da plataforma (consultores/admins) | E-mail, papel (`auth.users`, `tenant_members`) | Execução de contrato (V) | Necessário para o usuário acessar o produto |

Não há tratamento de dado sensível (art. 5º II) identificado no fluxo atual — nenhuma tabela mapeada em `fluxo-retencao-dados.md` guarda saúde, biometria, origem racial, religião, etc.

## 2. Papel na cadeia (controladora × operadora)

- **Consult Delivery como operadora**: processa dados de clientes finais (quem avalia a loja, quem manda WhatsApp) por conta e ordem da loja contratante, que é a controladora desses dados perante o consumidor final.
- **Consult Delivery como controladora**: dados dos próprios usuários da plataforma (consultores, admins de loja) e da relação contratual com cada tenant (Plataforma → Agência → Loja, `docs/tenancy-*.md`).
- Recomendação (roadmap jurídico, não técnico): formalizar isso em contrato/termo de operador entre Consult Delivery e cada loja/agência cliente.

## 3. Direitos do titular e como são atendidos hoje

| Direito (art. 18 LGPD) | Atendimento hoje | Gap |
|---|---|---|
| Confirmação de tratamento e acesso | Manual — Wandson consulta Supabase sob pedido | Sem self-service |
| Correção de dados incompletos/desatualizados | Manual (UPDATE via painel ou SQL) | Sem fluxo de edição pelo titular |
| Anonimização/bloqueio/eliminação | Parcial — `contact_optout` existe para WhatsApp (`supabase/migrations/20260702_011_rls_contact_optout.sql`) e bloqueia contato futuro, mas **não exclui** histórico já coletado | Sem exclusão retroativa automatizada |
| Portabilidade | Não implementado | Roadmap |
| Eliminação de dados tratados com consentimento (quando aplicável) | Não implementado | Roadmap |
| Informação sobre compartilhamento com terceiros | Nenhum compartilhamento com terceiros fora da stack declarada (Evolution API, Infisical, Trigger.dev, Asaas — todos processadores técnicos, não terceiros que reutilizam dado) | Formalizar lista de subprocessadores no roadmap |
| Revogação de consentimento | Aplicável apenas onde a base for consentimento (hoje nenhum tratamento mapeado usa essa base — todos usam execução de contrato/legítimo interesse) | — |

Estes gaps são os mesmos already listados em `fluxo-retencao-dados.md` §Gaps — tratá-los como um único backlog, não duplicar.

## 4. Encarregado (DPO)

Hoje **não há DPO formalmente nomeado**. Empresa tem 1 humano (Wandson Silva, CEO — `CLAUDE.md` §EQUIPE). Recomendação: nomear o próprio Wandson como encarregado até haver equipe dedicada, e publicar canal de contato (e-mail `@consultdelivery.com.br`) no rodapé da plataforma e na política de privacidade.

## 5. Incidentes de segurança

Não há hoje um runbook formal de **resposta a incidente de dados pessoais** (diferente do runbook de rotação de credenciais que já existe — `docs/infra/gate0-rotacao-credenciais.md`, focado em segredos técnicos, não em vazamento de dado de titular).

Recomendação de fluxo mínimo (roadmap):
1. Detecção → registrar em `audit_log` + notificação interna (Telegram `@DeliConsultBot`)
2. Contenção → rotacionar credencial envolvida (runbook já existe) + revogar sessão/RLS se aplicável
3. Avaliação de risco ao titular (art. 48 LGPD) — comunicar ANPD e titulares se risco relevante
4. Nota: já existe precedente de correção rápida de vazamento de escopo entre tenants (`supabase/migrations/20260701_003_bloquear_resp_avaliacoes_leak_consult_delivery.sql`, `20260701_004_corrige_escopo_resp_avaliacoes.sql`) — isso é evidência de que RLS é auditada e corrigida quando falha, não que já existe processo formal de comunicação de incidente

## 6. Transferência internacional

Nenhuma constatada — stack roda em Supabase (verificar região do projeto `czyanilrverorwenikqw`) e VPS própria (187.127.25.24). Se Supabase hospedar fora do Brasil, declarar no roadmap a necessidade de cláusula de transferência internacional (art. 33).

## Roadmap LGPD (o que falta, sem inventar que já existe)

- [ ] Nomear encarregado formalmente e publicar contato
- [ ] Runbook de incidente com dado pessoal (distinto do runbook de credenciais)
- [ ] Fluxo self-service de acesso/correção/exclusão para titular
- [ ] Política de retenção com TTL por tabela (hoje: retenção indefinida em todas)
- [ ] Contrato de operador de dados com cada tenant/loja cliente
- [ ] Confirmar região de hospedagem do projeto Supabase para transferência internacional
