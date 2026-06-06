# PLANO-MESTRE — Tracker de Sessões

> Fonte de verdade para handoff entre sessões.
> **Antes de trabalhar → leia este arquivo.**
> **Ao terminar → atualize as seções abaixo.**

---

## 🔴 Onde parou

_Última sessão: 2026-06-06_

- **T3 iniciada:** mapa de telas v0 (console interno, 32 telas, shortlist de 14 do MVP) entrou no repo + Obsidian em `WikiBrain/wiki/T3 — Mapa de Telas (Console Interno).md` — aguardando Wandson revisar/marcar antes de virar código
- Criou `PLANO-MESTRE.md` na raiz (fusão mapa-vivo + EvoNexus-replica)
- Mergeu PR #154 em `main`
- Hermes 3A fechado (kimi-k2.6 via Ollama Cloud, Docker na VPS)
- FASE 1 lado CD: aprovada para executar, ainda não rodada

---

## 👉 Próxima ação

1. **T2 / FASE 1 lado CD** — rodar Passos 1–4 com output bruto colado no doc. Branch: `wandson/evonexus-fase1-mapeamento`.
2. **T3 / Mapa de telas** — Wandson revisa/marca o mapa v0 no Obsidian; quando estiver com a cara dele → **T3(b)** = protótipo clicável em React das 14 telas do MVP (dados fake, navegável, antes de banco/código).
3. **T2 / FASE 0** — sessão VPS (`187.127.25.24`), inventário em `/root/cd-evonexus-lab`.

---

## 📊 Status por track

| Track | Nome | Status | Última ação |
|-------|------|--------|-------------|
| T1 | Plataforma CD (V1→V3) | 🔄 ~95% | 1A–1G concluídas; DELI Realtime pendente |
| T2 | EvoNexus-replica | 🔒 FASE 0 bloqueada | CHECKPOINT 0 ✅; FASE 1 lado CD aprovada |
| T3 | Visual-First / telas | 🔄 v0 em revisão | Mapa de telas v0 no Obsidian; aguarda revisão → T3(b) protótipo |
| T4 | Hermes (copiloto CEO) | 🔄 3A ✅ / 3B bloqueado | kimi-k2.6 rodando; 3B aguarda GATE 0 |
| T5 | Segurança / GATE 0 | ⏳ rotação adiada | fail2ban + SSH key-only ✅ |
| T6 | Agentes IA | 🔄 BomDia/Encerramento/chat ✅ | DELI em andamento; LARA/SOFIA pendentes |
| T7 | Feature PILOTO | 🔄 Ondas 01+02 merged | Onda 03 migration rascunhada, não aplicada |
| T8 | Infra / CI-CD | ⚠️ 2 riscos ativos | CI/CD sobrescreve; VPS branches divergem |
| T9 | Negócio | contexto | Primeiro cliente real = PRIORIDADE |

---

## 📋 Log de sessões

### 2026-06-06
- Criou `PLANO-MESTRE.md` raiz (fusão PLANO-MESTRE.md + mapa-vivo.md)
- PR #154 → merged em main
- Hermes 3A fechado com evidência (kimi-k2.6 ✅, Docker ✅, Telegram ✅)
- FASE 1 lado CD aprovada para executar
- **T3 v0:** mapa de telas (console interno) movido de Downloads → `WikiBrain/wiki/T3 — Mapa de Telas (Console Interno).md` (repo + Obsidian). 32 telas inventariadas, shortlist MVP = 14. Próximo: revisão do Wandson → T3(b) protótipo clicável.

---

## 🧱 Regra de atualização (para a sessão de IA)

Ao iniciar qualquer trabalho ligado ao PLANO-MESTRE:
1. Leia este arquivo inteiro
2. Leia `PLANO-MESTRE.md` (raiz do repo) para detalhes
3. Execute o trabalho
4. Ao terminar, volte aqui e:
   - Atualize **"Onde parou"** com data e o que foi feito
   - Atualize **"Próxima ação"** com o passo concreto seguinte
   - Atualize a linha da track afetada em **"Status por track"**
   - Append uma entrada em **"Log de sessões"**
5. Atualize também o `PLANO-MESTRE.md` (marque `[x]`, ajuste status)
6. Commit ambos os arquivos no mesmo PR
