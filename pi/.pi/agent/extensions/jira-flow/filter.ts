/**
 * Filtro de issues do Jira.
 *
 * Converte ADF (Cloud) ou texto (DC) em markdown e descarta o que não é útil
 * para o refinamento: ids internos, self URLs, avatares, changelog, watchers,
 * contadores e campos vazios.
 *
 * PONTO ÚNICO DE TROCA: quando o projeto de referência chegar, ajuste apenas
 * `filterIssue()` (e, se preciso, `adfToMarkdown`). Nada mais depende do shape
 * cru do Jira.
 */

import type { JiraIssueRaw } from "./jira.ts";

export interface FilteredChild {
	key: string;
	summary: string;
	type: string;
	status: string;
	description: string;
}

export interface FilteredIssue {
	key: string;
	summary: string;
	type: string;
	typeId?: string;
	status: string;
	priority?: string;
	labels: string[];
	components: string[];
	fixVersions: string[];
	parent?: { key: string; summary: string };
	description: string;
	acceptanceCriteria: string;
	comments: string[];
	children: FilteredChild[];
	links: { relation: string; key: string; summary: string }[];
}

export interface FilterOptions {
	jiraUrl: string;
	acceptanceField?: string;
	children?: JiraIssueRaw[];
}

// ---------------------------------------------------------------------------
// ADF -> Markdown
// ---------------------------------------------------------------------------

interface AdfNode {
	type?: string;
	text?: string;
	content?: AdfNode[];
	attrs?: Record<string, any>;
	marks?: { type: string; attrs?: Record<string, any> }[];
}

function applyMarks(text: string, marks: AdfNode["marks"]): string {
	if (!text) return text;
	for (const mark of marks ?? []) {
		switch (mark.type) {
			case "strong":
				text = `**${text}**`;
				break;
			case "em":
				text = `*${text}*`;
				break;
			case "code":
				text = `\`${text}\``;
				break;
			case "strike":
				text = `~~${text}~~`;
				break;
			case "link": {
				const href = mark.attrs?.href;
				if (href) text = `[${text}](${href})`;
				break;
			}
			default:
				break;
		}
	}
	return text;
}

function indent(text: string, prefix: string): string {
	return text
		.split("\n")
		.map((line) => (line.trim() ? `${prefix}${line}` : line))
		.join("\n");
}

function renderNodes(nodes: AdfNode[] | undefined, separator = ""): string {
	if (!nodes || nodes.length === 0) return "";
	return nodes.map((node) => renderNode(node)).join(separator);
}

function renderList(node: AdfNode, ordered: boolean): string {
	const items = (node.content ?? []).filter((child) => child.type === "listItem");
	return (
		items
			.map((item, index) => {
				const marker = ordered ? `${index + 1}. ` : "- ";
				const body = renderNodes(item.content, "\n").trim();
				const indented = body
					.split("\n")
					.map((line, i) => (i === 0 ? line : `  ${line}`))
					.join("\n");
				return `${marker}${indented}`;
			})
			.join("\n") + "\n\n"
	);
}

function renderTable(node: AdfNode): string {
	const rows = (node.content ?? []).filter((child) => child.type === "tableRow");
	if (rows.length === 0) return "";
	const cellsOf = (row: AdfNode): string[] =>
		(row.content ?? [])
			.filter((cell) => cell.type === "tableCell" || cell.type === "tableHeader")
			.map((cell) => renderNodes(cell.content, " ").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim());

	const header = cellsOf(rows[0]!);
	const separator = header.map(() => "---");
	const body = rows.slice(1).map(cellsOf);

	return (
		[header, separator, ...body].map((cells) => `| ${cells.join(" | ")} |`).join("\n") + "\n\n"
	);
}

