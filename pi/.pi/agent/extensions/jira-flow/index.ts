/**
 * jira-flow — fluxo de refinamento de epic do Jira.
 *
 * Fluxo:
 *   /refinar-issue <KEY>
 *     -> harness lê secrets, busca a issue no Jira (REST) e seus filhos
 *     -> filtra o payload (ADF/texto -> markdown, descarta ruído)
 *     -> cria a pasta de trabalho e grava jira-source.md
 *     -> mostra resumo e pede confirmação
 *     -> dispara o turno do LLM com o conteúdo filtrado + instruções internas
 *     -> o LLM entrega o resultado via tool `emit_epic_artifacts`
 *     -> o harness grava epic.md, index.md e tasks/*.md
 *
 * O push de volta ao Jira (criar issues) fica para uma etapa futura.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
	CONFIG_DIR_NAME,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { materializeArtifacts } from "./artifacts.ts";
import { filterIssue, filteredToMarkdown } from "./filter.ts";
import { JiraClient, JiraError } from "./jira.ts";
import { inferDeployment, loadSecrets, normalizeBaseUrl, saveSecrets, type JiraSecrets } from "./secrets.ts";

const STATUS_KEY = "jira-flow";
const KEY_PATTERN = /^[A-Z][A-Z0-9_]*-\d+$/;

interface PendingRefinement {
	key: string;
	dir: string;
}

let pending: PendingRefinement | null = null;
let emitToolRegistered = false;

// ---------------------------------------------------------------------------
// Resolução de caminhos
// ---------------------------------------------------------------------------

function moduleDir(): string | undefined {
	try {
		if (typeof __dirname === "string" && __dirname) return __dirname;
	} catch {
		// ignora
	}
	try {
		return path.dirname(fileURLToPath(import.meta.url));
	} catch {
		return undefined;
	}
}

function resolveExtensionDir(): string {
	const candidates: string[] = [];
	const envDir = process.env.PI_JIRA_FLOW_DIR;
	if (envDir) candidates.push(envDir);

	const local = moduleDir();
	if (local) candidates.push(local);

	try {
		candidates.push(path.join(getAgentDir(), "extensions", "jira-flow"));
	} catch {
		// ignora
	}
	candidates.push(path.join(process.cwd(), CONFIG_DIR_NAME, "extensions", "jira-flow"));

	for (const candidate of candidates) {
		if (fs.existsSync(path.join(candidate, "templates", "epic.md"))) return candidate;
	}
	return candidates[0] ?? process.cwd();
}

const EXT_DIR = resolveExtensionDir();
const TEMPLATES_DIR = path.join(EXT_DIR, "templates");
const INSTRUCTIONS_FILE = path.join(EXT_DIR, "instructions", "epic-refinement.md");

function readInstructions(): string {
	if (!fs.existsSync(INSTRUCTIONS_FILE)) {
		throw new Error(`Instruções internas não encontradas em ${INSTRUCTIONS_FILE}`);
	}
	return fs.readFileSync(INSTRUCTIONS_FILE, "utf8");
}

function clearStatus(ctx: ExtensionContext): void {
	try {
		ctx.ui.setStatus(STATUS_KEY, undefined);
	} catch {
		// ignora
	}
}

function projectKeyOf(issueKey: string): string {
	const dash = issueKey.indexOf("-");
	return dash > 0 ? issueKey.slice(0, dash) : issueKey;
}

// ---------------------------------------------------------------------------
// Diretório de epics
// ---------------------------------------------------------------------------

/**
 * Diretório padrão dos artefatos: `~/epics`, para centralizar tudo num lugar só
 * (independente do repo em que o pi estiver rodando).
 * Sobrescrevível por `epicsDir` no secrets.json ou pela env EPICS_DIR.
 */
function defaultEpicsDir(): string {
	return path.join(os.homedir(), "epics");
}

