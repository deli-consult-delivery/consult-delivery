# MÉTODO DE TRABALHO — Console v2 (regra do Wandson, 2026-06-08)

> **Ler antes de mexer em qualquer tela do Console v2.** Regra dada pelo Wandson e que vale para todas as sessões.

## 1. Protótipo primeiro, sempre
A fonte da verdade do visual é o protótipo em **`docs/prototipo/console-v2.html`** (e o design em claude.ai/design · ui_kits/console). **Antes de construir/alterar uma tela na plataforma:**
1. Primeiro construa/ajuste a tela **dentro do protótipo** (`console-v2.html`) — no mesmo padrão das demais.
2. Só então **porte o código** do protótipo para a plataforma (React, em `src/console/`).
3. Faça **o mais idêntico possível** ao protótipo — mesma identidade visual, mesmos componentes, mesmos ícones (sprite em `src/console/CvIcons.jsx`, extraído byte-a-byte do protótipo).

## 2. Tudo no visual claro (nova pegada)
O Console v2 é a versão **clara/unificada**. **Nenhuma tela pode ficar com o visual escuro do console antigo.** As telas que foram reaproveitadas do console clássico (DELI, Clientes/CRM, Lojas, Conversas·MIA, Cobrança, Rotinas, Heartbeats, Metas, Memória, Conhecimento, Configurações) **precisam ser refeitas no visual claro** — não basta reusar o componente escuro.

## 3. Fidelidade total da topbar e navegação
A topbar deve ter **exatamente** os elementos do protótipo: breadcrumb · busca · **pílula de créditos (zap)** · **seletor de tenant** · **sino de notificações (bell)** · **avatar**. Sidebar = 5 grupos (INÍCIO · OPERAÇÃO · AGENTES IA · DADOS · SISTEMA) na ordem do protótipo, com os ícones do protótipo.

## 4. Dados reais
Visual idêntico ao protótipo, mas **dados reais** (Supabase) — nunca dados fake. Onde ainda não há fonte (ex.: créditos como saldo de cobrança), usar o número real mais próximo e honesto, e deixar registrado.

## 5. Disciplina de entrega
Build sempre verde (validar com `esbuild --bundle` do grafo antes de mergear) · 1 onda por PR · verificar no navegador após o deploy.
