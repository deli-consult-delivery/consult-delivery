---
name: gsd-cleanup
description: "Arquiva os diretórios de fases acumulados dos marcos concluídos"
---

<objective>
Archive phase directories from completed milestones into `.planning/milestones/v{X.Y}-phases/`.

Use when `.planning/phases/` has accumulated directories from past milestones.
</objective>

<execution_context>
@.agent/get-shit-done/workflows/cleanup.md
</execution_context>

<process>
Follow the cleanup workflow at @.agent/get-shit-done/workflows/cleanup.md.
Identify completed milestones, show a dry-run summary, and archive on confirmation.
</process>
