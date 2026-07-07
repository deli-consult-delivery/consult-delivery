// src/hooks/usePermissions.test.js — testes das funções PURAS de derivação
// de usePermissions.js. Roda em Node puro (sem jsdom/@testing-library — não
// estão instaladas e a regra é sem dependência nova); por isso as funções de
// decisão (pickTenantRole, buildPermissionSet, ...) foram extraídas do
// useEffect pra ficar testáveis sem precisar renderizar o hook em React.
//
// Foco: a regressão de docs/seguranca/rbac-tenant-sync.md — hasRole/can
// tinham que vir de tenant_members (fonte da RLS), não de user_roles (órfã,
// sem escrita, divergia da RLS pra qualquer usuário onboardado depois do
// seed inicial). pickTenantRole é a peça central do fix: precisa retornar
// null quando não há linha em tenant_members pro (user_id, tenant_id) atual
// — nunca "vazar" um papel de outro tenant.
//
// Rodar: npx vitest run src/hooks/usePermissions.test.js
import { describe, it, expect } from 'vitest';
import {
  pickTenantRole, buildPermissionSet, buildAgentAccessMap, buildScreenPermsMap,
  resolveHasRole, resolveCan, resolveCanInvokeAgent, resolveRequireRoleAccess,
} from './permissions-derive.js';

describe('pickTenantRole', () => {
  it('sem linha em tenant_members pro tenant atual → null (nunca hasRole global)', () => {
    expect(pickTenantRole([])).toBeNull();
    expect(pickTenantRole(null)).toBeNull();
    expect(pickTenantRole(undefined)).toBeNull();
  });

  it('com linha → retorna o role DESTE tenant, não uma lista agregada de outros tenants', () => {
    expect(pickTenantRole([{ role: 'admin' }])).toBe('admin');
  });

  it('ignora linhas extras (só usa a primeira — tenant_members é 1 linha por (user,tenant))', () => {
    expect(pickTenantRole([{ role: 'admin' }, { role: 'viewer' }])).toBe('admin');
  });
});

describe('buildPermissionSet', () => {
  it('vazio/null → Set vazio, can() nunca true por acidente', () => {
    expect(buildPermissionSet(null).size).toBe(0);
    expect(buildPermissionSet([]).size).toBe(0);
  });

  it('monta chaves resource:action a partir das linhas de role_permissions', () => {
    const set = buildPermissionSet([
      { resource: 'approve_drafts', action: 'execute' },
      { resource: 'content', action: 'approve' },
    ]);
    expect(set.has('approve_drafts:execute')).toBe(true);
    expect(set.has('content:approve')).toBe(true);
    expect(set.has('content:edit')).toBe(false);
  });
});

describe('buildAgentAccessMap', () => {
  it('indexa por agent_id (canônico) E agent_name (legado) — mesmo registro nos dois', () => {
    const map = buildAgentAccessMap([
      { agent_id: 'analise-ifood', agent_name: 'analista-ifood', can_invoke: true },
    ]);
    expect(map['analise-ifood']).toBe(map['analista-ifood']);
    expect(map['analise-ifood'].can_invoke).toBe(true);
  });

  it('vazio/null → objeto vazio', () => {
    expect(buildAgentAccessMap(null)).toEqual({});
    expect(buildAgentAccessMap([])).toEqual({});
  });
});

describe('buildScreenPermsMap', () => {
  it('monta Map screen_id → allowed', () => {
    const map = buildScreenPermsMap([{ screen_id: 'agents', allowed: false }]);
    expect(map.get('agents')).toBe(false);
    expect(map.has('outra-tela')).toBe(false);
  });
});

