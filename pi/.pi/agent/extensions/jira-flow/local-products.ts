/**
 * Registro local de produtos → repos, para os produtos que ainda **não** estão
 * no índice `mcpb`.
 *
 * A indexação do mcpb é gradual (um produto por vez). Enquanto um produto não
 * está indexado, `mcpb context` não tem o que devolver — e sem repos o
 * refinamento volta a adivinhar. Este arquivo preenche essa lacuna: dá o nome
 * exibido, a descrição e os repos (resolvidos no checkout local) para a
 * identificação da issue funcionar desde já.
 *
 * Quando o produto entrar no `catalog.yaml` do mcpb e for indexado, o
 * `mcpb context` passa a vencer (traz overview curado + frescura).
 *
 * Arquivo: `products.json` (sobrescrevível por `JIRA_FLOW_PRODUCTS`).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface LocalProduct {
	displayName: string;
	description: string;
	repos: string[];
}

export type LocalProducts = Record<string, LocalProduct>;

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function loadLocalProducts(extDir: string): LocalProducts {
	const file = process.env.JIRA_FLOW_PRODUCTS?.trim() || path.join(extDir, "products.json");
	try {
		const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
		if (typeof parsed !== "object" || parsed === null) return {};
		const out: LocalProducts = {};
		for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
			if (typeof value !== "object" || value === null) continue;
			const item = value as Record<string, unknown>;
			const repos = Array.isArray(item.repos)
				? item.repos.filter((repo): repo is string => typeof repo === "string" && repo.trim().length > 0)
				: [];
			out[name] = {
				displayName: asString(item.displayName) ?? name,
				description: asString(item.description) ?? "",
				repos,
			};
		}
		return out;
	} catch {
		return {};
	}
}

/** Diretórios onde os checkouts costumam viver, na ordem de tentativa. */
function repoCandidates(name: string, cwd: string): string[] {
	const candidates: string[] = [];
	const ahgDir = process.env.AHG_DIR?.trim();
	if (ahgDir) candidates.push(path.join(ahgDir, name));
	candidates.push(path.join(os.homedir(), "ahg", name));
	candidates.push(path.join("/ahg", name));
	if (cwd) candidates.push(path.resolve(cwd, "..", name));
	return candidates;
}

/** Primeiro checkout local existente do repo; `null` quando não há nenhum. */
export function resolveRepoPath(name: string, cwd = process.cwd()): string | null {
	for (const candidate of repoCandidates(name, cwd)) {
		try {
			if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
		} catch {
			// ignora e tenta o próximo
		}
	}
	return null;
}

export interface LocalProductContext {
	product: string;
	displayName: string;
	description: string;
	repos: { name: string; path?: string }[];
}

/**
 * Monta o contexto do produto a partir do registro local. Devolve `null`
 * quando o produto não está registrado.
 */
export function localProductContext(
	name: string,
	products: LocalProducts,
	cwd = process.cwd(),
): LocalProductContext | null {
	const product = products[name];
	if (!product) return null;
	return {
		product: name,
		displayName: product.displayName,
		description: product.description,
		repos: product.repos.map((repo) => {
			const resolved = resolveRepoPath(repo, cwd);
			return resolved ? { name: repo, path: resolved } : { name: repo };
		}),
	};
}