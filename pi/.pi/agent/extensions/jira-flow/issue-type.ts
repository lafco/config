/** Classificação dos tipos do Jira em fluxos de refinamento. */

export type IssueFlow = "epic" | "story" | "maintenance" | "customer-support" | "documentation" | "generic";

/**
 * Forma da quebra produzida pelo refinamento (o que a issue vira ao ser
 * entregue):
 * - `stories`   — Epic: decompõe o escopo em histórias verticais.
 * - `tasks`     — Story (e fluxos planos): quebra em tarefas implementáveis.
 * - `diagnosis` — Manutenção/Apoio: investiga o ocorrido antes de corrigir.
 *
 * `diagnosis` já é mapeado hoje, mas só passa a ser materializado quando os
 * fluxos de Manutenção/Apoio tiverem instruções próprias (evolução futura).
 */
export type RefinementShape = "stories" | "tasks" | "diagnosis";

export interface IssueTypeClassification {
	/** Nome original retornado pelo Jira. */
	rawType: string;
	/** Fluxo escolhido pelo harness. */
	flow: IssueFlow;
	/** Nome estável para logs, artefatos e instruções. */
	label: string;
}

function normalize(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/**
 * Mantém os nomes específicos do Jira fora do restante do fluxo.
 * Aliases podem ser ampliados sem alterar o command ou as tools.
 */
export function classifyIssueType(type: string | undefined): IssueTypeClassification {
	const rawType = (type ?? "").trim();
	const value = normalize(rawType);

	if (value === "epic" || value === "epico") {
		return { rawType, flow: "epic", label: "Epic" };
	}
	if (value === "story" || value === "user story" || value === "historia") {
		return { rawType, flow: "story", label: "Story" };
	}
	if (
		value === "maintenance" ||
		value === "manutencao" ||
		value === "manutencao corretiva" ||
		value === "manutencao evolutiva"
	) {
		return { rawType, flow: "maintenance", label: "Manutenção" };
	}
	if (
		value === "customer support" ||
		value === "customer service" ||
		value === "apoio cliente" ||
		value === "apoio ao cliente" ||
		value === "suporte ao cliente" ||
		value === "atendimento ao cliente"
	) {
		return { rawType, flow: "customer-support", label: "Apoio ao cliente" };
	}
	if (value === "documentation" || value === "documentacao") {
		return { rawType, flow: "documentation", label: "Documentação" };
	}

	return { rawType, flow: "generic", label: rawType || "Tipo desconhecido" };
}

/**
 * Traduz o fluxo no formato da entrega. É o gate que decide qual tool de
 * emissão grava o quê: `stories` ⇒ `emit_epic_artifacts` (epic); qualquer
 * outra forma ⇒ `emit_story_artifacts` (tasks) — ver `tools.ts`.
 */
export function refinementShape(flow: IssueFlow): RefinementShape {
	switch (flow) {
		case "epic":
			return "stories";
		case "maintenance":
		case "customer-support":
			return "diagnosis";
		default:
			return "tasks";
	}
}

export function flowDescription(flow: IssueFlow): string {
	switch (flow) {
		case "epic":
			return "decomposição em histórias verticais";
		case "story":
			return "quebra em tarefas implementáveis por agentes";
		case "maintenance":
			return "investigação de causa, evidências, correção e validação";
		case "customer-support":
			return "diagnóstico, testes e explicação sem implementação de código";
		case "documentation":
			return "fluxo genérico até que o fluxo de documentação seja definido";
		default:
			return "refinamento genérico da issue";
	}
}
