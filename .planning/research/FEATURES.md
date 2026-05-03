# Features Research — Análise iFood

**Domain:** AI-powered iFood store performance analysis module for delivery consultancy SaaS
**Researched:** 2026-05-01
**Perspective:** Consultant running 10–20 client analyses per week

---

## Table Stakes (must-have v1)

Features consultants need for this to replace the manual spreadsheet process. Missing any of these means the tool fails adoption.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Trigger analysis for a specific client/store | Core action; without this nothing else works | Low | Dropdown to select store + paste Drive link |
| Google Drive link input | Specified input mechanism; must accept folder or file URLs | Low | Basic URL field + validation that link is accessible |
| Loading/progress state while Claude processes | Analysis takes 30–120s; consultant needs to know it's working | Low | Spinner or step indicators — cannot be blank screen |
| Structured results display (the 8 blocos) | Makes AI output usable; raw JSON is not acceptable | Medium | Card/accordion layout per block |
| Saúde geral badge (saudavel / atencao / critica) | Top-level signal; consultant sees status at a glance | Low | Color-coded indicator, shown prominently |
| Top 5 priorities list with urgency + financial impact | Key output; tells consultant what to do next | Low | Ordered list with urgency tag and R$ impact |
| Auto-create tasks in Kanban from top 5 priorities | Closes loop from analysis to action without double work | Medium | Maps each priority to a task with store + owner |
| WhatsApp send button with pre-written message | Eliminates copy-paste step; saves ~5 min per client | Medium | Shows mensagem_whatsapp preview, one-click send via Evolution API |
| Analysis history list per store | Consultant needs to know when last analysis was run | Low | Simple list: date, health status, triggered by |
| Error state with clear message | Drive link inaccessible, Claude timeout, parse failure — must not silently fail | Low | Actionable error message, retry button |
| Store selector scoped to current tenant | Multi-tenant; consultant only sees their own clients | Low | Dropdown from tenants/stores table |

---

## Differentiators (nice-to-have v1 or v2)

Features that would make consultants choose this over a spreadsheet and tell peers about it.

| Feature | Value Proposition | Complexity | When |
|---------|-------------------|------------|------|
| Side-by-side comparison with previous analysis (evolucao) | Proves consulting value over time; "look what improved" | Medium | v2 — needs at least 2 stored analyses |
| KPI delta indicators (arrows up/down vs last period) | Immediate visual reading of trends without reading text | Low | v2 — depends on history |
| Batch trigger: run analysis for all stores at once | Consultant running weekly reviews saves hours | High | v2 — needs queue/job system |
| Analysis template selector (weekly, monthly, audit) | Different report depths for different use cases | Medium | v2 |
| PDF export of the HTML report | Client-facing deliverable without extra formatting work | Medium | v2 |
| "Insights" digest: cross-store patterns for the consultancy | "3 of your 8 stores have low conversion — here's why" | High | v2 or v3 |
| Consultant notes attached to analysis | Contextual memory: "client was on vacation this week" | Low | v1.5 — add a textarea field |
| Scheduled/recurring analysis triggers | Set weekly cron per store; no manual trigger needed | High | v2 |
| Direct Kanban task assignment during analysis review | Choose assignee before confirming task creation | Low | v1.5 — small UX improvement |
| Audit trail: what changed since consultant intervened | Correlates consultant actions with metric improvements | High | v3 |

---

## Anti-Features (explicitly defer)

Features that sound useful but hurt v1 focus, timeline, or scope.

| Anti-Feature | Why Avoid in v1 | What to Do Instead |
|--------------|-----------------|-------------------|
| Client-facing portal (store owner login) | Different UX, auth flows, permissions — doubles scope | Deliver to owners via WhatsApp as designed |
| iFood API direct integration | iFood has no public partner API; scraping is TOS risk | Keep Drive upload as input; validate screenshots manually |
| Custom report templates / branding per client | Design work, not product work | Use single clean HTML template |
| Multi-language output | All consultants and clients are Brazilian PT-BR | Hard-code PT-BR |
| Real-time iFood monitoring / alerts | Requires polling or webhooks iFood doesn't offer | Analysis is on-demand only |
| Revenue forecasting / ML predictions | Requires historical data that doesn't exist yet | Stick to backward-looking KPIs |
| In-app HTML report editor | Adds editing layer with no clear ROI | Report is read-only; consultant edits tasks in Kanban |
| Granular user permissions per analysis | Team is 2–4 people; RBAC overhead exceeds value | All consultants in a tenant see all analyses |
| Store owner app / mobile client | Different product entirely | WhatsApp message IS the client-facing output |
| Automated financial billing integration per analysis run | Premature; pricing model not validated | Manual billing; Asaas comes later |

---

## UI Pattern Analysis

How analogous tools (Google Lighthouse, SEMrush Site Audit, Google Analytics, Supermetrics) handle the trigger → loading → result flow — and what applies here.

### The Trigger Step

