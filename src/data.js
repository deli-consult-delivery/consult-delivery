export const TENANTS = [
  { id: 'pizza-joao',  name: 'Pizzaria do João',   emoji: '🍕', color: '#B70C00' },
  { id: 'burger',      name: 'Burger House',        emoji: '🍔', color: '#F59E0B' },
  { id: 'acai',        name: 'Açaí Premium',        emoji: '🍇', color: '#8B5CF6' },
  { id: 'sushi',       name: 'Sushi Master',        emoji: '🍣', color: '#06B6D4' },
  { id: 'tapioca',     name: 'Tapioca da Vovó',     emoji: '🥞', color: '#EC4899' },
];

export const AGENTS = [
  { id: 'deli',  name: 'DELI',  role: 'COO Digital',           letter: 'D', cls: 'agent-deli',  color: '#B70C00', desc: 'Orquestra todos os agentes e ações da plataforma' },
  { id: 'cora',  name: 'CORA',  role: 'Cobrança Inteligente',  letter: 'C', cls: 'agent-cora',  color: '#10B981', desc: 'Recupera inadimplentes via WhatsApp' },
  { id: 'lara',  name: 'LARA',  role: 'Marketing & Conteúdo',  letter: 'L', cls: 'agent-lara',  color: '#EC4899', desc: 'Cria campanhas e posts automáticos' },
  { id: 'sofia', name: 'SOFIA', role: 'SDR / Prospecção',      letter: 'S', cls: 'agent-sofia', color: '#8B5CF6', desc: 'Prospecta novos restaurantes' },
  { id: 'breno', name: 'BRENO', role: 'Atendimento & Suporte', letter: 'B', cls: 'agent-breno', color: '#3B82F6', desc: 'Responde dúvidas de clientes 24/7' },
  { id: 'max',   name: 'MAX',   role: 'Consultor Técnico',     letter: 'M', cls: 'agent-max',   color: '#F59E0B', desc: 'Otimiza cardápio e iFood' },
  { id: 'vera',  name: 'VERA',  role: 'BI & Relatórios',       letter: 'V', cls: 'agent-vera',  color: '#06B6D4', desc: 'Gera insights e relatórios' },
];

