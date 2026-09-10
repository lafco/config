/**
 * Cliente Jira mínimo via REST, agnóstico de Cloud / Server-Data Center.
 *
 * - Cloud  -> REST API v3 (descrições em ADF)
 * - DC     -> REST API v2 (descrições em texto/wiki)
 *
 * Toda chamada é feita pelo harness (extension), nunca pela LLM.
 */

import type { Deployment, JiraSecrets } from "./secrets.ts";

/**
 * O Jira Data Center da empresa fica atrás de Cloudflare e exige um
 * User-Agent de navegador real — sem isso o fetch é bloqueado.
 */
const BROWSER_UA =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 20_000;

export const ISSUE_FIELDS = [
	"summary",
	"description",
	"status",
	"issuetype",
	"priority",
	"labels",
	"components",
	"fixVersions",
	"parent",
	"subtasks",
	"issuelinks",
	"comment",
	"assignee",
	"reporter",
	"created",
	"updated",
	"duedate",
	"resolution",
];

export interface JiraIssueRaw {
	key: string;
	fields: Record<string, any>;
}

export class JiraError extends Error {
	readonly status?: number;
	constructor(message: string, status?: number) {
		super(message);
		this.name = "JiraError";
		this.status = status;
	}
}

export class JiraClient {
	private readonly secrets: JiraSecrets;
	private readonly authHeader: string;

	constructor(secrets: JiraSecrets) {
		this.secrets = secrets;
		this.authHeader = buildAuthHeader(secrets);
	}

	private get apiBase(): string {
		const version = this.secrets.deployment === "cloud" ? "3" : "2";
		return `${this.secrets.url}/rest/api/${version}`;
	}

	/** URL navegável da issue (para humanos). */
	issueUrl(key: string): string {
		return `${this.secrets.url}/browse/${key}`;
	}

	/** Valida as credenciais e devolve a identidade autenticada no Jira. */
	async whoami(
		signal?: AbortSignal,
	): Promise<{ name: string; email?: string; url: string; deployment: Deployment }> {
		const data = await this.request("/myself", signal);
		return {
			name: String(data?.displayName ?? data?.name ?? data?.emailAddress ?? "(desconhecido)"),
			email: data?.emailAddress ? String(data.emailAddress) : undefined,
			url: this.secrets.url,
			deployment: this.secrets.deployment,
		};
	}

	private async request(pathname: string, signal?: AbortSignal): Promise<any> {
		const url = `${this.apiBase}${pathname}`;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
		if (signal) {
			if (signal.aborted) controller.abort();
			else signal.addEventListener("abort", () => controller.abort(), { once: true });
		}

		let response: Response;
		try {
			response = await fetch(url, {
				method: "GET",
				headers: {
					Authorization: this.authHeader,
					Accept: "application/json",
					"User-Agent": BROWSER_UA,
					"Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
				},
				signal: controller.signal,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const detail = controller.signal.aborted
				? `timeout de ${FETCH_TIMEOUT_MS / 1000}s ou cancelado`
				: message;
			throw new JiraError(`Não foi possível falar com o Jira (${url}): ${detail}`);
		} finally {
			clearTimeout(timeout);
		}

		const text = await response.text();
		if (!response.ok) {
			const snippet = text.replace(/\s+/g, " ").slice(0, 400);
			throw new JiraError(
				`Jira respondeu ${response.status} ${response.statusText} em ${pathname}: ${snippet}`,
				response.status,
			);
		}

		try {
			return JSON.parse(text);
		} catch {
			throw new JiraError(`Resposta do Jira não é JSON válido (${pathname}).`);
		}
	}

	async getIssue(key: string, extraFields: string[] = [], signal?: AbortSignal): Promise<JiraIssueRaw> {
		const fields = [...ISSUE_FIELDS, ...extraFields].filter(Boolean);
		const query = new URLSearchParams({ fields: fields.join(",") });
		return (await this.request(`/issue/${encodeURIComponent(key)}?${query}`, signal)) as JiraIssueRaw;
	}

	private async search(jql: string, fields: string[], signal?: AbortSignal): Promise<JiraIssueRaw[]> {
		const query = new URLSearchParams({
			jql,
			fields: fields.join(","),
			maxResults: "100",
		});

		const endpoints =
			this.secrets.deployment === "cloud"
				? [`/search/jql?${query}`, `/search?${query}`]
				: [`/search?${query}`];

		let lastError: unknown;
		for (const endpoint of endpoints) {
			try {
				const data = await this.request(endpoint, signal);
				return (data.issues ?? []) as JiraIssueRaw[];
			} catch (error) {
				lastError = error;
				const status = error instanceof JiraError ? error.status : undefined;
				// 404/410 = endpoint inexistente nessa versão; tenta o próximo.
				if (status !== 404 && status !== 410) throw error;
			}
		}
		throw lastError;
	}

	/**
	 * Filhos diretos do epic. Tenta as duas sintaxes de hierarquia usadas pelo
	 * Jira (`parent = KEY` para hierarquia nova e `"Epic Link" = KEY` para a
	 * antiga) e faz merge por key.
	 */
	async getChildren(key: string, signal?: AbortSignal): Promise<JiraIssueRaw[]> {
		const jqls = [`parent = ${key}`, `"Epic Link" = ${key}`];
		const merged = new Map<string, JiraIssueRaw>();

		for (const jql of jqls) {
			try {
				const issues = await this.search(jql, ISSUE_FIELDS, signal);
				for (const issue of issues) {
					if (issue.key !== key) merged.set(issue.key, issue);
				}
			} catch {
				// Sintaxe indisponível nesse Jira; segue para a próxima.
			}
		}

		return [...merged.values()];
	}
}

function buildAuthHeader(secrets: JiraSecrets): string {
	if (secrets.personalToken) {
		return `Bearer ${secrets.personalToken}`;
	}
	if (secrets.apiToken && secrets.email && secrets.deployment === "cloud") {
		const basic = Buffer.from(`${secrets.email}:${secrets.apiToken}`).toString("base64");
		return `Basic ${basic}`;
	}
	if (secrets.apiToken) {
		return `Bearer ${secrets.apiToken}`;
	}
	throw new JiraError("Credenciais do Jira ausentes.");
}
