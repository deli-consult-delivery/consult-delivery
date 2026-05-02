# Pitfalls Research — Análise iFood

**Domain:** AI vision analysis pipeline (n8n + Claude API + Google Drive + Supabase + Evolution API)
**Researched:** 2026-05-01
**Overall confidence:** HIGH (verified against official docs and community sources)

---

## Google Drive Integration Failures

### CRITICAL — Service account not granted access to the shared folder

**What goes wrong:** n8n calls Google Drive API with a service account. The folder was shared via a public link ("anyone with the link can view"), but the service account is a distinct Google identity — public links do not grant it access. The API returns 404 or 403 even though a browser with the link works fine.

**Warning sign:** Drive node returns `File not found` or `Insufficient permissions` for a folder you can open in the browser.

**Prevention:** Share the specific Drive folder directly with the service account's email address (format: `name@project-id.iam.gserviceaccount.com`) granting at minimum Viewer role. Public link sharing is irrelevant to API access.

**Phase to handle:** Foundation phase, before any file-reading logic is built.

---

### HIGH — Files in subfolders are not returned by a single list call

**What goes wrong:** `drive.files.list` with a folder ID only returns direct children. If the client organizes screenshots into subfolders (`/Janeiro/semana1/`), the workflow gets zero files and silently produces an empty analysis.

**Warning sign:** Analysis completes successfully but with 0 images processed; no error thrown.

**Prevention:** Either enforce a flat folder structure in the client brief (document this as a constraint), or implement recursive folder traversal using `mimeType = 'application/vnd.google-apps.folder'` queries and iterate each subfolder. The flat-folder constraint is simpler and should be the v1 choice.

**Phase to handle:** Define the folder convention before delivering the client onboarding guide.

---

### HIGH — Brazilian Portuguese filenames with accents cause encoding errors

**What goes wrong:** Filenames like `Relatório_Janeiro_Março.csv` or `capturas de tela ifood.png` are returned correctly by the Drive API (Drive stores filenames as UTF-8), but downstream n8n nodes or the Anthropic request builder may double-encode or corrupt the filename string when constructing request bodies. The file content itself is unaffected — the download works — but logging and debugging become difficult.

**Warning sign:** n8n execution log shows garbled filename strings; no functional failure but traceability breaks.

**Prevention:** Never use filenames for routing logic. Use Drive file IDs exclusively (the `id` field from the list response) for all download and reference operations. Treat filenames as display-only metadata.

**Phase to handle:** File ingestion node design, before first test run.

---

### MEDIUM — Too many files in folder (>20 screenshots) causes token overload

**What goes wrong:** Sending 25 PNG screenshots as base64 in a single Claude API request can easily exceed 100K tokens, causing the request to fail or be extremely slow. At 6–20 analyses per week this is a real scenario.

**Warning sign:** Claude API returns `prompt too long` or the n8n HTTP node times out before receiving a response.

**Prevention:** Cap the number of images sent per API call at 10–12. If the folder has more, either batch into multiple calls and merge JSON results, or instruct the client to keep folders under 15 files. For v1 with 6–20 analyses per week, a hard cap of 15 files with a user-facing warning is sufficient.

**Phase to handle:** Before the Claude API call node is built; enforce in the "list files" step.

---

## Claude API Issues

### CRITICAL — Response truncated because max_tokens is too low

**What goes wrong:** The analysis returns 8 structured blocks plus a top-5 list. If `max_tokens` is set to 1024 or 2048 (common defaults), the JSON will be cut off mid-object. The JSON parser then throws, n8n marks the execution as failed, and the Supabase row never gets updated — leaving the frontend polling indefinitely.

**Warning sign:** `stop_reason` in the API response is `max_tokens` instead of `end_turn`. JSON parse error immediately after the Claude node.

**Prevention:** Set `max_tokens` to at least 4096 for this use case. 8096 is safer. Monitor `stop_reason` in every execution — if it is ever `max_tokens`, increase the value. Claude Sonnet's output ceiling is 8192 tokens on current API versions; do not exceed that limit.

**Phase to handle:** Claude API call node configuration, day one.

