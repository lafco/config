/**
 * Configuração da extensão `todo`.
 *
 * Lê (nunca escreve) `~/.config/pi-todo/config.json`, honrando
 * `XDG_CONFIG_HOME` quando absoluto. Arquivo ausente ou inválido cai nos
 * padrões — a extensão nunca falha por causa de config.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

/** Campos de "guidance" que substituem as instruções padrão dadas ao modelo. */
export interface GuidanceFields {
	promptSnippet?: string;
	promptGuidelines?: string[];
	description?: string;
}

export interface TodoConfig {
	/** Substitui as instruções embutidas sobre quando/como usar a lista. */
	guidance?: GuidanceFields;
	/** Linhas de conteúdo que o overlay pode usar, heading incluso. Mínimo 3. */
	maxWidgetLines?: number;
	/** Atalho para colapsar/expandir o painel. `"off"` desabilita. */
	collapseKey?: string;
}

export const DEFAULT_MAX_WIDGET_LINES = 12;
export const DEFAULT_COLLAPSE_KEY = "ctrl+shift+t";
export const COLLAPSE_KEY_OFF = "off";

const CONFIG_DIR_NAME = "pi-todo";
const CONFIG_FILE_NAME = "config.json";

/** Diretório de config: `$XDG_CONFIG_HOME` (se absoluto) ou `~/.config`. */
function resolveConfigDir(): string {
	const xdg = process.env.XDG_CONFIG_HOME?.trim();
	if (!xdg) return join(homedir(), ".config");
	const expanded = xdg === "~" ? homedir() : xdg.startsWith("~/") ? join(homedir(), xdg.slice(2)) : xdg;
	return isAbsolute(expanded) ? expanded : join(homedir(), ".config");
}

/** Caminho absoluto do arquivo de config. */
export function configPath(): string {
	return join(resolveConfigDir(), CONFIG_DIR_NAME, CONFIG_FILE_NAME);
}

/**
 * Lê o arquivo de config. Devolve `{}` quando ausente, malformado, ou quando o
 * JSON não é um objeto simples (arrays e primitivos são rejeitados).
 */
export function loadConfig(): TodoConfig {
	const path = configPath();
	if (!existsSync(path)) return {};
	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
		if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
		return parsed as TodoConfig;
	} catch (error) {
		console.warn(`[todo] config inválida em ${path}; usando padrões — ${(error as Error).message}`);
		return {};
	}
}

/**
 * Orçamento de linhas de conteúdo do overlay. Lido a cada render (sem precisar
 * de `/reload`). Valores não numéricos ou abaixo do piso de 3 caem no padrão.
 */
export function getMaxWidgetLines(): number {
	const lines = loadConfig().maxWidgetLines;
	if (typeof lines !== "number" || lines < 3) return DEFAULT_MAX_WIDGET_LINES;
	return lines;
}

// ---------------------------------------------------------------------------
// Grammar de keybinding (mesma aceita pelo pi-tui)
// ---------------------------------------------------------------------------

const SPECIAL_KEYS = new Set([
	"escape",
	"esc",
	"enter",
	"return",
	"tab",
	"space",
	"backspace",
	"delete",
	"insert",
	"clear",
	"home",
	"end",
	"pageup",
	"pagedown",
	"up",
	"down",
	"left",
	"right",
	...Array.from({ length: 12 }, (_, i) => `f${i + 1}`),
]);

const MODIFIERS = new Set(["ctrl", "shift", "alt", "super"]);

/**
 * Valida um especificador de tecla no formato `modifier+...+key` aceito pelo
 * pi-tui. Exportado para testes.
 *
 * A checagem é estrita de propósito: o parser do pi-tui ignora partes
 * desconhecidas e usa a última como tecla, então algo como `ctr+]` casaria com
 * qualquer `]` solto. Aqui isso é rejeitado.
 */
export function isValidCollapseKeySpec(spec: string): boolean {
	if (!spec) return false;
	if (spec.startsWith("+") || spec.endsWith("+") || spec.includes("++")) return false;
	const parts = spec.split("+");
	const base = parts[parts.length - 1] ?? "";
	const modifiers = parts.slice(0, -1);
	if (modifiers.length !== new Set(modifiers).size) return false;
	if (!modifiers.every((m) => MODIFIERS.has(m))) return false;
	return base.length === 1 ? /[a-z0-9_\-!@#$%^&*()|~`'":;,./<>?[\]{}=\\]/.test(base) : SPECIAL_KEYS.has(base);
}

/**
 * Resolve o atalho de colapsar/expandir a partir da config, lido a cada
 * chamada. Devolve o padrão quando ausente/vazio/inválido, o sentinela
 * `"off"` quando desabilitado, ou o spec validado em minúsculas.
 */
export function resolveCollapseKey(): string {
	const configured = loadConfig().collapseKey;
	const raw = typeof configured === "string" ? configured.trim().toLowerCase() : undefined;
	if (raw === undefined || raw === "") return DEFAULT_COLLAPSE_KEY;
	if (raw === COLLAPSE_KEY_OFF) return COLLAPSE_KEY_OFF;
	return isValidCollapseKeySpec(raw) ? raw : DEFAULT_COLLAPSE_KEY;
}

// ---------------------------------------------------------------------------
// Validação de guidance
// ---------------------------------------------------------------------------

/**
 * Extrai apenas os campos de guidance válidos de um valor desconhecido.
 * Campos vazios/inválidos são descartados silenciosamente.
 */
export function validateGuidanceFields(fields: unknown): GuidanceFields {
	if (!fields || typeof fields !== "object") return {};
	const g = fields as Record<string, unknown>;
	const result: GuidanceFields = {};
	if (typeof g.promptSnippet === "string" && g.promptSnippet.length > 0) {
		result.promptSnippet = g.promptSnippet;
	}
	if (
		Array.isArray(g.promptGuidelines) &&
		g.promptGuidelines.length > 0 &&
		g.promptGuidelines.every((s) => typeof s === "string" && s.length > 0)
	) {
		result.promptGuidelines = g.promptGuidelines as string[];
	}
	if (typeof g.description === "string" && g.description.length > 0) {
		result.description = g.description;
	}
	return result;
}
