# RBAC — Papéis e Permissões

Schema: `supabase/migrations/20260504_001_rbac.sql`

## Papéis disponíveis (dentro de cada tenant)

| Papel       | Acesso                                                        |
|-------------|---------------------------------------------------------------|
| admin       | tudo                                                          |
| dev         | chat, kanban, crm (view), reports, analista-ifood — SEM financeiro |
| marketing   | chat, kanban, crm, reports, lara — SEM financeiro             |
| atendimento | chat, grupos_whatsapp, kanban, analise_ifood (view), analista-ifood |
| financeiro  | cobranca, inadimplencias, cora — SEM dev/marketing            |
| viewer      | kanban (view), reports (view) — sem execução                  |
| deli_owner  | deli (invoke, approve_drafts), approve_high_autonomy          |

## Uso no React

```tsx
<RequireRole resource="cobranca" action="read">
  <CoraScreen />
</RequireRole>

<RequireAgent agent="deli">
  <DeliPainel />
</RequireAgent>
```

## Middleware Bridge Server

```js
app.use('/api/agent/:agent', requireAgentAccess)
// Valida JWT + user_agent_access no Supabase
// Toda ação é logada em audit_log
```

## Usuários atuais e papéis

- Wandson: `admin` + `deli_owner`
- Eduardo: `atendimento`
- Wélida: `marketing`