export const TENANT_DATA = {
  'pizza-joao': {
    kpis: {
      pedidos: { value: 87, delta: '+12%', trend: 'up' },
      ticket:  { value: 'R$ 47,80', delta: '+5%', trend: 'up' },
      tarefas: { value: 12, delta: '3 urgentes', trend: 'neutral' },
      inadimplencia: { value: 'R$ 2.340', delta: '8 clientes', trend: 'down' },
    },
    chart7d: [62, 71, 58, 83, 74, 91, 87],
    recent: [
      { agent: 'deli',  text: 'Organizou 4 tarefas do dia no Kanban', time: 'agora' },
      { agent: 'cora',  text: 'Recuperou R$ 340 de Carlos M. via WhatsApp', time: '5 min' },
      { agent: 'max',   text: 'Sugeriu ajuste de preço em 3 pratos do iFood', time: '12 min' },
      { agent: 'lara',  text: 'Publicou post "Pizza sexta-feira" no Instagram', time: '38 min' },
      { agent: 'vera',  text: 'Gerou relatório semanal — ticket médio subiu', time: '1h' },
      { agent: 'breno', text: 'Respondeu 14 mensagens no WhatsApp', time: '2h' },
    ],
  },
  'burger': {
    kpis: {
      pedidos: { value: 54, delta: '-3%', trend: 'down' },
      ticket:  { value: 'R$ 38,20', delta: '+2%', trend: 'up' },
      tarefas: { value: 7, delta: '1 urgente', trend: 'neutral' },
      inadimplencia: { value: 'R$ 890', delta: '3 clientes', trend: 'neutral' },
    },
    chart7d: [48, 52, 61, 43, 58, 49, 54],
    recent: [
      { agent: 'max',  text: 'Identificou foto ruim no iFood — hambúrguer artesanal', time: 'agora' },
      { agent: 'lara', text: 'Agendou campanha "Terça do Dobro" para amanhã', time: '20 min' },
      { agent: 'cora', text: 'Negociou parcela com 2 inadimplentes', time: '45 min' },
    ],
  },
  'acai': {
    kpis: {
      pedidos: { value: 142, delta: '+28%', trend: 'up' },
      ticket:  { value: 'R$ 29,50', delta: '+8%', trend: 'up' },
      tarefas: { value: 4, delta: 'tudo ok', trend: 'up' },
      inadimplencia: { value: 'R$ 120', delta: '1 cliente', trend: 'up' },
    },
    chart7d: [88, 102, 124, 98, 131, 145, 142],
    recent: [
      { agent: 'vera', text: 'Ticket médio bateu recorde (+8%)', time: 'agora' },
      { agent: 'deli', text: 'Semana foi excepcional — compartilhei com Wandson', time: '10 min' },
    ],
  },
  'sushi': {
    kpis: {
      pedidos: { value: 31, delta: '-8%', trend: 'down' },
      ticket:  { value: 'R$ 89,40', delta: '+1%', trend: 'up' },
      tarefas: { value: 15, delta: '5 urgentes', trend: 'down' },
      inadimplencia: { value: 'R$ 4.200', delta: '11 clientes', trend: 'down' },
    },
    chart7d: [42, 38, 29, 35, 33, 28, 31],
    recent: [
      { agent: 'cora', text: 'Escalou 3 casos críticos para Wandson', time: '2 min' },
      { agent: 'max',  text: 'Detectou queda de visibilidade no iFood', time: '30 min' },
    ],
  },
  'tapioca': {
    kpis: {
      pedidos: { value: 24, delta: '+15%', trend: 'up' },
      ticket:  { value: 'R$ 22,10', delta: '+3%', trend: 'up' },
      tarefas: { value: 6, delta: 'tudo ok', trend: 'up' },
      inadimplencia: { value: 'R$ 0', delta: 'zero', trend: 'up' },
    },
    chart7d: [18, 15, 21, 19, 22, 26, 24],
    recent: [
      { agent: 'lara', text: 'Post "Tapioca de queijo" viralizou — 2.3k views', time: '1h' },
    ],
  },
};

