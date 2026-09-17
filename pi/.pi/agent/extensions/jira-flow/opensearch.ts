/** Cliente somente leitura para investigação opcional de logs no OpenSearch. */

const FETCH_TIMEOUT_MS = 20_000;

export interface OpenSearchConfig {
	url: string;
	/** API key (`ApiKey <valor>`). Tem precedência sobre usuário/senha. */
	apiKey?: string;
	/** Autenticação básica, usada quando não há apiKey. */
	username?: string;
	password?: string;
	index?: string;
	/** Campo de tempo usado no filtro `since`/`until` e na ordenação. */
	timeField?: string;
}

export interface OpenSearchQuery {
	text?: string;
	index?: string;
	from?: number;
	size?: number;
	since?: string;
	until?: string;
}

export interface OpenSearchHit {
	id: string;
	index: string;
	score: number | null;
	source: Record<string, unknown>;
}

export interface OpenSearchResult {
	total: number;
	hits: OpenSearchHit[];
	query: OpenSearchQuery;
}

export class OpenSearchError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "OpenSearchError";
	}
}

export class OpenSearchClient {
	private readonly config: OpenSearchConfig;

	constructor(config: OpenSearchConfig) {
		this.config = { ...config, url: config.url.replace(/\/+$/, "") };
	}

	/**
	 * Cabeçalho de autenticação: API key quando configurada, senão Basic com
	 * usuário/senha (`secrets.json` atual usa usuário/senha).
	 */
	private authorization(): string {
		const apiKey = this.config.apiKey?.trim();
		if (apiKey) return apiKey.startsWith("ApiKey ") ? apiKey : `ApiKey ${apiKey}`;
		const username = this.config.username ?? "";
		const password = this.config.password ?? "";
		return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
	}

	async search(query: OpenSearchQuery, signal?: AbortSignal): Promise<OpenSearchResult> {
		const size = Math.min(Math.max(Math.trunc(query.size ?? 20), 1), 50);
		const from = Math.max(Math.trunc(query.from ?? 0), 0);
		const index = (query.index?.trim() || this.config.index || "*").replace(/^\/+|\/+$/g, "");
		const timeField = this.config.timeField?.trim() || "@timestamp";
		const must = query.text?.trim()
			? [{ query_string: { query: query.text.trim(), default_operator: "AND" } }]
			: [{ match_all: {} }];
		const filters: Record<string, unknown>[] = [];
		if (query.since || query.until) {
			filters.push({
				range: {
					[timeField]: {
						...(query.since ? { gte: query.since } : {}),
						...(query.until ? { lte: query.until } : {}),
					},
				},
			});
		}

		const body = {
			from,
			size,
			track_total_hits: true,
			query: { bool: { must, filter: filters } },
			sort: [{ [timeField]: { order: "desc", unmapped_type: "date" } }],
		};
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
		if (signal) {
			if (signal.aborted) controller.abort();
			else signal.addEventListener("abort", () => controller.abort(), { once: true });
		}

		try {
			const response = await fetch(`${this.config.url}/${encodeURIComponent(index)}/_search`, {
				method: "POST",
				headers: {
					Accept: "application/json",
					"Content-Type": "application/json",
					Authorization: this.authorization(),
				},
				body: JSON.stringify(body),
				signal: controller.signal,
			});
			const text = await response.text();
			if (!response.ok) {
				throw new OpenSearchError(
					`OpenSearch respondeu ${response.status} ${response.statusText}: ${text.replace(/\s+/g, " ").slice(0, 400)}`,
				);
			}
			let data: any;
			try {
				data = JSON.parse(text);
			} catch {
				throw new OpenSearchError("OpenSearch devolveu uma resposta que não é JSON válido.");
			}
			const rawTotal = data?.hits?.total;
			const total = typeof rawTotal === "number" ? rawTotal : Number(rawTotal?.value ?? 0);
			const hits = Array.isArray(data?.hits?.hits)
				? data.hits.hits.map((hit: any) => ({
						id: String(hit?._id ?? ""),
						index: String(hit?._index ?? index),
					score: typeof hit?._score === "number" ? hit._score : null,
					source: hit?._source && typeof hit._source === "object" ? hit._source : {},
					}))
				: [];
			return { total: Number.isFinite(total) ? total : hits.length, hits, query: { ...query, index, from, size } };
		} catch (error) {
			if (error instanceof OpenSearchError) throw error;
			const message = error instanceof Error ? error.message : String(error);
			throw new OpenSearchError(
				controller.signal.aborted ? `timeout de ${FETCH_TIMEOUT_MS / 1000}s ou cancelado` : message,
			);
		} finally {
			clearTimeout(timeout);
		}
	}
}