function renderNode(node: AdfNode): string {
	const attrs = node.attrs ?? {};
	switch (node.type) {
		case undefined:
			return "";
		case "doc":
			return renderNodes(node.content, "\n").trim() + "\n";
		case "text":
			return applyMarks(node.text ?? "", node.marks);
		case "hardBreak":
			return "\n";
		case "paragraph":
			return renderNodes(node.content, "") + "\n\n";
		case "heading": {
			const level = Math.min(Math.max(Number(attrs.level ?? 1), 1), 6);
			return `${"#".repeat(level)} ${renderNodes(node.content, "")}\n\n`;
		}
		case "bulletList":
			return renderList(node, false);
		case "orderedList":
			return renderList(node, true);
		case "listItem":
			return renderNodes(node.content, "\n");
		case "codeBlock": {
			const language = attrs.language ? String(attrs.language) : "";
			return `\`\`\`${language}\n${renderNodes(node.content, "")}\n\`\`\`\n\n`;
		}
		case "blockquote":
			return indent(renderNodes(node.content, "").trim(), "> ") + "\n\n";
		case "rule":
			return "---\n\n";
		case "mediaSingle":
		case "mediaGroup":
			return renderNodes(node.content, "");
		case "media":
		case "mediaInline": {
			const alt = attrs.alt ?? attrs.fileName ?? attrs.id;
			return `[imagem${alt ? `: ${alt}` : ""}]`;
		}
		case "mention":
			return `@${attrs.text ?? "usuário"}`;
		case "emoji":
			return String(attrs.text ?? "");
		case "status":
			return `\`[${attrs.text ?? ""}]\``;
		case "inlineCard":
		case "blockCard": {
			const url = attrs.url ?? "";
			return url ? `<${url}>` : "";
		}
		case "panel":
			return indent(renderNodes(node.content, "").trim(), "> ") + "\n\n";
		case "expand":
		case "nestedExpand":
			return renderNodes(node.content, "") + "\n\n";
		case "table":
			return renderTable(node);
		case "taskList":
			return (
				(node.content ?? [])
					.map((item) => {
						const state = item.attrs?.state === "DONE" ? "x" : " ";
						return `- [${state}] ${renderNodes(item.content, " ").trim()}`;
					})
					.join("\n") + "\n\n"
			);
		case "decisionList":
			return renderNodes(node.content, "\n") + "\n\n";
		case "decisionItem":
			return `- ${renderNodes(node.content, " ").trim()}\n`;
		case "date":
			return attrs.timestamp ? new Date(Number(attrs.timestamp)).toISOString().slice(0, 10) : "";
		case "placeholder":
			return `(${attrs.text ?? "..."})`;
		default:
			return renderNodes(node.content, "");
	}
}

export function adfToMarkdown(value: unknown): string {
	if (!value) return "";
	if (typeof value === "string") return value.trim();
	if (typeof value === "object" && (value as AdfNode).type) {
		return renderNode(value as AdfNode)
			.replace(/\n{3,}/g, "\n\n")
			.trim();
	}
	return "";
}

// ---------------------------------------------------------------------------
// Wiki markup (Jira Data Center) -> Markdown
// ---------------------------------------------------------------------------

/**
 * Converte Jira wiki markup para Markdown (Jira Data Center).
 * Portado de `prdb/extensions/prdb/jira_client.ts` (extractWikiText).
 *
 * Armadilhas conhecidas (resolvidas com placeholders):
 *   `h1.` -> `# ` viraria lista numerada
 *   `[texto|url]` -> `[texto](url)` perderia os colchetes
 *   `*texto*` -> `**texto**` viraria item de lista
 */
