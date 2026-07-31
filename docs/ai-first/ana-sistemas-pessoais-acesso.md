# Sistemas Pessoais — Acesso da Ana (spec, 2026-07-30)

Nenhum destes está conectado. Confirmado pelo Wandson em 2026-07-30: nenhuma credencial pronta hoje — todos aguardam conexão.

| Sistema | Mecanismo proposto | Read/Write | Credencial que falta | Pendência |
|---|---|---|---|---|
| Email pessoal | MCP Gmail/IMAP dedicado (OAuth próprio, nunca `@consultdelivery.com.br`) | Read + Write (autonomia decidida) | OAuth client + login Gmail pessoal | Wandson autoriza OAuth pessoalmente quando disponível |
| Finanças pessoais | MCP filesystem sobre planilha/pasta pessoal, ou API de banco se houver Open Finance | Read + Write | Fonte de dado ainda não definida (planilha? extrato? Open Finance?) | Confirmar com Wandson qual formato ele já usa hoje |
| Arquivos pessoais | MCP filesystem sobre pasta pessoal dedicada (distinta da pasta "Consult Delivery OS", que é da DELI) | Read + Write | Caminho da pasta a definir | Confirmar caminho com Wandson |
| WhatsApp pessoal | Instância Evolution separada da comercial, ou API oficial WhatsApp | Read + Write | Número + instância Evolution nova | Provisionar instância nova na VPS (gated pelo GATE 0) |

## Regra fixa (não muda por sistema)
Nenhuma dessas linhas liga de verdade antes do GATE 0 confirmado — ver `ana-regime-permissao.md`. Credencial de cada sistema é sempre criada pelo próprio Wandson (login pessoal, OAuth pessoal) — nunca por uma sessão de agente sozinha.