// Regressão que já quebrou 2x: componente passa userId SEM tenantId.
// usePermissions(userId, tenantId) tem guarda `if (!userId || !tenantId) return`
// no useEffect — sem tenantId a query nunca roda e tenantRole fica preso no
// default do useState(null). resolveHasRole(null, qualquerNome) tem que ser
// SEMPRE false — nunca "vazar" acesso por role indefinido.
describe('resolveHasRole', () => {
  it('tenantRole null (userId sem tenantId, ou tenant sem membership) → sempre false', () => {
    expect(resolveHasRole(null, 'admin')).toBe(false);
    expect(resolveHasRole(null, 'viewer')).toBe(false);
  });

  it('tenantRole preenchido → true só pro nome exato', () => {
    expect(resolveHasRole('admin', 'admin')).toBe(true);
    expect(resolveHasRole('admin', 'viewer')).toBe(false);
  });
});

describe('resolveCan', () => {
  it('Set vazio (sem tenantId/sem role) → sempre false', () => {
    expect(resolveCan(new Set(), 'financeiro', 'view')).toBe(false);
  });

  it('resource:action presente no Set → true; ausente → false', () => {
    const set = buildPermissionSet([{ resource: 'financeiro', action: 'view' }]);
    expect(resolveCan(set, 'financeiro', 'view')).toBe(true);
    expect(resolveCan(set, 'financeiro', 'edit')).toBe(false);
  });
});

describe('resolveCanInvokeAgent', () => {
  it('agente sem registro no map → false', () => {
    expect(resolveCanInvokeAgent({}, 'analise-ifood')).toBe(false);
  });

  it('can_invoke true/false do registro', () => {
    const map = buildAgentAccessMap([{ agent_id: 'analise-ifood', can_invoke: true }]);
    expect(resolveCanInvokeAgent(map, 'analise-ifood')).toBe(true);
    expect(resolveCanInvokeAgent({ x: { can_invoke: false } }, 'x')).toBe(false);
  });
});

// Árvore de decisão do <RequireRole>: screenId override > roles > resource+action.
describe('resolveRequireRoleAccess', () => {
  const hasRole = name => resolveHasRole('admin', name); // usuário é admin NESTE tenant

  it('override de tela true → libera mesmo sem role/permissão batendo', () => {
    expect(resolveRequireRoleAccess({
      screenOverride: true, roles: ['financeiro'], hasRole, can: () => false,
    })).toBe(true);
  });

  it('override de tela false → nega mesmo com role/permissão batendo', () => {
    expect(resolveRequireRoleAccess({
      screenOverride: false, roles: ['admin'], hasRole, can: () => true,
    })).toBe(false);
  });

  it('libera com role no tenant certo (roles array, OR)', () => {
    expect(resolveRequireRoleAccess({
      screenOverride: null, roles: ['viewer', 'admin'], hasRole, can: () => false,
    })).toBe(true);
  });

  it('bloqueia sem role — nenhum item de roles bate', () => {
    expect(resolveRequireRoleAccess({
      screenOverride: null, roles: ['financeiro', 'viewer'], hasRole, can: () => false,
    })).toBe(false);
  });

  it('respeita tenantId: hasRole vem do tenant resolvido pelo hook, não de um cache de outro tenant', () => {
    const hasRoleOutroTenant = name => resolveHasRole('viewer', name); // mesmo user, tenant B = viewer
    expect(resolveRequireRoleAccess({
      screenOverride: null, roles: ['admin'], hasRole: hasRoleOutroTenant, can: () => false,
    })).toBe(false);
  });

  it('regressão userId sem tenantId: hasRole sempre false → RequireRole sempre bloqueia por role', () => {
    const hasRoleSemTenant = name => resolveHasRole(null, name);
    expect(resolveRequireRoleAccess({
      screenOverride: null, roles: ['admin'], hasRole: hasRoleSemTenant, can: () => false,
    })).toBe(false);
  });

  it('sem roles (array) → cai pra resource+action via can()', () => {
    expect(resolveRequireRoleAccess({
      screenOverride: null, roles: undefined, resource: 'financeiro', action: 'view',
      hasRole, can: (resource, action) => resource === 'financeiro' && action === 'view',
    })).toBe(true);
  });
});