export const CONVERSATIONS = {
  'pizza-joao': [
    {
      id: 'c1', type: 'whatsapp', name: 'Carlos Mendes', avatar: 'CM',
      preview: 'Tá, pode cancelar então. Vocês sempre...',
      time: '10:42', unread: 2, online: true, vip: true,
      tags: ['VIP', 'Cliente desde 2024'],
      orders: [
        { date: '22/04/2026', total: 'R$ 89,00', items: '2 pizzas + refri' },
        { date: '15/04/2026', total: 'R$ 52,00', items: '1 pizza + borda' },
        { date: '08/04/2026', total: 'R$ 67,00', items: '1 pizza + suco' },
      ],
      messages: [
        { from: 'in',  text: 'Oi! Pedi faz 45 minutos e ainda não saiu 😕', time: '10:35' },
        { from: 'in',  text: 'Tô com fome, cara', time: '10:35' },
        { from: 'out', text: 'Oi Carlos! Desculpa a demora. Vou ver com a cozinha agora mesmo, um segundo 🙏', time: '10:36' },
        { from: 'in',  text: 'Ok', time: '10:37' },
        { from: 'out', text: 'Acabei de confirmar: saiu pra entrega, chega em 15-20 min. Como desculpa, vou mandar uma borda recheada grátis no próximo pedido ✨', time: '10:40' },
        { from: 'in',  text: 'Tá, pode cancelar então. Vocês sempre atrasam', time: '10:42' },
        { from: 'in',  text: 'Tô no trabalho e preciso voltar', time: '10:42' },
      ],
      deliSuggestion: 'Carlos, entendo totalmente sua frustração. Acabei de confirmar com o motoboy: ele está a 8 minutos daí. Se preferir cancelar mesmo assim, faço o estorno imediato. Mas se puder esperar mais 8 minutos, a borda recheada vai dobrada — por conta da casa. O que acha?',
    },
    {
      id: 'c2', type: 'internal', name: 'Yasmin Lima', avatar: 'YL',
      preview: 'Portei o dashboard pro Lovable, vc pode revisar?',
      time: '10:30', unread: 1, online: true,
      role: 'Dev',
      messages: [
        { from: 'in', text: 'Oi! Portei o dashboard pro Lovable, vc pode revisar?', time: '10:30' },
      ],
    },
    {
      id: 'c3', type: 'agent', name: 'DELI', avatar: 'D', agentCls: 'agent-deli',
      preview: '3 tarefas urgentes foram priorizadas para hoje',
      time: '10:15', unread: 0, online: true,
      messages: [
        { from: 'in', text: '3 tarefas urgentes foram priorizadas para hoje', time: '10:15' },
      ],
    },
    {
      id: 'c4', type: 'whatsapp', name: 'Mariana Souza', avatar: 'MS',
      preview: 'Obrigada! Ficou tudo perfeito 😍',
      time: '09:48', unread: 0, online: false,
      tags: ['Cliente recorrente'],
      messages: [
        { from: 'in',  text: 'Obrigada! Ficou tudo perfeito 😍', time: '09:48' },
      ],
    },
    {
      id: 'c5', type: 'whatsapp', name: 'João Paulo R.', avatar: 'JP',
      preview: 'Tem pizza sem glúten?', time: '09:20', unread: 0, online: false,
      messages: [{ from: 'in', text: 'Tem pizza sem glúten?', time: '09:20' }],
    },
    {
      id: 'c6', type: 'agent', name: 'CORA', avatar: 'C', agentCls: 'agent-cora',
      preview: 'Recuperei R$ 340 de Carlos M.', time: '09:05', unread: 0, online: true,
      messages: [{ from: 'in', text: 'Recuperei R$ 340 de Carlos M.', time: '09:05' }],
    },
    {
      id: 'c7', type: 'whatsapp', name: 'Rafael Alves', avatar: 'RA',
      preview: 'Quero fazer pedido pra hoje à noite', time: '08:55', unread: 0, online: false,
      messages: [{ from: 'in', text: 'Quero fazer pedido pra hoje à noite', time: '08:55' }],
    },
    {
      id: 'c8', type: 'internal', name: 'Equipe Cozinha', avatar: 'EC',
      preview: 'Chegou a nova mozarela, vou testar hoje', time: '08:30', unread: 0,
      messages: [{ from: 'in', text: 'Chegou a nova mozarela, vou testar hoje', time: '08:30' }],
    },
  ],
  'burger': [
    { id: 'b1', type: 'whatsapp', name: 'Pedro Costa', avatar: 'PC', preview: 'O dobro de carne tá valendo?', time: '11:10', unread: 1, online: true, messages: [{from:'in', text:'O dobro de carne tá valendo?', time:'11:10'}] },
    { id: 'b2', type: 'agent', name: 'MAX', avatar: 'M', agentCls: 'agent-max', preview: 'Sugestão: trocar foto principal do iFood', time: '10:20', unread: 1, online: true, messages: [{from:'in', text:'Sugestão: trocar foto principal do iFood', time:'10:20'}] },
  ],
  'acai': [
    { id: 'a1', type: 'whatsapp', name: 'Bia Ramos', avatar: 'BR', preview: 'Amei o novo combo!', time: '09:15', unread: 0, online: false, messages: [{from:'in', text:'Amei o novo combo!', time:'09:15'}] },
  ],
  'sushi': [
    { id: 's1', type: 'whatsapp', name: 'Lucas Wei', avatar: 'LW', preview: 'Avaliação 2 estrelas — posso falar?', time: '11:40', unread: 3, online: true, messages: [{from:'in', text:'Avaliação 2 estrelas — posso falar?', time:'11:40'}] },
  ],
  'tapioca': [
    { id: 't1', type: 'whatsapp', name: 'Dona Zélia', avatar: 'DZ', preview: 'Pode ser 5 de coco pra levar?', time: '10:00', unread: 0, online: true, messages: [{from:'in', text:'Pode ser 5 de coco pra levar?', time:'10:00'}] },
  ],
};

