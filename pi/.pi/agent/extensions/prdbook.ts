import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, statSync, mkdirSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { createHash } from "node:crypto";

const VAULT_PATH = "~/prdbook";
const DB_PATH = "~/.pi/prdbook-index.db";

/** Max files to auto-inject per product (keep context lean) */
const MAX_AUTO_INJECT_FILES = 3;
/** Min BM25 score to auto-inject (lower = more inclusive, higher = stricter) */
const MIN_BM25_SCORE = 0.05;

/** Words to ignore (Portuguese + English stopwords) */
const STOP_WORDS = new Set([
  "o", "a", "os", "as", "de", "do", "da", "dos", "das",
  "que", "e", "é", "um", "uma", "uns", "umas", "para", "com",
  "não", "em", "no", "na", "nos", "nas", "por", "se", "ao",
  "à", "aos", "às", "ou", "mas", "como", "mais", "meu", "sua",
  "the", "a", "an", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "can", "shall",
  "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "it", "its", "this", "that", "these", "those", "i", "you",
  "he", "she", "we", "they", "me", "him", "her", "us", "them",
  "and", "or", "but", "not", "so", "if", "then", "else", "when",
  "up", "out", "all", "just", "about", "into", "over", "also",
  "very", "only", "some", "any", "each", "both", "few", "more",
  "most", "other", "new", "now", "get", "got", "use", "used",
  "using", "one", "two", "aqui", "tem", "está", "foi", "ser",
  "ter", "fazer", "qual", "esse", "essa", "isso", "ele", "ela",
  "são", "estão", "como", "entre", "onde", "quando", "porque",
]);

// ── Simple Portuguese + English stemmer ──────────────────
// Removes common suffixes so "jornada" ≈ "jornadas" ≈ "jornada"
const PT_STEMMER_RULES: [RegExp, string][] = [
  [/inhosas?$/, "inha"], [/zinhas?$/, "zinha"],
  [/íssimas?$/, "íssimo"], [/érrimas?$/, "érrimo"],
  [/zinhas?$/, "zinho"], [/inhas?$/, "inho"],
  [/mente$/, ""], [/mentes$/, ""],
  [/ações$/, "ação"], [/ições$/, "ição"],
  [/adas$/, "ada"], [/idas$/, "ida"],
  [/ados$/, "ado"], [/idos$/, "ido"],
  [/ares$/, "ar"], [/eres$/, "er"], [/ires$/, "ir"],
  [/avam$/, "ava"], [/iam$/, "ia"],
  [/ndo$/, "r"],          // fazendo → fazer
  [/s$/, ""],             // plural simples
  [/as$/, "a"], [/es$/, "e"], [/os$/, "o"],
];
const EN_STEMMER_RULES: [RegExp, string][] = [
  [/sses$/, "ss"], [/ies$/, "i"], [/ss$/, "ss"],
  [/s$/, ""],            // plural
  [/eed$/, "ee"], [/ed$/, ""], [/ing$/, ""],
  [/ational$/, "ate"], [/tional$/, "tion"],
  [/enci$/, "ence"], [/anci$/, "ance"],
  [/izer$/, "ize"], [/logi$/, "log"],
  [/bli$/, "ble"], [/alli$/, "al"],
  [/entli$/, "ent"], [/eli$/, "e"],
  [/ousli$/, "ous"], [/ization$/, "ize"],
  [/ation$/, "ate"], [/ator$/, "ate"],
  [/alism$/, "al"], [/iveness$/, "ive"],
  [/fulness$/, "ful"], [/ousness$/, "ous"],
  [/aliti$/, "al"], [/iviti$/, "ive"],
  [/biliti$/, "ble"], [/logi$/, "log"],
  [/ment$/, ""], [/ness$/, ""],
  [/ful$/, ""], [/ive$/, ""], [/ize$/, ""],
];

function stem_pt(word: string): string {
  let w = word.toLowerCase();
  for (const [re, repl] of PT_STEMMER_RULES) {
    if (w.length > 4 && re.test(w)) {
      w = w.replace(re, repl);
      break;
    }
  }
  return w;
}

