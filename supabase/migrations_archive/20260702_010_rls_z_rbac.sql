-- Rota B 4b-2 Z: RBAC -> has_rbac_role_in_hierarchy, preservando branch loja_consultores. Atômico.
-- Gerado a partir de pg_policies (def ao vivo). Substitui APENAS o ramo RBAC
-- (tenant_members + roles r.name) por public.has_rbac_role_in_hierarchy(...).
-- Preserva verbatim: branches loja_consultores (lc.ativo), autor_id/enviado_por = auth.uid(), autor_id IS NULL.
-- Nomes de policy citados verbatim (identifiers truncados a 63 bytes com multibyte).

BEGIN;

-- 1. atendimento_avaliacoes / aval_update_admin (UPDATE) — tenant direto — admin,dev,atendimento
DROP POLICY IF EXISTS "aval_update_admin" ON public.atendimento_avaliacoes;
CREATE POLICY "aval_update_admin" ON public.atendimento_avaliacoes
  AS PERMISSIVE FOR UPDATE TO public
  USING (
    public.has_rbac_role_in_hierarchy(atendimento_avaliacoes.tenant_id, ARRAY['admin','dev','atendimento']::text[])
  );

-- 2. avaliacao_config / tenant_admin_write_avaliacao_config (ALL) — tenant direto — admin,dev
DROP POLICY IF EXISTS "tenant_admin_write_avaliacao_config" ON public.avaliacao_config;
CREATE POLICY "tenant_admin_write_avaliacao_config" ON public.avaliacao_config
  AS PERMISSIVE FOR ALL TO public
  USING (
    public.has_rbac_role_in_hierarchy(avaliacao_config.tenant_id, ARRAY['admin','dev']::text[])
  );

-- 3. loja_consultores / "Admins gerenciam atribuições" (ALL) — via lojas l — admin,consultor_senior (sem lc)
DROP POLICY IF EXISTS "Admins gerenciam atribuições" ON public.loja_consultores;
CREATE POLICY "Admins gerenciam atribuições" ON public.loja_consultores
  AS PERMISSIVE FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM lojas l
      WHERE l.id = loja_consultores.loja_id
        AND public.has_rbac_role_in_hierarchy(l.tenant_id, ARRAY['admin','consultor_senior']::text[])
    )
  );

-- 4. loja_metricas_snapshot / "Editar métricas: ..." (ALL) — via lojas l (admin,consultor_senior) OR branch lc (PRESERVADO)
DROP POLICY IF EXISTS "Editar métricas: admins, consultores_senior e consultores atri" ON public.loja_metricas_snapshot;
CREATE POLICY "Editar métricas: admins, consultores_senior e consultores atri" ON public.loja_metricas_snapshot
  AS PERMISSIVE FOR ALL TO public
  USING (
    (
      EXISTS (
        SELECT 1 FROM lojas l
        WHERE l.id = loja_metricas_snapshot.loja_id
          AND public.has_rbac_role_in_hierarchy(l.tenant_id, ARRAY['admin','consultor_senior']::text[])
      )
      OR EXISTS (
        SELECT 1 FROM loja_consultores lc
        WHERE lc.loja_id = loja_metricas_snapshot.loja_id AND lc.user_id = auth.uid() AND lc.ativo = true
      )
    )
  );

-- 5. tarefa_aprovacoes / "Registrar acao: ..." (INSERT) — via tarefas_loja->lojas OR branch lc (PRESERVADO)
DROP POLICY IF EXISTS "Registrar acao: admins, consultores_senior e consultores atribu" ON public.tarefa_aprovacoes;
CREATE POLICY "Registrar acao: admins, consultores_senior e consultores atribu" ON public.tarefa_aprovacoes
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM tarefas_loja t JOIN lojas l ON l.id = t.loja_id
        WHERE t.id = tarefa_aprovacoes.tarefa_id
          AND public.has_rbac_role_in_hierarchy(l.tenant_id, ARRAY['admin','consultor_senior']::text[])
      )
      OR EXISTS (
        SELECT 1 FROM tarefas_loja t JOIN loja_consultores lc ON lc.loja_id = t.loja_id
        WHERE t.id = tarefa_aprovacoes.tarefa_id AND lc.user_id = auth.uid() AND lc.ativo = true
      )
    )
  );

