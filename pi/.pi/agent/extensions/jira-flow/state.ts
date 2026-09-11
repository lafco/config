/**
 * Estado em memória do refinamento em andamento.
 *
 * O harness monta a Fase 0 (produto/repos) antes de disparar o turno da LLM;
 * as tools (`ask_user`, `submit_analysis`, `consult_specialist`,
 * `emit_epic_artifacts`) leem daqui. Nada é persistido em disco: cada
 * `/refinar-issue` recomeça o estado, e `session_shutdown` zera tudo.
 */

import type { ProductsClient, ProductContext } from "./products.ts";

export interface RefinementState {
	/** Key do épico (ex.: PROJ-123). */
	key: string;
	/** Projeto do Jira (ex.: PROJ). */
	project: string;
	/** Pasta de trabalho dos artefatos. */
	dir: string;
	/** URL base do Jira, para montar os links. */
	jiraUrl: string;
	/** Produto/repos/especialistas resolvidos na Fase 0 (quando houver). */
	productContext: ProductContext | null;
	/** Cliente do catálogo, para a tool `consult_specialist`. */
	products: ProductsClient | null;
	/** Repositório de fallback (`--repo` ou `cwd`), quando o catálogo não resolveu. */
	fallbackRepo: string | null;
	/** Aviso da Fase 0 (catálogo fora, sem repo etc.), para o resumo/mensagem. */
	catalogNote: string | null;
	/** Gate: só emite artefatos depois da análise aprovada via `submit_analysis`. */
	analysisApproved: boolean;
	analysisApprovedAt: string | null;
}

let current: RefinementState | null = null;

export interface StartRefinementInput {
	key: string;
	project: string;
	dir: string;
	jiraUrl: string;
	productContext: ProductContext | null;
	products: ProductsClient | null;
	fallbackRepo: string | null;
	catalogNote: string | null;
}

export function startRefinement(input: StartRefinementInput): RefinementState {
	current = {
		...input,
		analysisApproved: false,
		analysisApprovedAt: null,
	};
	return current;
}

export function getRefinement(): RefinementState | null {
	return current;
}

export function stopRefinement(): void {
	current = null;
}

export function approveAnalysis(): void {
	if (!current) return;
	current.analysisApproved = true;
	current.analysisApprovedAt = new Date().toISOString();
}