function stem_en(word: string): string {
  let w = word.toLowerCase();
  if (w.length <= 3) return w;
  for (const [re, repl] of EN_STEMMER_RULES) {
    if (re.test(w)) {
      w = w.replace(re, repl);
      break;
    }
  }
  return w;
}

/** Stem a word using both Portuguese and English rules, return best match */
function stem(word: string): string {
  // Don't stem very short words or code identifiers (containing _ or camelCase)
  if (word.length <= 2 || word.includes("_") || /[A-Z]/.test(word)) return word;
  const pt = stem_pt(word);
  const en = stem_en(word);
  // Return the shorter stem (more aggressive = better match)
  return pt.length <= en.length ? pt : en;
}

// ── Tokenizer ─────────────────────────────────────────────
/**
 * Tokenizes text for FTS5 ingestion.
 * - Splits on non-word boundaries
 * - Preserves camelCase splits: "getSchedulesFromPw" → ["get","schedules","from","pw"]
 * - Preserves snake_case splits: "HORAS_CONTRATUAIS" → ["horas","contratuais"]
 * - Applies stemming to each token
 * - Filters stopwords and short tokens
 */
function tokenize(text: string): string[] {
  // First, split camelCase and snake_case
  const expanded = text
    .replace(/([a-z])([A-Z])/g, "$1 $2")   // camelCase → camel Case
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // HORASCONTRATUAIS → HORAS CONTRATUAIS
    .replace(/_/g, " ")                      // snake_case → snake case
    .toLowerCase();

  // Split on non-alphanumeric (keep accented chars)
  const tokens = expanded
    .split(/[^a-záéíóúâêîôûãõç0-9]+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));

  // Deduplicate while stemming
  const stemmed = new Set<string>();
  const result: string[] = [];
  for (const t of tokens) {
    const s = stem(t);
    if (!stemmed.has(s) && s.length >= 2) {
      stemmed.add(s);
      result.push(s);
    }
  }
  return result;
}

// ── SQLite FTS5 Index ────────────────────────────────────
let db: DatabaseSync | null = null;

interface FileRecord {
  id: number;
  path: string;
  product: string;
  hash: string;
  mtime: number;
}

function getDB(): DatabaseSync {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode=WAL");
  return db;
}

