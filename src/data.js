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

export const SETTINGS_DATA = {
  workspace: {
    'pizza-joao': { name: 'Pizzaria do João',  slug: 'pizza-joao', emoji: '🍕', segment: 'Pizzaria',    phone: '(11) 99999-0000', city: 'São Paulo, SP'    },
    'burger':     { name: 'Burger House',       slug: 'burger',     emoji: '🍔', segment: 'Hamburgueria', phone: '(21) 98888-1111', city: 'Rio de Janeiro, RJ' },
    'acai':       { name: 'Açaí Premium',       slug: 'acai',       emoji: '🍇', segment: 'Açaíteria',    phone: '(31) 97777-2222', city: 'Belo Horizonte, MG' },
    'sushi':      { name: 'Sushi Master',        slug: 'sushi',      emoji: '🍣', segment: 'Japonesa',     phone: '(11) 96666-3333', city: 'São Paulo, SP'    },
    'tapioca':    { name: 'Tapioca da Vovó',    slug: 'tapioca',    emoji: '🥞', segment: 'Tapiocaria',   phone: '(85) 95555-4444', city: 'Fortaleza, CE'    },
  },
  users: [
    { id: 'u1', name: 'Wandson Silva', email: 'wandson@consultdelivery.com.br', role: 'admin',    avatar: 'WS', online: true,  semaforo: 'vermelho' },
    { id: 'u2', name: 'Yasmin Lima',   email: 'yasmin@consultdelivery.com.br',  role: 'admin',    avatar: 'YL', online: true,  semaforo: 'amarelo'  },
    { id: 'u3', name: 'Eduardo',       email: 'eduardo@consultdelivery.com.br', role: 'consultor',avatar: 'ED', online: false, semaforo: 'verde'    },
    { id: 'u4', name: 'Hélida',        email: 'helida@consultdelivery.com.br',  role: 'operador', avatar: 'HE', online: false, semaforo: 'verde'    },
  ],
  integrations: [
    { id: 'anthropic', name: 'Claude API',       desc: 'Motor de IA dos agentes',    status: 'connected', color: '#B70C00', icon: 'sparkles', detail: 'claude-sonnet-4-20250514'   },
    { id: 'evolution', name: 'Evolution API',    desc: 'WhatsApp Business',           status: 'connected', color: '#25D366', icon: 'whatsapp', detail: 'Instância ativa'            },
    { id: 'n8n',       name: 'n8n',              desc: 'Automações e workflows',      status: 'connected', color: '#EA580C', icon: 'refresh',  detail: '12 workflows ativos'        },
    { id: 'gdrive',    name: 'Google Drive',     desc: 'Documentos e arquivos',       status: 'connected', color: '#4285F4', icon: 'paper',    detail: '9 pastas sincronizadas'     },
    { id: 'gcal',      name: 'Google Calendar',  desc: 'Agenda da equipe',            status: 'connected', color: '#34A853', icon: 'check',    detail: 'Sincronizando'              },
    { id: 'heygen',    name: 'HeyGen',           desc: 'Vídeos com avatar IA',        status: 'connected', color: '#8B5CF6', icon: 'star',     detail: 'API Key ativa'              },
    { id: 'metricool', name: 'Metricool',        desc: 'Gestão de redes sociais',     status: 'connected', color: '#EC4899', icon: 'chart',    detail: 'Publicando via LARA'        },
    { id: 'clickup',   name: 'ClickUp',          desc: 'Gestão de tarefas (legado)',  status: 'connected', color: '#7B68EE', icon: 'check',    detail: 'Migrando para plataforma'   },
    { id: 'ifood',     name: 'iFood',            desc: 'Pedidos e cardápio online',   status: 'pending',   color: '#EA1D2C', icon: 'phone',    detail: 'Aguardando credenciais'     },
    { id: 'asaas',     name: 'Asaas',            desc: 'Cobranças e pagamentos',      status: 'sandbox',   color: '#F59E0B', icon: 'dollar',   detail: 'Sandbox — TASK-403'         },
    { id: 'supabase',  name: 'Supabase',         desc: 'Banco de dados + Auth + RLS', status: 'connected', color: '#3ECF8E', icon: 'building', detail: 'consult-delivery-prod'      },
    { id: 'vercel',    name: 'Vercel',           desc: 'Deploy e hospedagem',         status: 'connected', color: '#0D0D0D', icon: 'arrowright',detail: 'deli-os.vercel.app'        },
  ],
  billing: {
    plan: 'Pro',
    budget: 800,
    current: 680,
    items: [
      { name: 'Lovable Pro',    cost: 130, status: 'active',  category: 'Frontend'   },
      { name: 'Supabase Pro',   cost: 130, status: 'active',  category: 'Backend'    },
      { name: 'Claude API',     cost: 380, status: 'active',  category: 'IA'         },
      { name: 'VPS (8GB/6CPU)', cost: 40,  status: 'active',  category: 'Infra'      },
    ],
  },
};

