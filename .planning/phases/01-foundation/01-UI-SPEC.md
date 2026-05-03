---
phase: 1
slug: foundation
status: draft
shadcn_initialized: false
preset: none
created: 2026-05-01
---

# Phase 1 — UI Design Contract: Foundation

> Scope: "Análise iFood" screen with trigger form, idle/processing/error states.
> Phase 2 (spinner with step indicators) and Phase 3 (report rendering) are explicitly
> out of scope for this contract — they will receive their own UI-SPEC files.

---

## Design System

**Source of truth:** `src/index.css` (CSS custom properties) + existing screen patterns.
No shadcn, no Tailwind, no CSS modules. All styling via global utility classes and inline
`style` props. This screen follows the identical pattern.

### Existing Utility Classes Used

| Class | Purpose |
|-------|---------|
| `route-enter` | Entry animation (`slideUp 400ms`) — apply to root div |
| `page-container` | Outer padding container — use `style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}` |
| `card` | Surface: `background: var(--white)`, `border: 1px solid var(--g-200)`, `border-radius: var(--r-md)`, `box-shadow: var(--sh-card)` |
| `page-h1` | Screen title: 28px, weight 700, `color: var(--black)`, `letter-spacing: -0.5px`, `line-height: 1.2` |
| `page-sub` | Subtitle: 14px, `color: var(--g-500)`, `margin-top: 4px` |
| `label` | Field label: 11px, weight 600, uppercase, `letter-spacing: 0.5px`, `color: var(--g-500)` |
| `input` | Text input: 10px 14px padding, `border: 1px solid var(--g-300)`, `border-radius: var(--r-sm)`, focus ring `0 0 0 3px rgba(183,12,0,0.15)` |
| `btn-primary` | Submit CTA: `background: var(--red)`, white text, 10px 20px padding, weight 600, 14px |
| `btn-secondary` | Secondary action: `background: var(--white)`, `border: 1px solid var(--g-300)`, weight 600 |
| `badge-yellow` | Warning badge: `background: var(--warn-soft)`, `color: #92400E` |
| `badge-red` | Error badge: `background: var(--red-soft)`, `color: var(--red)` |
| `badge-green` | Success/ok badge: `background: var(--success-soft)`, `color: #047857` |
| `badge-gray` | Neutral badge: `background: var(--g-100)`, `color: var(--g-700)` |
| `header-wrap` | Flex row for page header — `display: flex`, `justifyContent: space-between`, `alignItems: flex-end`, `marginBottom: 24` |
| `fade-in` | Opacity 0→1, 300ms |
| `slide-up` | Opacity+Y 0→1, 400ms |

---

## Screen Layout

### Sidebar Registration

**Add to `src/components/Sidebar.jsx`** — insert after the `cora` entry in `NAV_ITEMS`:

```js
{ id: 'analise-ifood', icon: 'chart', label: 'Análise iFood' },
```

The `icon: 'chart'` reuses the existing chart icon already in the icon set (also used by
`ReportsScreen`). The route string `'analise-ifood'` is the value passed to `setRoute`.

**No badge count** for this item — analyses do not produce unread counts in Phase 1.

### App.jsx Wiring

Add to `src/App.jsx` screen rendering block:

```jsx
{route === 'analise-ifood' && (
  <AnaliseiFoodScreen tenant={tenant} tenantDbId={tenantDbId} />
)}
```

### Main Content Area

The screen occupies the `.main` grid area (right of sidebar, below topbar).
No split panels. Single scrollable column.

```
┌─ .main (overflow: auto) ────────────────────────────────┐
│  .route-enter .page-container (padding 32, maxWidth 960) │
│  ┌── Header ──────────────────────────────────────────┐  │
│  │  iFood icon + h1 + page-sub                        │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌── Trigger Form (.card, padding 28) ───────────────┐  │
│  │  Client selector (full width)                      │  │
│  │  Drive link input (full width)                     │  │
│  │  Period selector (3 toggle buttons)                │  │
│  │  "Iniciar Análise" button (full width, marginTop)  │  │
│  └───────────────────────────────────────────────────┘  │
│  [Processing state replaces form card when active]       │
│  [Error state renders below form when active]            │
└──────────────────────────────────────────────────────────┘
```

