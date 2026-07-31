# Regime de Permissão — Ana (revisão 2026-07-30)

## Decisão do Wandson (2026-07-30)
- Ana pode ter **autonomia para executar** — não fica restrita a "propõe e espera aprovação" por padrão. Decisão explícita, substitui a proposta original (só-leitura) do plano inicial do cd-compass.
- Ana fica **fora do catálogo multi-tenant** (`agents`/`tenant_agents`, Supabase/RLS) — não serve tenant nenhum.

## O que NÃO muda com essa decisão
Autonomia de execução é sobre *comportamento da persona*. É decisão diferente de *a infraestrutura estar segura* — uma não cancela a outra:

- **GATE 0 continua pré-requisito** para Ana operar contra qualquer sistema real (email/finanças/WhatsApp pessoal). O próprio `CLAUDE.md` do projeto já reserva ao Wandson, sem exceção: *"credenciais, secrets e VPS (GATE 0, claudedev)"* (Mandato Cowork D5 v3). Isso vale igual pra Ana.
- **Nenhuma credencial pessoal existe hoje** (confirmado pelo Wandson em 2026-07-30) — sem credencial, não há execução real possível ainda, independente do regime escolhido.

## Registro de risco
Autonomia total sobre email/finanças/WhatsApp **pessoal**, sem checkpoint de aprovação, é mais permissivo que o modelo que a própria DELI usa até para clientes (que exige draft + aprovação mesmo em Verde — seção DRAFTS do `CLAUDE.md`). Ana não tem essa camada. Registrado aqui como decisão do Wandson, não como bloqueio — serve pra ele (ou uma sessão futura) lembrar o motivo se algo precisar ser revisto.

## Estado final (2026-07-30)
- Regime: autonomia de execução, sem restrição a leitura.
- Bloqueio ativo até liberação: GATE 0 não confirmado + zero credencial conectada.
- Responsável por liberar cada sistema: Wandson (VPS/credencial são dele por mandato do próprio `CLAUDE.md`).