export const REPORTS_DATA = {
  'pizza-joao': {
    periodo: 'Abril 2026',
    kpis: {
      receita:    { value: 'R$ 41.580,00', delta: '+18%',          trend: 'up'   },
      pedidos:    { value: '1.247',        delta: '+12%',          trend: 'up'   },
      ticket:     { value: 'R$ 47,80',     delta: '+5%',           trend: 'up'   },
      recuperado: { value: 'R$ 42.100,00', delta: '87% taxa CORA', trend: 'up'   },
    },
    chart7d:  [62, 71, 58, 83, 74, 91, 87],
    chart30d: [55, 62, 48, 71, 68, 85, 79, 60, 72, 55, 82, 76, 90, 83, 68, 74, 62, 71, 58, 83, 74, 91, 87, 78, 65, 88, 72, 84, 91, 87],
    topItems: [
      { name: 'Pizza Calabresa GG', orders: 312, pct: 100 },
      { name: 'Pizza Mussarela GG', orders: 287, pct: 92  },
      { name: 'Borda Recheada',     orders: 198, pct: 63  },
      { name: 'Pizza 4 Queijos M',  orders: 154, pct: 49  },
      { name: 'Suco Laranja',       orders: 143, pct: 46  },
    ],
    reports: [
      { id: 'r5', title: 'Relatório Semanal — Semana 17', agent: 'vera', status: 'generating', date: 'Gerando...' },
      { id: 'r1', title: 'Relatório Semanal — Semana 16', agent: 'vera', status: 'ready',      date: '22/04/2026' },
      { id: 'r2', title: 'Relatório Financeiro — Março',  agent: 'vera', status: 'ready',      date: '01/04/2026' },
      { id: 'r3', title: 'Análise de Inadimplência Q1',   agent: 'cora', status: 'ready',      date: '28/03/2026' },
      { id: 'r4', title: 'Performance iFood — Março',     agent: 'max',  status: 'ready',      date: '25/03/2026' },
    ],
    veraActions: [
      { text: 'Concluiu análise de ticket médio — subiu 5% no mês', time: 'agora' },
      { text: 'Identificou pico de pedidos nas sextas-feiras',       time: '18 min' },
      { text: 'Cruzou dados CORA: 87% dos inadimplentes pagaram',   time: '1h' },
    ],
    insights: [
      'Sextas-feiras têm 34% mais pedidos que a média semanal — aumente o estoque.',
      'Pizza Calabresa GG representa 23% da receita. Destaque no iFood.',
      'Horário de pico 19h–21h concentra 47% dos pedidos. Garanta equipe completa.',
      'Clientes VIP geram 3× mais receita que novos clientes. Priorize fidelização.',
    ],
  },
  'burger': {
    periodo: 'Abril 2026',
    kpis: {
      receita:    { value: 'R$ 20.628,00', delta: '-3%',           trend: 'down' },
      pedidos:    { value: '540',          delta: '-3%',           trend: 'down' },
      ticket:     { value: 'R$ 38,20',     delta: '+2%',           trend: 'up'   },
      recuperado: { value: 'R$ 18.400,00', delta: '91% taxa CORA', trend: 'up'   },
    },
    chart7d:  [48, 52, 61, 43, 58, 49, 54],
    chart30d: [60, 55, 48, 52, 61, 43, 58, 49, 54, 62, 48, 55, 43, 58, 52, 49, 61, 54, 48, 52, 61, 43, 58, 49, 54, 60, 55, 48, 52, 54],
    topItems: [
      { name: 'Hambúrguer Artesanal', orders: 189, pct: 100 },
      { name: 'X-Bacon Duplo',        orders: 143, pct: 76  },
      { name: 'Batata Frita GG',      orders: 134, pct: 71  },
      { name: 'Milk Shake',           orders: 98,  pct: 52  },
      { name: 'Combo Família',        orders: 76,  pct: 40  },
    ],
    reports: [
      { id: 'br1', title: 'Relatório Semanal — Semana 16', agent: 'vera', status: 'ready', date: '22/04/2026' },
      { id: 'br2', title: 'Relatório Financeiro — Março',  agent: 'vera', status: 'ready', date: '01/04/2026' },
    ],
    veraActions: [
      { text: 'Detectou queda de 3% nos pedidos — cruzando com concorrência', time: 'agora' },
    ],
    insights: [
      'Terças-feiras têm queda de 18% — campanha "Dobro" pode reverter isso.',
      'Combo Família tem crescimento de 12% nas últimas 2 semanas.',
      'Batata Frita GG é vendida em 71% dos pedidos — cross-sell forte.',
    ],
  },
  'acai': {
    periodo: 'Abril 2026',
    kpis: {
      receita:    { value: 'R$ 41.890,00', delta: '+28%',          trend: 'up' },
      pedidos:    { value: '1.420',        delta: '+28%',          trend: 'up' },
      ticket:     { value: 'R$ 29,50',     delta: '+8%',           trend: 'up' },
      recuperado: { value: 'R$ 28.900,00', delta: '96% taxa CORA', trend: 'up' },
    },
    chart7d:  [88, 102, 124, 98, 131, 145, 142],
    chart30d: [70, 80, 88, 102, 124, 98, 131, 145, 142, 110, 95, 112, 130, 142, 138, 120, 108, 115, 128, 140, 145, 150, 142, 135, 148, 152, 145, 138, 148, 142],
    topItems: [
      { name: 'Açaí 500ml Tradicional', orders: 428, pct: 100 },
      { name: 'Combo Casal',            orders: 312, pct: 73  },
      { name: 'Açaí 700ml Premium',     orders: 287, pct: 67  },
      { name: 'Granola Extra',          orders: 198, pct: 46  },
      { name: 'Topping Frutas',         orders: 195, pct: 46  },
    ],
    reports: [
      { id: 'ar1', title: 'Relatório Semanal — Semana 16', agent: 'vera', status: 'ready',      date: '22/04/2026' },
      { id: 'ar2', title: 'Relatório de Crescimento Q1',   agent: 'vera', status: 'ready',      date: '01/04/2026' },
      { id: 'ar3', title: 'Análise de Pico de Pedidos',    agent: 'vera', status: 'generating', date: 'Gerando...' },
    ],
    veraActions: [
      { text: 'Ticket médio bateu recorde histórico — +8% no mês', time: 'agora'  },
      { text: 'Combo Casal cresceu 22% — sugeriu campanha de pair', time: '30 min' },
    ],
    insights: [
      'Crescimento de 28% é o maior entre todos os clientes da base.',
      'Finais de semana concentram 58% dos pedidos — escale a equipe.',
      'Combo Casal tem margem 15% maior que os itens avulsos.',
    ],
  },
  'sushi': {
    periodo: 'Abril 2026',
    kpis: {
      receita:    { value: 'R$ 27.714,00', delta: '-8%',           trend: 'down' },
      pedidos:    { value: '310',          delta: '-8%',           trend: 'down' },
      ticket:     { value: 'R$ 89,40',     delta: '+1%',           trend: 'up'   },
      recuperado: { value: 'R$ 24.100,00', delta: '62% taxa CORA', trend: 'down' },
    },
    chart7d:  [42, 38, 29, 35, 33, 28, 31],
    chart30d: [50, 48, 42, 38, 29, 35, 33, 28, 31, 44, 40, 36, 32, 28, 35, 42, 38, 29, 35, 33, 28, 31, 40, 38, 32, 30, 28, 35, 31, 31],
    topItems: [
      { name: 'Combo Sashimi 30 peças', orders: 89,  pct: 100 },
      { name: 'Hot Roll (8 peças)',      orders: 78,  pct: 88  },
      { name: 'Temaki Salmão',          orders: 65,  pct: 73  },
      { name: 'Combinado Família',      orders: 48,  pct: 54  },
      { name: 'Edamame',               orders: 30,  pct: 34  },
    ],
    reports: [
      { id: 'sr1', title: 'Alerta de Queda — Semana 16', agent: 'vera', status: 'ready', date: '22/04/2026' },
      { id: 'sr2', title: 'Diagnóstico iFood — Março',   agent: 'max',  status: 'ready', date: '28/03/2026' },
    ],
    veraActions: [
      { text: 'Detectou queda de 8% — cruzando com avaliações do iFood', time: 'agora' },
      { text: 'Escalou relatório de risco para Wandson',                 time: '20 min' },
    ],
    insights: [
      'Queda de 8% coincide com 5 avaliações ruins — resolver urgente.',
      'Ticket médio é o maior da base (R$ 89,40) — potencial de recuperação.',
      'Inadimplência em 38% — CORA precisa intensificar cobranças.',
    ],
  },
  'tapioca': {
    periodo: 'Abril 2026',
    kpis: {
      receita:    { value: 'R$ 5.304,00', delta: '+15%',           trend: 'up' },
      pedidos:    { value: '240',         delta: '+15%',           trend: 'up' },
      ticket:     { value: 'R$ 22,10',    delta: '+3%',            trend: 'up' },
      recuperado: { value: 'R$ 4.200,00', delta: '100% taxa CORA', trend: 'up' },
    },
    chart7d:  [18, 15, 21, 19, 22, 26, 24],
    chart30d: [14, 16, 18, 15, 21, 19, 22, 26, 24, 20, 18, 22, 25, 28, 24, 20, 18, 15, 21, 19, 22, 26, 24, 22, 20, 24, 26, 28, 26, 24],
    topItems: [
      { name: 'Tapioca de Queijo',     orders: 88,  pct: 100 },
      { name: 'Tapioca Coco + Doce Leite', orders: 64, pct: 73 },
      { name: 'Tapioca de Frango',     orders: 52,  pct: 59  },
      { name: 'Tapioca Integral',      orders: 36,  pct: 41  },
    ],
    reports: [
      { id: 'tr1', title: 'Relatório Semanal — Semana 16', agent: 'vera', status: 'ready', date: '22/04/2026' },
    ],
    veraActions: [
      { text: 'Zero inadimplência pelo 3o mês consecutivo — parabéns!', time: 'agora' },
    ],
    insights: [
      'Zero inadimplência é o melhor resultado de todos os tenants.',
      'Post viral da semana passada gerou +22% de pedidos nos 3 dias seguintes.',
      'Ticket médio crescendo consistentemente +3% ao mês.',
    ],
  },
};

