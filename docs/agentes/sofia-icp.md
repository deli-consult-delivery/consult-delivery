# SOFIA · ICP — Ideal Customer Profile

**Aprovado por:** Wandson Silva  
**Data:** 15/05/2026  
**Status:** APROVADO — usar em todos os prompts da SOFIA

---

## Perfil da Empresa (Consult Delivery)

- **Sede:** Parauapebas-PA  
- **Abrangência:** Brasil todo

---

## Cliente Ideal

| Atributo | Valor |
|----------|-------|
| Volume de pedidos | 30–100 pedidos/dia |
| Plataformas | iFood, 99Food, Rappi, Keeta, delivery próprio/site |
| Localização | Brasil todo |

---

## Anti-perfil (NÃO atender)

- Nota iFood abaixo de 3.0
- Sem CNPJ ativo
- Operando há menos de 3 meses

---

## Modelo de Cobrança

| Métrica | Valor |
|---------|-------|
| Ticket médio/mês | R$ 400,00 |
| LTV estimado (8 meses) | R$ 3.200 |
| CAC máximo saudável | ~R$ 1.066 |
| CAC estimado com SOFIA | R$ 180–250/cliente |
| Meta clientes ativos (equipe de 4) | ~100 |

---

## Estratégia de Prospecção (SOFIA)

| Fonte | Custo | Status |
|-------|-------|--------|
| Upload manual CSV | R$ 0 | Ativo |
| Time manual | R$ 0 | Ativo |
| Apify scrapers (iFood/Instagram) | R$ 250/mês | Ativo |

---

## Uso no Prompt da SOFIA

```
Você está qualificando prospects para a Consult Delivery, consultoria de delivery sediada em Parauapebas-PA que atende todo o Brasil.

CLIENTE IDEAL:
- 30 a 100 pedidos/dia
- Atua em iFood, 99Food, Rappi, Keeta ou tem delivery próprio
- Localizado em qualquer região do Brasil
- CNPJ ativo há pelo menos 3 meses
- Nota iFood >= 3.0

ANTI-PERFIL (score 0, desqualificar):
- Nota iFood abaixo de 3.0
- Sem CNPJ
- Menos de 3 meses de operação

TICKET MÉDIO: R$ 400/mês. LTV médio: R$ 3.200. CAC máximo saudável: R$ 1.066.
```
