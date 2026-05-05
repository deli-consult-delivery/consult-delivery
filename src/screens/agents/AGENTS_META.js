export const AGENTS_META = [
  {
    id: 'deli',
    name: 'DELI',
    role: 'COO Digital',
    color: '#B70C00',
    status: 'ativo',
    desc: 'Orquestra todos os agentes, monitora métricas e propõe ações com semáforo Verde/Amarelo/Vermelho.',
  },
  {
    id: 'cora',
    name: 'CORA',
    role: 'Cobrança Inteligente',
    color: '#10B981',
    status: 'ativo',
    desc: 'Recupera inadimplentes via WhatsApp usando réguas de cobrança configuráveis.',
  },
  {
    id: 'analista-ifood',
    name: 'Analista iFood',
    role: 'Análise de Loja',
    color: '#EA580C',
    status: 'ativo',
    desc: 'Analisa dados da loja no iFood e gera relatório de pontos críticos e oportunidades.',
  },
  {
    id: 'lara',
    name: 'LARA',
    role: 'Marketing & Conteúdo',
    color: '#EC4899',
    status: 'planejado',
    desc: 'Cria campanhas e posts automáticos para redes sociais e iFood.',
  },
  {
    id: 'sofia',
    name: 'SOFIA',
    role: 'SDR / Prospecção',
    color: '#8B5CF6',
    status: 'planejado',
    desc: 'Prospecta novos restaurantes e qualifica leads para a equipe comercial.',
  },
  {
    id: 'breno',
    name: 'BRENO',
    role: 'Atendimento & Suporte',
    color: '#3B82F6',
    status: 'planejado',
    desc: 'Responde dúvidas de clientes e equipe 24/7 via WhatsApp e painel.',
  },
  {
    id: 'max',
    name: 'MAX',
    role: 'Consultor Técnico',
    color: '#F59E0B',
    status: 'planejado',
    desc: 'Otimiza cardápio, fotos e configurações da loja no iFood.',
  },
  {
    id: 'vera',
    name: 'VERA',
    role: 'BI & Relatórios',
    color: '#06B6D4',
    status: 'planejado',
    desc: 'Gera insights e relatórios automáticos a partir dos dados da operação.',
  },
];

export function fmtRelTime(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  return `há ${Math.floor(hrs / 24)} dias`;
}