export function extractWikiText(text: string | null | undefined): string {
	if (!text) return "";

	const savedLinks: string[] = [];
	let out = text;

	// 1. Blocos
	out = out.replace(/\{code(?::[^}]*)?\}([\s\S]*?)\{code\}/g, "\n```\n$1\n```\n");
	out = out.replace(/\{noformat\}([\s\S]*?)\{noformat\}/g, "\n```\n$1\n```\n");
	out = out.replace(/\{quote\}([\s\S]*?)\{quote\}/g, "\n> $1\n");
	out = out.replace(/\{color:[^}]*\}([\s\S]*?)\{color\}/g, "$1");

	// 2. Headings (null char no espaço para não virar lista)
	out = out.replace(/h([1-6])\.\s/g, (_, n: string) => "#".repeat(parseInt(n, 10)) + "\x00");

	// 3. Links com texto -> placeholder numérico
	out = out.replace(/\[([^\|\]]+)\|([^\]]+)\]/g, (_: string, label: string, url: string) => {
		const idx = savedLinks.length;
		savedLinks.push(`[${label}](${url})`);
		return `\x00L${idx}\x00`;
	});

	// 4. Monospace
	out = out.replace(/\{\{([^}]+)\}\}/g, "`$1`");

	// 5. Listas (antes do bold; só no início da linha)
	out = out.replace(/^\*\s/gm, "- ");
	out = out.replace(/^#\s/gm, "1. ");

	// 6. Bold
	out = out.replace(/\*([^*]+)\*/g, "**$1**");

	// 7. Itálico
	out = out.replace(/\b_([^_]+)_\b/g, "*$1*");

	// 8. Links simples
	out = out.replace(/\[([^\]]+)\]/g, "$1");

	// 9. Restaura placeholders
	out = out.replace(/#\x00/g, "# ");
	out = out.replace(/\x00L(\d+)\x00/g, (_: string, idx: string) => savedLinks[parseInt(idx, 10)] ?? "");

	// 10. Separadores
	out = out.replace(/----/g, "---");

	// 11. Limpeza final
	out = out.replace(/![^!\n]+!/g, "[imagem]");
	out = out.replace(/<[^>]+>/g, "");
	out = out.replace(/\n{3,}/g, "\n\n");

	return out.trim();
}

/**
 * Despacha a conversão conforme o dialeto do Jira:
 *   string -> wiki markup (Data Center) · objeto -> ADF (Cloud)
 */
export function markupToMarkdown(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "string") return extractWikiText(value);
	return adfToMarkdown(value);
}

// ---------------------------------------------------------------------------
// Limpeza de descrição e comentários
// Portado de `prdb/extensions/prdb/issue_parser.ts`.
// ---------------------------------------------------------------------------

const GREETING_PATTERNS = [
	/^(olá[,.!\s]*|oi[,.!\s]*|bom dia[,.!\s]*|boa tarde[,.!\s]*|boa noite[,.!\s]*)/i,
];

const FORMALITY_PATTERNS = [
	/(atenciosamente[,.!\s]*|obrigad[oa][,.!\s]*|grato[,.!\s]*|abs[,.!\s]*|abraç[oa]s?[,.!\s]*)$/im,
];

const STACKTRACE_PATTERNS = [
	/^\s+at\s+/m,
	/^Caused by:/m,
	/^\s+\.\.\.\s\d+\s+more$/m,
	/^Exception in thread/m,
	/^\s+at\s+\w+/m,
	/^\s+\[internal\]/m,
	/^Traceback\s/m,
	/^\s+File\s+"[^"]+",\s+line\s+\d+/m,
	/^[\w.]+Exception/m,
	/^[\w.]+Error/m,
];

const LOG_PATTERNS = [
	/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[.,]\d{3}\s+(ERROR|WARN|INFO|DEBUG|TRACE)/m,
	/^\[(ERROR|WARN|INFO|DEBUG|TRACE)\]/m,
	/^\w+\s+\|\s+(ERROR|WARN|INFO)\s+\|/m,
];

function removeStacktraces(text: string): string {
	const lines = text.split("\n");
	const result: string[] = [];
	let stackLines = 0;
	const stackBuffer: string[] = [];

	const flush = () => {
		if (stackLines > 0) {
			if (stackLines >= 3) result.push("[stacktrace removido]");
			else result.push(...stackBuffer);
			stackBuffer.length = 0;
			stackLines = 0;
		}
	};

	for (const line of lines) {
		if (STACKTRACE_PATTERNS.some((pattern) => pattern.test(line))) {
			stackBuffer.push(line);
			stackLines++;
		} else {
			flush();
			result.push(line);
		}
	}
	flush();

	return result.join("\n");
}

function removeLogBlocks(text: string): string {
	const lines = text.split("\n");
	const result: string[] = [];
	let logBuffer: string[] = [];

	const flush = () => {
		if (logBuffer.length > 3) result.push("[logs removidos]");
		else if (logBuffer.length > 0) result.push(...logBuffer);
		logBuffer = [];
	};

	for (const line of lines) {
		const isLogLine =
			LOG_PATTERNS.some((pattern) => pattern.test(line)) ||
			/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(line);
		if (isLogLine) logBuffer.push(line);
		else {
			flush();
			result.push(line);
		}
	}
	flush();

	return result.join("\n");
}

