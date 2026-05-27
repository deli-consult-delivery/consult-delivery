# install-agents.ps1 — instala os agentes cd-* globalmente no Claude Code (Windows)
# Uso: .\scripts\install-agents.ps1
#
# O que faz:
#   1. Usa os arquivos do repositório local (já clonado)
#   2. Copia todos os agentes cd-* para %USERPROFILE%\.claude\agents\
#   3. Mostra resumo do que foi instalado/atualizado

param(
    [string]$RepoPath = "",
    [string]$Token = $env:GITHUB_TOKEN
)

$AgentsDir = Join-Path $env:USERPROFILE ".claude\agents"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Split-Path -Parent $ScriptDir

# ─── banner ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Instalador de Agentes cd-* — Claude  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ─── criar diretório global ──────────────────────────────────────────────────
if (-not (Test-Path $AgentsDir)) {
    New-Item -ItemType Directory -Force -Path $AgentsDir | Out-Null
    Write-Host "✓ Criado: $AgentsDir" -ForegroundColor Green
}

# ─── determinar origem ───────────────────────────────────────────────────────
if ($RepoPath -ne "") {
    $SourceDir = Join-Path $RepoPath ".claude\agents"
} elseif (Test-Path (Join-Path $RepoRoot ".claude\agents")) {
    $SourceDir = Join-Path $RepoRoot ".claude\agents"
    Write-Host "📁 Usando arquivos locais do repositório" -ForegroundColor Gray
} else {
    # Tentar baixar do GitHub
    if (-not $Token) {
        Write-Host ""
        Write-Host "⚠️  Repositório local não encontrado e GITHUB_TOKEN não configurado." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Opções:" -ForegroundColor White
        Write-Host "  1. Rode dentro do repo clonado:"
        Write-Host "     cd C:\Users\`"Consult Delivery`"\consult-delivery"
        Write-Host "     .\scripts\install-agents.ps1"
        Write-Host ""
        Write-Host "  2. Passe o token:"
        Write-Host "     .\scripts\install-agents.ps1 -Token ghp_seu_token"
        Write-Host ""
        exit 1
    }

    Write-Host "🌐 Baixando do GitHub..." -ForegroundColor Gray
    $TmpDir = Join-Path $env:TEMP "cd-agents-install"
    if (Test-Path $TmpDir) { Remove-Item $TmpDir -Recurse -Force }

    $CloneUrl = "https://${Token}@github.com/deli-consult-delivery/consult-delivery.git"
    git clone --depth 1 --branch main --quiet $CloneUrl $TmpDir 2>$null

    if (-not (Test-Path $TmpDir)) {
        Write-Host "❌ Falha ao clonar o repositório. Verifique o token." -ForegroundColor Red
        exit 1
    }

    $SourceDir = Join-Path $TmpDir ".claude\agents"
}

# ─── copiar agentes ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "📦 Instalando agentes em $AgentsDir" -ForegroundColor Cyan
Write-Host ""

$Installed = 0
$Updated   = 0

Get-ChildItem -Path $SourceDir -Filter "cd-*.md" | ForEach-Object {
    $src    = $_.FullName
    $target = Join-Path $AgentsDir $_.Name

    if (Test-Path $target) {
        $srcHash    = (Get-FileHash $src    -Algorithm MD5).Hash
        $targetHash = (Get-FileHash $target -Algorithm MD5).Hash

        if ($srcHash -ne $targetHash) {
            Copy-Item $src $target -Force
            Write-Host "  ↑ $($_.Name) (atualizado)" -ForegroundColor Yellow
            $Updated++
        } else {
            Write-Host "  ✓ $($_.Name) (sem mudanças)" -ForegroundColor DarkGray
        }
    } else {
        Copy-Item $src $target -Force
        Write-Host "  + $($_.Name) (instalado)" -ForegroundColor Green
        $Installed++
    }
}

# ─── limpeza ─────────────────────────────────────────────────────────────────
if (Test-Path (Join-Path $env:TEMP "cd-agents-install")) {
    Remove-Item (Join-Path $env:TEMP "cd-agents-install") -Recurse -Force
}

# ─── resumo ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║         Instalação concluída ✅         ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Novos:       $Installed agente(s)"
Write-Host "  Atualizados: $Updated agente(s)"
Write-Host "  Local:       $AgentsDir"
Write-Host ""
Write-Host "Agentes disponíveis em qualquer sessão Claude Code:" -ForegroundColor White
Write-Host ""

Get-ChildItem -Path $AgentsDir -Filter "cd-*.md" | ForEach-Object {
    $name = (Select-String -Path $_.FullName -Pattern "^name:" | Select-Object -First 1).Line -replace "name:\s*", "" -replace '"', ""
    Write-Host "  @$name" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Dica: após atualizar o repo, rode novamente para sincronizar." -ForegroundColor DarkGray