**maxWidth 960px** — narrower than Dashboard's 1400px because this is a focused action
screen, not a data-dense dashboard. Centered with `margin: '0 auto'`.

---

## Component Specs

### Screen Header

```jsx
<div className="header-wrap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
    {/* iFood brand color icon — inline SVG or emoji fallback */}
    <div style={{
      width: 48, height: 48, borderRadius: 'var(--r-md)',
      background: 'linear-gradient(135deg, #EA1D2C, #C4111F)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontSize: 22, flexShrink: 0
    }}>🍔</div>
    <div>
      <h1 className="page-h1">Análise iFood</h1>
      <p className="page-sub">Selecione um cliente e inicie a análise de desempenho</p>
    </div>
  </div>
</div>
```

**Icon treatment:** A 48×48 pill/square with iFood red gradient (`#EA1D2C → #C4111F`).
Uses emoji `🍔` as fallback until a proper iFood icon asset is added. This follows the
same pattern as `CoraScreen` which uses `<AgentAvatar id="cora" size={56} />`.

---

### Trigger Form

Card container:

```jsx
<div className="card" style={{ padding: 28 }}>
  {/* form fields stack here */}
</div>
```

#### Field 1: Seletor de Cliente

- **Type:** Native `<select>` styled to match `.input` class
- **Label:** `CLIENTE`
- **Placeholder option:** `Selecione o cliente...` with `value=""` and `disabled`
- **Options:** Loaded from `customers` table filtered by `tenantDbId`
- **Loading state:** Disabled select with `color: var(--g-400)` while fetching
- **Layout:** Full width (`width: 100%`)

```jsx
<div style={{ marginBottom: 20 }}>
  <label className="label" style={{ display: 'block', marginBottom: 6 }}>Cliente</label>
  <select
    className="input"
    value={clienteId}
    onChange={e => setClienteId(e.target.value)}
    disabled={loading || submitting}
    style={{ cursor: 'pointer' }}
  >
    <option value="" disabled>Selecione o cliente...</option>
    {clientes.map(c => (
      <option key={c.id} value={c.id}>{c.name}</option>
    ))}
  </select>
</div>
```

#### Field 2: Link do Google Drive

- **Type:** `<input type="url">` using `.input` class
- **Label:** `LINK DA PASTA NO GOOGLE DRIVE`
- **Placeholder:** `https://drive.google.com/drive/folders/...`
- **Validation:** Client-side pattern check for Drive folder URL before submit
- **Error inline:** Red helper text below field if format invalid (see Copywriting section)
- **Layout:** Full width

```jsx
<div style={{ marginBottom: 20 }}>
  <label className="label" style={{ display: 'block', marginBottom: 6 }}>Link da Pasta no Google Drive</label>
  <input
    type="url"
    className="input"
    value={driveLink}
    onChange={e => setDriveLink(e.target.value)}
    placeholder="https://drive.google.com/drive/folders/..."
    disabled={submitting}
  />
  {driveLinkError && (
    <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 4 }}>{driveLinkError}</p>
  )}
</div>
```

#### Field 3: Período da Análise

- **Type:** Three toggle buttons (not radio inputs, not a `<select>`)
- **Label:** `PERÍODO`
- **Options:** `Diária` / `Semanal` / `Mensal`
- **Default:** `Semanal` (pre-selected on mount)
- **Active style:** `background: var(--red)`, `color: white`, `border-color: var(--red)`
- **Inactive style:** `background: var(--white)`, `color: var(--g-700)`, `border: 1px solid var(--g-300)`
- **Layout:** Three equal-width buttons in a flex row, gap 8px

```jsx
<div style={{ marginBottom: 28 }}>
  <label className="label" style={{ display: 'block', marginBottom: 8 }}>Período</label>
  <div style={{ display: 'flex', gap: 8 }}>
    {['diaria', 'semanal', 'mensal'].map(p => (
      <button
        key={p}
        onClick={() => setPeriodo(p)}
        disabled={submitting}
        style={{
          flex: 1,
          padding: '10px 0',
          borderRadius: 'var(--r-sm)',
          border: `1px solid ${periodo === p ? 'var(--red)' : 'var(--g-300)'}`,
          background: periodo === p ? 'var(--red)' : 'var(--white)',
          color: periodo === p ? 'white' : 'var(--g-700)',
          fontWeight: 600,
          fontSize: 14,
          transition: 'all 150ms var(--ease-out)',
          cursor: submitting ? 'not-allowed' : 'pointer',
          opacity: submitting ? 0.6 : 1,
        }}
      >
        {{ diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal' }[p]}
      </button>
    ))}
  </div>
</div>
```