async function resolveEpicsDir(
	configured: string | undefined,
	cwd: string,
	ctx: ExtensionContext,
): Promise<{ dir: string; warning?: string }> {
	const fallback = defaultEpicsDir();

	if (!configured || !configured.trim()) {
		return { dir: fallback };
	}

	const candidate = path.isAbsolute(configured) ? configured : path.resolve(cwd, configured);
	try {
		await fs.promises.mkdir(candidate, { recursive: true });
		await fs.promises.access(candidate, fs.constants.W_OK);
		return { dir: candidate };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(
			`EPICS_DIR "${candidate}" inacessível (${message}). Usando fallback: ${fallback}`,
			"warning",
		);
		return { dir: fallback, warning: message };
	}
}

// ---------------------------------------------------------------------------
// Tool de entrega dos artefatos
// ---------------------------------------------------------------------------

const EmitTaskSchema = Type.Object({
	id: Type.String({ description: "ID local estável, ex.: TASK-01" }),
	title: Type.String(),
	wave: Type.Integer({ minimum: 1, description: "Onda de execução (1, 2, 3...)" }),
	dependsOn: Type.Optional(Type.Array(Type.String(), { description: "IDs das tarefas predecessoras" })),
	estimate: Type.Optional(Type.String({ description: "S | M | L ou horas" })),
	objective: Type.Optional(Type.String()),
	context: Type.Optional(Type.String()),
	acceptanceCriteria: Type.Optional(
		Type.Array(Type.String(), { description: "Cada item no formato Dado/Quando/Então" }),
	),
	technicalNotes: Type.Optional(Type.String()),
	affectedAreas: Type.Optional(Type.String()),
	tests: Type.Optional(Type.String()),
	outOfScope: Type.Optional(Type.String()),
	risks: Type.Optional(Type.String()),
	labels: Type.Optional(Type.Array(Type.String())),
	type: Type.Optional(Type.String({ description: "Task | Story | Bug" })),
	storyPoints: Type.Optional(Type.Number()),
});

const EmitSchema = Type.Object({
	epic: Type.Object({
		key: Type.String(),
		summary: Type.String(),
		objective: Type.Optional(Type.String()),
		context: Type.Optional(Type.String()),
		successCriteria: Type.Optional(Type.String()),
		analysis: Type.Optional(Type.String()),
		outOfScope: Type.Optional(Type.String()),
		openQuestions: Type.Optional(Type.String()),
		labels: Type.Optional(Type.Array(Type.String())),
	}),
	tasks: Type.Array(EmitTaskSchema, { description: "Tarefas da quebra, em qualquer ordem" }),
});

type EmitParams = Static<typeof EmitSchema>;

function ensureEmitTool(pi: ExtensionAPI): void {
	if (emitToolRegistered) return;
	emitToolRegistered = true;

	pi.registerTool({
		name: "emit_epic_artifacts",
		label: "Gravar artefatos do epic",
		description:
			"Ferramenta interna do fluxo /refinar-issue. Entrega a análise do epic e a lista de tarefas para o harness gravar epic.md, index.md e tasks/*.md. Só chame quando o fluxo /refinar-issue estiver ativo e você já tiver validado a quebra com o usuário.",
		parameters: EmitSchema,
		async execute(_toolCallId, params: EmitParams) {
			if (!pending) {
				return {
					content: [
						{
							type: "text" as const,
							text: "Nenhum refinamento ativo. Inicie com /refinar-issue <KEY>.",
						},
					],
					isError: true,
				};
			}

			const target = pending;
			try {
				const result = await materializeArtifacts({
					dir: target.dir,
					templatesDir: TEMPLATES_DIR,
					epic: params.epic,
					tasks: params.tasks,
					meta: {
						jiraKey: target.key,
						project: projectKeyOf(target.key),
						jiraUrl: jiraBase,
						syncedAt: new Date().toISOString(),
					},
				});
				pending = null;
				const list = result.files.map((file) => `- ${file}`).join("\n");
				return {
					content: [
						{
							type: "text" as const,
							text: `Artefatos gravados em ${result.dir}\n${list}`,
						},
					],
					details: result,
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text" as const, text: `Falha ao gravar artefatos: ${message}` }],
					isError: true,
				};
			}
		},
	});
}

// A URL base do Jira é conhecida no momento do pull; guardamos para o emit.
let jiraBase = "";

// ---------------------------------------------------------------------------
// Setup assistido (/refinar-issue --setup)
// ---------------------------------------------------------------------------

