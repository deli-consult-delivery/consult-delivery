// asaas_saldo — saldo da conta Asaas da CD. Somente leitura.
'use strict';

module.exports = {
  name: 'asaas_saldo',
  title: 'Saldo Asaas',
  description:
    'Consulta o saldo atual da conta Asaas da Consult Delivery (via Bridge, cache 5 min). ' +
    'Não retorna a chave de API. Somente leitura.',
  inputShape: {}, // sem argumentos
  async handler(_args, { asaas }) {
    const data = await asaas.saldo();
    const v = data && (data.balance ?? data.totalBalance ?? data.saldo);
    return { summary: v != null ? `saldo=${v}` : 'saldo obtido', tenantIds: [], data };
  },
};