export const TASKS = {
  'pizza-joao': [
    { id: 't1', title: 'Revisar cardápio iFood', desc: 'Fotos dos 12 sabores principais precisam ser atualizadas', col: 'todo', priority: 'high', due: 'Hoje', assignee: 'W', comments: 3, attachments: 2, checklist: [4,8], agent: 'max' },
    { id: 't2', title: 'Configurar cobrança CORA', desc: 'Régua de 5 dias pra inadimplentes de pizza grande', col: 'todo', priority: 'high', due: 'Hoje', assignee: 'W', comments: 5, attachments: 0, checklist: [2,6], agent: 'cora' },
    { id: 't3', title: 'Responder avaliação 2⭐', desc: 'Cliente reclamou de atraso na terça', col: 'todo', priority: 'high', due: 'Hoje', assignee: 'Y', comments: 1, attachments: 1, checklist: null, agent: 'breno' },
    { id: 't4', title: 'Ajustar horário de funcionamento', desc: 'Feriado prolongado — atualizar iFood', col: 'todo', priority: 'med', due: 'Amanhã', assignee: 'W', comments: 0, attachments: 0, checklist: null },
    { id: 't5', title: 'Testar nova mozarela', desc: 'Fornecedor novo entregou ontem', col: 'todo', priority: 'low', due: '26/04', assignee: 'Y', comments: 2, attachments: 0, checklist: [1,3] },
    { id: 't6', title: 'Planejar campanha Dia das Mães', desc: 'Brief pra LARA preparar criativos', col: 'progress', priority: 'med', due: '28/04', assignee: 'W', comments: 4, attachments: 3, checklist: [3,7], agent: 'lara' },
    { id: 't7', title: 'Treinar equipe — novo sistema', desc: '2 funcionários do caixa', col: 'progress', priority: 'low', due: '30/04', assignee: 'Y', comments: 1, attachments: 0, checklist: [2,5] },
    { id: 't8', title: 'Negociar taxa com iFood', desc: 'Escalar volume pra pedir redução', col: 'progress', priority: 'high', due: '02/05', assignee: 'W', comments: 8, attachments: 2, checklist: [4,6] },
    { id: 't9', title: 'Revisar post do Instagram', desc: 'LARA gerou 3 variações', col: 'review', priority: 'low', due: 'Hoje', assignee: 'Y', comments: 2, attachments: 3, checklist: null, agent: 'lara' },
    { id: 't10', title: 'Aprovar nova borda recheada', desc: 'Preço e descrição no cardápio', col: 'review', priority: 'med', due: 'Hoje', assignee: 'W', comments: 0, attachments: 1, checklist: [2,2] },
    { id: 't11', title: 'Auditar relatório semanal', desc: 'VERA gerou — revisar números', col: 'review', priority: 'high', due: 'Hoje', assignee: 'W', comments: 1, attachments: 1, checklist: [0,4], agent: 'vera' },
    { id: 't12', title: 'Lançar promo "Sexta Pizza"', desc: 'Campanha WhatsApp com cupom', col: 'done', priority: 'med', due: '22/04', assignee: 'W', comments: 6, attachments: 2, checklist: [5,5], agent: 'lara' },
    { id: 't13', title: 'Fechar mês de março', desc: 'Conferido com contador', col: 'done', priority: 'high', due: '20/04', assignee: 'W', comments: 3, attachments: 4, checklist: [6,6] },
    { id: 't14', title: 'Recuperar 12 inadimplentes', desc: 'CORA finalizou ciclo', col: 'done', priority: 'high', due: '18/04', assignee: 'W', comments: 4, attachments: 1, checklist: [12,12], agent: 'cora' },
  ],
  'burger': [
    { id: 'bt1', title: 'Trocar foto do hambúrguer artesanal', desc: 'MAX detectou foto com baixa conversão', col: 'todo', priority: 'high', due: 'Hoje', assignee: 'W', comments: 2, attachments: 1, checklist: null, agent: 'max' },
    { id: 'bt2', title: 'Campanha "Terça do Dobro"', desc: 'LARA preparou criativo', col: 'review', priority: 'med', due: 'Amanhã', assignee: 'W', comments: 1, attachments: 2, checklist: null, agent: 'lara' },
    { id: 'bt3', title: 'Cobrar 3 inadimplentes', desc: 'CORA iniciou negociação', col: 'progress', priority: 'high', due: 'Hoje', assignee: 'W', comments: 2, attachments: 0, checklist: [1,3], agent: 'cora' },
    { id: 'bt4', title: 'Pedido fornecedor de pão brioche', desc: '', col: 'done', priority: 'low', due: '20/04', assignee: 'Y', comments: 0, attachments: 1, checklist: [2,2] },
  ],
  'acai': [
    { id: 'at1', title: 'Aproveitar pico — aumentar equipe?', desc: 'VERA detectou +28% de pedidos', col: 'progress', priority: 'med', due: 'Semana', assignee: 'W', comments: 3, attachments: 0, checklist: [1,4], agent: 'vera' },
    { id: 'at2', title: 'Lançar combo família', desc: '', col: 'done', priority: 'med', due: '19/04', assignee: 'W', comments: 2, attachments: 2, checklist: [3,3] },
  ],
  'sushi': [
    { id: 'st1', title: '🚨 Resolver avaliações 2⭐', desc: '5 avaliações ruins na semana', col: 'todo', priority: 'high', due: 'Hoje', assignee: 'W', comments: 7, attachments: 3, checklist: [0,5] },
    { id: 'st2', title: 'Revisar visibilidade iFood', desc: 'MAX detectou queda', col: 'todo', priority: 'high', due: 'Hoje', assignee: 'W', comments: 2, attachments: 1, checklist: null, agent: 'max' },
    { id: 'st3', title: 'Negociar 11 inadimplentes', desc: 'CORA escalou casos críticos', col: 'progress', priority: 'high', due: 'Esta semana', assignee: 'W', comments: 4, attachments: 0, checklist: [2,11], agent: 'cora' },
  ],
  'tapioca': [
    { id: 'tt1', title: 'Replicar post que viralizou', desc: 'LARA sugeriu série', col: 'todo', priority: 'med', due: 'Amanhã', assignee: 'Y', comments: 1, attachments: 1, checklist: null, agent: 'lara' },
    { id: 'tt2', title: 'Organizar cardápio', desc: '', col: 'done', priority: 'low', due: '21/04', assignee: 'W', comments: 0, attachments: 0, checklist: [3,3] },
  ],
};

