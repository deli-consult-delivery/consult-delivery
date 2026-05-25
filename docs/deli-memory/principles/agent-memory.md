# Memória Central dos Agentes

Schema: `supabase/migrations/20260504_002_memoria_central.sql`

## Princípio

Fatos sobre clientes vivem no Supabase, NÃO em `memory/*.md` na VPS nem em arquivos locais.

## Tabelas principais

| Tabela           | Descrição                                                  |
|------------------|------------------------------------------------------------|
| `lojas`          | loja iFood associada a um customer (cliente)               |
| `client_facts`   | fatos key-value por loja (qualquer agente lê/escreve)      |
| `client_timeline`| linha do tempo imutável de eventos por loja                |
| `loja_metricas`  | snapshot diário de métricas                                |

## Padrão de leitura (antes de agir)

```sql
SELECT * FROM client_facts WHERE loja_id = $1;
SELECT * FROM client_timeline WHERE loja_id = $1 ORDER BY ts DESC LIMIT 20;
```

## Padrão de escrita (fatos novos)

```sql
INSERT INTO client_facts (loja_id, key, value, ts)
VALUES ($1, $2, $3, NOW())
ON CONFLICT (loja_id, key) DO UPDATE SET value = EXCLUDED.value, ts = NOW();

INSERT INTO client_timeline (loja_id, event_type, data, ts)
VALUES ($1, $2, $3, NOW());
-- timeline é imutável: nunca UPDATE/DELETE
```

## Regra de ouro

Todo agente lê contexto ANTES de agir. Todo agente registra fatos novos DEPOIS de agir.
Sem ler o contexto → risco de contradição com o que já se sabe sobre o cliente.