export const CRM_DATA = {
  'pizza-joao': {
    kpis: { total: 248, ativos: 187, ticket: 'R$ 47,80', nps: 72 },
    clients: [
      { id: 'cl1', name: 'Carlos Mendes',     avatar: 'CM', phone: '(11) 99123-4567', status: 'vip',       tag: 'VIP',        totalOrders: 47, totalSpent: 'R$ 2.240,00', lastOrder: '22/04/2026', since: 'Jan 2024', agent: 'breno' },
      { id: 'cl2', name: 'Mariana Souza',     avatar: 'MS', phone: '(11) 98765-4321', status: 'recurrent', tag: 'Recorrente', totalOrders: 31, totalSpent: 'R$ 1.480,00', lastOrder: '20/04/2026', since: 'Mar 2024', agent: 'breno' },
      { id: 'cl3', name: 'Fernanda Oliveira', avatar: 'FO', phone: '(11) 98901-2345', status: 'vip',       tag: 'VIP',        totalOrders: 62, totalSpent: 'R$ 3.100,00', lastOrder: '21/04/2026', since: 'Nov 2023', agent: 'breno' },
      { id: 'cl4', name: 'João Paulo R.',     avatar: 'JP', phone: '(11) 91234-5678', status: 'new',       tag: 'Novo',       totalOrders: 2,  totalSpent: 'R$ 94,00',    lastOrder: '23/04/2026', since: 'Abr 2026', agent: null    },
      { id: 'cl5', name: 'Bruno Silva',       avatar: 'BS', phone: '(11) 97654-3210', status: 'recurrent', tag: 'Recorrente', totalOrders: 19, totalSpent: 'R$ 908,00',   lastOrder: '19/04/2026', since: 'Jun 2024', agent: null    },
      { id: 'cl6', name: 'Patrícia Nunes',    avatar: 'PN', phone: '(11) 95432-1098', status: 'recurrent', tag: 'Recorrente', totalOrders: 14, totalSpent: 'R$ 668,00',   lastOrder: '22/04/2026', since: 'Fev 2025', agent: 'breno' },
      { id: 'cl7', name: 'Rafael Alves',      avatar: 'RA', phone: '(11) 99876-5432', status: 'inactive',  tag: 'Inativo',    totalOrders: 8,  totalSpent: 'R$ 382,00',   lastOrder: '10/03/2026', since: 'Set 2025', agent: null    },
      { id: 'cl8', name: 'Ana Paula Ribeiro', avatar: 'AP', phone: '(11) 96543-2109', status: 'inactive',  tag: 'Inativo',    totalOrders: 5,  totalSpent: 'R$ 238,00',   lastOrder: '01/02/2026', since: 'Dez 2025', agent: null    },
    ],
  },
  'burger': {
    kpis: { total: 124, ativos: 89, ticket: 'R$ 38,20', nps: 64 },
    clients: [
      { id: 'bcl1', name: 'Pedro Costa',   avatar: 'PC', phone: '(21) 99111-2233', status: 'vip',       tag: 'VIP',        totalOrders: 28, totalSpent: 'R$ 1.069,60', lastOrder: '23/04/2026', since: 'Ago 2024', agent: 'breno' },
      { id: 'bcl2', name: 'Henrique Lima', avatar: 'HL', phone: '(21) 98222-3344', status: 'recurrent', tag: 'Recorrente', totalOrders: 15, totalSpent: 'R$ 573,00',   lastOrder: '20/04/2026', since: 'Out 2024', agent: null    },
      { id: 'bcl3', name: 'Camila Reis',   avatar: 'CR', phone: '(21) 97333-4455', status: 'new',       tag: 'Novo',       totalOrders: 3,  totalSpent: 'R$ 114,60',   lastOrder: '22/04/2026', since: 'Abr 2026', agent: null    },
    ],
  },
  'acai': {
    kpis: { total: 312, ativos: 298, ticket: 'R$ 29,50', nps: 91 },
    clients: [
      { id: 'acl1', name: 'Bia Ramos',    avatar: 'BR', phone: '(31) 99444-5566', status: 'vip',       tag: 'VIP',        totalOrders: 54, totalSpent: 'R$ 1.593,00', lastOrder: '23/04/2026', since: 'Jul 2024', agent: 'breno' },
      { id: 'acl2', name: 'Livia Santos', avatar: 'LS', phone: '(31) 98555-6677', status: 'recurrent', tag: 'Recorrente', totalOrders: 21, totalSpent: 'R$ 619,50',   lastOrder: '22/04/2026', since: 'Jan 2025', agent: null    },
    ],
  },
  'sushi': {
    kpis: { total: 87, ativos: 52, ticket: 'R$ 89,40', nps: 48 },
    clients: [
      { id: 'scl1', name: 'Lucas Wei',     avatar: 'LW', phone: '(11) 96789-0123', status: 'vip',       tag: 'VIP',        totalOrders: 22, totalSpent: 'R$ 1.966,80', lastOrder: '23/04/2026', since: 'Mar 2024', agent: 'breno' },
      { id: 'scl2', name: 'Ana Kobayashi', avatar: 'AK', phone: '(11) 94567-8901', status: 'recurrent', tag: 'Recorrente', totalOrders: 17, totalSpent: 'R$ 1.519,80', lastOrder: '18/04/2026', since: 'Fev 2025', agent: 'breno' },
      { id: 'scl3', name: 'Pedro Iwamoto', avatar: 'PI', phone: '(11) 95678-9012', status: 'inactive',  tag: 'Inativo',    totalOrders: 9,  totalSpent: 'R$ 804,60',   lastOrder: '15/03/2026', since: 'Nov 2024', agent: null    },
    ],
  },
  'tapioca': {
    kpis: { total: 43, ativos: 41, ticket: 'R$ 22,10', nps: 98 },
    clients: [
      { id: 'tcl1', name: 'Dona Zelia', avatar: 'DZ', phone: '(85) 99123-4567', status: 'vip', tag: 'VIP', totalOrders: 88, totalSpent: 'R$ 1.944,80', lastOrder: '23/04/2026', since: 'Jan 2023', agent: 'breno' },
    ],
  },
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