function initSchema(): void {
  const d = getDB();
  d.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      product TEXT NOT NULL,
      hash TEXT NOT NULL,
      mtime INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
      tokenized,
      file_id UNINDEXED,
      product UNINDEXED,
      tokenize='trigram'
    );

    CREATE INDEX IF NOT EXISTS idx_files_product ON files(product);
  `);
}

/** Recursively find all .md files in a directory (excluding staging) */
function findMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const s = statSync(fullPath);
      if (s.isDirectory()) {
        if (entry === "staging" || entry === ".archive" || entry.startsWith(".")) continue;
        files.push(...findMarkdownFiles(fullPath));
      } else if (entry.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  } catch {
    // directory might not exist yet
  }
  return files;
}

/** Read a markdown file safely, returns null on error */
function readMarkdownFile(filePath: string): string | null {
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/** Extract title from the first # heading in a markdown file */
function extractTitle(filePath: string): string {
  const content = readMarkdownFile(filePath);
  if (!content) return relative(VAULT_PATH, filePath);
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : relative(VAULT_PATH, filePath);
}

/** Parse YAML frontmatter for tags and body offset */
function parseFrontmatter(content: string): { tags: string[]; bodyOffset: number; body: string } | null {
  if (!content.startsWith("---\n")) return null;
  const endIdx = content.indexOf("\n---\n", 4);
  if (endIdx === -1) return null;
  const fm = content.slice(4, endIdx);
  const tagMatch = fm.match(/^tags:\s*\[([^\]]+)\]/m);
  const tags = tagMatch
    ? tagMatch[1].split(",").map((t) => t.trim().toLowerCase())
    : [];
  return { tags, bodyOffset: endIdx + 5, body: content.slice(endIdx + 5) };
}

// ── Index Management ────────────────────────────────────
/** Compute content hash for change detection */
function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/** Index or re-index a single file */
function indexFile(filePath: string, product: string): void {
  const content = readMarkdownFile(filePath);
  if (!content) return;

  const hash = contentHash(content);
  const mtime = statSync(filePath).mtimeMs;
  const d = getDB();

  // Check if file needs re-indexing
  const existing = d.prepare(
    "SELECT id, hash, mtime FROM files WHERE path = ?"
  ).get(filePath) as FileRecord | undefined;

  if (existing && existing.hash === hash && existing.mtime === mtime) {
    return; // unchanged
  }

  // Tokenize content: tags first (higher weight via repetition), then body
  const fm = parseFrontmatter(content);
  const tagTokens = fm ? fm.tags.flatMap((t) => tokenize(t)) : [];
  const bodyTokens = tokenize(fm ? fm.body : content);

  // Tags are repeated 3x to boost their BM25 weight (mimics our old 4x manual weight)
  const allTokens = [...tagTokens, ...tagTokens, ...tagTokens, ...bodyTokens];
  const tokenized = allTokens.join(" ");

  if (!tokenized.trim()) return;

  // Wrap in explicit SQL transaction (node:sqlite lacks .transaction() method)
  d.exec("BEGIN");
  try {
    if (existing) {
      // Remove old chunks
      d.prepare("DELETE FROM chunks WHERE file_id = ?").run(existing.id);
      // Update file record
      d.prepare("UPDATE files SET hash = ?, mtime = ? WHERE id = ?").run(hash, mtime, existing.id);
      // Insert new chunks
      d.prepare("INSERT INTO chunks (tokenized, file_id, product) VALUES (?, ?, ?)").run(
        tokenized, existing.id, product
      );
    } else {
      // New file
      const result = d.prepare(
        "INSERT INTO files (path, product, hash, mtime) VALUES (?, ?, ?, ?)"
      ).run(filePath, product, hash, mtime);
      const fileId = Number(result.lastInsertRowid);
      d.prepare("INSERT INTO chunks (tokenized, file_id, product) VALUES (?, ?, ?)").run(
        tokenized, fileId, product
      );
    }
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

/** Remove stale files from index (deleted from disk) */
function purgeStaleFiles(): void {
  const d = getDB();
  const files = d.prepare("SELECT id, path FROM files").all() as { id: number; path: string }[];
  for (const f of files) {
    if (!existsSync(f.path)) {
      d.prepare("DELETE FROM chunks WHERE file_id = ?").run(f.id);
      d.prepare("DELETE FROM files WHERE id = ?").run(f.id);
    }
  }
}

/** Full re-index of all vault files */
function reindexAll(): void {
  const productFolders = getProductFolders();
  for (const product of productFolders) {
    const productDir = join(VAULT_PATH, product);
    const files = findMarkdownFiles(productDir);
    for (const file of files) {
      indexFile(file, product);
    }
  }
  purgeStaleFiles();
}

// ── BM25 Search ──────────────────────────────────────────
interface SearchResult {
  filePath: string;
  product: string;
  title: string;
  bm25Score: number;
  highlighted: string;
}

/** FTS5 query requires special escaping and formatting */
function fts5Query(keywords: string[]): string {
  // FTS5 trigram tokenizer: each term can be a prefix or exact match
  // We use OR to make it flexible
  const terms = keywords.map((k) => `"${k.replace(/"/g, '""')}"`).join(" OR ");
  return terms || '""'; // empty query returns nothing
}

