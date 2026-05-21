import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Limite de chars por arquivo da base (~1000 tokens por arquivo)
export const MAX_CHARS_PER_KB_FILE = 4000;

export interface KnowledgeSource {
  path: string;
  conteudo_relevante: string;
}

export interface KnowledgeBaseResult {
  fontes: KnowledgeSource[];
  tokens_estimados: number;
}

function getKnowledgeBasePath(): string {
  return process.env.KNOWLEDGE_BASE_PATH ?? "/root/consult-delivery-knowledge";
}

/**
 * Extrai caminhos de arquivo candidatos do _index.md raiz.
 * Lê linhas de tabela markdown com status "ativo" e extrai o nome do arquivo.
 * Retorna lista de { filePath: caminho absoluto, lineText: linha completa do índice }.
 */
function extractCandidatesFromIndex(
  indexContent: string,
  basePath: string
): Array<{ filePath: string; lineText: string }> {
  const candidates: Array<{ filePath: string; lineText: string }> = [];
  const lines = indexContent.split("\n");

  // Rastreia a área atual lendo os cabeçalhos de seção (### 00-empresa/, ### 01-atendimento/, etc.)
  let currentAreaPrefix = "";

  for (const line of lines) {
    // Detecta cabeçalho de área do tipo: ### 00-empresa/ — ...
    const areaMatch = line.match(/^###\s+([\w-]+\/)/);
    if (areaMatch) {
      currentAreaPrefix = areaMatch[1];
      continue;
    }

    // Detecta linha de tabela markdown com ✅ ativo
    if (!line.includes("✅ ativo")) continue;

    // Extrai o conteúdo entre backticks da primeira coluna: | `arquivo.md` | ...
    const fileMatch = line.match(/\|\s*`([^`]+)`\s*\|/);
    if (!fileMatch) continue;

    const rawFile = fileMatch[1];

    // Se o arquivo já tem path completo (contém "/"), usa direto; caso contrário, prefixed com área
    const relativePath = rawFile.includes("/")
      ? rawFile
      : currentAreaPrefix + rawFile;

    candidates.push({
      filePath: join(basePath, relativePath),
      lineText: line,
    });
  }

  return candidates;
}

/**
 * Pontua um candidato contra as keywords da query.
 * Retorna número de keywords que aparecem na linha do índice (case-insensitive).
 */
function scoreCandidate(lineText: string, keywords: string[]): number {
  const lowerLine = lineText.toLowerCase();
  return keywords.filter((kw) => lowerLine.includes(kw)).length;
}

/**
 * Tokeniza a query em keywords relevantes (remove stop words curtas).
 */
function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-záàãâéêíóõôúüç]/gi, ""))
    .filter((w) => w.length >= 3);
}

/**
 * Lê um arquivo da base de conhecimento e trunca se necessário.
 * Retorna null se o arquivo não existir (stub/pendente).
 */
async function readKnowledgeFile(
  filePath: string
): Promise<string | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    if (content.length > MAX_CHARS_PER_KB_FILE) {
      return content.slice(0, MAX_CHARS_PER_KB_FILE) + "\n… [truncado]";
    }
    return content;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "EISDIR") {
      console.warn(`[knowledge-base] arquivo não encontrado, pulando: ${filePath}`);
      return null;
    }
    throw new Error(
      `[knowledge-base] erro ao ler arquivo ${filePath}: ${(err as Error).message}`
    );
  }
}

/**
 * Busca arquivos relevantes na base de conhecimento estática (consult-delivery-knowledge).
 *
 * Fluxo:
 * 1. Lê _index.md raiz (sempre)
 * 2. Extrai candidatos com status "ativo"
 * 3. Pontua cada candidato contra keywords da query
 * 4. Lê até max_files arquivos com maior score
 * 5. Pula arquivos não encontrados com console.warn
 * 6. Retorna { fontes, tokens_estimados }
 *
 * Dependências: node:fs/promises, node:path — sem Supabase, sem Anthropic.
 */
export async function searchKnowledgeBase(
  query: string,
  max_files = 3
): Promise<KnowledgeBaseResult> {
  const basePath = getKnowledgeBasePath();
  const indexPath = join(basePath, "_index.md");

  const indexContent = await readFile(indexPath, "utf-8").catch((err) => {
    throw new Error(
      `[knowledge-base] falha ao ler _index.md em ${indexPath}: ${(err as Error).message}`
    );
  });

  const keywords = extractKeywords(query);
  const candidates = extractCandidatesFromIndex(indexContent, basePath);

  // Pontua e ordena por score desc; desempate pelo índice original (estabilidade)
  const scored = candidates
    .map((c, idx) => ({ ...c, score: scoreCandidate(c.lineText, keywords), idx }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.idx - b.idx);

  // Se nenhum candidato pontua, pega os primeiros max_files com status ativo (fallback)
  const selected =
    scored.length > 0 ? scored.slice(0, max_files) : candidates.slice(0, max_files);

  const fontes: KnowledgeSource[] = [];

  for (const candidate of selected) {
    const conteudo = await readKnowledgeFile(candidate.filePath);
    if (conteudo === null) continue;

    // Normaliza path para exibição relativa (remove basePath prefix)
    const relativePath = candidate.filePath
      .replace(basePath, "")
      .replace(/^[\\/]/, "");

    fontes.push({ path: relativePath, conteudo_relevante: conteudo });
  }

  const totalChars = fontes.reduce(
    (sum, f) => sum + f.conteudo_relevante.length,
    0
  );
  // Estimativa padrão: 4 chars ≈ 1 token
  const tokens_estimados = Math.ceil(totalChars / 4);

  return { fontes, tokens_estimados };
}
