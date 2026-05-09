import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const JIRA_URL = process.env.JIRA_URL || "";
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN || "";

// User-Agent de navegador real — necessário para bypass do Cloudflare no Jira Data Center
const BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function authHeader(): string {
  // Jira Data Center 8.x usa Bearer token (Personal Access Token)
  return `Bearer ${JIRA_API_TOKEN}`;
}

function checkConfig(): string | null {
  if (!JIRA_URL) return "JIRA_URL não definida. Adicione 'export JIRA_URL=\"https://jiraproducao.totvs.com.br\"' ao ~/.bashrc";
  if (!JIRA_API_TOKEN) return "JIRA_API_TOKEN não definida. Gere um Personal Access Token no Jira (Perfil → Personal Access Tokens) e adicione ao ~/.bashrc";
  return null;
}

// Converte Jira wiki markup para texto plano (Jira Data Center usa wiki, não ADF)
function extractWikiText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/\{code(?::[^}]*)?\}([\s\S]*?)\{code\}/g, "\n```\n$1\n```\n")
    .replace(/\{noformat\}([\s\S]*?)\{noformat\}/g, "\n```\n$1\n```\n")
    .replace(/\{quote\}([\s\S]*?)\{quote\}/g, "\n> $1\n")
    .replace(/\{color:[^}]*\}([\s\S]*?)\{color\}/g, "$1")
    .replace(/h([1-6])\.\s/g, (_, n) => "#".repeat(parseInt(n)) + " ")
    .replace(/\*\s/g, "- ")
    .replace(/#\s/g, "1. ")
    .replace(/\[([^\|\]]+)\|([^\]]+)\]/g, "[$1]($2)")
    .replace(/\[([^\]]+)\]/g, "$1")
    .replace(/\{\{([^}]+)\}\}/g, "`$1`")
    .replace(/\*([^*]+)\*/g, "**$1**")
    .replace(/\b_([^_]+)_\b/g, "*$1*")
    .replace(/----/g, "---")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function jiraGet(path: string): Promise<any> {
  const url = `${JIRA_URL}/rest/api/2/${path}`;
  const resp = await fetch(url, {
    headers: {
      "Authorization": authHeader(),
      "Accept": "application/json",
      "User-Agent": BROWSER_UA,
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Jira ${resp.status}: ${body.slice(0, 300)}`);
  }
  return resp.json();
}

function formatIssue(issue: any): string {
  const fields = issue.fields || {};
  const description = extractWikiText(fields.description);
  const summary = fields.summary || "(sem título)";
  const key = issue.key;
  const issuetype = fields.issuetype?.name || "?";
  const status = fields.status?.name || "?";
  const priority = fields.priority?.name || "?";
  const labels = (fields.labels || []).join(", ") || "(nenhuma)";
  const components = (fields.components || []).map((c: any) => c.name).join(", ") || "(nenhum)";
  const assignee = fields.assignee?.displayName || "não atribuído";
  const reporter = fields.reporter?.displayName || "?";

  let out = "";
  out += `## ${key}: ${summary}\n\n`;
  out += `| Campo | Valor |\n|---|---|\n`;
  out += `| Tipo | ${issuetype} |\n`;
  out += `| Status | ${status} |\n`;
  out += `| Prioridade | ${priority} |\n`;
  out += `| Labels | ${labels} |\n`;
  out += `| Componentes | ${components} |\n`;
  out += `| Assignee | ${assignee} |\n`;
  out += `| Reporter | ${reporter} |\n`;
  out += `| Link | ${JIRA_URL}/browse/${key} |\n`;

  if (description) {
    out += `\n### Descrição\n\n${description}\n`;
  }

  // Custom fields — acceptance criteria
  const acField = findAcceptanceCriteria(fields);
  if (acField) {
    out += `\n### Critérios de Aceitação\n\n${acField}\n`;
  }

  return out;
}

function findAcceptanceCriteria(fields: any): string | null {
  // Tenta campos comuns de critério de aceitação
  const candidates = [
    "customfield_10006",
    "customfield_10007",
    "customfield_10100",
    "customfield_10010",
  ];
  for (const cf of candidates) {
    const val = fields[cf];
    if (val) {
      if (typeof val === "string") return extractWikiText(val);
      if (val.content) return extractWikiText(val);
    }
  }

  // Varre todos os customfields procurando por "critério" no nome
  for (const [key, value] of Object.entries(fields)) {
    if (key.startsWith("customfield_") && value && typeof value === "string" && value.length > 10) {
      return value;
    }
  }

  return null;
}

function formatIssueListItem(issue: any): string {
  const fields = issue.fields || {};
  return `- [${issue.key}](${JIRA_URL}/browse/${issue.key}) **${fields.issuetype?.name || "?"}** ${fields.status?.name || "?"} — ${fields.summary || ""}`;
}

export default function (pi: ExtensionAPI) {

  pi.registerTool({
    name: "jira_fetch_issue",
    label: "Fetch Jira Issue",
    description: "Busca uma issue do Jira por key (ex: WVC-1234). Retorna título, descrição, tipo, status, labels, componentes, assignee, e critérios de aceitação (se disponíveis). Use como fonte primária para preencher os documentos de staging (01-04).",
    parameters: Type.Object({
      key: Type.String({ description: "Key da issue no Jira, ex: 'WVC-1234'" }),
    }),
    async execute(_toolCallId, params) {
      const err = checkConfig();
      if (err) return { content: [{ type: "text", text: `❌ ${err}` }], details: { status: "error" } };

      try {
        const issue = await jiraGet(`issue/${params.key}`);
        const text = formatIssue(issue);

        return {
          content: [{ type: "text", text }],
          details: {
            key: issue.key,
            summary: issue.fields?.summary,
            issuetype: issue.fields?.issuetype?.name,
            status: issue.fields?.status?.name,
            labels: issue.fields?.labels || [],
            components: (issue.fields?.components || []).map((c: any) => c.name),
          },
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `❌ Erro ao buscar ${params.key}: ${e.message}` }],
          details: { status: "error", key: params.key },
        };
      }
    },
  });

  pi.registerTool({
    name: "jira_search",
    label: "Search Jira Issues",
    description: "Busca issues no Jira usando JQL. Use para listar issues pendentes, encontrar issues por label/componente, ou descobrir o backlog.",
    parameters: Type.Object({
      jql: Type.String({ description: "JQL query, ex: 'project=WVC AND status=\"To Do\" ORDER BY priority DESC'" }),
      maxResults: Type.Optional(Type.Number({ description: "Máximo de resultados (default: 10)", default: 10 })),
    }),
    async execute(_toolCallId, params) {
      const err = checkConfig();
      if (err) return { content: [{ type: "text", text: `❌ ${err}` }], details: { status: "error" } };

      try {
        const max = params.maxResults || 10;
        const data = await jiraGet(`search?jql=${encodeURIComponent(params.jql)}&maxResults=${max}&fields=summary,issuetype,status,priority`);
        const issues = data.issues || [];

        if (issues.length === 0) {
          return {
            content: [{ type: "text", text: `Nenhuma issue encontrada para: \`${params.jql}\`` }],
            details: { total: 0 },
          };
        }

        let out = `### ${issues.length} issue(s) encontrada(s)\n\n`;
        out += `JQL: \`${params.jql}\`\n\n`;
        for (const issue of issues) {
          out += formatIssueListItem(issue) + "\n";
        }
        out += `\nUse \`jira_fetch_issue\` para ver detalhes completos de uma issue específica.`;

        return {
          content: [{ type: "text", text: out }],
          details: { total: issues.length, jql: params.jql },
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `❌ Erro na busca: ${e.message}` }],
          details: { status: "error" },
        };
      }
    },
  });

}
