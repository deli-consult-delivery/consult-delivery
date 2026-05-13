-- Fase 0 | Tarefa 4.2
-- Remove tenants seed criados para testes iniciais.
-- CASCADE elimina todos os dados relacionados (conversations, messages, tasks, etc.)
-- evolution_instances: verificado como vazio para estes tenants (sem bloqueio NO ACTION)

DELETE FROM tenants
WHERE slug IN ('pizza-joao', 'burger', 'acai', 'sushi', 'tapioca');
