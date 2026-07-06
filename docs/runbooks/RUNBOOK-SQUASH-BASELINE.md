# RUNBOOK — Squash das Migrations em Baseline

Última revisão: 2026-07-05 | Status: aguardando aprovação do Wandson (nenhum passo aplicado em prod)

Ref: `docs/estrategia/PLANO-CONTINUIDADE-PLATAFORMA-2026-07.md` §3 B1 e §6 decisão travada 5 ·
`RESTRUCTURE.md` princípio 3 ("Migrations versionadas em Git para toda mudança de schema. Zero
alteração manual no Supabase Studio.")

Projeto Supabase: `czyanilrverorwenikqw`. Janela aprovada: **domingo, sem deploy**.

**Ordem obrigatória (decisão travada 04/07, com um refinamento técnico desta revisão):** backup
completo → snapshot → este runbook → geração do baseline (dump read-only) → arquivamento →
**validação em banco zerado ANTES de qualquer repair em prod** → **SQL/comando de metadados
aprovado pelo Wandson** → aplicar o repair → rollback documentado (já está neste mesmo PR).
A validação foi movida para antes do repair definitivo (revisão desta sessão): não faz sentido
mutar o metadado de produção (`schema_migrations`) com base numa baseline que ainda não foi
provada correta — se a validação falhar, paramos ali, sem nunca ter tocado prod além do dump.
Isso não contradiz a decisão travada (backup → snapshot → runbook → SQL aprovado → aplicar →
validação → rollback) — é uma reordenação de segurança dentro do "aplicar": primeiro provamos
que a baseline reconstrói o schema, só depois pedimos aprovação para mexer no metadado real.

---

## Inventário atual (output bruto, gerado 2026-07-05)

```
$ ls -1 supabase/migrations | wc -l
235

$ ls -1 supabase/migrations | sort | head -3
20260426_evolution_chat.sql
20260502_analises.sql
20260502_tarefas_analise.sql

$ ls -1 supabase/migrations | sort | tail -3
20260702_014_lojas_portal_ifood_nomes_corrigidos.sql
20260702_015_lojas_portal_ifood_villas_cafepao_desativacoes.sql
rollback_20260702_policies_snapshot.sql
```

234 arquivos seguem o padrão `<timestamp>_descricao.sql`. Um arquivo —
`rollback_20260702_policies_snapshot.sql` — não é uma migration real (é um snapshot de
referência de RLS gerado em 02/07, sem prefixo de timestamp válido). Ele vai junto para o
archive, mas não entra na lista de versões do `schema_migrations` (nunca foi uma migration
aplicada por esse mecanismo).

**Achado não-óbvio:** 42 prefixos de 8 dígitos (data sem hora, ex. `20260502`) se repetem em
mais de um arquivo (ex. `20260502_analises.sql` e `20260502_tarefas_analise.sql` têm o mesmo
prefixo `20260502`). Isso significa que **não dá para assumir 1:1 entre nome de arquivo local e
`version` real gravada em `supabase_migrations.schema_migrations`** — a lista de versões a
reverter (seção 5) tem que vir de uma leitura real da tabela em prod, não da lista de arquivos
locais. Está refletido no passo 5.1 abaixo.

---

## 1. Pré-requisitos (checklist go/no-go)

- [ ] **Backup completo** disparado no dashboard Supabase (Project Settings → Database →
      Backups) OU confirmação de que o PITR (Point-in-Time Recovery) cobre a janela — projeto
      `czyanilrverorwenikqw`, plano atual precisa ter PITR/backup diário ativo. Anotar o
      timestamp do backup usado como ponto de restore.
- [ ] **Snapshot manual de contagem** antes de começar — rodar contra **prod** (SQL Editor do
      dashboard ou `psql`) e guardar o resultado íntegro, é o que a seção 4 (validação) compara
      depois e o que sustenta a decisão de prosseguir ou não:
      ```sql
      SELECT count(*) AS tables   FROM information_schema.tables WHERE table_schema = 'public';
      SELECT count(*) AS policies FROM pg_policies WHERE schemaname = 'public';
      SELECT extname FROM pg_extension ORDER BY 1;
      ```
- [ ] **Janela sem deploy**: domingo (05/07/2026), confirmar que não há deploy agendado no
      GitHub Actions nem push planejado para `main` durante a janela.
- [ ] **Credencial do Supabase CLI disponível**: `npx supabase login` (gera token interativo) OU
      `SUPABASE_ACCESS_TOKEN` exportado no shell da janela. **Sem isso o dump falha** (confirmado
      nesta sessão — ver seção "Estado desta execução" no fim do documento).
- [ ] **Working tree limpo** no repo (`git status` sem pendências) antes de rodar o script.
- [ ] Ninguém mais escrevendo no banco durante a janela (mensagem no grupo interno, se aplicável).

Só avança para a seção 2 com os 6 itens acima marcados.

---

## 2. Geração do baseline

Comando exato (rodar na raiz do repo, com CLI autenticado):

```bash
npx --yes supabase db dump --linked -f supabase/migrations/00000000000000_baseline.sql
```

> **Atenção — isto NÃO é uma operação local/offline.** `--linked` faz o CLI abrir uma conexão
> real e ao vivo com o banco de **produção** (projeto `czyanilrverorwenikqw`), pela rede, usando
> a credencial ativa. É **read-only** — o dump só faz leitura de catálogo/schema, nenhum
> `INSERT`/`UPDATE`/`DELETE`/DDL é executado — mas é prod de verdade sendo consultado, não um
> arquivo local nem um banco de teste. Rodar só dentro da janela aprovada (domingo, sem deploy).

- `--linked` usa o projeto já linkado (`supabase/.temp/project-ref` = `czyanilrverorwenikqw`,
  confirmado nesta sessão).
- Se faltar credencial, o comando falha rápido com `LegacyPlatformAuthRequiredError` e **não
  trava, não escreve nada** — confirmado nesta sessão (ver rodapé).

### Verificação do dump (rodar antes de prosseguir)

```bash
grep -c '^CREATE TABLE'    supabase/migrations/00000000000000_baseline.sql   # nº de tabelas
grep -c '^CREATE POLICY'   supabase/migrations/00000000000000_baseline.sql   # nº de RLS policies
grep -c '^CREATE EXTENSION' supabase/migrations/00000000000000_baseline.sql  # extensões
grep -c '^CREATE OR REPLACE FUNCTION\|^CREATE FUNCTION' supabase/migrations/00000000000000_baseline.sql
```

Critério binário: os 4 números têm que ser **> 0** e a contagem de `CREATE TABLE` e
`CREATE POLICY` tem que bater com o snapshot tirado direto do prod (seção 1, checklist do
snapshot). Se `CREATE TABLE` = 0, o dump está vazio/incompleto — abortar, não arquivar nada (o
script em `scripts/squash-baseline.sh` já aborta sozinho nesse caso).

---

## 3. Arquivamento

```bash
mkdir -p supabase/migrations_archive
# tudo que não for a baseline nova vai para o archive, preservando histórico git (git mv, não rm)
for f in supabase/migrations/*.sql; do
  base="$(basename "$f")"
  [ "$base" = "00000000000000_baseline.sql" ] && continue
  git mv "$f" "supabase/migrations_archive/$base"
done
```

`supabase/migrations/` fica só com `00000000000000_baseline.sql`. `supabase/migrations_archive/`
recebe os 235 arquivos antigos (234 migrations reais + o snapshot de rollback de RLS). **Nada é
deletado** — `git mv` preserva o blob e o histórico de cada arquivo.

Isso é o que `scripts/squash-baseline.sh` automatiza (seção "Geração do baseline" +
"Arquivamento" do script, passos 2 e 4).

---

## 4. Validação em banco zerado (roda ANTES de tocar no metadado de prod)

Objetivo: provar que `00000000000000_baseline.sql` sozinho recria o schema de prod, byte a byte
em estrutura (não em dados) — **antes** de aprovar/rodar qualquer repair contra
`supabase_migrations.schema_migrations` na seção 5. Se esta seção falhar, paramos aqui: nada em
prod foi tocado além do dump read-only da seção 2.

### Opção A — `supabase start` local (recomendada, sem custo)

```bash
npx --yes supabase stop --no-backup   # se já tinha stack local rodando
npx --yes supabase start              # sobe Postgres local limpo
npx --yes supabase db reset           # aplica supabase/migrations/*.sql do zero (só a baseline, pós-arquivamento)
```

Depois, rodar contra o banco local (via `psql` na connection string que `supabase start`
imprime, ou `supabase db execute` se disponível na versão da CLI) — a mesma query do snapshot
de prod (seção 1):

```sql
SELECT count(*) AS tables   FROM information_schema.tables WHERE table_schema = 'public';
SELECT count(*) AS policies FROM pg_policies WHERE schemaname = 'public';
SELECT extname FROM pg_extension ORDER BY 1;
```

### Opção B — branch de dev do Supabase

`supabase branches create <nome>` (recurso pago/plano) cria um Postgres novo aplicando as
migrations do zero — mesma verificação de contagem acima, sem tocar no projeto principal.

### Critérios binários de aceite

- [ ] nº de tabelas no banco zerado == nº de tabelas do snapshot de prod (seção 1)
- [ ] nº de RLS policies no banco zerado == nº de policies do snapshot de prod (seção 1)
- [ ] lista de extensões (`pg_extension`) no banco zerado == lista do snapshot de prod (seção 1)
- [ ] `supabase db reset` roda sem erro (output bruto anexado ao PR desta etapa)

**Qualquer divergência → não prosseguir para a seção 5.** Investigar o dump e repetir a partir
da seção 2 antes de sequer cogitar tocar em `schema_migrations`.

---

## 5. SQL de metadados — o que o Wandson aprova (só depois da seção 4 passar 100%)

O único toque em prod além do dump read-only (seção 2) é a tabela
`supabase_migrations.schema_migrations` (rastreia quais migrations o CLI considera aplicadas).
**Não escrevemos `INSERT`/`DELETE` bruto contra essa tabela** — o schema interno de colunas dela
não está documentado publicamente de forma confiável (achado desta sessão: só existe confirmação
da coluna `version`; `name` e `statements` aparecem em discussões da comunidade, não na doc
oficial). Em vez de arriscar um `INSERT` com coluna errada direto em prod, usamos o comando
oficial da CLI que existe exatamente para isso — `supabase migration repair` — que muta a tabela
internamente sem exigir que a gente acerte o DDL na mão.

### 5.1 Captura (read-only) o estado real — pode rodar a qualquer momento antes do repair

```bash
# Via SQL Editor do dashboard Supabase (ou psql), projeto czyanilrverorwenikqw:
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
```

**Guardar esse output integralmente** — é a fonte de verdade de "o que sai" (não a lista de
arquivos locais — ver o achado sobre prefixos duplicados na seção "Inventário atual") e é o
material bruto do rollback (seção 6).

### 5.2 O que sai — reverter cada versão capturada no passo 5.1

```bash
npx --yes supabase migration repair --status reverted <versao_1> <versao_2> ... <versao_N> --linked
```

`<versao_1> ... <versao_N>` = a coluna `version` inteira, uma por uma, do resultado do passo
5.1 (não uma lista adivinhada). Isso remove cada linha correspondente de
`supabase_migrations.schema_migrations`.

### 5.3 O que entra — registra a baseline como aplicada (sem executar o SQL dela)

```bash
npx --yes supabase migration repair --status applied 00000000000000 --linked
```

Insere a linha da versão `00000000000000` (baseline) em `schema_migrations`, **sem rodar** o
conteúdo de `00000000000000_baseline.sql` contra o banco (o schema já é o de prod — rodar o
dump de novo daria erro de "já existe"). É por isso que essa etapa é só metadado.

### 5.4 Conferência pós-repair

```bash
npx --yes supabase migration list --linked
```

Esperado: uma única versão listada como remota, `00000000000000`, marcada como aplicada.

---

## 6. Plano de rollback

**Gatilho:** qualquer item do checklist da seção 4 falhar (nesse caso a seção 5 nem deveria ter
rodado), OU `supabase migration list --linked` (seção 5.4) não bater com o esperado, OU qualquer
deploy/push contra prod falhar depois do squash citando erro de migration history.

1. **Código (reversível via git):**
   ```bash
   git revert <sha-do-commit-de-squash>
   ```
   Restaura `supabase/migrations/*.sql` originais e remove a baseline — `git mv` no commit
   original faz o revert ser limpo (arquivos voltam ao lugar, histórico intacto).

2. **Metadados (`schema_migrations`), a partir do capturado no passo 5.1** (só se a seção 5
   chegou a rodar):
   ```bash
   npx --yes supabase migration repair --status reverted 00000000000000 --linked
   npx --yes supabase migration repair --status applied <versao_1> <versao_2> ... <versao_N> --linked
   ```
   `<versao_1> ... <versao_N>` = exatamente a lista capturada no passo 5.1 antes do squash (por
   isso esse output tem que ser salvo e anexado ao PR, não descartado).

3. **Dados/schema:** se o backup completo (seção 1) precisar ser restaurado (cenário extremo —
   schema corrompido, não só metadado), usar o PITR/backup do dashboard Supabase apontando para
   o timestamp anotado antes da janela.

---

## 7. Regra pós-squash

Migrations novas continuam versionadas normalmente em `supabase/migrations/`, com timestamp
`YYYYMMDDHHMMSS_descricao.sql`, seguindo RESTRUCTURE.md princípio 3. O squash é um evento único
de higiene — não muda o fluxo normal de "toda mudança de schema é uma migration commitada".

---

## Estado desta execução (2026-07-05, sessão de geração deste runbook)

Testado nesta sessão, output bruto:

```
$ npx --yes supabase --version
2.109.0

$ npx --yes supabase db dump --linked -f /tmp/test-baseline-dump-check.sql
{"_tag":"Error","error":{"code":"LegacyPlatformAuthRequiredError","message":"Access token not
provided. Supply an access token by running `supabase login` or setting the
SUPABASE_ACCESS_TOKEN environment variable."}}
```

CLI funciona (via `npx`), projeto está linkado (`supabase/.temp/project-ref` =
`czyanilrverorwenikqw`), mas **não há credencial no ambiente desta sessão** — o dump falhou sem
travar e sem escrever nada. Por isso este PR entrega só o runbook e o script (item 3 do brief:
"Se não [o dump funcionar]: só runbook + script"). Nenhum `baseline.sql` foi gerado, nenhuma
migration foi arquivada, nada foi tocado em prod.

Para rodar de fato na janela de domingo: `npx supabase login` (ou exportar
`SUPABASE_ACCESS_TOKEN`) e então `bash scripts/squash-baseline.sh`.

Além disso, o script `scripts/squash-baseline.sh` foi exercitado de ponta a ponta em sandboxes
git isolados (fora deste repo, com CLI stubado) cobrindo 4 cenários: dump funciona (arquivamento
correto), rodar de novo com baseline já existente (aborta, idempotente), dump falha por falta de
credencial (nada é arquivado, `git status` limpo) e dump retorna schema vazio (aborta antes de
arquivar). Os 4 se comportaram como esperado.
