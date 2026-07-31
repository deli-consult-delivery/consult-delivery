# HANDOFF — Conectar DELI ao "Consult Delivery OS" (2026-07-31)

## Decisão já tomada (sessão anterior, confirmada pelo Wandson)
DELI **lê os arquivos direto** da pasta "Consult Delivery OS" via MCP filesystem — **não** migra pra Supabase/RLS. Ver `docs/ai-first/ana-regime-permissao.md` e o cd-compass original.

## ⚠️ Gap arquitetural não resolvido ainda — checar isso PRIMEIRO
"Consult Delivery OS" é uma pasta em `C:\Users\Consult Delivery\Documents\Consult Delivery OS` — **no Windows local do Wandson**. Mas a DELI roda no `hermes-gateway`, **na VPS** (187.127.25.24). Um MCP filesystem na VPS não enxerga pasta nenhuma do Windows local — precisa de uma ponte.

cd-echo (sessão anterior) confirmou que essa pasta é um **repositório git próprio** (~12.7k arquivos), estrutura tipo "segundo cérebro": `01_Empresa`, `02_Clientes`, `03_Servicos`, `04_Financeiro` (CSVs reais: `contas_a_receber.csv`, `contas_a_pagar.csv`), `07_Acessos` (inventário, sem credencial real dentro), `09_Comercial`.

**Primeiro passo obrigatório:** rodar `git remote -v` dentro dessa pasta local pra descobrir se já existe um remote (GitHub/GitLab). Se sim → clonar na VPS é trivial. Se não → perguntar ao Wandson como ele quer sincronizar (criar remote privado? rsync manual? outra coisa?) — **não decidir sozinho**, é dado sensível (financeiro real).

## Passos propostos (depois do gap acima resolvido)
1. Clonar/sincronizar "Consult Delivery OS" pra um path na VPS (ex: `/home/claudedev/consult-delivery-os/`, fora de `/root`, dono `claudedev`)
2. Definir mecanismo de atualização (git pull periódico? webhook? manual?) — perguntar ao Wandson a frequência que ele espera
3. Registrar um MCP filesystem no `hermes/config.yaml` apontando pra esse path, escopado **read-only** por padrão (a pasta tem financeiro real e inventário de acesso — write exige decisão explícita separada do Wandson, não assumir)
4. Adicionar esse MCP ao profile da DELI (`hermes/profiles/deli/`) — **não** ao da Ana (Ana é só pessoal, essa pasta é de negócio)
5. Testar leitura: pedir pra DELI resumir o conteúdo de `01_Empresa/perguntas_para_ia.md` (o arquivo que já foi escrito como prompt pra IA operar a empresa) e conferir se bate com o real
6. Documentar resultado com output bruto, tracker item em review — não marcar "done" sozinho

## Cuidado extra
`04_Financeiro` e `07_Acessos` têm dado sensível de verdade (contas a pagar/receber reais, inventário de acesso). Igual às outras vezes: qualquer coisa que pareça credencial/segredo dentro dos arquivos, não repetir em log/chat — só referenciar que existe.
