# Nimbalyst ↔ Hermes — Spec de conexão MCP (2026-07-30)

## Objetivo
Falar com DELI e Ana de dentro do Nimbalyst (app desktop já instalado, projeto `consult-delivery` aberto nele), sem duplicar lógica — Nimbalyst vira só mais um cliente de chat pro Hermes.

## Por que não existe hoje
Os MCPs atuais do Hermes (`ifood`, `asaas`, `evolution`, `cd-admin`, `vendaerp`) são *tools de ação* determinísticas — nenhum expõe "conversar com persona X". Nimbalyst precisa de um MCP novo que faça essa ponte.

## Achado técnico (2026-07-30, lendo `src/console/Deli.jsx` de verdade)
O endpoint real **não é síncrono**:
- `POST {BRIDGE}/agents/deli-conversa/run` — body `{tenant_id, payload: {user_id, message}}`, header `Authorization: Bearer <supabase_session_token>`. Só **dispara** a execução (retorna aceite, não a resposta).
- A resposta de verdade chega depois, via **Supabase Realtime** — INSERT na tabela `deli_messages` (filtro `tenant_id`), é isso que o `Deli.jsx` escuta (`postgres_changes` subscription) pra atualizar o chat.
- Autenticação é **token de sessão Supabase do usuário logado** (`session.access_token`), não uma API key fixa de serviço.

Isso muda o desenho do wrapper: `talk_to_deli` não pode ser um simples `POST → recebe resposta`. Precisa: (1) disparar o run, (2) escutar/pollar `deli_messages` até a nova linha do `assistant` aparecer, (3) devolver o conteúdo. E precisa de um token Supabase válido — **decisão em aberto, não resolvida sozinha**: usar uma conta de serviço dedicada (nova, criada pelo Wandson) ou reusar sessão dele — de qualquer forma é credencial, fica com ele.

## Proposta: `hermes-chat-mcp`
Wrapper mínimo, 2 tools:
- `talk_to_deli(mensagem: string) -> resposta: string` — dispara `deli-conversa/run` e aguarda a resposta via Supabase Realtime (com timeout)
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
1. ~~Confirmar endpoint real do Bridge~~ — feito 2026-07-30, ver "Achado técnico" acima.
2. **Decisão do Wandson: como o wrapper autentica no Supabase** — conta de serviço dedicada (recomendado, mais fácil de revogar sozinha) ou token de sessão dele copiado manualmente. Bloqueia a escrita do código — é credencial, não decido sozinho.
3. Escrever o wrapper `hermes-chat-mcp` (Node, 2 tools, sem regra de negócio — só repassa pro Bridge + escuta Realtime).
4. Endpoint da Ana só existe depois do GATE 0 confirmado.
5. Testar registro no Nimbalyst com `talk_to_deli` primeiro (já tem endpoint real em produção), `talk_to_ana` depois.
