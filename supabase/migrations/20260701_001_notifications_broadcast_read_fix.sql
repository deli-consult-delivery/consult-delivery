-- Corrige bug: notificações broadcast (recipient_user_id IS NULL) nunca podiam ser
-- marcadas como lidas, pois internal_notifications_update_own só permitia UPDATE
-- quando recipient_user_id = auth.uid(). Resultado: contador de notificações nunca
-- zera para alertas de sistema/DELI (kind: system, deli_alert, agent_completed, etc).
-- Achado durante QA de go-live da Karina Doceria (2026-07-01).

DROP POLICY IF EXISTS internal_notifications_update_own ON public.internal_notifications;

CREATE POLICY internal_notifications_update_own
  ON public.internal_notifications FOR UPDATE
  USING (
    (recipient_user_id = auth.uid())
    OR (
      recipient_user_id IS NULL
      AND tenant_id IN (
        SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    (recipient_user_id = auth.uid())
    OR (
      recipient_user_id IS NULL
      AND tenant_id IN (
        SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
      )
    )
  );
