/**
 * Cliente HTTP do catálogo de produtos da empresa.
 *
 * É a fonte primária de contexto do refinamento: dado um épico do Jira, o
 * catálogo responde qual produto ele afeta, quais repositórios pertencem a
 * esse produto e quais especialistas existem para consulta.
 *
 * Todo o transporte mora no harness (esta extension); a LLM só enxerga o
 * resultado — seja injetado na Fase 0, seja pela tool `consult_specialist`.
 *
 * Contrato esperado:
 *   GET  {url}/resolve?jiraKey=PROJ-123
 *        -> { product, repos: [{ name, path?, url? }], specialists: [{ id, name? }] }
 *   POST {url}/ask  { product, question, specialist? }
 *        -> { answer }
 *
 * Auth: `Authorization: Bearer {token}` (omitido quando não há token).
 */

import type { ProductsSecrets } from "./secrets.ts";

const FETCH_TIMEOUT_MS = 15_000;

export interface RepoRef {
	name: string;
	path?: string;
	url?: string;
}

export interface SpecialistRef {
	id: string;
	name?: string;
}

export interface ProductContext {
	product: string;
	repos: RepoRef[];
	specialists: SpecialistRef[];
}

export class ProductsError extends Error {
	readonly status?: number;
	constructor(message: string, status?: number) {
		super(message);
		this.name = "ProductsError";
		this.status = status;
	}
}

export class ProductsClient {
	private readonly baseUrl: string;
	private readonly token: string | undefined;

	constructor(config: ProductsSecrets) {
		this.baseUrl = config.url.replace(/\/+$/, "");
		this.token = config.token?.trim() || undefined;
	}

	/** Produto, repositórios e especialistas de um épico. */
	async resolve(jiraKey: string, signal?: AbortSignal): Promise<ProductContext> {
		const query = new URLSearchParams({ jiraKey });
		const data = await this.request<unknown>(`/resolve?${query}`, { method: "GET" }, signal);
		return normalizeContext(data);
	}

	/** Consulta conversacional a um especialista de produto. */
	async ask(
		input: { product: string; question: string; specialist?: string },
		signal?: AbortSignal,
	): Promise<string> {
		const data = await this.request<unknown>(
			"/ask",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					product: input.product,
					question: input.question,
					...(input.specialist ? { specialist: input.specialist } : {}),
				}),
			},
			signal,
		);
		const answer = extractAnswer(data);
		if (!answer) {
			throw new ProductsError("O catálogo respondeu sem conteúdo em /ask.");
		}
		return answer;
	}

	private async request<T>(pathname: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
		const url = `${this.baseUrl}${pathname}`;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
		if (signal) {
			if (signal.aborted) controller.abort();
			else signal.addEventListener("abort", () => controller.abort(), { once: true });
		}

		const headers: Record<string, string> = {
			Accept: "application/json",
			...(init.headers as Record<string, string> | undefined),
		};
		if (this.token) headers.Authorization = `Bearer ${this.token}`;

		let response: Response;
		try {
			response = await fetch(url, { ...init, headers, signal: controller.signal });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const detail = controller.signal.aborted
				? `timeout de ${FETCH_TIMEOUT_MS / 1000}s ou cancelado`
				: message;
			throw new ProductsError(`Não foi possível falar com o catálogo de produtos (${url}): ${detail}`);
		} finally {
			clearTimeout(timeout);
		}

		const text = await response.text();
		if (!response.ok) {
			const snippet = text.replace(/\s+/g, " ").slice(0, 400);
			throw new ProductsError(
				`Catálogo de produtos respondeu ${response.status} ${response.statusText} em ${pathname}: ${snippet}`,
				response.status,
			);
		}
		if (!text.trim()) return {} as T;
		try {
			return JSON.parse(text) as T;
		} catch {
			throw new ProductsError(`Resposta do catálogo não é JSON válido (${pathname}).`);
		}
	}
}

function extractAnswer(data: unknown): string {
	if (typeof data === "string") return data.trim();
	if (data && typeof data === "object") {
		const record = data as Record<string, unknown>;
		const value = record.answer ?? record.resposta ?? record.text ?? record.reply;
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return "";
}

function normalizeContext(data: unknown): ProductContext {
	const record = isRecord(data) ? data : {};
	const product = firstString(record.product, record.produto, record.name, record.nome);
	if (!product) {
		throw new ProductsError("O catálogo não informou o produto (campo `product` vazio).");
	}
	return {
		product,
		repos: normalizeRepos(record.repos ?? record.repositories ?? record.repositorios),
		specialists: normalizeSpecialists(record.specialists ?? record.especialistas),
	};
}

function normalizeRepos(value: unknown): RepoRef[] {
	if (!Array.isArray(value)) return [];
	const repos: RepoRef[] = [];
	for (const item of value) {
		if (typeof item === "string" && item.trim()) {
			repos.push({ name: item.trim() });
			continue;
		}
		if (!isRecord(item)) continue;
		const name = firstString(item.name, item.nome, item.repo, item.repository);
		if (!name) continue;
		const repoPath = firstString(item.path, item.caminho, item.localPath);
		const url = firstString(item.url, item.link, item.html_url);
		repos.push({ name, path: repoPath, url });
	}
	return repos;
}

function normalizeSpecialists(value: unknown): SpecialistRef[] {
	if (!Array.isArray(value)) return [];
	const specialists: SpecialistRef[] = [];
	for (const item of value) {
		if (typeof item === "string" && item.trim()) {
			specialists.push({ id: item.trim() });
			continue;
		}
		if (!isRecord(item)) continue;
		const id = firstString(item.id, item.name, item.nome, item.slug);
		if (!id) continue;
		const name = firstString(item.displayName, item.name, item.nome);
		specialists.push({ id, name: name && name !== id ? name : undefined });
	}
	return specialists;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function firstString(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return undefined;
}
