/**
 * Estado em memória do refinamento em andamento.
 *
 * O harness monta a Fase 0 (produto/repos) antes de disparar o turno da LLM;
 * as tools (`ask_user`, `submit_analysis`, `consult_specialist`,
 * `emit_epic_artifacts`) leem daqui. Nada é persistido em disco: cada
 * `/refinar-issue` recomeça o estado, e `session_shutdown` zera tudo.
 *
 * Não há gate de aprovação da análise: `submit_analysis` só registra o
 * entendimento; a validação humana é a negociação da quebra e a confirmação
 * antes de gravar.
 */

import type { JiraClient } from "./jira.ts";
import type { IssueFlow } from "./issue-type.ts";
import type { McpbProductContext } from "./mcpb.ts";
import type { OpenSearchClient } from "./opensearch.ts";
import type { ProductsClient, ProductContext } from "./products.ts";

export interface RefinementState {
	/** Key da issue (ex.: PROJ-123). */
	key: string;
	/** Tipo original retornado pelo Jira e fluxo selecionado. */
	issueType: string;
	flow: IssueFlow;
	/** Projeto do Jira (ex.: PROJ). */
	project: string;
	/** Pasta de trabalho dos artefatos. */
	dir: string;
	/** URL base do Jira, para montar os links. */
	jiraUrl: string;
	/** Cliente autenticado, usado apenas por operações explicitamente confirmadas. */
	jira: JiraClient;
	/** Cliente opcional para investigação de logs em manutenção/apoio. */
	opensearch: OpenSearchClient | null;
	/** Produto/repos/especialistas resolvidos na Fase 0 (quando houver). */
	productContext: ProductContext | null;
	/** Cliente do catálogo, para a tool `consult_specialist`. */
	products: ProductsClient | null;
	/** Repositório de fallback (`--repo` ou `cwd`), quando o catálogo não resolveu. */
	fallbackRepo: string | null;
	/** Aviso da Fase 0 (catálogo fora, sem repo etc.), para o resumo/mensagem. */
	catalogNote: string | null;
	/** Epic pai, quando a issue refinada é uma Story (contexto do refinamento). */
	parentKey: string | null;
	parentSummary: string | null;
	/** Repositório primário (primeiro do produto ou fallback), para a execução por agentes. */
	primaryRepo: string | null;
	/** Contexto local do índice mcpb (Fase 0), quando disponível. */
	mcpbContext: McpbProductContext | null;
	/** Caminho do CLI bin/mcpb (fallback do consult_specialist). */
	mcpbBin: string | null;
}

let current: RefinementState | null = null;

export interface StartRefinementInput {
	key: string;
	issueType: string;
	flow: IssueFlow;
	jira: JiraClient;
	opensearch: OpenSearchClient | null;
	project: string;
	dir: string;
	jiraUrl: string;
	productContext: ProductContext | null;
	products: ProductsClient | null;
	fallbackRepo: string | null;
	catalogNote: string | null;
	mcpbContext: McpbProductContext | null;
	mcpbBin: string | null;
	parentKey?: string | null;
	parentSummary?: string | null;
	primaryRepo?: string | null;
}

export function startRefinement(input: StartRefinementInput): RefinementState {
	current = {
		...input,
		parentKey: input.parentKey ?? null,
		parentSummary: input.parentSummary ?? null,
		primaryRepo: input.primaryRepo ?? null,
	};
	return current;
}

export function getRefinement(): RefinementState | null {
	return current;
}

export function stopRefinement(): void {
	current = null;
}
