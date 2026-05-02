---
name: gsd-undo
description: "Reversão segura no git. Desfaz commits de fase ou plano usando o manifesto da fase com verificações de dependência."
---


<objective>
Safe git revert — roll back GSD phase or plan commits using the phase manifest, with dependency checks and a confirmation gate before execution.

Three modes:
- **--last N**: Show recent GSD commits for interactive selection
- **--phase NN**: Revert all commits for a phase (manifest + git log fallback)
- **--plan NN-MM**: Revert all commits for a specific plan
</objective>

<execution_context>
@.agent/get-shit-done/workflows/undo.md
@.agent/get-shit-done/references/ui-brand.md
@.agent/get-shit-done/references/gate-prompts.md
</execution_context>

<context>
$ARGUMENTS
</context>

<process>
Execute the undo workflow from @.agent/get-shit-done/workflows/undo.md end-to-end.
</process>