function removeLargeCodeBlocks(text: string): string {
	return text.replace(/```[\s\S]*?```/g, (match) => {
		const innerLines = match.split("\n").length - 2;
		return innerLines > 5 ? `\`\`\`\n[código omitido: ${innerLines} linhas]\n\`\`\`` : match;
	});
}

function removeGreetings(text: string): string {
	let result = text.trim();

	const firstLine = result.split("\n")[0]?.trim() ?? "";
	for (const greeting of GREETING_PATTERNS) {
		if (greeting.test(firstLine) && firstLine.length < 80) {
			result = result.slice(result.indexOf("\n") + 1).trim();
			break;
		}
	}

	const lines = result.split("\n");
	for (let i = lines.length - 1; i >= Math.max(0, lines.length - 2); i--) {
		const line = lines[i]?.trim() ?? "";
		for (const formality of FORMALITY_PATTERNS) {
			if (formality.test(line) && line.length < 80) {
				lines.splice(i, 1);
				break;
			}
		}
	}

	return lines.join("\n").trim();
}

/** Remove stacktraces, logs, blocos de código longos e saudações/formalidades. */
export function cleanDescription(raw: string): string {
	let text = raw;
	text = removeStacktraces(text);
	text = removeLogBlocks(text);
	text = removeLargeCodeBlocks(text);
	text = removeGreetings(text);
	text = text.replace(/\n{3,}/g, "\n\n").trim();
	return text;
}

const COMMENT_MAX_CHARS = 1500;

/** Descarta comentários sem densidade de informação. */
function isCommentRelevant(body: string): boolean {
	const text = body.trim();
	if (!text || text.length < 20) return false;

	const withoutEmoji = text.replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "");
	if (withoutEmoji.trim().length < 10) return false;

	const normalized = text.toLowerCase().replace(/[.!,\s]+$/, "");
	if (
		/^(ok|feito|concluído|concluido|obrigado|obrigada|vlw|👍|👎|✅|❌|🚀|🙏|\+1|-1|testado|verificado)$/.test(
			normalized,
		)
	) {
		return false;
	}

	return true;
}

function filterComments(bodies: string[]): string[] {
	return bodies.filter(isCommentRelevant).slice(0, 10);
}

// ---------------------------------------------------------------------------
// Filtro
// ---------------------------------------------------------------------------

function names(list: unknown, key = "name"): string[] {
	if (!Array.isArray(list)) return [];
	return list
		.map((item) => (item && typeof item === "object" ? String((item as any)[key] ?? "") : ""))
		.filter(Boolean);
}

function childFromRaw(issue: JiraIssueRaw): FilteredChild {
	const fields = issue.fields ?? {};
	return {
		key: issue.key,
		summary: String(fields.summary ?? ""),
		type: String(fields.issuetype?.name ?? ""),
		status: String(fields.status?.name ?? ""),
		description: cleanDescription(markupToMarkdown(fields.description)),
	};
}

