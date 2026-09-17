/**
 * Carregamento de credenciais e configuração do fluxo Jira.
 *
 * Precedência: arquivo `~/.pi/agent/secrets.json` > variáveis de ambiente.
 * O pi não possui vault nativo, então o arquivo é a fonte primária e as env
 * vars servem de fallback (ex.: a empresa injeta via sops/1Password).
 *
 * Formato do arquivo:
 * {
 *   "jira": {
 *     "url": "https://empresa.atlassian.net",
 *     "deployment": "cloud",            // "cloud" | "dc" (opcional; inferido pela URL)
 *     "email": "voce@empresa.com",      // Cloud: usado no Basic auth
 *     "apiToken": "...",                // Cloud: API token
 *     "personalToken": "...",           // DC: PAT (Bearer)
 *     "acceptanceField": "customfield_10001" // opcional
 *   },
 *   "epicsDir": "/caminho/para/epics",  // opcional
 *   "products": {                       // opcional (catálogo de produtos)
 *     "url": "https://catalogo.interno/api",
 *     "token": "..."
 *   }
 * }
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export type Deployment = "cloud" | "dc";

export interface ProductsSecrets {
	url: string;
	token?: string;
}

export interface OpenSearchSecrets {
	url: string;
	/** Autenticação por API key (preferida quando presente). */
	apiKey?: string;
	/** Autenticação básica (alternativa usada pelo secrets.json atual). */
	username?: string;
	password?: string;
	index?: string;
	/** Campo de tempo do índice (ex.: `time_iso8601`); o cliente usa `@timestamp` quando ausente. */
	timeField?: string;
}

export interface JiraSecrets {
	url: string;
	deployment: Deployment;
	email?: string;
	apiToken?: string;
	personalToken?: string;
	acceptanceField?: string;
	epicsDir?: string;
	products?: ProductsSecrets;
	opensearch?: OpenSearchSecrets;
}

export interface LoadResult {
	secrets: JiraSecrets | null;
	source: string;
	errors: string[];
}

function env(name: string): string | undefined {
	const value = process.env[name];
	return value && value.trim() ? value.trim() : undefined;
}

function secretsFilePath(): string {
	return path.join(getAgentDir(), "secrets.json");
}

interface FilesShape {
	jira?: {
		url?: string;
		deployment?: string;
		email?: string;
		apiToken?: string;
		personalToken?: string;
		acceptanceField?: string;
	};
	epicsDir?: string;
	products?: {
		url?: string;
		token?: string;
	};
	opensearch?: {
		url?: string;
		apiKey?: string;
		username?: string;
		password?: string;
		index?: string;
		timeField?: string;
	};
	pw2?: {
		environments?: Record<string, { autoRunCompanies?: unknown }>;
	};
}

function readFile(): { data: FilesShape; source: string; errors: string[] } {
	const file = secretsFilePath();
	if (!fs.existsSync(file)) {
		return { data: {}, source: "(nenhum secrets.json)", errors: [] };
	}
	try {
		const raw = fs.readFileSync(file, "utf8");
		const data = JSON.parse(raw) as FilesShape;
		return { data, source: file, errors: [] };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { data: {}, source: file, errors: [`Falha ao ler ${file}: ${message}`] };
	}
}

export function inferDeployment(url: string, explicit?: string): Deployment {
	const value = (explicit ?? "").trim().toLowerCase();
	if (value === "cloud" || value === "dc") return value;
	if (value) return value === "server" || value === "data-center" ? "dc" : "cloud";
	return /\.atlassian\.net(\/|$)/i.test(url) ? "cloud" : "dc";
}

export function normalizeBaseUrl(url: string): string {
	return url.replace(/\/+$/, "");
}

