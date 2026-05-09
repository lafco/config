import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

const VAULT_ROOT = path.resolve(process.env.HOME || "~", "prdbook");
const STAGING_DIR = path.join(VAULT_ROOT, "staging");
const TEMPLATE_DIR = path.join(STAGING_DIR, ".template");
const ARCHIVE_DIR = path.join(STAGING_DIR, ".archive");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Feature Init ───────────────────────────────────────────────

function featureInit(product: string, slug: string): { created: string; files: string[] } {
  const featureDir = path.join(STAGING_DIR, `${product}-${slug}`);

  if (fs.existsSync(featureDir)) {
    throw new Error(`Feature "${product}-${slug}" já existe em staging/`);
  }

  // Copia template
  fs.cpSync(TEMPLATE_DIR, featureDir, { recursive: true });

  // Substitui placeholders
  const files = fs.readdirSync(featureDir).filter(f => f.endsWith(".md"));
  for (const file of files) {
    const filePath = path.join(featureDir, file);
    let content = fs.readFileSync(filePath, "utf-8");
    content = content.replace(/\[NOME DO PRODUTO\]/g, product);
    content = content.replace(/\[NOME DA FEATURE\]/g, slug);
    content = content.replace(/\[SLUG\]/g, `${product}-${slug}`);
    fs.writeFileSync(filePath, content);
  }

  return {
    created: featureDir,
    files: files.sort()
  };
}

// ─── Feature List ───────────────────────────────────────────────

function featureList(): { active: string[]; archived: string[] } {
  const active: string[] = [];
  const archived: string[] = [];

  if (fs.existsSync(STAGING_DIR)) {
    for (const entry of fs.readdirSync(STAGING_DIR)) {
      const entryPath = path.join(STAGING_DIR, entry);
      if (entry.startsWith(".") || entry === "README.md" || entry === "new-feature.sh") continue;
      if (fs.statSync(entryPath).isDirectory() && fs.existsSync(path.join(entryPath, "01-analysis.md"))) {
        active.push(entry);
      }
    }
  }

  if (fs.existsSync(ARCHIVE_DIR)) {
    for (const entry of fs.readdirSync(ARCHIVE_DIR)) {
      if (entry.startsWith(".") || entry === "index.md") continue;
      const entryPath = path.join(ARCHIVE_DIR, entry);
      if (fs.statSync(entryPath).isDirectory()) {
        archived.push(entry);
      }
    }
  }

  return { active, archived };
}

// ─── Feature Merge ──────────────────────────────────────────────

interface MergePlan {
  create?: Array<{ destination: string; content: string }>;
  update?: Array<{ document: string; section: string; oldText: string; newText: string }>;
  remove?: Array<{ document: string; reason: string }>;
}