export const INADIMPLENTES = {
  'pizza-joao': {
    kpis: { total: 'R$ 18.450,00', recebido: 'R$ 42.100,00', taxa: '87%', reguas: 4 },
    rows: [
      { id: 'i1', name: 'Carlos Mendes',      avatar: 'CM', value: 'R$ 340,00',   days: 12, last: 'há 2 min',  status: 'trying' },
      { id: 'i2', name: 'Fernanda Oliveira',  avatar: 'FO', value: 'R$ 1.280,00', days: 8,  last: 'há 1h',     status: 'negotiating' },
      { id: 'i3', name: 'Bruno Silva',        avatar: 'BS', value: 'R$ 89,00',    days: 3,  last: 'há 4h',     status: 'trying' },
      { id: 'i4', name: 'Ana Paula Ribeiro',  avatar: 'AP', value: 'R$ 2.100,00', days: 45, last: 'ontem',     status: 'critical' },
      { id: 'i5', name: 'Ricardo Tavares',    avatar: 'RT', value: 'R$ 520,00',   days: 6,  last: 'há 30min',  status: 'negotiating' },
      { id: 'i6', name: 'Juliana Campos',     avatar: 'JC', value: 'R$ 210,00',   days: 2,  last: 'há 15min',  status: 'trying' },
      { id: 'i7', name: 'Marcelo Duarte',     avatar: 'MD', value: 'R$ 4.300,00', days: 62, last: '3 dias',    status: 'critical' },
      { id: 'i8', name: 'Patrícia Nunes',     avatar: 'PN', value: 'R$ 180,00',   days: 4,  last: 'há 2h',     status: 'paid' },
    ],
    liveActions: [
      { client: 'Carlos M.',    action: 'Enviou mensagem de desculpa + oferta de parcelamento', time: 'agora' },
      { client: 'Fernanda O.',  action: 'Aguardando resposta (respondeu "ok, amanhã pago")',    time: '2min' },
      { client: 'Ricardo T.',   action: 'Negociou parcela em 2x sem juros',                      time: '5min' },
    ],
    transcript: {
      client: 'Carlos Mendes',
      value: 'R$ 340,00',
      days: 12,
      sentiment: 78,
      payProb: 72,
      nextAction: 'Oferecer parcelamento em 2x sem juros',
      messages: [
        { from: 'bot',    text: 'Oi Carlos! Aqui é a CORA, da Pizzaria do João 🍕 Vi aqui que seu último pedido (22/04) ficou pendente — R$ 340,00. Tudo bem?', time: '10:02' },
        { from: 'client', text: 'oi, to em correria essa semana mds',  time: '10:15' },
        { from: 'bot',    text: 'Entendo, sem pressão! Quer que eu divida em 2x de R$ 170? Posso gerar um link agora.', time: '10:16' },
        { from: 'client', text: 'hmm pode ser',                         time: '10:20' },
        { from: 'bot',    text: 'Perfeito! Aqui está: bit.ly/p-joao/abc — 1ª parcela hoje, 2ª em 15 dias. Confirma pra eu registrar? 💳', time: '10:20' },
        { from: 'client', text: 'pago hj sim, obrigado',                time: '10:42' },
        { from: 'bot',    text: 'Show! Assim que cair o pix eu te aviso. E quando quiser repetir o pedido, o primeiro tá com 10% off — por conta da paciência 💪', time: '10:42' },
      ],
    },
  },
  'burger': {
    kpis: { total: 'R$ 3.200,00', recebido: 'R$ 18.400,00', taxa: '91%', reguas: 3 },
    rows: [
      { id: 'bi1', name: 'Henrique Lima',  avatar: 'HL', value: 'R$ 420,00',   days: 5,  last: 'há 30min', status: 'negotiating' },
      { id: 'bi2', name: 'Camila Reis',    avatar: 'CR', value: 'R$ 180,00',   days: 2,  last: 'há 2h',    status: 'trying' },
      { id: 'bi3', name: 'Eduardo Vilas',  avatar: 'EV', value: 'R$ 290,00',   days: 8,  last: 'ontem',    status: 'trying' },
    ],
    liveActions: [
      { client: 'Henrique L.', action: 'Aceitou proposta de desconto de 5%', time: 'agora' },
    ],
  },
  'acai': {
    kpis: { total: 'R$ 120,00', recebido: 'R$ 28.900,00', taxa: '96%', reguas: 2 },
    rows: [
      { id: 'ai1', name: 'Lívia Santos', avatar: 'LS', value: 'R$ 120,00', days: 3, last: 'há 1h', status: 'trying' },
    ],
    liveActions: [],
  },
  'sushi': {
    kpis: { total: 'R$ 31.800,00', recebido: 'R$ 24.100,00', taxa: '62%', reguas: 5 },
    rows: [
      { id: 'si1', name: 'Pedro Iwamoto',   avatar: 'PI', value: 'R$ 3.200,00', days: 30, last: 'ontem',  status: 'critical' },
      { id: 'si2', name: 'Ana Kobayashi',   avatar: 'AK', value: 'R$ 1.800,00', days: 18, last: 'há 2h',  status: 'negotiating' },
      { id: 'si3', name: 'Rafael Tanaka',   avatar: 'RT', value: 'R$ 5.400,00', days: 55, last: '3 dias', status: 'critical' },
      { id: 'si4', name: 'Beatriz Yamada',  avatar: 'BY', value: 'R$ 890,00',   days: 9,  last: 'hoje',   status: 'trying' },
    ],
    liveActions: [
      { client: 'Ana K.',    action: 'Pediu mais 3 dias — aceito',           time: 'agora' },
      { client: 'Rafael T.', action: 'Escalado para Wandson (crítico)',       time: '10min' },
    ],
  },
  'tapioca': {
    kpis: { total: 'R$ 0,00', recebido: 'R$ 4.200,00', taxa: '100%', reguas: 1 },
    rows: [],
    liveActions: [],
  },
};
