#!/usr/bin/env bash
# install-agents.sh — instala os agentes cd-* globalmente no Claude Code
# Uso: bash scripts/install-agents.sh
# Funciona em: Linux (VPS, servidor) e macOS
#
# O que faz:
#   1. Baixa a versão mais recente do GitHub (branch main)
#   2. Copia todos os agentes cd-* para ~/.claude/agents/
#   3. Mostra resumo do que foi instalado/atualizado

set -e

REPO="https://github.com/deli-consult-delivery/consult-delivery.git"
BRANCH="main"
AGENTS_DIR="$HOME/.claude/agents"
TMP_DIR=$(mktemp -d)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# ─── cores ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}║   Instalador de Agentes cd-* — Claude  ║${RESET}"
echo -e "${CYAN}╚════════════════════════════════════════╝${RESET}"
echo ""

# ─── criar diretório global se não existir ───────────────────────────────────
mkdir -p "$AGENTS_DIR"

# ─── determinar origem dos arquivos ──────────────────────────────────────────
# Se estiver rodando de dentro do repo clonado, usa local
# Se não, baixa do GitHub
if [ -d "$REPO_ROOT/.claude/agents" ]; then
    SOURCE_DIR="$REPO_ROOT/.claude/agents"
    echo -e "📁 Usando arquivos locais do repositório"
else
    echo -e "🌐 Baixando do GitHub (branch: $BRANCH)..."

    # Verifica se tem token configurado no git remote
    GIT_REMOTE=$(git -C /tmp config --get remote.origin.url 2>/dev/null || echo "")
    TOKEN=$(echo "$GIT_REMOTE" | grep -oP '(?<=https://)[^@]+(?=@)' || echo "")

    if [ -n "$TOKEN" ]; then
        CLONE_URL="https://${TOKEN}@github.com/deli-consult-delivery/consult-delivery.git"
    elif [ -n "$GITHUB_TOKEN" ]; then
        CLONE_URL="https://${GITHUB_TOKEN}@github.com/deli-consult-delivery/consult-delivery.git"
    else
        echo -e "${YELLOW}⚠️  Token não encontrado. Configure GITHUB_TOKEN ou use dentro do repo clonado.${RESET}"
        echo -e "   export GITHUB_TOKEN=ghp_seu_token"
        echo -e "   bash scripts/install-agents.sh"
        rm -rf "$TMP_DIR"
        exit 1
    fi

    git clone --depth 1 --branch "$BRANCH" --quiet "$CLONE_URL" "$TMP_DIR/repo" 2>/dev/null
    SOURCE_DIR="$TMP_DIR/repo/.claude/agents"
fi

# ─── copiar agentes ──────────────────────────────────────────────────────────
echo ""
echo -e "📦 Instalando agentes em ${CYAN}~/.claude/agents/${RESET}"
echo ""

INSTALLED=0
UPDATED=0

for agent_file in "$SOURCE_DIR"/cd-*.md; do
    [ -f "$agent_file" ] || continue
    filename=$(basename "$agent_file")
    target="$AGENTS_DIR/$filename"

    if [ -f "$target" ]; then
        # Verifica se mudou
        if ! diff -q "$agent_file" "$target" > /dev/null 2>&1; then
            cp "$agent_file" "$target"
            echo -e "  ${YELLOW}↑${RESET} $filename (atualizado)"
            ((UPDATED++)) || true
        else
            echo -e "  ${GREEN}✓${RESET} $filename (sem mudanças)"
        fi
    else
        cp "$agent_file" "$target"
        echo -e "  ${GREEN}+${RESET} $filename (instalado)"
        ((INSTALLED++)) || true
    fi
done

# ─── limpeza ─────────────────────────────────────────────────────────────────
rm -rf "$TMP_DIR"

# ─── resumo ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}║         Instalação concluída ✅         ║${RESET}"
echo -e "${GREEN}╚════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  Novos:       $INSTALLED agente(s)"
echo -e "  Atualizados: $UPDATED agente(s)"
echo -e "  Local:       $AGENTS_DIR"
echo ""
echo -e "Agentes disponíveis em qualquer sessão Claude Code:"
echo ""
for agent_file in "$AGENTS_DIR"/cd-*.md; do
    [ -f "$agent_file" ] || continue
    name=$(grep -m1 "^name:" "$agent_file" | sed 's/name: *//' | tr -d '"')
    echo -e "  @${name}"
done
echo ""
echo -e "${CYAN}Dica:${RESET} após atualizar o repo, rode novamente para sincronizar."