function parseMergePlan(slug: string): MergePlan {
  const mergeFile = path.join(STAGING_DIR, `${slug}`, "04-merge-plan.md");
  if (!fs.existsSync(mergeFile)) {
    throw new Error(`04-merge-plan.md não encontrado em staging/${slug}/`);
  }

  const content = fs.readFileSync(mergeFile, "utf-8");
  const plan: MergePlan = { create: [], update: [], remove: [] };

  // Parse CREATE sections — cada bloco "### Conteúdo de `...`"
  const createRegex = /### Conteúdo de `([^`]+)`\s*\n\n```markdown\n([\s\S]*?)```/g;
  let match;
  while ((match = createRegex.exec(content)) !== null) {
    plan.create!.push({
      destination: match[1],
      content: match[2]
    });
  }

  // Parse UPDATE sections — cada bloco "### Diff para `...`"
  const updateRegex = /### Diff para `([^`]+)`\s*\n\n\*\*Antes:\*\*\s*\n```markdown\n([\s\S]*?)```\s*\n\n\*\*Depois:\*\*\s*\n```markdown\n([\s\S]*?)```/g;
  while ((match = updateRegex.exec(content)) !== null) {
    plan.update!.push({
      document: match[1],
      section: "",
      oldText: match[2],
      newText: match[3].trim()
    });
  }

  // Parse REMOVE sections
  const removeTableRegex = /\| `([^`]+)` \| (.+) \|/g;
  const removeSection = content.match(/## Documentos a REMOVER([\s\S]*?)(?=##|---$|$)/);
  if (removeSection) {
    while ((match = removeTableRegex.exec(removeSection[0])) !== null) {
      plan.remove!.push({
        document: match[1],
        reason: match[2]
      });
    }
  }

  return plan;
}

function applyMerge(slug: string): { created: string[]; updated: string[]; removed: string[] } {
  const plan = parseMergePlan(slug);
  const result = { created: [] as string[], updated: [] as string[], removed: [] as string[] };

  // CREATE
  for (const create of plan.create || []) {
    const targetPath = path.join(VAULT_ROOT, create.destination);
    ensureDir(path.dirname(targetPath));
    fs.writeFileSync(targetPath, create.content);
    result.created.push(create.destination);
  }

  // UPDATE
  for (const update of plan.update || []) {
    const targetPath = path.join(VAULT_ROOT, update.document);
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Documento não encontrado para update: ${update.document}`);
    }

    const fileContent = fs.readFileSync(targetPath, "utf-8");
    if (!fileContent.includes(update.oldText.trim())) {
      throw new Error(`Texto antigo não encontrado em ${update.document}. O arquivo pode já ter sido atualizado.`);
    }

    const newContent = fileContent.replace(update.oldText, update.newText);
    fs.writeFileSync(targetPath, newContent);
    result.updated.push(update.document);
  }

  // REMOVE — apenas loga, não remove automaticamente (segurança)
  for (const remove of plan.remove || []) {
    result.removed.push(`${remove.document} (${remove.reason})`);
  }

  return result;
}

// ─── Feature Archive ────────────────────────────────────────────

function featureArchive(slug: string, reference: string): string {
  const featureDir = path.join(STAGING_DIR, slug);
  if (!fs.existsSync(featureDir)) {
    throw new Error(`Feature "${slug}" não encontrada em staging/`);
  }

  const archiveDir = path.join(ARCHIVE_DIR, slug);
  ensureDir(ARCHIVE_DIR);

  // Move
  fs.renameSync(featureDir, archiveDir);

  // Cria _COMPLETED.md
  const today = new Date().toISOString().substring(0, 10);
  const completed = `# Feature Concluída: ${slug}

| Campo | Valor |
|---|---|
| **Data de merge** | ${today} |
| **Produto** | ${slug.split("-")[0]} |
| **Referência** | ${reference || "—"} |
| **Docs criados** | Ver 04-merge-plan.md |
| **Docs atualizados** | Ver 04-merge-plan.md |

## Resumo

Feature implementada e documentos mesclados no vault.

## Desvios do plano

Nenhum desvio registrado. Ver 03-code-changes.md vs código final.
`;
  fs.writeFileSync(path.join(archiveDir, "_COMPLETED.md"), completed);

  // Atualiza index do archive
  const archiveIndex = path.join(ARCHIVE_DIR, "index.md");
  if (fs.existsSync(archiveIndex)) {
    let indexContent = fs.readFileSync(archiveIndex, "utf-8");
    const newRow = `| ${today} | ${slug} | ${slug.split("-")[0]} | ${reference} |\n`;
    const tableEnd = indexContent.lastIndexOf("| — | — | — | — |");
    if (tableEnd > 0) {
      const afterEnd = indexContent.indexOf("\n", tableEnd);
      if (afterEnd > 0) {
        indexContent = indexContent.substring(0, afterEnd + 1) + newRow + indexContent.substring(afterEnd + 1);
        fs.writeFileSync(archiveIndex, indexContent);
      }
    }
  }

  return archiveDir;
}