---

### CRITICAL — Claude returns valid text but invalid JSON

**What goes wrong:** Despite a prompt saying "return only JSON", Claude may prepend text like "Here is the analysis:" or wrap the JSON in markdown code fences (` ```json ... ``` `). The downstream JSON parse node fails. This is especially common when the prompt is ambiguous or when the model is slightly overloaded.

**Warning sign:** JSON parse node throws `Unexpected token H` or similar; the raw response starts with text characters, not `{`.

**Prevention (three layers):**
1. In the system prompt, include: "Respond ONLY with valid JSON. No explanations, no markdown, no code fences. Start your response with `{` and end with `}`."
2. Use Anthropic's structured output / tool-use mode: define the expected schema as a tool and force the model to call it. This is the most reliable method — the API constrains token generation to valid JSON matching the schema.
3. In n8n, add a Code node after the Claude response that strips any leading/trailing non-JSON characters before parsing: `text.replace(/^[^{]*/, '').replace(/[^}]*$/, '')`.

**Phase to handle:** Claude API node setup; use tool-use mode from day one rather than retrofitting later.

---

### HIGH — 529 Overloaded error (not a rate limit)

**What goes wrong:** HTTP 529 `overloaded_error` means Anthropic's capacity pool for the requested model is exhausted. This is different from a 429 rate limit. n8n's default HTTP Request node does not retry on 529 — it marks the execution as failed immediately.

**Warning sign:** n8n execution fails with status 529; happens during peak hours (typically 14:00–18:00 UTC).

**Prevention:**
- Add an n8n Error Trigger workflow that catches failed executions and re-queues them after 30–60 seconds with exponential backoff.
- In the HTTP Request node, enable "Retry on fail" with 3 attempts and 10-second intervals.
- If 529 persists beyond 90 seconds, fall back to `claude-haiku-4-*` for a degraded but functional result, or set the analysis status to `queued_retry` and notify the user.

**Phase to handle:** Error handling design; implement before go-live.

---

### HIGH — Image size exceeds 5MB after base64 encoding

**What goes wrong:** iFood screenshots are typically under 1MB, but if a client sends actual photo images or uncompressed exports, a single image can exceed 5MB post-base64 encoding (base64 adds ~33% overhead). The Anthropic API returns a hard error for images over 5MB.

**Warning sign:** API error `image exceeds 5 MB maximum size limit`; execution fails on the first oversized image.

**Prevention:** Add a validation step in n8n after downloading each file: check `file size * 1.34 > 5MB`. If so, either reject the file with a logged warning or compress it via a Code node using Sharp (if running in a custom n8n Docker image) or reject and notify the user which files were skipped. Also enforce a maximum of 8000px on any image dimension — another hard API limit.

**Phase to handle:** File ingestion validation step, before the Claude API call.

---

### MEDIUM — Multiple images inflate token usage unpredictably

**What goes wrong:** Each image sent to Claude costs tokens based on its dimensions, not its file size. A 1920x1080 screenshot costs roughly 1,600 tokens. Sending 15 screenshots consumes 24,000 tokens in vision input alone before any text is generated. Combined with a detailed system prompt and the 8-block JSON output, a single analysis can approach 40,000 tokens, which affects latency and cost.

**Warning sign:** Analysis latency exceeds 45 seconds consistently; Claude API costs are higher than projected.

**Prevention:** Resize images to 1280px width before sending. This cuts per-image token cost by ~50% with no meaningful loss of text readability for screenshots. Add an image resize step in n8n using a Code node or HTTP call to an image optimization service.

**Phase to handle:** Image processing pipeline, optimization pass after v1 works.

---

## n8n Execution Issues

### CRITICAL — Webhook returns timeout because workflow takes >60s

**What goes wrong:** When the React frontend triggers the n8n webhook and waits for a synchronous response, the HTTP connection times out after 60 seconds (default for most reverse proxies including nginx). The analysis workflow takes 30–90 seconds depending on image count and API latency. The frontend receives a network error even though the workflow may still be running.