#### Submit Button: "Iniciar Análise"

- **Class:** `btn-primary`
- **Width:** Full width (`width: 100%`)
- **Icon:** `<Icon name="chart" size={15} />` left of label
- **States:**

| State | Appearance |
|-------|-----------|
| Idle, form valid | `background: var(--red)`, enabled, full opacity |
| Idle, form invalid | `opacity: 0.5`, `cursor: not-allowed`, `pointer-events: none` |
| Submitting (after first click) | Disabled, `opacity: 0.7`, label becomes spinner + "Iniciando..." |
| Processing (job_id received) | Button replaced by processing card — not visible |

- **Disable trigger:** Disabled immediately on first click (`setSubmitting(true)`) — this is the
  duplicate prevention contract (TRIGGER-03). The button never re-enables once clicked while
  the current analysis is running.

```jsx
<button
  className="btn-primary"
  onClick={handleSubmit}
  disabled={submitting || !clienteId || !driveLink || !isValidDriveLink(driveLink)}
  style={{
    width: '100%',
    justifyContent: 'center',
    opacity: (submitting || !clienteId || !driveLink) ? 0.5 : 1,
    cursor: (submitting || !clienteId || !driveLink) ? 'not-allowed' : 'pointer',
  }}
>
  {submitting ? (
    <>
      <span style={{
        width: 14, height: 14,
        border: '2px solid rgba(255,255,255,0.3)',
        borderTopColor: 'white',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
        display: 'inline-block',
      }} />
      Iniciando...
    </>
  ) : (
    <><Icon name="chart" size={15} /> Iniciar Análise</>
  )}
</button>
```

---

### Processing State

**TRIGGER-04 + REPORT-01 + REPORT-02** — displayed after the INSERT returns a `job_id`
and the n8n webhook is fired. The form card is hidden; this card replaces it.

This state is in scope for Phase 1 because the button triggers it immediately. The full
Realtime subscription and step progression belong to Phase 3.

**Phase 1 processing state is simplified:** Show spinner + static "Análise em andamento..."
message. No step indicators (those are a Phase 3 contract).

```jsx
<div className="card fade-in" style={{ padding: 40, textAlign: 'center' }}>
  {/* Spinner */}
  <div style={{
    width: 48, height: 48,
    border: '4px solid var(--g-200)',
    borderTopColor: 'var(--red)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    margin: '0 auto 20px',
  }} />
  <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--g-900)', marginBottom: 8 }}>
    Análise em andamento
  </h2>
  <p style={{ fontSize: 14, color: 'var(--g-500)', maxWidth: 360, margin: '0 auto' }}>
    Isso pode levar até 2 minutos. Não feche essa aba.
  </p>
  {/* Step indicators — Phase 3 will replace this with live progress */}
  <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', maxWidth: 320, margin: '24px auto 0' }}>
    {[
      { label: 'Lendo pasta do Drive',       done: false },
      { label: 'Analisando com IA',           done: false },
      { label: 'Salvando resultados',         done: false },
    ].map((step, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 20, height: 20,
          borderRadius: '50%',
          background: step.done ? 'var(--success)' : 'var(--g-200)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          fontSize: 10, color: step.done ? 'white' : 'var(--g-400)',
        }}>
          {step.done ? '✓' : i + 1}
        </span>
        <span style={{ fontSize: 13, color: step.done ? 'var(--g-700)' : 'var(--g-400)' }}>
          {step.label}
        </span>
      </div>
    ))}
  </div>
</div>
```

**Phase 3 will replace** the static step list with live state driven by Supabase Realtime.

---

### Error State

**Displayed when:** Supabase INSERT fails, n8n webhook call fails, or (Phase 3) the Realtime
subscription reports `status = 'error'`.

Rendered as a card below the form (form remains visible for correction).

