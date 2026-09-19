/**
 * Modelo por fase do subagente.
 *
 * Fase = agente (`scout`, `planner`, `worker`, `validator`, `task-reviewer`...).
 * A escolha é **uma só**, no arquivo `models.json` ao lado desta extensão
 * (sobrescrevível por `SUBAGENT_MODELS`) — não há duas fontes de verdade para
 * decidir qual modelo ganhou.
 *
 * Precedência:
 *   1. `model` do despacho — existe para o retry escalar o worker depois de um
 *      review com achados `execucao`; não é para uso rotineiro;
 *   2. lista do agente no `models.json`;
 *   3. `model:` no frontmatter do agente;
 *   4. modelo da sessão — último recurso, nunca o primeiro.
 *
 * Cada lista é ordenada: o primeiro que rodar vence, os seguintes são
 * fallback. Ponha o fallback **em outro provider** — dois modelos do mesmo
 * gateway caem juntos quando o gateway cai.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

const THINKING_LEVELS = new Set<string>(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

export interface SubagentModelConfig {
	/** Modelos por agente, em ordem de preferência. */
	agents: Record<string, string[]>;
	/** Esforço de raciocínio por agente. */
	thinking: Record<string, ThinkingLevel>;
}

export const EMPTY_CONFIG: SubagentModelConfig = { agents: {}, thinking: {} };

/**
 * Diretório desta extensão. `import.meta.dir` é do Bun e **não existe** no
 * carregador do pi (o despacho quebrava com "path argument must be of type
 * string"); `__dirname` e `import.meta.url` são o que o resto do repo usa.
 */
function moduleDir(): string | undefined {
	try {
		if (typeof __dirname === "string" && __dirname) return __dirname;
	} catch {
		// ignora: `__dirname` não existe em ESM
	}
	try {
		return path.dirname(fileURLToPath(import.meta.url));
	} catch {
		return undefined;
	}
}

/** Caminho padrão do `models.json` (ao lado desta extensão). */
export function defaultConfigPath(): string | undefined {
	const dir = moduleDir();
	return dir ? path.join(dir, "models.json") : undefined;
}

function asModelList(value: unknown): string[] {
	if (typeof value === "string") return value.trim() ? [value.trim()] : [];
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => (typeof item === "string" ? item.trim() : ""))
		.filter((item) => item.length > 0);
}

/** Lê `models.json` (env `SUBAGENT_MODELS` tem precedência). */
export function loadModelConfig(dir?: string, file?: string): SubagentModelConfig {
	const target =
		process.env.SUBAGENT_MODELS?.trim() || file || (dir ? path.join(dir, "models.json") : undefined) || defaultConfigPath();
	if (!target) return EMPTY_CONFIG;
	let raw: unknown;
	try {
		if (!fs.existsSync(target)) return EMPTY_CONFIG;
		raw = JSON.parse(fs.readFileSync(target, "utf8"));
	} catch {
		return EMPTY_CONFIG;
	}
	if (!raw || typeof raw !== "object") return EMPTY_CONFIG;
	const source = raw as { agents?: unknown; thinking?: unknown };
	const agents: Record<string, string[]> = {};
	if (source.agents && typeof source.agents === "object") {
		for (const [name, value] of Object.entries(source.agents as Record<string, unknown>)) {
			const list = asModelList(value);
			if (list.length > 0) agents[name] = list;
		}
	}
	const thinking: Record<string, ThinkingLevel> = {};
	if (source.thinking && typeof source.thinking === "object") {
		for (const [name, value] of Object.entries(source.thinking as Record<string, unknown>)) {
			const level = typeof value === "string" ? value.trim() : "";
			if (THINKING_LEVELS.has(level)) thinking[name] = level as ThinkingLevel;
		}
	}
	return { agents, thinking };
}

export interface ModelResolution {
	/** Candidatos em ordem: o primeiro é o preferido, o resto é fallback. */
	models: (string | undefined)[];
	thinking?: ThinkingLevel;
	/** De onde veio o primeiro candidato — vai para o relatório do despacho. */
	source: "dispatch" | "config" | "frontmatter" | "sessao";
}

/** Resolve a cadeia de modelos do agente (primário + fallbacks). */
export function resolveModel(input: {
	agentName: string;
	agentModel?: string;
	dispatchModel?: string;
	sessionModel?: string;
	config: SubagentModelConfig;
}): ModelResolution {
	const { agentName, agentModel, dispatchModel, sessionModel, config } = input;
	const configured = config.agents[agentName] ?? [];
	const dispatch = (dispatchModel ?? "").trim();
	const frontmatter = (agentModel ?? "").trim();
	const session = (sessionModel ?? "").trim();

	const ordered: (string | undefined)[] = [];
	const push = (model: string | undefined) => {
		if (model && !ordered.includes(model)) ordered.push(model);
	};

	if (dispatch) {
		push(dispatch);
		for (const model of configured) push(model);
		push(frontmatter);
		push(session);
		return { models: ordered, thinking: config.thinking[agentName], source: "dispatch" };
	}
	if (configured.length > 0) {
		for (const model of configured) push(model);
		push(frontmatter);
		push(session);
		return { models: ordered, thinking: config.thinking[agentName], source: "config" };
	}
	if (frontmatter) return { models: [frontmatter, session].filter((m): m is string => Boolean(m)), thinking: config.thinking[agentName], source: "frontmatter" };
	push(session);
	return { models: ordered, thinking: config.thinking[agentName], source: "sessao" };
}

/**
 * Vale trocar de modelo? Só quando a tentativa morreu **sem produzir nada** —
 * provider fora, rate limit, modelo indisponível, processo que não subiu.
 *
 * Cuidado que custou um bug: um modelo inexistente devolve `401` numa mensagem
 * `assistant` com conteúdo **vazio** e `stopReason: "error"`. Contar "existe
 * mensagem de assistant" como resposta pulava o fallback exatamente no caso que
 * ele deveria cobrir. O que conta é conteúdo: texto não vazio ou chamada de
 * ferramenta. Se o agente produziu isso e depois falhou, trocar de modelo é
 * sorteio — o problema não é o modelo.
 */
export function shouldFallback(result: {
	messages: readonly { role?: string; content?: unknown }[];
	exitCode?: number;
	stopReason?: string;
}): boolean {
	return !result.messages.some((message) => message.role === "assistant" && hasContent(message.content));
}

/** Conteúdo relevante de uma mensagem: texto não vazio ou chamada de ferramenta. */
function hasContent(content: unknown): boolean {
	if (typeof content === "string") return content.trim().length > 0;
	if (!Array.isArray(content)) return false;
	return content.some((part) => {
		if (!part || typeof part !== "object") return false;
		const typed = part as { type?: unknown; text?: unknown };
		if (typed.type === "text") return typeof typed.text === "string" && typed.text.trim().length > 0;
		return typed.type === "toolCall" || typed.type === "tool_use" || typed.type === "tool-call";
	});
}

/** Motivo curto da falha de uma tentativa, para o relatório. */
export function failureReason(result: { errorMessage?: string; stderr?: string; exitCode?: number }): string {
	const detail = (result.errorMessage ?? "").trim() || (result.stderr ?? "").trim();
	if (detail) return detail.split("\n").slice(-2).join(" ").slice(0, 200);
	return `exit ${result.exitCode ?? "?"}`;
}
