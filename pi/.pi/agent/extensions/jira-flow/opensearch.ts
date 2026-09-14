/** Cliente somente leitura para investigação opcional de logs no OpenSearch. */

const FETCH_TIMEOUT_MS = 20_000;

export interface OpenSearchConfig {
	url: string;
	apiKey: string;
	index?: string;
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

	async search(query: OpenSearchQuery, signal?: AbortSignal): Promise<OpenSearchResult> {
		const size = Math.min(Math.max(Math.trunc(query.size ?? 20), 1), 50);
		const from = Math.max(Math.trunc(query.from ?? 0), 0);
		const index = (query.index?.trim() || this.config.index || "*").replace(/^\/+|\/+$/g, "");
		const must = query.text?.trim()
			? [{ query_string: { query: query.text.trim(), default_operator: "AND" } }]
			: [{ match_all: {} }];
		const filters: Record<string, unknown>[] = [];
		if (query.since || query.until) {
			filters.push({
				range: {
					"@timestamp": {
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
			sort: [{ "@timestamp": { order: "desc", unmapped_type: "date" } }],
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
					Authorization: this.config.apiKey.startsWith("ApiKey ")
						? this.config.apiKey
						: `ApiKey ${this.config.apiKey}`,
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