```jsx
<div className="card fade-in" style={{
  padding: 20, marginTop: 16,
  border: '1px solid var(--red-soft)',
  background: 'var(--red-soft)',
}}>
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
    <Icon name="warning" size={18} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 2 }} />
    <div style={{ flex: 1 }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--red)', marginBottom: 4 }}>
        {errorTitle}
      </p>
      <p style={{ fontSize: 13, color: 'var(--red)', opacity: 0.8 }}>
        {errorMessage}
      </p>
    </div>
    <button
      className="btn-secondary"
      onClick={handleRetry}
      style={{ flexShrink: 0, fontSize: 13 }}
    >
      Tentar novamente
    </button>
  </div>
</div>
```

"Tentar novamente" resets `submitting = false`, clears `jobId`, and lets the user submit again.
It does NOT auto-populate a new form — the existing field values are preserved.

---

## Spacing Scale

Extracted from `src/index.css` utility classes. Use only these values:

| Token | Value | Use |
|-------|-------|-----|
| 4px | `gap-1`, `margin-top: 4` | Tight label-to-field gap supplement |
| 6px | `margin-bottom: 6` | Label bottom margin |
| 8px | `gap-2`, `p-2` | Button group gap, badge padding |
| 12px | `gap-3`, `p-3` | Internal card element gap |
| 14px | `px-4` approximate | Input side padding |
| 16px | `gap-4`, `p-4` | Standard section gap |
| 20px | `p-5`, `marginBottom: 20` | Field-to-field gap inside form |
| 24px | `gap-6`, `p-6`, `marginBottom: 24` | Section-to-section gap |
| 28px | card padding | Form card internal padding |
| 32px | page-container padding | Page outer padding |
| 40px | processing card padding | Centered content padding |

**No arbitrary values.** Inline `style` uses only the values above.

---

## Typography

Extracted directly from `src/index.css`. Font: **Montserrat** (loaded from Google Fonts CDN).

| Role | Size | Weight | Color token | Class |
|------|------|--------|-------------|-------|
| Page title (h1) | 28px | 700 | `var(--black)` | `page-h1` |
| Processing title | 18px | 700 | `var(--g-900)` | inline |
| Body / field copy | 14px | 400 / 500 | `var(--g-700)` | base |
| Field labels | 11px | 600 | `var(--g-500)` | `label` |
| Helper / error text | 12–13px | 400 | `var(--red)` / `var(--g-500)` | inline |
| Badge text | 11px | 600 | semantic | `badge-*` |
| Button text | 14px | 600 | white / `var(--g-900)` | `btn-primary` / `btn-secondary` |
| Step indicator | 13px | 400 | `var(--g-400)` / `var(--g-700)` | inline |
| Subtitle (page-sub) | 14px | 400 | `var(--g-500)` | `page-sub` |

**Line heights:** 1.5 for body copy (set by `.copilot-textarea`); 1.2 for headings (set by `.page-h1`).
**No other font sizes** — these 4 sizes cover all elements in Phase 1.

---

## Color Palette

Extracted from `src/index.css` `:root` and theme overrides. The platform supports 3 themes
(light/gray/dark) via CSS variable reassignment. This screen inherits all themes automatically
by using only `var(--*)` tokens.

### Primary Surface (60%)

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `var(--g-50)` | `#F9FAFB` | `#252525` | Page background |
| `var(--white)` | `#FFFFFF` | `#2F2F2F` | Card backgrounds, inputs, dropdowns |

### Secondary Surface (30%)

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `var(--g-100)` | `#F3F4F6` | `#333333` | Hover backgrounds, inactive toggle state |
| `var(--g-200)` | `#E5E7EB` | `#3A3A3A` | Card borders, dividers |
| `var(--black-soft)` | `#1A1A1A` | `#1E1E1E` | Sidebar background |

### Accent (10%) — reserved-for list

`var(--red)` = `#B70C00` is used ONLY for:

1. Active sidebar item background
2. Submit button (`btn-primary`) background
3. Form input focus ring (`box-shadow: 0 0 0 3px rgba(183,12,0,0.15)`)
4. Active period toggle button background
5. Error state text and border tint
6. Spinner border-top color (processing state)
7. iFood header icon gradient start color (`#EA1D2C` — intentionally brighter for brand context)

**`var(--success)` = `#10B981`** — reserved for: completed step indicators, "done" status badges only.
**`var(--warn)` = `#F59E0B`** — reserved for: `badge-yellow` warning states only.

