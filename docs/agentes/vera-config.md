# VERA — Configuração Aprovada

**Data de aprovação:** 2026-05-15
**Aprovado por:** Wandson Silva

---

## 1. Destinatários dos relatórios

Wandson + Wélida + Eduardo

> Clientes finais NÃO recebem. Relatórios são internos.

Emails a configurar como `VERA_RECIPIENTS` no Infisical:
- wandson@consultdelivery.com.br
- welida@consultdelivery.com.br
- eduardo@consultdelivery.com.br

---

## 2. Periodicidade

Todos os ciclos ativos:

| Ciclo    | Schedule (UTC-3)  | Task                     |
|----------|-------------------|--------------------------|
| Diário   | Todo dia às 7h    | vera-relatorio-diario    |
| Semanal  | Segunda-feira 8h  | vera-relatorio-semanal   |
| Mensal   | Dia 1 às 8h       | vera-relatorio-mensal    |
| Snapshot | Todo dia às 6h    | vera-snapshot-diario     |
| Anomalia | A cada 4h         | vera-detectar-anomalia   |

---

## 3. Métricas monitoradas (7 KPIs)

| # | KPI                         | Fonte                          |
|---|-----------------------------|--------------------------------|
| 1 | Pedidos/dia (por cliente)   | `loja_metricas.pedidos_dia`    |
| 2 | Ticket médio                | `loja_metricas.ticket_medio`   |
| 3 | Nota iFood                  | `loja_metricas.nota_ifood`     |
| 4 | Taxa de recuperação CORA    | `cora_cobrancas` (pago/total)  |
| 5 | Clientes ativos             | `tenants.is_active`            |
| 6 | Conversas abertas no chat   | `conversations.status`         |
| 7 | Novos prospects SOFIA       | `prospects.created_at`         |

---

## 4. Serviço de email

**Pendente de configuração.** Usar Resend (resend.com).

Secret a adicionar no Infisical: `RESEND_API_KEY`

Enquanto não configurado: VERA salva relatórios no banco (`vera_reports`) mas pula o envio por email (log de aviso, sem erro fatal).

---

## 5. Restrições aprovadas

- VERA é **read-only** — nunca escreve em tabelas que não sejam `vera_*`
- VERA nunca cruza dados entre tenants (RLS rigoroso)
- `vera-responder-pergunta` valida SQL gerado (somente SELECT permitido)
- Anomalias críticas notificam uma vez (campo `notificado = true`)
