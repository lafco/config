/**
 * Ponte com o CLI JSON do mcpb (`bin/mcpb`) — índice local de produtos.
 *
 * Fase 0 do refinamento (fonte primária):
 *   1. `products-map.json` (projects/components/labels -> produto);
 *   2. `mcpb context --product <nome>` -> produto, repos (com path), overview
 *      (memória curada) e frescura do índice;
 *   3. `mcpb products` -> catálogo (com repos) para o reverse-lookup do repo
 *      (`resolveProductFromRepos`) e o match do texto da issue
 *      (`resolveProductFromText`) quando o mapa não resolve — unido ao
 *      `products.json` local via `buildProductCatalog`.
 *
 * `consult_specialist` usa `mcpb ask` como fallback quando o catálogo HTTP de
 * produtos não está configurado/fora do ar.
 *
 * Nada aqui cria/subiu processos no load da extension: o CLI é chamado por
 * `execFile` só quando a Fase 0 ou a tool realmente precisam dele.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CONTEXT_TIMEOUT_MS = 180_000; // resolveRepos pode fazer git fetch/clone
const ASK_TIMEOUT_MS = 240_000; // ask com LLM pode demorar
const MAX_BUFFER = 8 * 1024 * 1024;
const STDERR_MAX_CHARS = 1_500;

export interface McpbRepoInfo {
	name: string;
	path: string | null;
	head: string | null;
	indexedAt: string | null;
}

export interface McpbFreshness {
	docIndexedAt: string | null;
	codeIndexedAt: string | null;
	docChunks: number;
	codeChunks: number;
	vec: boolean;
}

export interface McpbProductContext {
	product: string;
	displayName: string;
	description: string;
	memoryPath: string;
	overview: string | null;
	repos: McpbRepoInfo[];
	freshness: McpbFreshness;
}

export interface McpbAskResult {
	product: string;
	answer: string;
	citations: string[];
	route?: string;
	phase?: string;
}

export interface ProductsMap {
	projects: Record<string, string>;
	components: Record<string, string>;
	labels: Record<string, string>;
	/** Componentes de processo/gestão: existem no Jira mas não são produto. */
	ignore: string[];
}

/** De onde o produto foi inferido — importa quando o match é fraco (projeto/label). */
export type ProductSource = "component" | "project" | "label" | "repo" | "text" | "user";

export interface ProductResolution {
	product: string;
	source: ProductSource;
	/** Valor do Jira que casou (componente, key do projeto ou label). */
	matched: string;
}

/**
 * Resultado da resolução. `product: null` com `source: "ignored"` significa
 * "componente reconhecido, mas não é produto" — para não cair no default do
 * projeto (ex.: OKR/PLR num projeto cujo default é um produto).
 */
export type ProductLookup =
	| ProductResolution
	| { product: null; source: "ignored"; matched: string };

export interface McpbProductSummary {
	name: string;
	displayName: string;
	description: string;
	repos: McpbRepoInfo[];
}

/**
 * Entrada do catálogo usado no reverse-lookup: junta o que vem do `mcpb
 * products` (nome/displayName/repos) com o registro local (`products.json`),
 * que acrescenta os `aliases` em pt-BR e os produtos ainda não indexados.
 */
export interface ProductCatalogEntry {
	name: string;
	displayName: string;
	repos: { name: string; path?: string }[];
	aliases?: string[];
}

/** Entrada crua do `mcpb products`: repos podem ter path nulo. */
export interface ProductCatalogSource {
	name: string;
	displayName: string;
	repos: { name: string; path?: string | null }[];
}

/**
 * Une o catálogo do mcpb ao registro local (`products.json`): o mcpb vence em
 * repos e displayName; o local completa o que falta (produtos ainda não
 * indexados, repos quando o mcpb não tem, e os `aliases` em pt-BR).
 */
export function buildProductCatalog(
	mcpbProducts: ProductCatalogSource[],
	localProducts: Record<string, { displayName: string; repos: { name: string; path?: string | null }[]; aliases?: string[] }>,
): ProductCatalogEntry[] {
	const entries = new Map<string, ProductCatalogEntry>();
	for (const summary of mcpbProducts) {
		entries.set(summary.name, {
			name: summary.name,
			displayName: summary.displayName || summary.name,
			repos: summary.repos.map((repo) => ({
				name: repo.name,
				...(repo.path ? { path: repo.path } : {}),
			})),
		});
	}
	for (const [name, product] of Object.entries(localProducts)) {
		const repos = product.repos.map((repo) => ({
			name: repo.name,
			...(repo.path ? { path: repo.path } : {}),
		}));
		const existing = entries.get(name);
		if (existing) {
			if (existing.repos.length === 0) existing.repos = repos;
			if (!existing.displayName) existing.displayName = product.displayName;
			if (product.aliases?.length) existing.aliases = product.aliases;
		} else {
			entries.set(name, {
				name,
				displayName: product.displayName || name,
				repos,
				...(product.aliases?.length ? { aliases: product.aliases } : {}),
			});
		}
	}
	return [...entries.values()];
}