---

## Copywriting

All text in PT-BR. No emojis in form labels or error messages.

### Screen Header

| Element | Text |
|---------|------|
| Page title | `Análise iFood` |
| Subtitle | `Selecione um cliente e inicie a análise de desempenho` |

### Form Labels and Placeholders

| Element | Text |
|---------|------|
| Client field label | `Cliente` |
| Client placeholder option | `Selecione o cliente...` |
| Drive field label | `Link da Pasta no Google Drive` |
| Drive placeholder | `https://drive.google.com/drive/folders/...` |
| Period field label | `Período` |
| Period option 1 | `Diária` |
| Period option 2 | `Semanal` |
| Period option 3 | `Mensal` |
| Submit button (idle) | `Iniciar Análise` |
| Submit button (submitting) | `Iniciando...` |

### Validation Error Messages (inline, below field)

| Trigger | Message |
|---------|---------|
| Drive link not a Drive URL | `Cole um link válido do Google Drive (drive.google.com/drive/folders/...)` |
| Drive link empty on submit | `Informe o link da pasta do Google Drive` |
| Client not selected on submit | `Selecione um cliente para continuar` |

### Processing State

| Element | Text |
|---------|------|
| Processing title | `Análise em andamento` |
| Processing subtitle | `Isso pode levar até 2 minutos. Não feche essa aba.` |
| Step 1 | `Lendo pasta do Drive` |
| Step 2 | `Analisando com IA` |
| Step 3 | `Salvando resultados` |

### Error State

| Scenario | Title | Message |
|----------|-------|---------|
| Supabase INSERT failed | `Erro ao iniciar análise` | `Não foi possível salvar a análise. Tente novamente.` |
| n8n webhook call failed | `Erro ao iniciar análise` | `A análise foi registrada mas não pôde ser disparada. Tente novamente.` |
| No clients loaded | `Nenhum cliente encontrado` | `Cadastre clientes no CRM antes de iniciar uma análise.` |
| Timeout (2 min, Phase 3) | `Análise demorou demais` | `O tempo de espera foi excedido. Verifique o link do Drive e tente novamente.` |

### Retry Button

| Element | Text |
|---------|------|
| Retry CTA | `Tentar novamente` |

---

## Interaction Contract

### Validation Rules (client-side, before submit)

| Field | Rule | Fires |
|-------|------|-------|
| Cliente | Must have a non-empty `value` (UUID) | On submit attempt |
| Drive link | Must match regex `/drive\.google\.com\/drive\/folders\//` | On submit attempt AND on blur |
| Período | Always has a value (default `semanal`) — no validation needed | — |

Validation is **not** shown while the user is typing — only on blur (Drive link) or on submit attempt.
This matches existing platform pattern (no live validation in any existing screen).

### Button State Machine

```
IDLE (form incomplete)
  → button: disabled, opacity 0.5, cursor not-allowed

IDLE (form complete)
  → button: enabled, opacity 1.0

[user clicks]
  → SUBMITTING: button disabled, label "Iniciando...", spinner inline
  → INSERT analises row in Supabase (status: pending)
  → POST webhook to n8n

[INSERT success + webhook dispatched]
  → PROCESSING: form card hidden, processing card shown
  → button not visible

[INSERT or webhook error]
  → ERROR: submitting = false, button re-enabled, error card shown below form
  → button re-enables so user can retry
```

The button **re-enables on error** (unlike the processing path where it stays hidden).
The button **stays disabled for the duration** of a successful submission — no re-enable
until the user explicitly clicks "Tentar novamente".

### Async Behavior

- INSERT to Supabase is `await`ed — button disables before the call
- n8n webhook is fire-and-forget (no await on response content — only confirm `200 OK`)
- If webhook returns non-200, show error state but the Supabase row already exists with `status = pending`
- No optimistic UI — state only advances on confirmed Supabase response

### Client List Loading

```
onMount:
  setLoadingClientes(true)
  clientes = await listClients(tenantDbId)   // src/lib/api.js — new function
  setClientes(clientes)
  setLoadingClientes(false)

While loading:
  <select disabled> with single option "Carregando clientes..."
  submit button disabled (form incomplete)
```

### Mobile Behavior