**Warning sign:** React receives a 504 or connection reset error after exactly 60 seconds; n8n execution log shows the workflow completed successfully after the timeout.

**Prevention:** Configure the n8n Webhook node to use **"Immediately"** response mode — it responds HTTP 200 at once and processes asynchronously. The frontend must then poll Supabase for status rather than waiting on the webhook response. This is also why the 3-second Supabase polling architecture is the correct pattern here. Do not use synchronous webhook response mode for any operation that may exceed 15 seconds.

**Phase to handle:** Webhook node configuration, before any frontend integration.

---

### HIGH — n8n crashes mid-execution leaving analysis in "processing" forever

**What goes wrong:** If the VPS runs out of memory, is restarted, or Docker is updated during an execution, the Supabase row for that analysis stays in `status = 'processing'`. The frontend polls indefinitely. The user sees a spinner forever.

**Warning sign:** Analysis rows stuck in `processing` status for more than 5 minutes; VPS memory usage was at >90%.

**Prevention:**
1. Implement a stale-analysis cleanup: a Supabase cron job (pg_cron) or a scheduled n8n workflow that runs every 10 minutes and sets `status = 'error'` for any row stuck in `processing` for more than 5 minutes.
2. The frontend polling logic must handle the `error` status and show a retry button, not just an infinite spinner.

**Phase to handle:** Supabase schema design (add `updated_at` timestamp) and frontend error handling, before go-live.

---

### HIGH — Same client triggers analysis twice before first one finishes (race condition)

**What goes wrong:** The user clicks "Analisar" twice, or the frontend retries on a false timeout. Two n8n executions run simultaneously for the same client/folder. Both write to Supabase, creating duplicate analysis rows or overwriting each other's results. Two WhatsApp messages are sent.

**Warning sign:** Client reports receiving two WhatsApp messages; duplicate rows in the analyses table.

**Prevention:**
1. In the React frontend: disable the trigger button immediately on first click and show a loading state. Re-enable only on success or error.
2. In n8n: at the very first step, check Supabase for a row with `status = 'processing'` for this client. If one exists, exit the workflow immediately (use an IF node to branch to a no-op).
3. Set `n8n.executions.concurrency` to limit concurrent executions of this specific workflow, or use n8n's built-in concurrency control (available in self-hosted via `EXECUTIONS_DATA_PRUNE_MAX_COUNT`).

**Phase to handle:** Frontend UX and n8n workflow guard clause, before any user testing.

---

### MEDIUM — n8n environment variable for timeout not taking effect in Docker

**What goes wrong:** You set `EXECUTIONS_TIMEOUT=300` in the Docker Compose env file but n8n still kills executions at 60 seconds. This is a documented issue: the environment variable must be set in the correct service block and the container must be fully restarted (not just reloaded).

**Warning sign:** Executions still time out at 60 seconds after changing env vars.

**Prevention:** After changing any n8n env var: `docker compose down && docker compose up -d`. Verify with `docker exec n8n printenv EXECUTIONS_TIMEOUT`. Also set `EXECUTIONS_TIMEOUT_MAX` alongside `EXECUTIONS_TIMEOUT` — both must be present for the per-workflow override to work.

**Phase to handle:** Infrastructure setup, before first long-running test.

---

## Supabase Storage Issues

### HIGH — Large HTML/JSON report stored in a TEXT column causes Realtime payload limits

**What goes wrong:** Supabase Realtime broadcasts row changes to subscribers. The Realtime channel has a **2MB payload limit per broadcast**. If the analysis result JSON (8 blocks + priorities + raw data) exceeds 2MB in the `result` column, the Realtime event is silently dropped. The frontend's subscription never fires; polling fallback also suffers because a single row read of a 2MB+ text column is slow over the REST API.

**Warning sign:** Frontend subscription fires for small analyses but not for large ones; no error in browser console.

**Prevention:**
- Store the structured analysis JSON in a JSONB column (not TEXT) — PostgreSQL compresses JSONB on disk.
- Split storage: save the summary (top 5 priorities + metadata) in the main `analyses` table, and save the full report in Supabase Storage as a JSON file. The main row stays small; the frontend fetches the full report on demand.
- Hard limit: keep the `analyses` table row under 500KB. For this use case (8 structured blocks), well-structured JSON should be 10–50KB — only a problem if you embed raw image data or uncompressed text dumps in the result.

