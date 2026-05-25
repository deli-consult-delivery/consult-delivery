export const PACOTES = [
  { id: 'light',       label: 'Light',       desc: 'R$500/mês' },
  { id: 'performance', label: 'Performance',  desc: 'R$500 base + 12% crescimento' },
  { id: 'enterprise',  label: 'Enterprise',   desc: 'R$1.200/mês' },
  { id: 'growth',      label: 'Growth',       desc: 'R$2.500 setup + R$1.500/mês' },
];

export const RECONTRATACAO_TEMPLATES = {
  light:       (nome) => `Olá ${nome}! Renovamos nossa parceria. Pacote Light R$500/mês - gestão iFood completa, relatórios semanais e suporte prioritário. Para confirmar ou saber mais, responda esta mensagem!`,
  performance: (nome) => `Olá ${nome}! Novo modelo de parceria: R$500 base + 12% do crescimento que geramos juntos. Você paga mais só quando cresce mais. Vamos conversar?`,
  enterprise:  (nome) => `Olá ${nome}! Proposta Enterprise: R$1.200/mês, mínimo 6 meses, com gestão completa e consultoria estratégica mensal. Responda para agendar uma apresentação!`,
  growth:      (nome) => `Olá ${nome}! Pacote Growth com IA no iFood: R$2.500 setup + R$1.500/mês. Automatização avançada e IA para maximizar seus resultados. Quer saber mais?`,
};

export const STATUS_LABELS = {
  pendente:    { label: 'Pendente',     color: '#F59E0B' },
  aceito:      { label: 'Aceito',       color: '#10B981' },
  recusado:    { label: 'Recusado',     color: '#EF4444' },
  sem_resposta:{ label: 'Sem resposta', color: '#6B7280' },
};