-- 6. tarefa_comentarios / "Comentar: ..." (INSERT) — (autor OR NULL) AND (via tarefas_loja->lojas OR branch lc) — autor e lc PRESERVADOS
DROP POLICY IF EXISTS "Comentar: admins, consultores_senior e consultores atribuidos" ON public.tarefa_comentarios;
CREATE POLICY "Comentar: admins, consultores_senior e consultores atribuidos" ON public.tarefa_comentarios
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    (
      ((autor_id = auth.uid()) OR (autor_id IS NULL))
      AND (
        EXISTS (
          SELECT 1 FROM tarefas_loja t JOIN lojas l ON l.id = t.loja_id
          WHERE t.id = tarefa_comentarios.tarefa_id
            AND public.has_rbac_role_in_hierarchy(l.tenant_id, ARRAY['admin','consultor_senior']::text[])
        )
        OR EXISTS (
          SELECT 1 FROM tarefas_loja t JOIN loja_consultores lc ON lc.loja_id = t.loja_id
          WHERE t.id = tarefa_comentarios.tarefa_id AND lc.user_id = auth.uid() AND lc.ativo = true
        )
      )
    )
  );

-- 7. tarefa_comentarios / "Deletar comentario: autor ou admin" (DELETE) — autor OR (via tarefas_loja->lojas) — sem lc
DROP POLICY IF EXISTS "Deletar comentario: autor ou admin" ON public.tarefa_comentarios;
CREATE POLICY "Deletar comentario: autor ou admin" ON public.tarefa_comentarios
  AS PERMISSIVE FOR DELETE TO public
  USING (
    (
      (autor_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM tarefas_loja t JOIN lojas l ON l.id = t.loja_id
        WHERE t.id = tarefa_comentarios.tarefa_id
          AND public.has_rbac_role_in_hierarchy(l.tenant_id, ARRAY['admin','consultor_senior']::text[])
      )
    )
  );

-- 8. tarefa_prints / "Enviar prints: ..." (INSERT) — via tarefas_loja->lojas OR branch lc (PRESERVADO)
DROP POLICY IF EXISTS "Enviar prints: admins, consultores_senior e consultores atribui" ON public.tarefa_prints;
CREATE POLICY "Enviar prints: admins, consultores_senior e consultores atribui" ON public.tarefa_prints
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM tarefas_loja t JOIN lojas l ON l.id = t.loja_id
        WHERE t.id = tarefa_prints.tarefa_id
          AND public.has_rbac_role_in_hierarchy(l.tenant_id, ARRAY['admin','consultor_senior']::text[])
      )
      OR EXISTS (
        SELECT 1 FROM tarefas_loja t JOIN loja_consultores lc ON lc.loja_id = t.loja_id
        WHERE t.id = tarefa_prints.tarefa_id AND lc.user_id = auth.uid() AND lc.ativo = true
      )
    )
  );

-- 9. tarefa_prints / "Remover prints proprios ou como admin" (DELETE) — enviado_por OR (via tarefas_loja->lojas) — sem lc
DROP POLICY IF EXISTS "Remover prints proprios ou como admin" ON public.tarefa_prints;
CREATE POLICY "Remover prints proprios ou como admin" ON public.tarefa_prints
  AS PERMISSIVE FOR DELETE TO public
  USING (
    (
      (enviado_por = auth.uid())
      OR EXISTS (
        SELECT 1 FROM tarefas_loja t JOIN lojas l ON l.id = t.loja_id
        WHERE t.id = tarefa_prints.tarefa_id
          AND public.has_rbac_role_in_hierarchy(l.tenant_id, ARRAY['admin','consultor_senior']::text[])
      )
    )
  );

-- 10. tarefas_loja / "Gerenciar tarefas: ..." (ALL) — via lojas l OR branch lc (PRESERVADO)
DROP POLICY IF EXISTS "Gerenciar tarefas: admins, consultores_senior e consultores atr" ON public.tarefas_loja;
CREATE POLICY "Gerenciar tarefas: admins, consultores_senior e consultores atr" ON public.tarefas_loja
  AS PERMISSIVE FOR ALL TO public
  USING (
    (
      EXISTS (
        SELECT 1 FROM lojas l
        WHERE l.id = tarefas_loja.loja_id
          AND public.has_rbac_role_in_hierarchy(l.tenant_id, ARRAY['admin','consultor_senior']::text[])
      )
      OR EXISTS (
        SELECT 1 FROM loja_consultores lc
        WHERE lc.loja_id = tarefas_loja.loja_id AND lc.user_id = auth.uid() AND lc.ativo = true
      )
    )
  );

-- 11. templates_tarefa / "Gerenciar templates: admins e consultores_senior" (ALL) — tenant direto — admin,consultor_senior
DROP POLICY IF EXISTS "Gerenciar templates: admins e consultores_senior" ON public.templates_tarefa;
CREATE POLICY "Gerenciar templates: admins e consultores_senior" ON public.templates_tarefa
  AS PERMISSIVE FOR ALL TO public
  USING (
    public.has_rbac_role_in_hierarchy(templates_tarefa.tenant_id, ARRAY['admin','consultor_senior']::text[])
  );

COMMIT;
