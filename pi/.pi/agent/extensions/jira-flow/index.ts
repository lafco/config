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
import { filterIssue, filteredToMarkdown, type FilteredChild, type FilteredIssue } from "./filter.ts";
import { JiraClient, JiraError } from "./jira.ts";
import { classifyIssueType, flowDescription, refinementShape, type IssueFlow } from "./issue-type.ts";
import { OpenSearchClient } from "./opensearch.ts";
import {
	findMcpbBin,
	loadProductsMap,
	McpbClient,
	McpbError,
	resolveProductFromMapDetailed,
	type McpbProductContext,
	type ProductSource,
} from "./mcpb.ts";
import { ProductsClient, ProductsError, type ProductContext } from "./products.ts";
import { inferDeployment, loadSecrets, normalizeBaseUrl, saveSecrets, type JiraSecrets } from "./secrets.ts";
import { loadLocalProducts, localProductContext } from "./local-products.ts";
import { startRefinement, stopRefinement } from "./state.ts";
import { registerFlowTools } from "./tools.ts";
import { loadValidationDefaults, validationDefaultsMarkdown } from "./validation-defaults.ts";

const STATUS_KEY = "jira-flow";
const KEY_PATTERN = /^[A-Z][A-Z0-9_]*-\d+$/;
const REPO_FLAG_PATTERN = /--repo(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/;
const PRODUCT_FLAG_PATTERN = /--product(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/;

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
const INSTRUCTION_FILES = ["epic-refinement.md", "tools.md", "quebra-padroes.md", "exemplos-quebra.md"];

/**
 * Artefatos que o harness grava. `--force` remove só estes: uma tarefa antiga
 * (formato plano) continuaria sendo lida pelo `epic-runner` ao lado das novas.
 */
const ARTIFACT_PATHS = ["epic.md", "story.md", "index.md", "tasks", "stories", "evidence", "review"];

async function clearArtifacts(dir: string): Promise<string[]> {
	const removed: string[] = [];
	for (const name of ARTIFACT_PATHS) {
		const target = path.join(dir, name);
		if (!fs.existsSync(target)) continue;
		try {
			await fs.promises.rm(target, { recursive: true, force: true });
			removed.push(name);
		} catch {
			// best effort: se não der para remover, a gravação sobrescreve o que der
		}
	}
	return removed;
}

function readInstructions(flow: IssueFlow): string {
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
	const flowFile = path.join(INSTRUCTIONS_DIR, "flows", `${flow}.md`);
	if (fs.existsSync(flowFile)) parts.push(fs.readFileSync(flowFile, "utf8").trim());
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
	mcpbContext: McpbProductContext | null;
	mcpbBin: string | null;
	/** Como o produto foi resolvido: flag, componente, projeto, label ou catálogo. */
	productSource: ProductSource | "flag" | "catalog" | null;
	/** Descrição do produto (mcpb ou registro local), para o prompt. */
	productDescription: string | null;
}

/** Rótulo legível da origem da resolução, para o resumo e a mensagem. */
function productSourceLabel(source: ProductPhaseResult["productSource"], matched?: string | null): string {
	switch (source) {
		case "flag":
			return "--product (explícito)";
		case "component":
			return `componente do Jira${matched ? ` (${matched})` : ""}`;
		case "project":
			return `projeto${matched ? ` (${matched})` : ""} — default do mapa, confirme`;
		case "label":
			return `label${matched ? ` (${matched})` : ""} — match fraco, confirme`;
		case "catalog":
			return "catálogo de produtos (HTTP)";
		default:
			return "não resolvido";
	}
}

/** Origem fraca (projeto/label): vale destacar no resumo antes de refinar. */
function isWeakProductSource(source: ProductPhaseResult["productSource"]): boolean {
	return source === "project" || source === "label";
}

function looksLikeRepo(dir: string): boolean {
	return fs.existsSync(path.join(dir, ".git")) || fs.existsSync(path.join(dir, ".hg"));
}

/**
 * Fase 0 — contexto do produto, em ordem de precedência:
 *   1. `--product <nome>` (explícito) + `mcpb context`;
 *   2. `products-map.json` (component -> project -> label) + `mcpb context`
 *      (produto, repos com paths locais, overview curado e frescura);
 *   3. catálogo HTTP de produtos (quando configurado e o mcpb não resolveu);
 *   4. `--repo` -> `cwd` (confirmado no TUI) -> pergunta.
 */
async function runProductPhase(
	secrets: JiraSecrets,
	key: string,
	issue: Pick<FilteredIssue, "components" | "labels">,
	repoFlag: string | undefined,
	productFlag: string | undefined,
	cwd: string,
	ctx: ExtensionContext,
): Promise<ProductPhaseResult> {
	let products: ProductsClient | null = null;
	let productContext: ProductContext | null = null;
	let mcpbContext: McpbProductContext | null = null;
	let mcpbBin: string | null = null;
	let productSource: ProductPhaseResult["productSource"] = null;
	let matchedValue: string | null = null;
	let productDescription: string | null = null;
	const notes: string[] = [];
	const appendNote = (message: string): void => {
		if (message && !notes.includes(message)) notes.push(message);
	};

	mcpbBin = findMcpbBin();
	const map = loadProductsMap(EXT_DIR);
	const localProducts = loadLocalProducts(EXT_DIR);

	const loadMcpbContext = async (product: string): Promise<void> => {
		if (!mcpbBin) {
			appendNote("CLI mcpb não encontrado (defina MCPB_BIN/MCPB_PATH)");
			return;
		}
		ctx.ui.setStatus(STATUS_KEY, `Consultando índice local (mcpb): ${product}...`);
		try {
			mcpbContext = await new McpbClient(mcpbBin).context(product, ctx.signal);
			productDescription = mcpbContext.description?.trim() || null;
			productContext = {
				product: mcpbContext.product,
				repos: mcpbContext.repos.flatMap((repo) =>
					repo.path ? [{ name: repo.name, path: repo.path }] : [],
				),
				specialists: [],
			};
		} catch (error) {
			const message = error instanceof McpbError ? error.message : String(error);
			appendNote(`mcpb indisponível para "${product}" (${message})`);
			ctx.ui.notify(`Aviso: ${message}. Usando fallback.`, "warning");
		} finally {
			clearStatus(ctx);
		}
	};

	/**
	 * Produto ainda não indexado no mcpb: o registro local (`products.json`)
	 * resolve os repos no checkout para a identificação não voltar a adivinhar.
	 */
	const applyLocalProductFallback = (product: string): boolean => {
		const local = localProductContext(product, localProducts, cwd);
		if (!local) return false;
		productContext = { product: local.product, repos: local.repos, specialists: [] };
		productDescription = local.description || null;
		appendNote(
			`produto "${product}" ainda não está no índice mcpb; repos resolvidos pelo registro local (products.json)`,
		);
		return true;
	};

	// 1. `--product` explícito vence o mapa.
	if (productFlag?.trim()) {
		matchedValue = productFlag.trim();
		await loadMcpbContext(matchedValue);
		if (productContext || applyLocalProductFallback(matchedValue)) productSource = "flag";
	}

	// 2. Mapa local (componente -> projeto -> label).
	if (!productContext) {
		const mapped = resolveProductFromMapDetailed(map, {
			project: projectKeyOf(key),
			components: issue.components,
			labels: issue.labels,
		});
		if (mapped?.product) {
			await loadMcpbContext(mapped.product);
			if (productContext || applyLocalProductFallback(mapped.product)) {
				productSource = mapped.source;
				matchedValue = mapped.matched;
			} else if (!mcpbBin) {
				// sem mcpb, ainda vale registrar a intenção do mapa
				productSource = mapped.source;
				matchedValue = mapped.matched;
			}
		} else if (mapped) {
			appendNote(
				`componente "${mapped.matched}" é de processo (não é produto); produto não resolvido`,
			);
		} else if (mcpbBin) {
			appendNote("produto não mapeado em products-map.json");
		}
	}

	// O catálogo HTTP é sempre instanciado quando configurado (para o
	// consult_specialist); o resolve só roda como fallback se o mcpb não
	// resolveu o produto.
	if (secrets.products?.url) {
		products = new ProductsClient(secrets.products);
		if (!productContext) {
			ctx.ui.setStatus(STATUS_KEY, "Consultando catálogo de produtos...");
			try {
				productContext = await products.resolve(key, ctx.signal);
			} catch (error) {
				const message = error instanceof ProductsError ? error.message : String(error);
				appendNote(`catálogo de produtos indisponível (${message})`);
				ctx.ui.notify(`Aviso: ${message}. Usando fallback de repositório.`, "warning");
			} finally {
				clearStatus(ctx);
			}
			if (productContext) {
				productSource = "catalog";
				matchedValue = null;
			}
		}
	} else if (!productContext) {
		appendNote("catálogo de produtos não configurado (products.url ausente)");
	}

	let fallbackRepo: string | null = null;
	const repos = productContext?.repos ?? [];

	if (repos.length === 0) {
		if (repoFlag?.trim()) {
			fallbackRepo = path.resolve(cwd, repoFlag.trim());
		} else if (looksLikeRepo(cwd)) {
			// Nunca adotar o cwd em silêncio: rodar o pi de dentro de um repo que
			// não é o código do produto (ex.: dotfiles) injetava o repo errado.
			if (ctx.mode !== "tui") {
				fallbackRepo = cwd;
				appendNote(`repositório não resolvido; usando o diretório atual (${cwd})`);
			} else if (
				await ctx.ui.confirm(
					"Usar o diretório atual como repositório?",
					`O produto não foi resolvido e o diretório atual é um repositório git:\n${cwd}\n\nUsar como repositório do código?`,
				)
			) {
				fallbackRepo = cwd;
			} else {
				const answer = await ctx.ui.input(
					"Repositório do código (deixe vazio para seguir sem repo)",
					cwd,
				);
				if (answer === undefined) {
					return {
						productContext,
						products,
						fallbackRepo: null,
						note: notes.join("; ") || null,
						aborted: true,
						mcpbContext,
						mcpbBin,
						productSource,
						productDescription,
					};
				}
				const trimmed = answer.trim();
				if (trimmed) fallbackRepo = path.resolve(cwd, trimmed);
				else appendNote("nenhum repositório informado");
			}
		} else {
			const answer = await ctx.ui.input("Repositório do código (deixe vazio para seguir sem repo)", cwd);
			if (answer === undefined) {
				return {
					productContext,
					products,
					fallbackRepo: null,
					note: notes.join("; ") || null,
					aborted: true,
					mcpbContext,
					mcpbBin,
					productSource,
					productDescription,
				};
			}
			const trimmed = answer.trim();
			if (trimmed) {
				fallbackRepo = path.resolve(cwd, trimmed);
			} else {
				appendNote("nenhum repositório informado");
			}
		}
	}

	return {
		productContext,
		products,
		fallbackRepo,
		note: notes.join("; ") || null,
		aborted: false,
		mcpbContext,
		mcpbBin,
		productSource,
		productDescription,
	};
}

function parentContextMarkdown(parent: FilteredIssue, siblings: FilteredChild[], jiraUrl: string): string {
	const lines = ["## Contexto do Epic pai (resolvido pelo harness)", ""];
	lines.push(`- Epic: ${parent.key} — ${parent.summary}`);
	lines.push(`- Status: ${parent.status || "—"}`);
	lines.push(`- URL: ${jiraUrl}/browse/${parent.key}`);
	if (parent.description) lines.push("", "### Descrição do Epic", "", parent.description);
	if (parent.acceptanceCriteria) {
		lines.push("", "### Critérios de aceite do Epic", "", parent.acceptanceCriteria);
	}
	if (siblings.length > 0) {
		lines.push("", `### Histórias irmãs (${siblings.length})`, "");
		for (const sibling of siblings) {
			lines.push(`- ${sibling.key} — ${sibling.summary} (${sibling.type} · ${sibling.status})`);
		}
		lines.push("", "Use as irmãs para não sobrepor escopo; não as duplique nos artefatos.");
	}
	return lines.join("\n");
}

function productContextMarkdown(phase: ProductPhaseResult): string {
	const lines = ["## Contexto do produto (Fase 0 — resolvido pelo harness)", ""];
	lines.push(
		phase.productContext
			? `- Produto: ${phase.productContext.product}`
			: "- Produto: não resolvido pelo catálogo",
	);
	if (phase.productContext) {
		lines.push(`- Origem da resolução: ${productSourceLabel(phase.productSource)}`);
		if (isWeakProductSource(phase.productSource)) {
			lines.push(
				"  - **Confirme o produto com o usuário na Fase 1**: veio do projeto/label, não de um componente do Jira.",
			);
		}
		if (!phase.mcpbContext) {
			lines.push("- Índice local (mcpb): **este produto ainda não está indexado** (indexação gradual).");
			if (phase.productDescription) lines.push(`- Sobre o produto: ${phase.productDescription}`);
			lines.push(
				"  - Investigue os repositórios acima com grep/read; `consult_specialist` **não** responde para produto sem índice.",
			);
		} else if (phase.productDescription) {
			lines.push(`- Sobre o produto: ${phase.productDescription}`);
		}
	}

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

	if (phase.mcpbContext) {
		const f = phase.mcpbContext.freshness;
		lines.push(
			`- Índice local (mcpb): docs em ${f.docIndexedAt ?? "—"} · código em ${f.codeIndexedAt ?? "—"} (${f.docChunks} docs / ${f.codeChunks} chunks)`,
		);
		const overview = phase.mcpbContext.overview?.trim();
		if (overview) {
			const truncated =
				overview.length > 8000
					? `${overview.slice(0, 8000)}\n… (truncado; fonte: ${phase.mcpbContext.memoryPath})`
					: overview;
			lines.push("", "### Memória curada do produto (via mcpb)", "", truncated);
		}
	}

	if (phase.note) lines.push(`- Aviso: ${phase.note}`);
	return lines.join("\n");
}

/** Idade legível de um timestamp ISO; "sem índice" quando ausente/inválido. */
function formatAge(iso: string | null): string {
	if (!iso) return "sem índice";
	const timestamp = Date.parse(iso);
	if (Number.isNaN(timestamp)) return "sem índice";
	const hours = (Date.now() - timestamp) / 3_600_000;
	if (hours < 1) return "há <1h";
	if (hours < 48) return `há ${Math.round(hours)}h`;
	return `há ${Math.round(hours / 24)} dias`;
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
	registerFlowTools(pi, { templatesDir: TEMPLATES_DIR, extDir: EXT_DIR });

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
			const productMatch = rawArgs.match(PRODUCT_FLAG_PATTERN);
			const productFlag = productMatch ? productMatch[1] ?? productMatch[2] ?? productMatch[3] : undefined;
			const cleaned = rawArgs.replace(REPO_FLAG_PATTERN, " ").replace(PRODUCT_FLAG_PATTERN, " ");
			const force = /(^|\s)--force(\s|$)/.test(cleaned);
			const key = cleaned.replace(/--force/g, "").trim().toUpperCase();

			if (!key) {
				ctx.ui.notify(
					"Uso: /refinar-issue <KEY> [--force] [--repo <path>] [--product <nome>]  ·  /refinar-issue --setup  (ex.: /refinar-issue PROJ-123)",
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

			const classification = classifyIssueType(rawIssue.fields?.issuetype?.name);
			let children: Awaited<ReturnType<JiraClient["getChildren"]>> = [];
			if (classification.flow === "epic") {
				ctx.ui.setStatus(STATUS_KEY, `Buscando filhos de ${key}...`);
				try {
					children = await client.getChildren(key, ctx.signal);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					ctx.ui.notify(
						`Aviso: não consegui buscar filhos de ${key} (${message}). Seguindo sem eles.`,
						"warning",
					);
				}
			}

			ctx.ui.setStatus(STATUS_KEY, "Filtrando conteúdo...");
			const filtered = filterIssue(rawIssue, {
				jiraUrl: secrets.url,
				acceptanceField: secrets.acceptanceField,
				children,
			});

			// No fluxo Story, o Epic pai é contexto do refinamento (e as irmãs evitam
			// sobreposição de escopo). O harness resolve aqui para a LLM não precisar.
			let parentContext: { epic: FilteredIssue; siblings: FilteredChild[] } | null = null;
			if (classification.flow === "story" && filtered.parent?.key) {
				const parentKey = filtered.parent.key;
				ctx.ui.setStatus(STATUS_KEY, `Buscando o epic pai ${parentKey}...`);
				try {
					const parentRaw = await client.getIssue(
						parentKey,
						secrets.acceptanceField ? [secrets.acceptanceField] : [],
						ctx.signal,
					);
					const parentFields = {
						jiraUrl: secrets.url,
						acceptanceField: secrets.acceptanceField,
					};
					let siblings: FilteredChild[] = [];
					try {
						const rawSiblings = await client.getChildren(parentKey, ctx.signal);
						siblings = filterIssue(parentRaw, { ...parentFields, children: rawSiblings }).children.filter(
							(sibling) => sibling.key.toUpperCase() !== key,
						);
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						ctx.ui.notify(
							`Aviso: não consegui buscar as histórias irmãs de ${parentKey} (${message}).`,
							"warning",
						);
					}
					parentContext = { epic: filterIssue(parentRaw, parentFields), siblings };
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					ctx.ui.notify(
						`Aviso: não consegui buscar o epic pai ${parentKey} (${message}). Seguindo sem esse contexto.`,
						"warning",
					);
				}
			}
			clearStatus(ctx);

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

			if (targetExists && force) {
				const removed = await clearArtifacts(targetDir);
				if (removed.length > 0) {
					ctx.ui.notify(`--force: artefatos anteriores removidos (${removed.join(", ")}).`, "info");
				}
			}

			// Fase 0 — produto/repos/especialistas (mcpb → catálogo HTTP + fallback).
			const phase = await runProductPhase(secrets, key, filtered, repoFlag, productFlag, ctx.cwd, ctx);
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
				`issue_type: ${filtered.type || classification.label}`,
				`flow: ${classification.flow}`,
				...(parentContext ? [`parent_key: ${parentContext.epic.key}`] : []),
				`fetched_at: ${fetchedAt}`,
				"---",
				"",
				filteredToMarkdown(filtered, secrets.url),
			].join("\n");

			try {
				await fs.promises.mkdir(targetDir, { recursive: true });
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
			const freshnessLine = phase.mcpbContext
				? `Índice:   mcpb ${formatAge(phase.mcpbContext.freshness.docIndexedAt)} (docs) · ${formatAge(phase.mcpbContext.freshness.codeIndexedAt)} (código)`
				: "";

			const shape = refinementShape(classification.flow);
			const shapeLabel =
				shape === "stories"
					? "histórias verticais (stories)"
					: shape === "diagnosis"
						? "diagnóstico + tarefas"
						: "tarefas implementáveis";
			const emitTool =
				classification.flow === "story"
					? "`emit_story_artifacts` (story + tasks)"
					: shape === "stories"
						? "`emit_epic_artifacts` (com `stories`)"
						: "`emit_epic_artifacts` (com `tasks`)";

			const summaryLines = [
				`Issue:    ${filtered.key} — ${filtered.summary}`,
				`Tipo:     ${filtered.type || "—"} · Fluxo: ${classification.label} (${flowDescription(classification.flow)})`,
				`Status:   ${filtered.status || "—"}`,
				`Quebra:   ${shapeLabel}`,
				parentContext ? `Pai:      ${parentContext.epic.key} — ${parentContext.epic.summary}` : "",
				parentContext ? `Irmãs:    ${parentContext.siblings.length} já existentes` : "",
				`Filhos:   ${filtered.children.length} já existentes`,
				`Comentários: ${filtered.comments.length}`,
				phase.productContext
					? `Produto:  ${phase.productContext.product}${
							isWeakProductSource(phase.productSource)
								? ` (${productSourceLabel(phase.productSource)})`
								: ""
						}`
					: "",
				repoLine,
				freshnessLine,
				phase.note ? `Aviso:    ${phase.note}` : "",
				`Pasta:    ${targetDir}`,
				targetExists && force ? "Modo:     --force (limpa e regrava os artefatos)" : "",
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
				issueType: filtered.type || classification.label,
				flow: classification.flow,
				jira: client,
				opensearch: secrets.opensearch ? new OpenSearchClient(secrets.opensearch) : null,
				project: projectKeyOf(key),
				dir: targetDir,
				jiraUrl: secrets.url,
				productContext: phase.productContext,
				products: phase.products,
				fallbackRepo: phase.fallbackRepo,
				catalogNote: phase.note,
				mcpbContext: phase.mcpbContext,
				mcpbBin: phase.mcpbBin,
				parentKey: parentContext?.epic.key ?? null,
				parentSummary: parentContext?.epic.summary ?? null,
				primaryRepo: phase.productContext?.repos?.[0]?.path ?? phase.fallbackRepo ?? null,
			});

			const instructions = readInstructions(classification.flow);
			const validationSection = validationDefaultsMarkdown(loadValidationDefaults(EXT_DIR));
			const message = [
				instructions,
				"",
				"---",
				"",
				`## Issue do Jira (${filtered.key}) — conteúdo filtrado`,
				`Fluxo selecionado pelo tipo ${classification.flow}: ${flowDescription(classification.flow)}.`,
				"O tipo original da issue é fato do Jira; não o altere por inferência.",
				"",
				filteredToMarkdown(filtered, secrets.url),
				"",
				"---",
				"",
				productContextMarkdown(phase),
				...(parentContext
					? ["", "---", "", parentContextMarkdown(parentContext.epic, parentContext.siblings, secrets.url)]
					: []),
				...(validationSection ? ["", "---", "", validationSection] : []),
				"",
				"---",
				"",
				"## Pasta de trabalho",
				"",
				targetDir,
				"",
				`\`jira-source.md\` contém a fonte filtrada (não precisa reler). Siga as fases acima e finalize chamando ${emitTool} exatamente uma vez.`,
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