/**
 * Ordem de resolução do CLI:
 *   1. `$MCPB_BIN` (caminho explícito);
 *   2. `$MCPB_PATH/bin/mcpb` (checkout do mcpb);
 *   3. launcher `~/.local/bin/mcpb-mcp` (symlink) -> `<checkout>/bin/mcpb`;
 *   4. `~/ahg/mcpb/bin/mcpb`;
 *   5. `<cwd>/bin/mcpb`, apenas se `<cwd>/catalog.yaml` existir (evita pegar
 *      um `bin/mcpb` qualquer de um projeto estranho).
 */
export function findMcpbBin(): string | null {
	const candidates: string[] = [];

	const envBin = process.env.MCPB_BIN?.trim();
	if (envBin) candidates.push(envBin);

	const envPath = process.env.MCPB_PATH?.trim();
	if (envPath) candidates.push(path.join(envPath, "bin", "mcpb"));

	try {
		const real = fs.realpathSync(path.join(os.homedir(), ".local", "bin", "mcpb-mcp"));
		if (path.basename(real) === "mcpb-mcp" && path.basename(path.dirname(real)) === "bin") {
			candidates.push(path.join(path.dirname(path.dirname(real)), "bin", "mcpb"));
		}
	} catch {
		// sem launcher instalado
	}

	candidates.push(path.join(os.homedir(), "ahg", "mcpb", "bin", "mcpb"));

	try {
		if (fs.existsSync(path.join(process.cwd(), "catalog.yaml"))) {
			candidates.push(path.join(process.cwd(), "bin", "mcpb"));
		}
	} catch {
		// cwd inacessível — ignora
	}

	for (const candidate of candidates) {
		try {
			if (fs.existsSync(candidate)) return candidate;
		} catch {
			// ignora e tenta o próximo
		}
	}
	return null;
}

function emptyProductsMap(): ProductsMap {
	return { projects: {}, components: {}, labels: {}, ignore: [] };
}

/** Carrega o mapa de produtos; nunca lança (arquivo ausente/inválido = mapa vazio). */
export function loadProductsMap(extDir: string): ProductsMap {
	const configured = process.env.JIRA_FLOW_PRODUCTS_MAP?.trim();
	const file = configured || path.join(extDir, "products-map.json");
	try {
		const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
		if (!isRecord(parsed)) return emptyProductsMap();
		return {
			projects: stringMap(parsed.projects),
			components: stringMap(parsed.components),
			labels: stringMap(parsed.labels),
			ignore: Array.isArray(parsed.ignore)
				? parsed.ignore.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
				: [],
		};
	} catch {
		return emptyProductsMap();
	}
}

