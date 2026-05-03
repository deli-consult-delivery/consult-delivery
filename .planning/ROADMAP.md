# Roadmap — Módulo Análise iFood

**3 phases | 35 requirements | Granularity: Coarse**

---

## Phases

- [ ] **Phase 1: Foundation** — Schema, API functions, and React trigger form wired to Supabase
- [ ] **Phase 2: Pipeline n8n** — End-to-end analysis pipeline from Drive ingestion to Supabase writes, with full resilience
- [ ] **Phase 3: Report & Actions UI** — Report rendering, post-analysis actions, and analysis history

---

## Phase Details

### Phase 1: Foundation

**Goal**: The analysis trigger is live — a consultant can select a client, paste a Drive link, submit the form, and a `pending` row appears in Supabase with a `job_id`
**Depends on**: Nothing (first phase)
**Requirements**: SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04, SCHEMA-05, TRIGGER-01, TRIGGER-02, TRIGGER-03, TRIGGER-04
**Estimated effort**: 3h

**Success Criteria** (what must be TRUE):
1. A consultant can navigate to "Análise iFood" via the platform's side menu and see the trigger form
2. Submitting the form creates a row in the `analises` table with `status = pending` and returns a `job_id` — visible in Supabase dashboard
3. Submitting a second time while the first is pending is blocked — the button disables on first click
4. RLS is enforced — a consultant from tenant A cannot query rows belonging to tenant B

**Plans**: TBD
**UI hint**: yes

---

### Phase 2: Pipeline n8n

**Goal**: Triggering an analysis from the form causes n8n to read the Drive folder, call Claude, and write the structured result (JSON, HTML, WhatsApp message, and Kanban tasks) back to Supabase — status transitions from `pending` → `processing` → `done` (or `error`)
**Depends on**: Phase 1
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05, PIPE-06, PIPE-07, PIPE-08, PIPE-09, PIPE-10, PIPE-11, INFRA-01, INFRA-02, INFRA-03
**Estimated effort**: 5h

**Success Criteria** (what must be TRUE):
1. After form submission, the Supabase row transitions from `pending` → `processing` → `done` within 90 seconds when given a valid Drive folder
2. The `done` row contains a non-null `resultado_json`, `html_relatorio`, and `mensagem_whatsapp` — verifiable directly in Supabase
3. Top-5 priority tasks appear in the `tasks` table (Kanban) after a successful analysis
4. A row with an invalid Drive link (or any n8n failure) transitions to `status = error` with a readable `error_message` — no rows are ever stuck in `processing` beyond 5 minutes

**Plans**: TBD

---

### Phase 3: Report & Actions UI

**Goal**: The consultant sees the complete analysis result inside the platform — report rendered, tasks reviewable, WhatsApp sendable with confirmation, and all past analyses accessible per client
**Depends on**: Phase 2
**Requirements**: REPORT-01, REPORT-02, REPORT-03, REPORT-04, REPORT-05, REPORT-06, ACTION-01, ACTION-02, ACTION-03, HIST-01, HIST-02, HIST-03
**Estimated effort**: 4h

**Success Criteria** (what must be TRUE):
1. After triggering an analysis, the consultant sees a live spinner with step indicators — they never face a blank screen during the 30–90s processing window
2. When analysis completes, the full HTML report renders inside the platform with a health badge (`saudavel` / `atencao` / `critico`) and the top-5 priorities in cards showing urgency and estimated financial impact
3. The consultant can preview and confirm WhatsApp message delivery; the `whatsapp_sent` flag updates to `true` after confirmation
4. The consultant can open any past analysis for a client, see the full HTML report, and the current analysis shows whether performance improved or worsened versus the previous one

**Plans**: TBD
**UI hint**: yes

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/? | Not started | - |
| 2. Pipeline n8n | 0/? | Not started | - |
| 3. Report & Actions UI | 0/? | Not started | - |
