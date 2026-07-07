// src/lib/mapErro.js — traduz códigos técnicos de erro (RAISE EXCEPTION de RPCs
// Postgres, RLS) pra mensagens amigáveis em pt-BR. Cobre os códigos que hoje
// chegam crus na UI via `err.message` (achado da revisão do #838:
// Configuracoes.jsx/SettingsScreen.jsx mostravam 'cannot_remove_last_admin'/
// 'cannot_remove_self' sem tradução).
//
// Código desconhecido → devolve a mensagem original (nunca esconde um erro
// real por trás de um "algo deu errado" genérico — só traduz o que já
// conhecemos).
const MENSAGENS = {
  permission_denied: 'Você não tem permissão para fazer essa ação.',
  cannot_remove_self: 'Você não pode remover a si mesmo.',
  cannot_remove_last_admin: 'Não é possível remover o último administrador do tenant.',
  cannot_edit_own_name_here: 'Edite seu próprio nome pelo seu perfil, não por aqui.',
  cannot_change_own_role: 'Você não pode alterar seu próprio papel.',
  display_name_empty: 'O nome não pode ficar em branco.',
  invalid_role: 'Papel inválido.',
  'not authorized: platform operator only': 'Só um operador da plataforma pode fazer essa ação.',
};

// Formas genéricas do Postgres/PostgREST — não são um código fixo (o nome da
// tabela/constraint varia), então casam por padrão em vez de chave exata.
// Cobre qualquer escrita bloqueada por RLS/constraint, não só as 9 RPCs
// mapeadas acima em MENSAGENS (auditoria de cobertura, PR follow-up do #841).
const PADROES = [
  { re: /new row violates row-level security policy/i, msg: 'Você não tem permissão para fazer essa ação.' },
  { re: /permission denied for table/i, msg: 'Você não tem permissão para fazer essa ação.' },
  { re: /duplicate key value violates unique constraint/i, msg: 'Já existe um registro com esses dados.' },
];

export function mapErro(mensagemBruta) {
  if (!mensagemBruta) return mensagemBruta;
  if (MENSAGENS[mensagemBruta]) return MENSAGENS[mensagemBruta];
  const padrao = PADROES.find(p => p.re.test(mensagemBruta));
  return padrao ? padrao.msg : mensagemBruta;
}
