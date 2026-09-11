/**
 * jira-flow — fluxo de refinamento de épico do Jira.
 *
 * Fluxo:
 *   /refinar-issue <KEY> [--force] [--repo <path>]
 *     -> harness lê secrets, busca a issue no Jira (REST) e seus filhos
 *     -> filtra o payload (ADF/texto -> markdown, descarta ruído)
 *     -> cria a pasta de trabalho e grava jira-source.md
 *     -> Fase 0: resolve produto/repos/especialistas no catálogo de produtos
 *     -> mostra resumo e pede confirmação
 *     -> dispara o turno da LLM com o conteúdo filtrado + contexto + instruções
 *     -> a LLM pergunta (`ask_user`), revisa o entendimento (`submit_analysis`),
 *        consulta o especialista (`consult_specialist`) e entrega via
 *        `emit_epic_artifacts`
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
import { filterIssue, filteredToMarkdown } from "./filter.ts";
import { JiraClient, JiraError } from "./jira.ts";
import { ProductsClient, ProductsError, type ProductContext } from "./products.ts";
import { inferDeployment, loadSecrets, normalizeBaseUrl, saveSecrets, type JiraSecrets } from "./secrets.ts";
import { startRefinement, stopRefinement } from "./state.ts";
import { registerFlowTools } from "./tools.ts";

const STATUS_KEY = "jira-flow";
const KEY_PATTERN = /^[A-Z][A-Z0-9_]*-\d+$/;
const REPO_FLAG_PATTERN = /--repo(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/;

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
const INSTRUCTIONS_DIR = path.join(EXT_DIR, "instructions");
const INSTRUCTION_FILES = ["epic-refinement.md", "tools.md", "quebra-padroes.md"];

function readInstructions(): string {
	const parts: string[] = [];
	for (const name of INSTRUCTION_FILES) {
		const file = path.join(INSTRUCTIONS_DIR, name);
		if (!fs.existsSync(file)) {
			if (name === "epic-refinement.md") {
				throw new Error(`Instruções internas não encontradas em ${file}`);
			}
			continue;
		}
		parts.push(fs.readFileSync(file, "utf8").trim());
	}
	return parts.join("\n\n---\n\n");
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
// Fase 0 — contexto de produto/repositório
// ---------------------------------------------------------------------------

interface ProductPhaseResult {
	productContext: ProductContext | null;
	products: ProductsClient | null;
	fallbackRepo: string | null;
	note: string | null;
	aborted: boolean;
}

function looksLikeRepo(dir: string): boolean {
	return fs.existsSync(path.join(dir, ".git")) || fs.existsSync(path.join(dir, ".hg"));
}

/**
 * Fonte primária é o catálogo de produtos. Quando ele não resolve (fora do ar,
 * não configurado ou lista vazia), cai para `--repo` -> `cwd` -> pergunta.
 */
async function runProductPhase(
	secrets: JiraSecrets,
	key: string,
	repoFlag: string | undefined,
	cwd: string,
	ctx: ExtensionContext,
): Promise<ProductPhaseResult> {
	let products: ProductsClient | null = null;
	let productContext: ProductContext | null = null;
	let note: string | null = null;

	if (secrets.products?.url) {
		products = new ProductsClient(secrets.products);
		ctx.ui.setStatus(STATUS_KEY, "Consultando catálogo de produtos...");
		try {
			productContext = await products.resolve(key, ctx.signal);
		} catch (error) {
			const message = error instanceof ProductsError ? error.message : String(error);
			note = `catálogo de produtos indisponível (${message})`;
			ctx.ui.notify(`Aviso: ${note}. Usando fallback de repositório.`, "warning");
		} finally {
			clearStatus(ctx);
		}
	} else {
		note = "catálogo de produtos não configurado (products.url ausente)";
	}

	let fallbackRepo: string | null = null;
	const repos = productContext?.repos ?? [];

	if (repos.length === 0) {
		if (repoFlag?.trim()) {
			fallbackRepo = path.resolve(cwd, repoFlag.trim());
		} else if (looksLikeRepo(cwd)) {
			fallbackRepo = cwd;
		} else {
			const answer = await ctx.ui.input("Repositório do código (deixe vazio para seguir sem repo)", cwd);
			if (answer === undefined) {
				return { productContext, products, fallbackRepo: null, note, aborted: true };
			}
			const trimmed = answer.trim();
			if (trimmed) {
				fallbackRepo = path.resolve(cwd, trimmed);
			} else {
				note = `${note ? `${note}; ` : ""}nenhum repositório informado`;
			}
		}
	}

	return { productContext, products, fallbackRepo, note, aborted: false };
}