export function filterIssue(raw: JiraIssueRaw, options: FilterOptions): FilteredIssue {
	const fields = raw.fields ?? {};

	const acceptanceRaw = options.acceptanceField ? fields[options.acceptanceField] : undefined;

	const comments = Array.isArray(fields.comment?.comments)
		? filterComments(
				(fields.comment.comments as any[]).map((comment) =>
					cleanDescription(markupToMarkdown(comment?.body)),
				),
			)
		: [];

	const links = Array.isArray(fields.issuelinks)
		? (fields.issuelinks as any[])
				.flatMap((link) => {
					const type = String(link?.type?.name ?? "relacionado");
					const entries: { relation: string; key: string; summary: string }[] = [];
					if (link?.outwardIssue) {
						entries.push({
							relation: String(link.type?.outward ?? type),
							key: String(link.outwardIssue.key ?? ""),
							summary: String(link.outwardIssue.fields?.summary ?? ""),
						});
					}
					if (link?.inwardIssue) {
						entries.push({
							relation: String(link.type?.inward ?? type),
							key: String(link.inwardIssue.key ?? ""),
							summary: String(link.inwardIssue.fields?.summary ?? ""),
						});
					}
					return entries.filter((entry) => entry.key);
				})
				.slice(0, 30)
		: [];

	const children: FilteredChild[] = [];
	const seen = new Set<string>();
	for (const child of options.children ?? []) {
		if (!child?.key || child.key === raw.key || seen.has(child.key)) continue;
		seen.add(child.key);
		children.push(childFromRaw(child));
	}
	for (const subtask of (fields.subtasks ?? []) as any[]) {
		const key = String(subtask?.key ?? "");
		if (!key || seen.has(key)) continue;
		seen.add(key);
		children.push({
			key,
			summary: String(subtask.fields?.summary ?? ""),
			type: String(subtask.fields?.issuetype?.name ?? "Subtarefa"),
			status: String(subtask.fields?.status?.name ?? ""),
			description: "",
		});
	}

	const parent = fields.parent
		? { key: String(fields.parent.key ?? ""), summary: String(fields.parent.fields?.summary ?? "") }
		: undefined;

	return {
		key: raw.key,
		summary: String(fields.summary ?? ""),
		type: String(fields.issuetype?.name ?? ""),
		typeId: fields.issuetype?.id ? String(fields.issuetype.id) : undefined,
		status: String(fields.status?.name ?? ""),
		priority: fields.priority?.name ? String(fields.priority.name) : undefined,
		labels: Array.isArray(fields.labels)
			? fields.labels.map((label: unknown) => String(label)).filter(Boolean)
			: [],
		components: names(fields.components),
		fixVersions: names(fields.fixVersions),
		parent: parent?.key ? parent : undefined,
		description: cleanDescription(markupToMarkdown(fields.description)),
		acceptanceCriteria: cleanDescription(markupToMarkdown(acceptanceRaw)),
		comments,
		children,
		links,
	};
}

export function filteredToMarkdown(issue: FilteredIssue, jiraUrl: string): string {
	const lines: string[] = [];
	lines.push(`# ${issue.key} — ${issue.summary}`);
	lines.push("");
	lines.push(`- **Tipo:** ${issue.type || "—"}`);
	lines.push(`- **Status:** ${issue.status || "—"}`);
	if (issue.priority) lines.push(`- **Prioridade:** ${issue.priority}`);
	if (issue.labels.length) lines.push(`- **Labels:** ${issue.labels.join(", ")}`);
	if (issue.components.length) lines.push(`- **Componentes:** ${issue.components.join(", ")}`);
	if (issue.fixVersions.length) lines.push(`- **Fix versions:** ${issue.fixVersions.join(", ")}`);
	if (issue.parent) lines.push(`- **Pai:** ${issue.parent.key} — ${issue.parent.summary}`);
	lines.push(`- **URL:** ${jiraUrl}/browse/${issue.key}`);
	lines.push("");

	if (issue.description) {
		lines.push("## Descrição");
		lines.push("");
		lines.push(issue.description);
		lines.push("");
	}

	if (issue.acceptanceCriteria) {
		lines.push("## Critérios de aceite (campo do Jira)");
		lines.push("");
		lines.push(issue.acceptanceCriteria);
		lines.push("");
	}

	if (issue.children.length) {
		lines.push("## Issues já existentes sob o epic");
		lines.push("");
		for (const child of issue.children) {
			lines.push(`### ${child.key} — ${child.summary}`);
			lines.push(`- **Tipo:** ${child.type || "—"} · **Status:** ${child.status || "—"}`);
			if (child.description) {
				lines.push("");
				lines.push(child.description);
			}
			lines.push("");
		}
	}

	if (issue.comments.length) {
		lines.push("## Comentários");
		lines.push("");
		for (const comment of issue.comments) {
			lines.push(
				comment.length > COMMENT_MAX_CHARS ? `${comment.slice(0, COMMENT_MAX_CHARS)}…` : comment,
			);
			lines.push("");
			lines.push("---");
			lines.push("");
		}
	}

	if (issue.links.length) {
		lines.push("## Itens vinculados");
		lines.push("");
		for (const link of issue.links) {
			lines.push(`- **${link.relation}:** ${link.key} — ${link.summary}`);
		}
		lines.push("");
	}

	return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
