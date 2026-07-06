'use strict';

// ════════════════════════════════════════════════════════════════════════════
// Helper: resolve credenciais Evolution por instance_name.
//
// instance_name é o identificador não-secreto que o Console já usa para
// selecionar a instância (picker de Chat/Grupos). A key e a URL da Evolution
// ficam só aqui — nunca chegam ao navegador.
// ════════════════════════════════════════════════════════════════════════════

async function resolveInstance(instanceName, sbFetch) {
  if (!instanceName) return null;
  const rows = await sbFetch(
    `evolution_instances?instance_name=eq.${encodeURIComponent(instanceName)}&select=evolution_url,api_key,instance_name&limit=1`
  );
  const inst = Array.isArray(rows) ? rows[0] : null;
  return (inst?.evolution_url && inst?.api_key && inst?.instance_name) ? inst : null;
}

module.exports = { resolveInstance };