// ─── Extension ──────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {

  // Ferramenta: feature_init
  pi.registerTool({
    name: "feature_init",
    label: "Init Feature Staging",
    description: "Cria uma nova feature no fluxo de staging. Copia os 4 templates (01-analysis, 02-impact, 03-code-changes, 04-merge-plan) para staging/{produto}-{slug}/.",
    parameters: Type.Object({
      product: Type.String({
        description: "Nome do produto: 'escalas', 'folgas', 'pontoweb', 'shared' ou 'vacations'"
      }),
      slug: Type.String({
        description: "Slug kebab-case da feature, ex: 'multi-jornada-support', 'premium-sabado-util'"
      })
    }),
    async execute(_toolCallId, params) {
      try {
        const result = featureInit(params.product, params.slug);
        const fileList = result.files.map(f => `  - ${f}`).join("\n");
        return {
          content: [{
            type: "text",
            text: `✅ Feature criada: staging/${params.product}-${params.slug}/\n\nArquivos:\n${fileList}\n\nPróximos passos:\n1. Preencher 01-analysis.md (análise do código atual vs desejado)\n2. Preencher 02-impact.md (sistemas e docs impactados)\n3. Preencher 03-code-changes.md (mudanças exatas antes/depois)\n4. Preencher 04-merge-plan.md (como mesclar docs no vault)`
          }],
          details: { status: "created", path: result.created }
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `❌ Erro: ${e.message}` }],
          details: { status: "error" }
        };
      }
    }
  });

  // Ferramenta: feature_list
  pi.registerTool({
    name: "feature_list",
    label: "List Features",
    description: "Lista todas as features no staging (ativas e arquivadas).",
    parameters: Type.Object({}),
    async execute() {
      const { active, archived } = featureList();

      const activeStr = active.length > 0
        ? active.map(f => `  - ${f}`).join("\n")
        : "  (nenhuma feature ativa)";
      const archivedStr = archived.length > 0
        ? archived.map(f => `  - ${f}`).join("\n")
        : "  (nenhuma feature arquivada)";

      return {
        content: [{
          type: "text",
          text: `## Features ativas (${active.length})\n${activeStr}\n\n## Features concluídas (${archived.length})\n${archivedStr}`
        }],
        details: { active, archived }
      };
    }
  });

  // Ferramenta: feature_preview — preview sem aplicar
  pi.registerTool({
    name: "feature_preview",
    label: "Preview Feature Merge",
    description: "Gera uma pré-visualização do que o feature_merge faria nos documentos do vault, sem aplicar nenhuma mudança. Use antes de feature_merge para validação humana.",
    parameters: Type.Object({
      slug: Type.String({
        description: "Slug completo da feature (ex: 'escalas-multi-jornada')"
      })
    }),
    async execute(_toolCallId, params) {
      try {
        const plan = parseMergePlan(params.slug);

        let preview = "## 📋 Pré-visualização do Merge\n\n";
        preview += `⚠️ **NENHUMA MUDANÇA FOI APLICADA.** Esta é apenas uma prévia.\n`;
        preview += `Use \`feature_merge\` com \`confirm: true\` para aplicar.\n\n`;
        preview += `---\n\n`;

        if ((plan.create || []).length > 0) {
          preview += `### 📄 Documentos a CRIAR (${plan.create!.length})\n\n`;
          for (const c of plan.create!) {
            const contentPreview = c.content.length > 500 ? c.content.substring(0, 500) + "..." : c.content;
            preview += `**Destino:** \`${c.destination}\`\n`;
            preview += `\`\`\`markdown\n${contentPreview}\n\`\`\`\n\n`;
          }
        }

        if ((plan.update || []).length > 0) {
          preview += `### ✏️ Documentos a ATUALIZAR (${plan.update!.length})\n\n`;
          for (const u of plan.update!) {
            const exists = fs.existsSync(path.join(VAULT_ROOT, u.document));
            const status = exists ? "✅ existe" : "❌ NÃO ENCONTRADO";
            preview += `**Documento:** \`${u.document}\` ${status}\n`;

            if (exists) {
              const fileContent = fs.readFileSync(path.join(VAULT_ROOT, u.document), "utf-8");
              const oldFound = fileContent.includes(u.oldText.trim());
              preview += `  - Match do texto antigo: ${oldFound ? "✅" : "❌ (pode falhar no merge)"}\n`;
            }
            preview += `  - Tamanho da mudança: ${u.oldText.length} → ${u.newText.length} caracteres\n\n`;
          }
        }

        if ((plan.remove || []).length > 0) {
          preview += `### 🗑️ Documentos a REMOVER (${plan.remove!.length})\n\n`;
          preview += `⚠️ **Remoções NÃO são automáticas.** Remova manualmente:\n`;
          for (const r of plan.remove!) {
            preview += `  - \`${r.document}\` — ${r.reason}\n`;
          }
          preview += "\n";
        }

        const totalChanges = (plan.create || []).length + (plan.update || []).length + (plan.remove || []).length;
        preview += `---\n**Total de mudanças pendentes:** ${totalChanges}\n`;
        preview += `Para aplicar: \`feature_merge("${params.slug}", confirm: true)\``;

        return {
          content: [{ type: "text", text: preview }],
          details: { plan, totalChanges, slug: params.slug }
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `❌ Erro ao gerar preview: ${e.message}` }],
          details: { status: "error" }
        };
      }
    }
  });

  // Ferramenta: feature_merge
  pi.registerTool({
    name: "feature_merge",
    label: "Merge Feature Docs",
    description: "Aplica o plano de merge (04-merge-plan.md) de uma feature staging aos vaults de documentação. REQUER confirm: true para executar. Sempre chame feature_preview antes para validação humana.",
    parameters: Type.Object({
      slug: Type.String({
        description: "Slug completo da feature (ex: 'escalas-multi-jornada')"
      }),
      confirm: Type.Optional(Type.Boolean({
        description: "DEVE ser true para aplicar mudanças. Sem confirm, retorna erro instruindo a usar feature_preview primeiro.",
        default: false
      }))
    }),
    async execute(_toolCallId, params) {
      if (!params.confirm) {
        return {
          content: [{
            type: "text",
            text: `⛔ **Merge bloqueado — confirmação necessária.**\n\nEste tool requer \`confirm: true\` para aplicar mudanças nos documentos do vault.\n\n**Fluxo correto:**\n1. Primeiro chame \`feature_preview("${params.slug}")\` para ver o que será alterado\n2. Mostre a prévia ao usuário e peça confirmação\n3. Se o usuário aprovar, chame \`feature_merge("${params.slug}", confirm: true)\`\n\nSe o usuário pedir ajustes, edite o \`04-merge-plan.md\` e repita o preview.`
          }],
          details: { status: "blocked", reason: "confirmation_required" }
        };
      }

      try {
        const result = applyMerge(params.slug);

        let summary = "✅ **Merge executado com sucesso!**\n\n";
        if (result.created.length > 0) {
          summary += `### 📄 Documentos criados (${result.created.length})\n${result.created.map(f => `  - \`${f}\``).join("\n")}\n\n`;
        }
        if (result.updated.length > 0) {
          summary += `### ✏️ Documentos atualizados (${result.updated.length})\n${result.updated.map(f => `  - \`${f}\``).join("\n")}\n\n`;
        }
        if (result.removed.length > 0) {
          summary += `### 🗑️ Documentos a remover (manual)\n${result.removed.map(f => `  - ${f}`).join("\n")}\n\n⚠️ Remoções não são automáticas por segurança. Remova manualmente.`;
        }

        summary += "\nPróximo passo: chamar \`feature_archive\` para arquivar esta feature.";

        return {
          content: [{ type: "text", text: summary }],
          details: result
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `❌ Erro no merge: ${e.message}` }],
          details: { status: "error" }
        };
      }
    }
  });

  // Ferramenta: feature_archive
  pi.registerTool({
    name: "feature_archive",
    label: "Archive Feature",
    description: "Move uma feature concluída de staging/ para .archive/ e cria _COMPLETED.md com o resumo.",
    parameters: Type.Object({
      slug: Type.String({
        description: "Slug completo da feature (ex: 'escalas-multi-jornada')"
      }),
      reference: Type.Optional(Type.String({
        description: "PR link, commit hash ou referência da implementação"
      }))
    }),
    async execute(_toolCallId, params) {
      try {
        const archiveDir = featureArchive(params.slug, params.reference || "");

        const reference = params.reference ? ` (ref: ${params.reference})` : "";

        return {
          content: [{
            type: "text",
            text: `✅ Feature arquivada: .archive/${params.slug}/${reference}\n\nArquivo criado: _COMPLETED.md com resumo\nÍndice atualizado: .archive/index.md\n\nA feature foi removida de staging/ e movida para o arquivo histórico.`
          }],
          details: { status: "archived", path: archiveDir }
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `❌ Erro: ${e.message}` }],
          details: { status: "error" }
        };
      }
    }
  });

  // Notifica que a extensão carregou
  pi.on("session_start", async (_event, ctx) => {
    // Silencioso — só registra as ferramentas
  });
}