The form is a single-column vertical stack — no layout changes needed for mobile.
The `.page-container` padding reduces to 16px on mobile via `.page-container` + `@media (max-width: 767px)`.
Period toggle buttons stack is 3 equal columns — at very narrow widths (<320px) they wrap
naturally; no special handling needed.

---

## Accessibility Notes

### Contrast Ratios (verified against extracted tokens)

| Foreground | Background | Ratio | Use |
|-----------|-----------|-------|-----|
| `var(--g-900)` `#111827` | `var(--white)` `#FFFFFF` | 16:1 | Input text — passes AAA |
| `var(--g-500)` `#6B7280` | `var(--white)` `#FFFFFF` | 4.6:1 | Label text — passes AA |
| `white` `#FFFFFF` | `var(--red)` `#B70C00` | 7.1:1 | Button text — passes AAA |
| `var(--red)` `#B70C00` | `var(--white)` `#FFFFFF` | 7.1:1 | Error text on white — passes AAA |
| `#92400E` | `var(--warn-soft)` `#FEF3C7` | 5.8:1 | Warning badge — passes AA |
| `#047857` | `var(--success-soft)` `#D1FAE5` | 5.1:1 | Success badge — passes AA |
| `white` `#FFFFFF` | `var(--g-400)` `#9CA3AF` | 2.4:1 | Inactive step number — fails AA |

**Action on failed contrast:** Inactive step numbers use `var(--g-400)` text on `var(--g-200)` background.
Override to use `var(--g-600)` text on `var(--g-200)` background for step circle numbers: ratio becomes 3.9:1
(AA for large text / non-essential decorative — acceptable for numbered circles).

### Focus States

All interactive elements receive visible focus:

- `.input:focus` — border-color `var(--red)`, box-shadow `0 0 0 3px rgba(183,12,0,0.15)` — already defined in CSS
- `button:focus-visible` — add `outline: 2px solid var(--red); outline-offset: 2px` to any button without the class
- `select:focus` — same as `.input:focus` (apply `.input` class to the select element)
- Period toggle buttons — use `button:focus-visible` ring

**No `:focus` suppression** — do not add `outline: none` without a replacement ring.

### Semantic HTML

- Wrap the form in `<form onSubmit={handleSubmit}>` (not just `<div>`)
- Use `<label>` with `htmlFor` pointing to each input `id` — do NOT use the `.label` class on a `<div>`
- The period toggle group: wrap in `<fieldset>` with `<legend className="label">Período</legend>`
- `aria-busy="true"` on the form card while `submitting === true`
- `aria-live="polite"` on the error message container so screen readers announce errors

### Keyboard Navigation

- Tab order: Client selector → Drive link → Period buttons (3 stops) → Submit button
- Period toggle: `Space` or `Enter` activates the focused period button
- Submit: `Enter` in any text field triggers form submit (standard `<form>` behavior)
- Retry button: reachable by Tab when error state is visible

---

## File Conventions

Following `src/screens/CoraScreen.jsx` and `src/screens/DashboardScreen.jsx` patterns:

- **Filename:** `src/screens/AnaliseiFoodScreen.jsx`
- **Export:** `export default function AnaliseiFoodScreen({ tenant, tenantDbId }) { ... }`
- **Imports order:** React hooks → local components → lib/api → data
- **State declaration order:** `useState` → `useRef` → `useEffect` → handlers → JSX
- **Comments:** PT-BR section separators (`// ── Nome da seção ──────────────────────────`)
- **Task references:** `// TRIGGER-01 — Tela Análise iFood no menu lateral`
- **New api.js functions:** `listClientes(tenantDbId)`, `createAnalise(payload)` — named exports,
  throw on error (following `api.js` pattern, not `db.js`)

---

## Out of Scope for Phase 1 UI

These elements belong to later phases and must NOT be built now:

- Live step indicators driven by Realtime subscription (Phase 3)
- HTML report rendering (Phase 3)
- Health badge (saudavel/atencao/critico) (Phase 3)
- Top-5 priority cards (Phase 3)
- WhatsApp send button and preview (Phase 3)
- Analysis history list (Phase 3)
- 2-minute timeout error handling (Phase 3 — Realtime subscription)
- Notification bell update when analysis completes (Phase 3)