/** Search the FTS5 index with BM25 ranking */
function searchFTS5(queryText: string, product: string, limit: number = 50): SearchResult[] {
  const d = getDB();
  const keywords = tokenize(queryText);
  if (keywords.length === 0) return [];

  const fts5q = fts5Query(keywords);

  try {
    const rows = d.prepare(`
      SELECT
        f.path,
        f.product,
        bm25(chunks, 5.0, 1.0) AS bm25_score,
        highlight(chunks, 0, '**', '**') AS highlighted
      FROM chunks
      JOIN files f ON f.id = chunks.file_id
      WHERE chunks MATCH ?
        AND f.product = ?
      ORDER BY bm25_score
      LIMIT ?
    `).all(fts5q, product, limit) as { path: string; product: string; bm25_score: number; highlighted: string }[];

    return rows
      .filter((r) => r.bm25_score !== null && r.bm25_score >= -10) // BM25 can be negative for poor matches
      .map((r) => ({
        filePath: r.path,
        product: r.product,
        title: extractTitle(r.path),
        bm25Score: r.bm25_score,
        highlighted: r.highlighted || "",
      }));
  } catch (e: any) {
    // FTS5 might fail on malformed queries — fall back to LIKE search
    const q = `%${keywords.join("%")}%`;
    const d2 = getDB();
    const rows = d2.prepare(`
      SELECT DISTINCT f.path, f.product
      FROM files f
      JOIN chunks c ON c.file_id = f.id
      WHERE c.tokenized LIKE ? AND f.product = ?
      LIMIT ?
    `).all(q, product, limit) as { path: string; product: string }[];
    return rows.map((r) => ({
      filePath: r.path,
      product: r.product,
      title: extractTitle(r.path),
      bm25Score: 0,
      highlighted: "",
    }));
  }
}

// ── Product folders ──────────────────────────────────────
function getProductFolders(): string[] {
  try {
    return readdirSync(VAULT_PATH).filter((f) => {
      const full = join(VAULT_PATH, f);
      return statSync(full).isDirectory() && !f.startsWith(".") && f !== "staging";
    });
  } catch {
    return [];
  }
}

// ── Knowledge formatting ─────────────────────────────────
function formatKnowledge(
  files: { path: string; bm25Score: number; highlighted: string }[],
  baseDir: string,
  maxCharsPerFile: number = 4000
): string[] {
  const parts: string[] = [];
  for (const file of files) {
    const relPath = relative(baseDir, file.path);
    const content = readMarkdownFile(file.path);
    if (!content) continue;
    const truncated =
      content.length > maxCharsPerFile
        ? content.slice(0, maxCharsPerFile) +
          `\n\n*... (truncated, use \`get_product_knowledge\` tool for full content, ${content.length} total chars)*`
        : content;
    parts.push(`### ${relPath} (BM25: ${file.bm25Score.toFixed(3)})\n${truncated}`);
  }
  return parts;
}