**Phase to handle:** Schema design, before writing the first n8n save step.

---

### MEDIUM — n8n Supabase node silently uses anon key instead of service_role key

**What goes wrong:** n8n's built-in Supabase node requires credentials. A common mistake is entering the `anon` (public) key instead of the `service_role` key. With anon key + RLS enabled, inserts and reads work only where RLS policies explicitly allow them. When n8n tries to write an analysis result without a valid user JWT in context, RLS blocks the insert silently — the node returns success (HTTP 201) but the row is never actually written because of a trigger or policy mismatch.

**Warning sign:** n8n shows the Supabase node as green (success) but the row does not appear in the table; checking Supabase logs shows RLS policy violations.

**Prevention:** Always use the `service_role` key in n8n server-side workflows. The service_role key bypasses RLS entirely. Verify by checking Supabase Dashboard → Settings → API → "Service role key" and confirming it starts with `eyJ...` and is different from the anon key. In n8n credentials, the field label is "Service Role Secret".

**Phase to handle:** n8n Supabase credential setup, day one. Verify with a test insert before building the full workflow.

---

### MEDIUM — Aggressive 3-second polling creates excessive Supabase read load

**What goes wrong:** 3-second polling is acceptable for 1–2 simultaneous users. At 10 concurrent analyses (possible if the team runs batches), that is 200+ reads per minute against the analyses table. With RLS enabled on the anon key path (frontend), each read is more expensive than a direct query. Supabase Free tier allows 500MB database size and has connection limits; Supabase Pro handles this comfortably but wastefully.

**Warning sign:** Supabase Dashboard shows unusual read spikes during batch analysis periods; database connection pool approaching limit.

**Prevention:** Switch from polling to Supabase Realtime subscriptions for the frontend. Subscribe to `analyses:id=eq.{analysisId}` — the frontend gets notified within milliseconds of the status change, with zero polling overhead. Keep polling as a fallback only (e.g., if the WebSocket connection drops after 30 seconds of no update, poll once to verify). Supabase Realtime handles this use case natively.

**Phase to handle:** Frontend implementation. Migrate from polling to Realtime in v1 if possible; polling is acceptable as a starting point.

---

## WhatsApp Delivery Issues

### HIGH — Evolution API instance is disconnected (QR code expired)

**What goes wrong:** The Evolution API WhatsApp instance requires periodic QR re-scanning. If the phone's internet drops, WhatsApp logs out, or the VPS restarts Docker containers without persistent session storage, the instance disconnects. n8n calls the Evolution API send endpoint and receives a 400 or 401 response. The analysis is saved to Supabase correctly, but the WhatsApp notification is never sent.

**Warning sign:** Evolution API returns `instance not connected` or `401 Unauthorized`; WhatsApp messages stop arriving for all clients.

**Prevention:**
1. Implement a health-check n8n workflow that calls `GET /instance/connectionState/{instanceName}` every 5 minutes. If state is not `open`, send an alert to the team's internal chat or email.
2. Store session data in a persistent Docker volume so reconnection survives container restarts.
3. In the analysis workflow, treat WhatsApp send failure as non-fatal: save the analysis to Supabase successfully, then attempt WhatsApp. If WhatsApp fails, set a flag `whatsapp_sent = false` in the row so the team can resend manually.
4. Avoid triggering WhatsApp account bans: do not send more than 20 messages/hour from a single non-Business API number. At 6–20 analyses/week this is not a risk, but document the limit.

**Phase to handle:** Evolution API integration design; health-check cron before go-live.

---

### MEDIUM — Store owner's number is not on WhatsApp

**What goes wrong:** The workflow sends to the phone number stored in the client record. If the number is landline, a VOIP number, or the owner has WhatsApp on a different number, the Evolution API returns success (message queued) but the delivery never happens, or worse, reaches the wrong person.

