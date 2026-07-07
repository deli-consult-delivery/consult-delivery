// src/lib/mapErro.test.js — cobre a tradução dos códigos técnicos que hoje
// chegam na UI (achado da revisão do #838).
import { describe, it, expect } from 'vitest';
import { mapErro } from './mapErro.js';

describe('mapErro', () => {
  it('traduz os códigos conhecidos de RPCs de RBAC/settings', () => {
    expect(mapErro('permission_denied')).toBe('Você não tem permissão para fazer essa ação.');
    expect(mapErro('cannot_remove_self')).toBe('Você não pode remover a si mesmo.');
    expect(mapErro('cannot_remove_last_admin')).toBe('Não é possível remover o último administrador do tenant.');
    expect(mapErro('cannot_edit_own_name_here')).toMatch(/perfil/);
    expect(mapErro('cannot_change_own_role')).toMatch(/próprio papel/);
    expect(mapErro('display_name_empty')).toMatch(/em branco/);
    expect(mapErro('invalid_role')).toBe('Papel inválido.');
    expect(mapErro('not authorized: platform operator only')).toMatch(/operador da plataforma/);
  });

  it('código desconhecido → devolve a mensagem original (nunca esconde erro real)', () => {
    expect(mapErro('algum_erro_novo_nao_mapeado')).toBe('algum_erro_novo_nao_mapeado');
  });

  it('vazio/null/undefined → devolve como veio, sem quebrar', () => {
    expect(mapErro('')).toBe('');
    expect(mapErro(null)).toBeNull();
    expect(mapErro(undefined)).toBeUndefined();
  });
});
