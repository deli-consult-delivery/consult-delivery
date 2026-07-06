// Catálogo estático dos agentes IA da plataforma (nome, cor, classe CSS do avatar).
// Metadado de apresentação, não dado de negócio — por isso não veio de tabela/API.
export const AGENTS = [
  { id: 'deli',  name: 'DELI',  role: 'COO Digital',           letter: 'D', cls: 'agent-deli',  color: '#B70C00', desc: 'Orquestra todos os agentes e ações da plataforma' },
  { id: 'cora',  name: 'CORA',  role: 'Cobrança Inteligente',  letter: 'C', cls: 'agent-cora',  color: '#10B981', desc: 'Recupera inadimplentes via WhatsApp' },
  { id: 'lara',  name: 'LARA',  role: 'Marketing & Conteúdo',  letter: 'L', cls: 'agent-lara',  color: '#EC4899', desc: 'Cria campanhas e posts automáticos' },
  { id: 'sofia', name: 'SOFIA', role: 'SDR / Prospecção',      letter: 'S', cls: 'agent-sofia', color: '#8B5CF6', desc: 'Prospecta novos restaurantes' },
  { id: 'breno', name: 'BRENO', role: 'Atendimento & Suporte', letter: 'B', cls: 'agent-breno', color: '#3B82F6', desc: 'Responde dúvidas de clientes 24/7' },
  { id: 'max',   name: 'MAX',   role: 'Consultor Técnico',     letter: 'M', cls: 'agent-max',   color: '#F59E0B', desc: 'Otimiza cardápio e iFood' },
  { id: 'vera',        name: 'VERA',        role: 'BI & Relatórios',         letter: 'V', cls: 'agent-vera',        color: '#06B6D4', desc: 'Gera insights e relatórios' },
  { id: 'bom-dia',    name: 'Bom Dia',    role: 'Artes WhatsApp',          letter: '☀', cls: 'agent-bom-dia',    color: '#F59E0B', desc: 'Gera e envia artes motivacionais diárias' },
  { id: 'encerramento', name: 'Encerramento', role: 'Finalização Expediente', letter: '🌙', cls: 'agent-encerramento', color: '#6366F1', desc: 'Gera e envia imagem de encerramento de expediente' },
];