function productContextMarkdown(phase: ProductPhaseResult): string {
	const lines = ["## Contexto do produto (Fase 0 — resolvido pelo harness)", ""];
	lines.push(
		phase.productContext
			? `- Produto: ${phase.productContext.product}`
			: "- Produto: não resolvido pelo catálogo",
	);

	const repos = phase.productContext?.repos ?? [];
	if (repos.length > 0) {
		lines.push("- Repositórios do produto:");
		for (const repo of repos) {
			const location = repo.path ?? repo.url ?? "";
			lines.push(`  - ${repo.name}${location ? ` — ${location}` : ""}`);
		}
		lines.push("  - Estratégia: investigue o repositório primário; os demais só quando necessário.");
	} else if (phase.fallbackRepo) {
		lines.push(`- Repositório (fallback): ${phase.fallbackRepo}`);
	} else {
		lines.push(
			"- Nenhum repositório disponível; investigue o que for possível e registre a lacuna em `duvidas`.",
		);
	}

	const specialists = phase.productContext?.specialists ?? [];
	if (specialists.length > 0) {
		const rendered = specialists
			.map((specialist) => (specialist.name ? `${specialist.name} (${specialist.id})` : specialist.id))
			.join(", ");
		lines.push(`- Especialistas: ${rendered}`);
	}

	if (phase.note) lines.push(`- Aviso: ${phase.note}`);
	return lines.join("\n");
}

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
	registerFlowTools(pi, { templatesDir: TEMPLATES_DIR });

	pi.registerCommand("refinar-issue", {
		description:
			"Puxa um épico do Jira, resolve produto/repos, filtra o conteúdo e inicia o refinamento local (ex.: /refinar-issue PROJ-123)",
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

			// Qualquer nova execução descarta o estado de um refinamento anterior.
			stopRefinement();

			const repoMatch = rawArgs.match(REPO_FLAG_PATTERN);
			const repoFlag = repoMatch ? repoMatch[1] ?? repoMatch[2] ?? repoMatch[3] : undefined;
			const cleaned = rawArgs.replace(REPO_FLAG_PATTERN, " ");
			const force = /(^|\s)--force(\s|$)/.test(cleaned);
			const key = cleaned.replace(/--force/g, "").trim().toUpperCase();

			if (!key) {
				ctx.ui.notify(
					"Uso: /refinar-issue <KEY> [--force] [--repo <path>]  ·  /refinar-issue --setup  (ex.: /refinar-issue PROJ-123)",
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

			// Fase 0 — produto/repos/especialistas (fonte primária + fallback).
			const phase = await runProductPhase(secrets, key, repoFlag, ctx.cwd, ctx);
			if (phase.aborted) {
				clearStatus(ctx);
				ctx.ui.notify(`Refinamento de ${key} cancelado.`, "info");
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

			const repos = phase.productContext?.repos ?? [];
			const repoLine = repos.length
				? `Repos:    ${repos.map((repo) => repo.name).join(", ")}`
				: phase.fallbackRepo
					? `Repo:     ${phase.fallbackRepo} (fallback)`
					: "Repo:     — (nenhum)";

			const summaryLines = [
				`Issue:    ${filtered.key} — ${filtered.summary}`,
				`Tipo:     ${filtered.type || "—"} · Status: ${filtered.status || "—"}`,
				`Filhos:   ${filtered.children.length} já existentes`,
				`Comentários: ${filtered.comments.length}`,
				phase.productContext ? `Produto:  ${phase.productContext.product}` : "",
				repoLine,
				phase.note ? `Aviso:    ${phase.note}` : "",
				`Pasta:    ${targetDir}`,
				targetExists && force ? "Modo:     --force (sobrescreve epic.md/index.md/tasks)" : "",
			].filter(Boolean);

			const ok = await ctx.ui.confirm(
				`Refinar ${filtered.key}?`,
				`${summaryLines.join("\n")}\n\njira-source.md será gravado. Iniciar o refinamento?`,
			);
			if (!ok) {
				ctx.ui.notify(`Refinamento de ${key} abortado.`, "info");
				return;
			}

			startRefinement({
				key,
				project: projectKeyOf(key),
				dir: targetDir,
				jiraUrl: secrets.url,
				productContext: phase.productContext,
				products: phase.products,
				fallbackRepo: phase.fallbackRepo,
				catalogNote: phase.note,
			});

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
				productContextMarkdown(phase),
				"",
				"---",
				"",
				"## Pasta de trabalho",
				"",
				targetDir,
				"",
				"`jira-source.md` contém a fonte filtrada (não precisa reler). Siga as fases acima e finalize chamando `emit_epic_artifacts` exatamente uma vez.",
			].join("\n");

			const options = ctx.isIdle() ? undefined : ({ deliverAs: "followUp" } as const);
			pi.sendUserMessage(message, options);
		},
	});

	// O pull usa env/arquivo; ao descarregar, zera o estado em memória.
	pi.on("session_shutdown", async () => {
		stopRefinement();
	});
}
