/**
 * Convenções de validação do time, aplicadas pelo harness.
 *
 * Hoje o único caso é o PW2 **local**: os testes rodam sempre na empresa
 * `a408453` e, por padrão, com a matrícula `236`. O arquivo fica em
 * `validation-defaults.json` (editável sem mexer no TypeScript) e pode ser
 * trocado por `JIRA_FLOW_VALIDATION_DEFAULTS`.
 *
 * O harness usa isto em dois lugares:
 *  1. injeta a convenção na mensagem do refinamento (fato, não sugestão);
 *  2. preenche `validation.company`/`validation.register` quando o fluxo
 *     declarou `kind: "pw2"` local e deixou o campo vazio.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { TaskArtifact } from "./artifacts.ts";

export interface Pw2LocalDefaults {
	environment: string;
	company: string;
	register: string;
}

export interface ValidationDefaults {
	pw2Local: Pw2LocalDefaults | null;
}

const EMPTY: ValidationDefaults = { pw2Local: null };

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function loadValidationDefaults(extDir: string): ValidationDefaults {
	const file = process.env.JIRA_FLOW_VALIDATION_DEFAULTS?.trim() || path.join(extDir, "validation-defaults.json");
	try {
		if (!fs.existsSync(file)) return EMPTY;
		const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { pw2Local?: Record<string, unknown> };
		const pw2 = raw.pw2Local ?? {};
		const company = asString(pw2.company);
		const register = asString(pw2.register);
		if (!company) return EMPTY;
		return {
			pw2Local: {
				environment: asString(pw2.environment) ?? "local",
				company,
				register: register ?? "",
			},
		};
	} catch {
		return EMPTY;
	}
}

/**
 * Completa as tarefas com a convenção local do PW2. Só toca em validação
 * `pw2` de ambiente local: fora do local a empresa é decisão da tarefa.
 */
export function applyValidationDefaults(tasks: TaskArtifact[], defaults: ValidationDefaults): TaskArtifact[] {
	const local = defaults.pw2Local;
	if (!local) return tasks;
	for (const task of tasks) {
		const validation = task.validation;
		if (!validation || validation.kind !== "pw2") continue;
		const environment = (validation.environment ?? local.environment).trim() || local.environment;
		if (environment !== "local") continue;
		validation.environment = environment;
		if (!validation.company?.trim()) validation.company = local.company;
		if (!validation.register?.trim() && local.register) validation.register = local.register;
	}
	return tasks;
}

/** Seção da mensagem do refinamento com a convenção local (fonte: harness). */
export function validationDefaultsMarkdown(defaults: ValidationDefaults): string {
	if (!defaults.pw2Local) return "";
	const { environment, company, register } = defaults.pw2Local;
	return [
		"## Convenção de validação (resolvida pelo harness)",
		"",
		`- Testes **locais** do PW2 usam sempre o ambiente \`${environment}\`, a empresa \`${company}\`${
			register ? ` e a matrícula padrão \`${register}\`` : ""
		}.`,
		"- Ao declarar `validation` com `kind: \"pw2\"`, preencha `environment` e `company` com esses valores e cite a matrícula padrão nos `steps`.",
		"- O harness preenche `company`/`register` quando você deixar vazio; ainda assim, declare explicitamente quando o cenário pedir outra matrícula.",
	].join("\n");
}