async function runSetup(ctx: ExtensionCommandContext): Promise<void> {
	const existing = loadSecrets();
	const defaultUrl = existing.secrets?.url ?? "https://jiraproducao.totvs.com.br";

	const urlInput = await ctx.ui.input("URL base do Jira", defaultUrl);
	if (!urlInput?.trim()) {
		ctx.ui.notify("Setup cancelado.", "info");
		return;
	}
	const url = normalizeBaseUrl(urlInput.trim());
	const deployment = inferDeployment(url);

	const tokenInput = await ctx.ui.input(
		deployment === "cloud" ? "API token do Jira Cloud" : "Personal Access Token (PAT) do Jira",
		"cole o token aqui",
	);
	if (!tokenInput?.trim()) {
		ctx.ui.notify("Setup cancelado.", "info");
		return;
	}
	const token = tokenInput.trim();

	let email: string | undefined;
	if (deployment === "cloud") {
		email = (await ctx.ui.input("E-mail da conta Atlassian", existing.secrets?.email ?? ""))?.trim();
		if (!email) {
			ctx.ui.notify("Setup cancelado: Jira Cloud exige e-mail.", "warning");
			return;
		}
	}

	const candidate: JiraSecrets = {
		url,
		deployment,
		email,
		personalToken: deployment === "dc" ? token : undefined,
		apiToken: deployment === "cloud" ? token : undefined,
	};

	ctx.ui.setStatus(STATUS_KEY, `Testando credenciais em ${url}...`);
	try {
		const me = await new JiraClient(candidate).whoami(ctx.signal);
		const file = saveSecrets({
			url,
			deployment,
			email,
			personalToken: candidate.personalToken,
			apiToken: candidate.apiToken,
			epicsDir: existing.secrets?.epicsDir,
		});
		clearStatus(ctx);
		ctx.ui.notify(
			`Jira OK: ${me.name} · ${me.url} (API ${me.deployment === "cloud" ? "v3" : "v2"}).\nCredenciais salvas em ${file} (0600).`,
			"info",
		);
	} catch (error) {
		clearStatus(ctx);
		const message = error instanceof JiraError ? error.message : String(error);
		ctx.ui.notify(`Falha ao validar as credenciais — nada foi salvo.\n${message}`, "error");
	}
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
	ensureEmitTool(pi);

	pi.registerCommand("refinar-issue", {
		description: "Puxa um epic do Jira, filtra o conteúdo e inicia o refinamento local (ex.: /refinar-issue PROJ-123)",
		getArgumentCompletions: (prefix: string) => {
			try {
				const loaded = loadSecrets();
				const base = loaded.secrets?.epicsDir;
				const dir = base && base.trim() ? base : defaultEpicsDir();
				if (!fs.existsSync(dir)) return null;
				const items = fs
					.readdirSync(dir, { withFileTypes: true })
					.filter((entry) => entry.isDirectory())
					.map((entry) => ({ value: entry.name, label: entry.name }))
					.filter((item) => item.value.toUpperCase().startsWith(prefix.toUpperCase()));
				return items.length > 0 ? items : null;
			} catch {
				return null;
			}
		},
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const rawArgs = (args ?? "").trim();

			if (/(^|\s)--setup(\s|$)/.test(rawArgs)) {
				await runSetup(ctx);
				return;
			}

			const force = /(^|\s)--force(\s|$)/.test(rawArgs);
			const key = rawArgs.replace(/--force/g, "").trim().toUpperCase();

			if (!key) {
				ctx.ui.notify(
					"Uso: /refinar-issue <KEY> [--force]  ·  /refinar-issue --setup  (ex.: /refinar-issue PROJ-123)",
					"error",
				);
				return;
			}
			if (!KEY_PATTERN.test(key)) {
				ctx.ui.notify(`"${key}" não parece uma key do Jira (ex.: PROJ-123).`, "error");
				return;
			}

			const loaded = loadSecrets();
			if (!loaded.secrets) {
				ctx.ui.notify(
					`Credenciais do Jira incompletas (fonte: ${loaded.source}):\n${loaded.errors.join("\n")}\n\nRode /refinar-issue --setup para configurar.`,
					"error",
				);
				return;
			}
			const secrets: JiraSecrets = loaded.secrets;
			const client = new JiraClient(secrets);

			ctx.ui.setStatus(STATUS_KEY, `Buscando ${key} no Jira...`);
			let rawIssue;
			try {
				rawIssue = await client.getIssue(
					key,
					secrets.acceptanceField ? [secrets.acceptanceField] : [],
					ctx.signal,
				);
			} catch (error) {
				clearStatus(ctx);
				const message = error instanceof JiraError ? error.message : String(error);
				ctx.ui.notify(`Falha ao buscar ${key}: ${message}`, "error");
				return;
			}

			ctx.ui.setStatus(STATUS_KEY, `Buscando filhos de ${key}...`);
			let children: Awaited<ReturnType<JiraClient["getChildren"]>> = [];
			try {
				children = await client.getChildren(key, ctx.signal);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(
				`Aviso: não consegui buscar filhos de ${key} (${message}). Seguindo sem eles.`,
				"warning",
			);
			}

			ctx.ui.setStatus(STATUS_KEY, "Filtrando conteúdo...");
			const filtered = filterIssue(rawIssue, {
				jiraUrl: secrets.url,
				acceptanceField: secrets.acceptanceField,
				children,
			});

			const resolved = await resolveEpicsDir(secrets.epicsDir, ctx.cwd, ctx);
			const targetDir = path.join(resolved.dir, key);
			const targetExists = fs.existsSync(targetDir);

			if (targetExists && !force) {
				clearStatus(ctx);
				ctx.ui.notify(
					`Pasta já existe: ${targetDir}\nUse /refinar-issue ${key} --force para refazer o refinamento.`,
					"warning",
				);
				return;
			}

			const fetchedAt = new Date().toISOString();
			const sourceDoc = [
				"---",
				`jira_key: ${key}`,
				`jira_url: ${client.issueUrl(key)}`,
				`fetched_at: ${fetchedAt}`,
				"---",
				"",
				filteredToMarkdown(filtered, secrets.url),
			].join("\n");

			try {
				await fs.promises.mkdir(path.join(targetDir, "tasks"), { recursive: true });
				await fs.promises.writeFile(path.join(targetDir, "jira-source.md"), sourceDoc, "utf8");
			} catch (error) {
				clearStatus(ctx);
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Falha ao gravar em ${targetDir}: ${message}`, "error");
				return;
			}
			clearStatus(ctx);

			const summaryLines = [
				`Issue:    ${filtered.key} — ${filtered.summary}`,
				`Tipo:     ${filtered.type || "—"} · Status: ${filtered.status || "—"}`,
				`Filhos:   ${filtered.children.length} já existentes`,
				`Comentários: ${filtered.comments.length}`,
				`Pasta:    ${targetDir}`,
				targetExists && force ? "Modo:     --force (sobrescreve epic.md/index.md/tasks)" : "",
			].filter(Boolean);

			const ok = await ctx.ui.confirm(
				`Refinar ${filtered.key}?`,
				`${summaryLines.join("\n")}\n\njira-source.md foi gravado. Iniciar o refinamento?`,
			);
			if (!ok) {
				ctx.ui.notify(`Refinamento de ${key} abortado. jira-source.md mantido em ${targetDir}.`, "info");
				return;
			}

			ensureEmitTool(pi);
			pending = { key, dir: targetDir };
			jiraBase = secrets.url;

			const instructions = readInstructions();
			const message = [
				instructions,
				"",
				"---",
				"",
				`## Issue do Jira (${filtered.key}) — conteúdo filtrado`,
				"",
				filteredToMarkdown(filtered, secrets.url),
				"",
				"---",
				"",
				"## Pasta de trabalho",
				"",
				targetDir,
				"",
				"`jira-source.md` contém a fonte filtrada (não precisa reler). Finalize chamando `emit_epic_artifacts` exatamente uma vez.",
			].join("\n");

			const options = ctx.isIdle() ? undefined : ({ deliverAs: "followUp" } as const);
			pi.sendUserMessage(message, options);
		},
	});

	// O pull usa env/arquivo; ao descarregar, zera o estado em memória.
	pi.on("session_shutdown", async () => {
		pending = null;
	});
}
