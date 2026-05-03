---
name: gsd-validate-phase
description: "Audita retroativamente e preenche lacunas de validação de Nyquist para uma fase concluída"
---

<objective>
Audit Nyquist validation coverage for a completed phase. Three states:
- (A) VALIDATION.md exists — audit and fill gaps
- (B) No VALIDATION.md, SUMMARY.md exists — reconstruct from artifacts
- (C) Phase not executed — exit with guidance

Output: updated VALIDATION.md + generated test files.
</objective>

<execution_context>
@.agent/get-shit-done/workflows/validate-phase.md
</execution_context>

<context>
Phase: $ARGUMENTS — optional, defaults to last completed phase.
</context>

<process>
Execute @.agent/get-shit-done/workflows/validate-phase.md.
Preserve all workflow gates.
</process>