**Pattern used by Lighthouse / SEMrush:** Single prominent input field (URL / domain), large CTA button ("Analyze" / "Start Audit"). Minimal friction. No pre-analysis configuration required for a first run.

**Apply here:** One form: store selector dropdown + Drive link text field + "Iniciar Análise" button. No additional options needed in v1. Configuration (which blocks to include, depth) deferred to v2.

### The Loading State

**Critical insight from analogous tools:** Users abandon if there is no progress signal within 10 seconds of triggering a long operation. Lighthouse and Vercel show step-by-step progress ("Fetching resources… Auditing performance… Generating report"). SEMrush shows a spinner with estimated time.

**Apply here:** Because Claude processing is 30–120 seconds, a static spinner is risky. Recommended pattern:

1. Immediate acknowledgment: "Análise iniciada — processando arquivos do Drive" (appears instantly)
2. Step indicators (fake-progress acceptable): "Lendo screenshots (1/3)", "Analisando métricas (2/3)", "Gerando prioridades (3/3)"
3. Completion triggers page transition to results — do not auto-redirect; show a "Ver resultado" button or toast notification

**Implementation note:** Run analysis as a background job (Supabase Edge Function or VPS). Store result in DB. Frontend polls or subscribes via Supabase Realtime. This means the consultant can navigate away and return.

### The Results View

**Pattern from Google Analytics / SEMrush dashboards:** Summary scorecard at top (health status + key number), detail sections below. Progressive disclosure: summary → block → detail. Avoid information overload on first load.

**Apply here:**
- Top bar: Store name + analysis date + Saúde Geral badge (green/yellow/red)
- Pinned section: Top 5 Prioridades with urgency and R$ impact
- Accordion or tabs: 8 blocos — collapsed by default, consultant expands what they need
- Action bar (sticky bottom or top): "Criar tarefas no Kanban" + "Enviar WhatsApp" as primary CTAs

**Anti-pattern to avoid:** Do not dump all 15+ KPIs in a flat list. Group by bloco. Consultants scan, not read.

### The Action Step (Kanban + WhatsApp)

**Pattern from project management tools:** After a report, offer "one-click" next actions. Notion AI, Linear, and Jira all show "Create issue from this item" inline. The key is confirmation before action.

**Apply here:**
- "Criar tarefas" button opens a preview modal: list of 5 tasks that will be created, editable titles, confirm button
- "Enviar WhatsApp" button shows the pre-written mensagem_whatsapp in a preview modal, with an editable textarea and a "Confirmar envio" button
- Both actions show success confirmation inline (not a separate page)

---

## History & Comparison

### v1 Recommendation: Store History, No Comparison UI

**What to build in v1:**
- Store every analysis result in DB (analyses table with store_id, tenant_id, created_at, raw_json, saude_geral)
- Show a history list per store: date, health badge, triggered by, link to full result
- Do NOT build comparison UI (delta KPIs, side-by-side) in v1

**Rationale:**
- The `evolucao` field in the JSON output already handles comparison logic at the Claude level — no UI needed in v1
- Comparison UI requires at least 2–3 stored analyses per store to be meaningful (takes 2–3 weeks minimum to accumulate)
- Building comparison UI before data exists wastes sprint capacity
- The history list alone proves "we have a record" and seeds the comparison feature for v2

**v2 Recommendation:**
- After 4+ weeks of stored analyses, add delta indicators to the results view
- Add a "Comparar com análise anterior" toggle on the results page
- Cross-store comparison dashboard: which stores improved, which worsened, in a given period

---

## Notification Strategy

### Where to Notify the Consultant

Because analysis runs asynchronously (30–120 seconds, possibly longer with large Drive folders), the consultant should not have to sit on the loading screen.

**Recommended v1 notification stack (in priority order):**

1. **In-app notification (bell icon)** — PRIMARY
   - Existing platform already has TASK-307 (Notificações básicas)
   - When analysis completes, create a notification: "Análise da [Loja X] concluída — [saúde geral badge]"
   - Click goes directly to the result page
   - This covers the case where consultant navigated away

2. **Toast on same tab** — SECONDARY
   - If consultant stays on the platform (any page), show a toast: "Análise pronta — Ver resultado →"
   - Implement via Supabase Realtime subscription on the analyses table
   - Low implementation cost if Realtime is already configured for chat

3. **WhatsApp to consultant** — DEFER to v2
   - Sending a WhatsApp to the consultant when their client's analysis is done adds complexity (Evolution API call from VPS, consultant phone number management)
   - The in-app notification is sufficient for v1 since consultants work inside the platform

4. **Email** — EXPLICITLY DEFER
   - No email infrastructure in current stack
   - Adds Resend/SendGrid integration cost and complexity
   - Not justified for internal tool with small team

### Notification Content

Notification should include:
- Store name
- Health status (saudavel / atencao / critica) with color
- Number of priorities generated
- Direct link to result
- Timestamp

**Anti-pattern:** Do not notify before the result is fully stored and parseable. A "done" notification that leads to a broken result page destroys trust faster than a slow analysis.
