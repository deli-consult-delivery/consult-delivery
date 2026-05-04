# RBAC — Papéis, Permissões e Fluxo de Autorização

## Schema de tabelas

```mermaid
erDiagram
    tenants {
        uuid id PK
        text slug
        text name
    }
    tenant_members {
        uuid user_id FK
        uuid tenant_id FK
        text role
    }
    roles {
        uuid id PK
        uuid tenant_id FK
        text name
        boolean is_system
    }
    user_roles {
        uuid user_id FK
        uuid role_id FK
        uuid granted_by FK
        timestamptz granted_at
    }
    role_permissions {
        uuid role_id FK
        text resource
        text action
    }
    user_agent_access {
        uuid user_id FK
        text agent_name
        boolean can_invoke
        boolean can_view_history
        boolean can_approve_drafts
    }
    audit_log {
        bigint id PK
        uuid tenant_id FK
        uuid user_id FK
        text agent_name
        text action
        text resource
        jsonb metadata
        timestamptz created_at
    }

    tenants ||--o{ tenant_members : "membro de"
    tenants ||--o{ roles : "define"
    roles ||--o{ user_roles : "atribuída a"
    roles ||--o{ role_permissions : "tem"
    tenant_members }o--|| roles : "user_id join"
    audit_log }o--|| tenants : "pertence a"
```

## Fluxo de autorização React

```mermaid
sequenceDiagram
    participant U as Usuário
    participant SC as Screen
    participant RR as RequireRole
    participant UP as usePermissions(userId)
    participant SB as Supabase

    U->>SC: navega para tela protegida
    SC->>RR: <RequireRole resource="cobranca" action="view">
    RR->>UP: can('cobranca', 'view')
    UP->>UP: verifica _cache[userId]
    alt cache miss
        UP->>SB: SELECT user_roles JOIN role_permissions
        SB-->>UP: lista de {resource, action}
        UP->>UP: salva em _cache[userId]
    end
    UP-->>RR: true / false
    alt permitido
        RR-->>SC: renderiza conteúdo
    else negado
        RR-->>U: <AccessDenied />
    end
```

## Fluxo de autorização Bridge Server (invoke agente)

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant BS as Bridge Server
    participant MW as requireAgentAccess()
    participant SB as Supabase
    participant OC as OpenClaw

    FE->>BS: POST /invoke/analista-ifood\n{Authorization: Bearer JWT}
    BS->>MW: middleware
    MW->>SB: verificar JWT (Supabase auth.getUser)
    SB-->>MW: userId OK
    MW->>SB: SELECT user_agent_access WHERE agent_name='analista-ifood'
    alt não autorizado
        SB-->>MW: vazio
        MW-->>FE: 403 Forbidden
    else autorizado
        SB-->>MW: {can_invoke: true}
        MW->>SB: INSERT audit_log (action='invoke', agent='analista-ifood')
        MW->>OC: repassa chamada
        OC-->>FE: resposta do agente
    end
```

## Matriz de permissões (seed)

| Resource | admin | dev | marketing | atendimento | financeiro | viewer | deli_owner |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| chat:view | ✅ | ✅ | ✅ | ✅ | | ✅ | |
| kanban:view | ✅ | ✅ | ✅ | ✅ | | ✅ | |
| kanban:create | ✅ | ✅ | ✅ | ✅ | | | |
| crm:view | ✅ | ✅ | ✅ | | | ✅ | |
| reports:view | ✅ | ✅ | ✅ | | | ✅ | |
| cobranca:view | ✅ | | | | ✅ | | |
| analise_ifood:view | ✅ | ✅ | | ✅ | | | |
| agents_panel:view | ✅ | ✅ | | | | | ✅ |
| tenant_admin:view | ✅ | | | | | | |
| deli:invoke | ✅ | | | | | | ✅ |
| approve_drafts:execute | ✅ | | | | | | ✅ |
