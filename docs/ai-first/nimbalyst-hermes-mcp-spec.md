# Nimbalyst ↔ Hermes — Spec de conexão MCP (2026-07-30)

## Objetivo
Falar com DELI e Ana de dentro do Nimbalyst (app desktop já instalado, projeto `consult-delivery` aberto nele), sem duplicar lógica — Nimbalyst vira só mais um cliente de chat pro Hermes.

## Por que não existe hoje
Os MCPs atuais do Hermes (`ifood`, `asaas`, `evolution`, `cd-admin`, `vendaerp`) são *tools de ação* determinísticas — nenhum expõe "conversar com persona X". Nimbalyst precisa de um MCP novo que faça essa ponte.

## Proposta: `hermes-chat-mcp`
Wrapper mínimo, 2 tools:
- `talk_to_deli(mensagem: string) -> resposta: string` — chama o endpoint do Bridge/Hermes que já serve a DELI em produção
- `talk_to_ana(mensagem: string) -> resposta: string` — mesma ideia, endpoint da Ana (só existe depois do GATE 0 confirmado + credenciais conectadas)

## Registro no Nimbalyst
Settings → MCP Servers → Add Server → config manual (mesmo padrão dos templates GitHub/PostgreSQL já vistos na tela). Formato esperado (a confirmar contra a doc real do Nimbalyst MCP na hora de implementar):

```json
{
  "hermes-chat": {
    "command": "node",
    "args": ["caminho/pro/hermes-chat-mcp/index.js"],
    "env": { "HERMES_BRIDGE_URL": "..." }
  }
}
```

## Falta implementar (nenhum código ainda)
1. Confirmar endpoint real do Bridge que a DELI já usa (`src/console/Deli.jsx` — ver `VITE_BRIDGE_URL`).
2. Escrever o wrapper `hermes-chat-mcp` (Node, 2 tools, sem regra de negócio — só repassa pro Bridge).
3. Endpoint da Ana só existe depois do profile (`hermes/profiles/ana/SOUL.md`) + GATE 0 confirmado.
4. Testar registro no Nimbalyst com `talk_to_deli` primeiro (já tem endpoint real em produção), `talk_to_ana` depois.
