/**
 * Ponte com o CLI JSON do mcpb (`bin/mcpb`) — índice local de produtos.
 *
 * Fase 0 do refinamento (fonte primária):
 *   1. `products-map.json` (projects/components/labels -> produto);
 *   2. `mcpb context --product <nome>` -> produto, repos (com path), overview
 *      (memória curada) e frescura do índice;
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
export type ProductSource = "component" | "project" | "label";

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
