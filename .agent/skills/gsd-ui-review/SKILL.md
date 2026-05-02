---
name: gsd-ui-review
description: "Auditoria visual retroativa baseada em 6 pilares do código frontend implementado"
---

<objective>
Conduct a retroactive 6-pillar visual audit. Produces UI-REVIEW.md with
graded assessment (1-4 per pillar). Works on any project.
Output: {phase_num}-UI-REVIEW.md
</objective>

<execution_context>
@.agent/get-shit-done/workflows/ui-review.md
@.agent/get-shit-done/references/ui-brand.md
</execution_context>

<context>
Phase: $ARGUMENTS — optional, defaults to last completed phase.
</context>

<process>
Execute @.agent/get-shit-done/workflows/ui-review.md end-to-end.
Preserve all workflow gates.
</process>
