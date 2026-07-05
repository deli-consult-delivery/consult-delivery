-- 20260628_004_vendaerp_proposals_confirm_code.sql
-- GATE 0 (Blueprint v2 §5C/§7): erp_confirmar ESTRUTURAL — confirmação out-of-band.
--
-- Hoje erp_confirmar(proposal_id) executa só com o proposal_id, que o agente que
-- PROPÔS recebe de volta → o mesmo agente pode auto-confirmar (o "sim" é só
-- instrução de prompt, não barreira). Estas colunas tornam isso ESTRUTURAL:
--   • confirm_code_hash: hash (sha256) de um código gerado no propor e NUNCA
--     devolvido ao agente — entregue ao CEO por canal out-of-band (Telegram).
--     erp_confirmar passa a exigir o código; sem ele (que só o CEO tem), o agente
--     proponente não confirma.
--   • confirm_attempts: contador anti-brute-force (lock após N tentativas erradas).
--
-- ADITIVO/REVERSÍVEL: só ADD COLUMN. Reverter = DROP COLUMN das duas.
-- Propostas antigas (pré-migration) ficam com hash NULL → não confirmáveis pelo
-- novo caminho (expiram em 10 min de qualquer forma; escrita ainda não está live).

ALTER TABLE public.vendaerp_proposals
  ADD COLUMN IF NOT EXISTS confirm_code_hash text,
  ADD COLUMN IF NOT EXISTS confirm_attempts  integer NOT NULL DEFAULT 0;
