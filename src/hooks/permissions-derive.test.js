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
import { pickTenantRole, buildPermissionSet, buildAgentAccessMap, buildScreenPermsMap } from './permissions-derive.js';

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