**Warning sign:** Client reports not receiving the WhatsApp; Evolution API shows the message as "sent" but not "delivered".

**Prevention:** Add a phone number validation step before sending. In the client registration form, require WhatsApp number confirmation (have the client send a message first, establishing them as a known contact). Store a `whatsapp_validated` boolean in the client record. Only send via WhatsApp to validated numbers; fall back to showing the result only in the platform UI for unvalidated numbers.

**Phase to handle:** Client onboarding/CRM module, before WhatsApp integration is used in production.

---

### LOW — WhatsApp message too long

**What goes wrong:** If the n8n workflow sends the full analysis report as a WhatsApp text message, it will exceed readable limits. WhatsApp supports up to 65,536 characters technically, but messages over ~500 characters are unpleasant on mobile. Messages over 4,096 characters via WhatsApp Business API session messages are truncated by some providers.

**Warning sign:** Message appears cut off on the recipient's phone.

**Prevention:** The WhatsApp message should be a short notification only — maximum 3–5 lines: client name, analysis date, top priority, and a link to view the full report in the platform. Keep it under 300 characters. Never send the full JSON or HTML report via WhatsApp.

**Phase to handle:** n8n message template design.

---

## UX Pitfalls

### CRITICAL — No progress feedback during 30–90 second wait

**What goes wrong:** The user clicks "Analisar", sees nothing happen for 60 seconds, concludes the system is broken, clicks again (triggering a duplicate — see race condition above), or abandons the session.

**Warning sign:** High duplicate analysis rate in the database; user feedback saying "the button didn't work".

**Prevention:** Immediately after the webhook fires, update the Supabase row to `status = 'processing'` and show the frontend a progress indicator with estimated time ("Analisando suas imagens... isso leva cerca de 45 segundos"). Use a step-based progress display if you can broadcast sub-steps from n8n (e.g., "Lendo arquivos", "Enviando para IA", "Salvando resultado"). At minimum, show a spinning indicator with elapsed time.

**Phase to handle:** Frontend UX, before any user testing.

---

### CRITICAL — Analysis fails silently with no error shown to user

**What goes wrong:** n8n fails (Claude API 529, Drive permission error, image too large). The Supabase row status stays in `processing` or is set to `error` but the frontend only checks for `done` — it never handles the `error` state. The user sees an infinite spinner.

**Warning sign:** Support requests: "ficou carregando para sempre".

**Prevention:**
1. The frontend polling/subscription must handle three states explicitly: `processing` (show spinner), `done` (show result), `error` (show error message + retry button).
2. The n8n workflow must always update the Supabase row status — even on failure, via an Error Trigger or a final catch branch that sets `status = 'error'` and writes a human-readable `error_message`.
3. Never leave a row in `processing` without a timeout fallback (see stale-analysis cleanup above).

**Phase to handle:** Both n8n error handling and frontend state management, before first user test.

---

### HIGH — Report looks broken on mobile

**What goes wrong:** The 8-block JSON analysis is rendered as a table or multi-column layout on desktop. On mobile (< 768px), tables overflow, columns collapse, and numbers become unreadable. Brazilian small business owners predominantly use WhatsApp on mobile — they will open the report link on their phone.

**Warning sign:** User screenshot showing broken layout; Yasmin's responsive testing missed analysis-specific components.

**Prevention:** Design the analysis report component mobile-first. Use a card-per-block layout (single column on mobile, two columns on tablet). Each of the 8 analysis blocks should be a collapsible card. Priority list should be a numbered vertical list, not a horizontal grid. Test on 375px width (iPhone SE) as the minimum baseline.

**Phase to handle:** Report UI component design, week 1 of frontend work.

---

### MEDIUM — No way to re-trigger a failed analysis

**What goes wrong:** The analysis fails. The user sees an error message. There is no "Tentar novamente" button. The user has to contact support or navigate away and lose context.

**Warning sign:** Repeated manual support requests to re-run analyses.

**Prevention:** Add a "Tentar novamente" button on the error state that calls the same webhook with the same Drive link. The n8n workflow should check if a `processing` row already exists for this client+folder+date combination and reuse the row ID (updating status back to `processing`) rather than creating a new row. This prevents orphaned rows accumulating.