export function loadSecrets(): LoadResult {
	const { data, source, errors } = readFile();
	const jira = data.jira ?? {};

	const url = normalizeBaseUrl(jira.url ?? env("JIRA_URL") ?? "");
	const email = jira.email ?? env("JIRA_EMAIL") ?? env("JIRA_USERNAME");
	const apiToken = jira.apiToken ?? env("JIRA_API_TOKEN");
	const personalToken = jira.personalToken ?? env("JIRA_PERSONAL_TOKEN");
	const acceptanceField = jira.acceptanceField ?? env("JIRA_ACCEPTANCE_FIELD");
	const epicsDir = data.epicsDir ?? env("EPICS_DIR");
	const deployment = inferDeployment(url, jira.deployment ?? env("JIRA_DEPLOYMENT"));

	// Catálogo de produtos é opcional: quando ausente, o fluxo cai no fallback
	// de repositório. Config pela env PRODUCTS_URL / PRODUCTS_TOKEN.
	const productsUrl = data.products?.url ?? env("PRODUCTS_URL");
	const productsToken = data.products?.token ?? env("PRODUCTS_TOKEN");
	const products: ProductsSecrets | undefined = productsUrl
		? { url: normalizeBaseUrl(productsUrl), token: productsToken }
		: undefined;
	const opensearchUrl = data.opensearch?.url ?? env("OPENSEARCH_URL");
	const opensearchApiKey = data.opensearch?.apiKey ?? env("OPENSEARCH_API_KEY");
	const opensearchUsername = data.opensearch?.username ?? env("OPENSEARCH_USERNAME");
	const opensearchPassword = data.opensearch?.password ?? env("OPENSEARCH_PASSWORD");
	const opensearchTimeField = data.opensearch?.timeField ?? env("OPENSEARCH_TIME_FIELD");
	const usableOpenSearch =
		opensearchUrl && (opensearchApiKey || (opensearchUsername && opensearchPassword));
	const opensearch: OpenSearchSecrets | undefined = usableOpenSearch
		? {
				url: normalizeBaseUrl(opensearchUrl),
				apiKey: opensearchApiKey,
				username: opensearchUsername,
				password: opensearchPassword,
				index: data.opensearch?.index ?? env("OPENSEARCH_INDEX"),
				timeField: opensearchTimeField,
			}
		: undefined;

	if (!url) errors.push("Jira sem URL. Defina `jira.url` no secrets.json ou a env JIRA_URL.");
	if (!personalToken && !apiToken) {
		errors.push(
			"Jira sem credencial. Defina `jira.apiToken` (Cloud) ou `jira.personalToken` (DC) no secrets.json, ou as envs JIRA_API_TOKEN / JIRA_PERSONAL_TOKEN.",
		);
	}
	if (deployment === "cloud" && apiToken && !email) {
		errors.push("Jira Cloud com apiToken exige `jira.email` (ou env JIRA_EMAIL).");
	}

	if (errors.length > 0) {
		return { secrets: null, source, errors };
	}

	return {
		secrets: { url, deployment, email, apiToken, personalToken, acceptanceField, epicsDir, products, opensearch },
		source,
		errors: [],
	};
}

export { secretsFilePath };

/**
 * Empresas liberadas para execução sem confirmação em ambientes não-locais
 * (`pw2.environments.<nome>.autoRunCompanies`). Lido em modo best-effort: serve
 * só para avisar o refinamento de que um worker vai conseguir validar a task
 * via `pw2_request` fora do TUI, ou se a validação terá de ser manual.
 */
export function loadAutoRunCompanies(): string[] {
	try {
		const { data } = readFile();
		const environments = data.pw2?.environments ?? {};
		const companies = new Set<string>();
		for (const config of Object.values(environments)) {
			const list = config?.autoRunCompanies;
			if (!Array.isArray(list)) continue;
			for (const company of list) {
				if (typeof company === "string" && company.trim()) companies.add(company.trim());
			}
		}
		return [...companies];
	} catch {
		return [];
	}
}

/**
 * Grava (ou mescla) as credenciais em `~/.pi/agent/secrets.json` com permissão 0600.
 * Usado pelo command `/refinar-issue --setup`.
 */
export function saveSecrets(input: {
	url: string;
	deployment: Deployment;
	email?: string;
	personalToken?: string;
	apiToken?: string;
	acceptanceField?: string;
	epicsDir?: string;
}): string {
	const file = secretsFilePath();
	const { data } = readFile();

	const jira: NonNullable<FilesShape["jira"]> = {
		...(data.jira ?? {}),
		url: input.url,
		deployment: input.deployment,
	};
	delete jira.email;
	delete jira.personalToken;
	delete jira.apiToken;
	if (input.email) jira.email = input.email;
	if (input.personalToken) jira.personalToken = input.personalToken;
	if (input.apiToken) jira.apiToken = input.apiToken;
	if (input.acceptanceField) jira.acceptanceField = input.acceptanceField;

	const next: FilesShape = { ...data, jira };
	if (input.epicsDir) next.epicsDir = input.epicsDir;

	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
	try {
		fs.chmodSync(file, 0o600);
	} catch {
		// best effort em filesystems sem chmod
	}
	return file;
}
