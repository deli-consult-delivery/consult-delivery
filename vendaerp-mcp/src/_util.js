// _util.js — helpers comuns às tools do vendaerp-mcp.
'use strict';

/** Conta itens de um retorno do ERP, tolerante ao envelope (array, {data}, {itens}…). */
function contar(data) {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') {
    for (const k of ['data', 'itens', 'items', 'registros', 'lista', 'result', 'results']) {
      if (Array.isArray(data[k])) return data[k].length;
    }
  }
  return data == null ? 0 : 1;
}

module.exports = { contar };