/** Normaliza para comparação case/acento-insensível. */
function normalizeKey(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

function matchTableDetailed(
	values: string[],
	table: Record<string, string>,
): { product: string; matched: string } | null {
	for (const value of values) {
		const target = normalizeKey(value);
		if (!target) continue;
		for (const [key, product] of Object.entries(table)) {
			if (normalizeKey(key) === target) return { product, matched: value };
		}
	}
	return null;
}

/**
 * Resolve o produto pela ordem: componente com match exato (case/acento-
 * insensível) → componente ignorado (não é produto) → project key → label.
 * O componente vence o projeto: um épico do projeto X pode tratar de outro
 * produto (ex.: componente PontoWeb num épico de Férias).
 *
 * A versão detalhada devolve a origem, para o harness avisar quando o produto
 * veio só do projeto (default) ou de uma label — match mais fraco — ou quando
 * o componente é de processo.
 */
export function resolveProductFromMapDetailed(
	map: ProductsMap,
	issue: { project: string; components: string[]; labels: string[] },
): ProductLookup | null {
	const byComponent = matchTableDetailed(issue.components, map.components);
	if (byComponent) return { product: byComponent.product, source: "component", matched: byComponent.matched };

	const ignored = matchIgnored(issue.components, map.ignore);
	if (ignored) return { product: null, source: "ignored", matched: ignored };

	const project = issue.project.toUpperCase();
	const byProject = map.projects[project];
	if (byProject) return { product: byProject, source: "project", matched: project };

	const byLabel = matchTableDetailed(issue.labels, map.labels);
	if (byLabel) return { product: byLabel.product, source: "label", matched: byLabel.matched };

	return null;
}

/** Componente de processo que casa com a lista `ignore` (case/acento-insensível). */
function matchIgnored(components: string[], ignore: string[]): string | null {
	for (const value of components) {
		const target = normalizeKey(value);
		if (!target) continue;
		for (const entry of ignore) {
			if (normalizeKey(entry) === target) return value;
		}
	}
	return null;
}

export function resolveProductFromMap(
	map: ProductsMap,
	issue: { project: string; components: string[]; labels: string[] },
): string | null {
	return resolveProductFromMapDetailed(map, issue)?.product ?? null;
}

/** Caminho idêntico ou um contido no outro (repo e subdiretório do repo). */
function samePathOrInside(outer: string, inner: string): boolean {
	const rel = path.relative(outer, inner);
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * O candidato (`--repo`/cwd) pertence a este repo do catálogo? Casa pelo path
 * quando o catálogo tem um, senão pelo basename.
 */
function repoMatches(repo: { name: string; path?: string }, candidate: string): boolean {
	if (repo.path) {
		const repoPath = path.resolve(repo.path);
		const resolved = path.resolve(candidate);
		if (samePathOrInside(repoPath, resolved) || samePathOrInside(resolved, repoPath)) return true;
	}
	return path.basename(path.resolve(candidate)) === repo.name;
}

/**
 * Passo 3 da Fase 0 — reverse-lookup do repositório: `--repo`/cwd é checkout de
 * um produto do catálogo. Devolve `null` quando nenhum candidato pertence a
 * exatamente um produto: `pw2`, compartilhado por vários, fica ambíguo e não
 * resolve. Um candidato ambíguo não aborta os seguintes.
 */
export function resolveProductFromRepos(
	catalog: ProductCatalogEntry[],
	candidates: string[],
): ProductResolution | null {
	for (const candidate of candidates) {
		const trimmed = candidate?.trim();
		if (!trimmed) continue;
		const matches = catalog.filter((entry) => entry.repos.some((repo) => repoMatches(repo, trimmed)));
		if (matches.length === 1) return { product: matches[0].name, source: "repo", matched: trimmed };
	}
	return null;
}

/** Palavra/frase inteira no texto normalizado (bordas não alfanuméricas). */
function containsToken(haystack: string, token: string): boolean {
	const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
}

/**
 * Passo 4 da Fase 0 — match do texto da issue (resumo/componentes/labels)
 * contra `name`/`displayName`/`aliases` do catálogo. Só resolve com match
 * único; dois produtos batendo o mesmo termo ficam ambíguos e não resolvem.
 */
export function resolveProductFromText(
	catalog: ProductCatalogEntry[],
	issue: { summary?: string; components: string[]; labels: string[] },
): ProductResolution | null {
	const haystack = [issue.summary ?? "", ...issue.components, ...issue.labels]
		.map((value) => normalizeKey(value))
		.filter(Boolean)
		.join(" \n ");
	if (!haystack.trim()) return null;

	const matches = new Map<string, string>();
	for (const entry of catalog) {
		const keywords = [entry.name, entry.displayName, ...(entry.aliases ?? [])];
		for (const keyword of keywords) {
			const token = normalizeKey(keyword);
			if (!token || !containsToken(haystack, token)) continue;
			matches.set(entry.name, keyword);
			break;
		}
	}
	if (matches.size !== 1) return null;
	const [product, matched] = [...matches.entries()][0];
	return { product, source: "text", matched };
}

export class McpbError extends Error {
	readonly code: string;
	readonly exitCode?: number;
	readonly stderr?: string;

	constructor(
		message: string,
		options: { code?: string; exitCode?: number; stderr?: string } = {},
	) {
		super(message);
		this.name = "McpbError";
		this.code = options.code ?? "failed";
		this.exitCode = options.exitCode;
		this.stderr = options.stderr;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function stringMap(value: unknown): Record<string, string> {
	if (!isRecord(value)) return {};
	const out: Record<string, string> = {};
	for (const [key, item] of Object.entries(value)) {
		if (typeof item === "string" && item.trim()) out[key] = item.trim();
	}
	return out;
}

/** Normaliza a lista `repos` do `mcpb products` (name/path/head/indexedAt). */
function parseMcpbRepos(value: unknown): McpbRepoInfo[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter(isRecord)
		.map((repo) => ({
			name: typeof repo.name === "string" ? repo.name : "",
			path: typeof repo.path === "string" && repo.path ? repo.path : null,
			head: typeof repo.head === "string" && repo.head ? repo.head : null,
			indexedAt: typeof repo.indexedAt === "string" && repo.indexedAt ? repo.indexedAt : null,
		}))
		.filter((repo) => repo.name);
}

function truncateStderr(text: string | undefined): string | undefined {
	const trimmed = (text ?? "").trim();
	if (!trimmed) return undefined;
	return trimmed.length > STDERR_MAX_CHARS ? `${trimmed.slice(0, STDERR_MAX_CHARS)}…` : trimmed;
}

/** Extrai `{error:{code,message}}` do stdout do CLI, quando presente. */
function parseErrorDocument(stdout: string | undefined): { code: string; message: string } | null {
	if (!stdout) return null;
	try {
		const data: unknown = JSON.parse(stdout);
		if (isRecord(data) && isRecord(data.error) && typeof data.error.message === "string") {
			return {
				code: typeof data.error.code === "string" ? data.error.code : "failed",
				message: data.error.message,
			};
		}
	} catch {
		// stdout não é JSON
	}
	return null;
}

interface ExecLikeError {
	code?: string | number;
	killed?: boolean;
	name?: string;
	message?: string;
	stdout?: string;
	stderr?: string;
}

export class McpbClient {
	private readonly bin: string;

	constructor(bin: string) {
		this.bin = bin;
	}

	/** `mcpb context --product <nome>` — produto, repos, overview e frescura. */
	async context(product: string, signal?: AbortSignal): Promise<McpbProductContext> {
		const data = await this.run(["context", "--product", product], CONTEXT_TIMEOUT_MS, signal);
		if (!isRecord(data) || typeof data.product !== "string" || !Array.isArray(data.repos)) {
			throw new McpbError('Resposta inválida de "mcpb context" (JSON inesperado).', {
				code: "bad_json",
			});
		}
		return data as unknown as McpbProductContext;
	}

	/** `mcpb products` — catálogo de produtos do índice local (nome/descrição). */
	async products(signal?: AbortSignal): Promise<McpbProductSummary[]> {
		const data = await this.run(["products"], CONTEXT_TIMEOUT_MS, signal);
		const list = Array.isArray(data)
			? data
			: isRecord(data) && Array.isArray(data.products)
				? data.products
				: null;
		if (!list) {
			throw new McpbError('Resposta inválida de "mcpb products" (JSON inesperado).', {
				code: "bad_json",
			});
		}
		return list
			.filter(isRecord)
			.map((item) => ({
				name: typeof item.name === "string" ? item.name : "",
				displayName: typeof item.displayName === "string" ? item.displayName : "",
				description: typeof item.description === "string" ? item.description : "",
				repos: parseMcpbRepos(item.repos),
			}))
			.filter((item) => item.name);
	}

	/** `mcpb ask --product <nome> --question <pergunta>` — resposta + citações. */
	async ask(
		input: { product: string; question: string },
		signal?: AbortSignal,
	): Promise<McpbAskResult> {
		const data = await this.run(
			["ask", "--product", input.product, "--question", input.question],
			ASK_TIMEOUT_MS,
			signal,
		);
		if (!isRecord(data) || typeof data.answer !== "string") {
			throw new McpbError('Resposta inválida de "mcpb ask" (JSON inesperado).', {
				code: "bad_json",
			});
		}
		return data as unknown as McpbAskResult;
	}

	private async run(args: string[], timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
		try {
			const { stdout } = await execFileAsync(this.bin, args, {
				timeout: timeoutMs,
				signal,
				maxBuffer: MAX_BUFFER,
				encoding: "utf8",
			});
			return JSON.parse(stdout);
		} catch (error) {
			throw this.toMcpbError(error, args);
		}
	}

	private toMcpbError(error: unknown, args: string[]): McpbError {
		const err = (isRecord(error) ? error : {}) as ExecLikeError;
		const stderr = truncateStderr(err.stderr);

		// O CLI sempre emite {"error":{...}} no stdout — é a mensagem oficial.
		const parsed = parseErrorDocument(err.stdout);
		if (parsed) {
			return new McpbError(parsed.message, {
				code: parsed.code,
				exitCode: typeof err.code === "number" ? err.code : undefined,
				stderr,
			});
		}

		if (err.name === "AbortError" || err.code === "ABORT_ERR") {
			return new McpbError(`"mcpb ${args[0]}" cancelado.`, { code: "aborted", stderr });
		}
		if (err.killed) {
			return new McpbError(
				`"mcpb ${args[0]}" excedeu o timeout (${Math.round((args[0] === "ask" ? ASK_TIMEOUT_MS : CONTEXT_TIMEOUT_MS) / 1000)}s).`,
				{ code: "timeout", stderr },
			);
		}
		if (err.code === "ENOENT") {
			return new McpbError(`bin/mcpb não encontrado em "${this.bin}".`, {
				code: "not_found",
				stderr,
			});
		}
		const detail = err.message ?? "erro desconhecido";
		return new McpbError(`falha ao executar "mcpb ${args.join(" ")}": ${detail}`, {
			code: "failed",
			stderr,
		});
	}
}