// ── Extension entry point ────────────────────────────────
export default function (pi: ExtensionAPI) {
  // Initialize FTS5 index
  try {
    initSchema();
    reindexAll();
  } catch (e) {
    console.error("[prdbook] FTS5 init failed:", e);
  }

  const productFolders = getProductFolders();
  const productList = productFolders.join(", ");

  // ── Register custom tool ────────────────────────────────
  pi.registerTool({
    name: "get_product_knowledge",
    label: "Get Product Knowledge",
    description: `Retrieve documentation and knowledge about products from the knowledge base. Available products: ${productList}. Use this whenever the user asks about any of these products or when you need technical details about them.`,
    promptSnippet: `Search product knowledge for ${productList}`,
    promptGuidelines: [
      `Use get_product_knowledge when the user mentions or asks about any product (${productList}) — it returns documentation from the knowledge vault.`,
      `The product name must match one of the available folders exactly (case-sensitive): ${productList}.`,
    ],
    parameters: Type.Object({
      product: Type.String({
        description: `The product name. Must be one of: ${productList}`,
      }),
      search: Type.Optional(
        Type.String({
          description:
            "Optional search term to find specific information within the product's knowledge files. If omitted, all files are returned.",
        })
      ),
    }),
    async execute(_toolCallId, params) {
      const productDir = join(VAULT_PATH, params.product);

      if (params.product === ".git") {
        const productInfo = readMarkdownFile(join(VAULT_PATH, ".git", "index.md"));
        return {
          content: [{ type: "text", text: productInfo || `Product ".git" documentation.` }],
          details: {},
        };
      }

      if (!statSync(productDir, { throwIfNoEntry: false })?.isDirectory()) {
        return {
          content: [{ type: "text", text: `Product "${params.product}" not found. Available products: ${productList}` }],
          details: {},
        };
      }

      let files: { path: string; title: string; bm25Score: number; highlighted: string }[];

      if (params.search) {
        // Use FTS5+BM25 search
        const results = searchFTS5(params.search, params.product, 50);
        files = results.map((r) => ({ path: r.filePath, title: r.title, bm25Score: r.bm25Score, highlighted: r.highlighted }));
      } else {
        // Return all files with placeholder scores
        const allFiles = findMarkdownFiles(productDir);
        files = allFiles.map((f) => ({ path: f, title: extractTitle(f), bm25Score: 0, highlighted: "" }));
      }

      if (files.length === 0) {
        return {
          content: [{ type: "text", text: `No documentation found for "${params.product}". The folder exists but has no matching files.` }],
          details: {},
        };
      }

      const knowledge = formatKnowledge(files, productDir, 8000);
      const result = knowledge.join("\n\n");
      const summary = `Found ${files.length} file(s) for "${params.product}"${params.search ? ` matching "${params.search}"` : ""}.`;

      return {
        content: [{ type: "text", text: `${summary}\n\n${result}` }],
        details: { filesFound: files.length, product: params.product, searchTerm: params.search },
      };
    },
  });

  // ── Auto-inject knowledge ───────────────────────────────
  pi.on("before_agent_start", async (event) => {
    const userText = event.prompt.toLowerCase();
    const mentioned = productFolders.filter((p) => userText.includes(p.toLowerCase()));
    if (mentioned.length === 0) return;

    // Re-index before search (catch any file changes since startup)
    try { reindexAll(); } catch { /* silently skip */ }

    const queryKeywords = tokenize(event.prompt).join(" ");
    const knowledgeParts: string[] = [];

    for (const product of mentioned) {
      const results = queryKeywords
        ? searchFTS5(queryKeywords, product, 50)
        : [];

      const topRelevant = results
        .filter((r) => r.bm25Score >= MIN_BM25_SCORE)
        .slice(0, MAX_AUTO_INJECT_FILES);

      const allFiles = findMarkdownFiles(join(VAULT_PATH, product));
      const allScored = results.length > 0
        ? results  // Use FTS5 results for scoring display
        : allFiles.map((f) => ({ filePath: f, product, title: extractTitle(f), bm25Score: 0, highlighted: "" }));

      let productText = `## ${product}\n\n`;

      if (topRelevant.length > 0) {
        const details = formatKnowledge(
          topRelevant.map((r) => ({ path: r.filePath, bm25Score: r.bm25Score, highlighted: r.highlighted })),
          VAULT_PATH,
          4000
        );
        productText += details.join("\n\n") + "\n\n";
      } else {
        productText += "*(No files strongly matched. Use `get_product_knowledge` to explore.)*\n\n";
      }

      // File index with BM25 scores
      productText += "**📁 Available files:**\n";
      for (const { title, bm25Score } of allScored) {
        const normalizedScore = bm25Score > 0 ? Math.min(Math.round(bm25Score * 50), 100) : 0;
        const bar = normalizedScore > 0
          ? "█".repeat(Math.ceil(normalizedScore / 10)) + "░".repeat(10 - Math.ceil(normalizedScore / 10))
          : "░░░░░░░░░░";
        productText += `- ${title} [${bar}] (BM25: ${bm25Score.toFixed(3)})\n`;
      }
      productText += `\n*Use \`get_product_knowledge\` with product="${product}" to load any file.*`;

      knowledgeParts.push(productText);
    }

    return {
      systemPrompt:
        (event.systemPrompt || "") +
        `\n\n## 📚 Product Knowledge Base (FTS5+BM25)\n\nVault: \`${VAULT_PATH}\`. Only the most relevant files are shown below. Use \`get_product_knowledge\` to load any file in full.\n\n` +
        knowledgeParts.join("\n\n---\n\n"),
    };
  });
}