**Phase to handle:** Frontend error state design + n8n idempotency logic.

---

### LOW — Polling connection not cleaned up on component unmount

**What goes wrong:** The React component starts a `setInterval` or Supabase subscription on mount. If the user navigates away before the analysis completes, the interval/subscription is not cleared. Memory leak accumulates over a session; multiple subscriptions may fire callbacks on unmounted components, causing React "setState on unmounted component" warnings or double-processing of results.

**Warning sign:** Browser memory usage grows over a session; console warnings about unmounted component state updates.

**Prevention:** Always return a cleanup function from `useEffect` that calls `clearInterval` or `supabase.removeChannel()`. If using Supabase Realtime, store the channel reference and call `.unsubscribe()` on cleanup.

**Phase to handle:** Frontend implementation, standard React hygiene.

---

## Priority Risk Matrix

| Risk | Severity | Probability | Priority |
|------|----------|-------------|----------|
| Claude returns invalid/truncated JSON (max_tokens too low) | CRITICAL | HIGH | 1 |
| Webhook sync timeout causes false failure + duplicate triggers | CRITICAL | HIGH | 2 |
| No error state in frontend (infinite spinner on failure) | CRITICAL | HIGH | 3 |
| Service account not granted Drive folder access | CRITICAL | MEDIUM | 4 |
| Analysis stuck in "processing" after n8n crash | HIGH | MEDIUM | 5 |
| Claude API 529 overloaded with no retry | HIGH | MEDIUM | 6 |
| Evolution API instance disconnected silently | HIGH | MEDIUM | 7 |
| Race condition: duplicate analyses triggered | HIGH | MEDIUM | 8 |
| No progress feedback (user re-clicks, duplicates) | HIGH | HIGH | 9 |
| Files in subfolders return empty list silently | HIGH | LOW | 10 |
| n8n uses anon key instead of service_role (silent RLS block) | MEDIUM | MEDIUM | 11 |
| Image >5MB hard API error | MEDIUM | LOW | 12 |
| Report broken on mobile | MEDIUM | HIGH | 13 |
| Supabase Realtime payload >2MB silently dropped | MEDIUM | LOW | 14 |
| WhatsApp message too long | LOW | LOW | 15 |
| Store owner number not on WhatsApp | LOW | MEDIUM | 16 |

### Immediate actions before first workflow test

1. Set Webhook node to "Immediately" response mode.
2. Set `max_tokens` to 8096; check `stop_reason` in every response.
3. Use Claude tool-use/structured output mode for JSON — do not rely on prompt alone.
4. Use service_role key in n8n Supabase credentials; verify with a test insert.
5. Share the Drive folder explicitly with the service account email.
6. Add stale-analysis cleanup job (pg_cron or scheduled n8n workflow).
7. Build frontend error state before demoing to any user.

---

## Sources

- [Anthropic Structured Outputs Docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [n8n Webhook Timeout Configuration](https://docs.n8n.io/hosting/configuration/configuration-examples/execution-timeout/)
- [n8n Concurrency Control](https://docs.n8n.io/hosting/scaling/concurrency-control/)
- [Supabase RLS + Service Role Key Troubleshooting](https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z)
- [n8n Supabase Node Common Issues](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.supabase/common-issues/)
- [Supabase Realtime Limits](https://supabase.com/docs/guides/realtime/limits)
- [Google Drive API — Manage Sharing](https://developers.google.com/drive/api/guides/manage-sharing)
- [Claude 529 Overload Handling — Production Guide](https://dev.to/kevinzy189/claude-status-why-your-claude-api-keeps-returning-529-overloadederror-a-production-debugging-61i)
- [Evolution API — WhatsApp disconnect issues](https://github.com/EvolutionAPI/evolution-api/issues/718)
- [Anthropic API Image Size Limit (5MB)](https://github.com/anthropics/claude-code/issues/11564)
- [n8n Queue Mode Duplicate Execution](https://flowgenius.in/n8n-queue-mode-duplicate-execution/)
