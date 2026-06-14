// erp_status — a credencial do VendaERP (no Bridge) está válida e respondendo?
// Chamada barata: o Bridge consulta Empresas e devolve {conectado, empresa, total}.
'use strict';

module.exports = {
  name: 'erp_status',
  title: 'Status do VendaERP',
  description:
    'Confere se o VendaERP está acessível e a credencial (que vive no Bridge) responde. ' +
    'Retorna se está conectado e a empresa principal. Não retorna segredos. Somente leitura.',
  inputShape: {}, // sem argumentos
  async handler(_args, { erp }) {
    const data = await erp.status();
    const conectado = data && data.conectado === true;
    return {
      summary: conectado
        ? `conectado${data.empresa ? ` · ${data.empresa}` : ''}${data.total_empresas != null ? ` · ${data.total_empresas} empresa(s)` : ''}`
        : 'sem conexão',
      tenantIds: [],
      data,
    };
  },
};
