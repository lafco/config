/**
 * Materialização dos artefatos da issue refinada.
 *
 * O harness (esta extension) é quem cria pastas e arquivos. A LLM apenas
 * entrega o conteúdo estruturado via tool `emit_epic_artifacts`.
 *
 * Os templates ficam em `templates/*.md` e podem ser editados sem mexer no
 * TypeScript (são lidos a cada execução). Os nomes dos arquivos permanecem
 * compatíveis com o fluxo antigo, mesmo quando a issue não é um Epic.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** Tarefas de código exigem pelo menos um critério de aceite verificável. */
const CODE_TASK_TYPES = new Set(["Codificação [BACKEND]", "Codificação [FRONTEND]", "Defeito"]);

export interface EpicArtifact {
	key: string;
	summary: string;
	objective?: string;
	context?: string;
	successCriteria?: string;
	analysis?: string;
	outOfScope?: string;
	openQuestions?: string;
	labels?: string[];
}

export interface TaskArtifact {
	id: string;
	title: string;
	wave: number;
	dependsOn?: string[];
	estimate?: string;
	objective?: string;
	valorObservavel?: string;
	context?: string;
	acceptanceCriteria?: string[];
	technicalNotes?: string;
	affectedAreas?: string;
	tests?: string;
	outOfScope?: string;
	risks?: string;
	labels?: string[];
	type?: string;
	storyPoints?: number;
}

export interface MaterializeMeta {
	jiraKey: string;
	issueType: string;
	project: string;
	jiraUrl: string;
	syncedAt: string;
}

export interface MaterializeInput {
	dir: string;
	templatesDir: string;
	epic: EpicArtifact;
	tasks: TaskArtifact[];
	meta: MaterializeMeta;
}

export interface MaterializeResult {
	dir: string;
	files: string[];
}

export function slugify(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60)
		.replace(/-+$/g, "");
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => vars[name] ?? "");
}

function yamlString(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
}

function yamlList(values: string[] | undefined): string {
	if (!values || values.length === 0) return "[]";
	return `[${values.map((value) => yamlString(value)).join(", ")}]`;
}

function yamlNumber(value: number | undefined): string {
	return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function text(value: string | undefined, fallback = "—"): string {
	const trimmed = (value ?? "").trim();
	return trimmed ? trimmed : fallback;
}

function bullets(values: string[] | undefined): string {
	if (!values || values.length === 0) return "—";
	return values.map((value) => `- ${value}`).join("\n");
}

function readTemplate(templatesDir: string, name: string): string {
	const file = path.join(templatesDir, name);
	if (!fs.existsSync(file)) {
		throw new Error(`Template não encontrado: ${file}`);
	}
	return fs.readFileSync(file, "utf8");
}

export function validateArtifacts(input: Pick<MaterializeInput, "epic" | "tasks">): string[] {
	const errors: string[] = [];
	if (!input.epic?.key) errors.push("epic.key é obrigatório.");
	if (!input.epic?.summary) errors.push("epic.summary é obrigatório.");
	if (!Array.isArray(input.tasks) || input.tasks.length === 0) {
		errors.push("tasks deve conter pelo menos uma tarefa.");
		return errors;
	}

	const ids = new Set<string>();
	for (const task of input.tasks) {
		if (!task.id) {
			errors.push("Toda tarefa precisa de `id` (ex.: TASK-01).");
			continue;
		}
		if (ids.has(task.id)) errors.push(`ID de tarefa duplicado: ${task.id}.`);
		ids.add(task.id);
		if (!task.title) errors.push(`${task.id} sem título.`);
		if (!Number.isInteger(task.wave) || task.wave < 1) {
			errors.push(`${task.id} precisa de \`wave\` inteiro >= 1.`);
		}
		if (CODE_TASK_TYPES.has((task.type ?? "").trim()) && !(task.acceptanceCriteria?.length)) {
			errors.push(`${task.id} (${task.type}) precisa de ao menos um critério de aceite.`);
		}
	}

	for (const task of input.tasks) {
		for (const dependency of task.dependsOn ?? []) {
			if (!ids.has(dependency)) {
				errors.push(`${task.id} depende de ${dependency}, que não existe.`);
			}
		}
	}

	return errors;
}

export async function materializeArtifacts(input: MaterializeInput): Promise<MaterializeResult> {
	const errors = validateArtifacts(input);
	if (errors.length > 0) {
		throw new Error(`Artefatos inválidos:\n- ${errors.join("\n- ")}`);
	}

	const { dir, templatesDir, epic, tasks, meta } = input;
	const files: string[] = [];

	await fs.promises.mkdir(path.join(dir, "tasks"), { recursive: true });

	// epic.md
	const epicVars = {
		jiraKey: meta.jiraKey,
		project: meta.project,
		issueType: yamlString(meta.issueType),
		type: yamlString(meta.issueType),
		summary: yamlString(epic.summary),
		labelsYaml: yamlList(epic.labels),
		jiraUrl: `${meta.jiraUrl}/browse/${meta.jiraKey}`,
		syncedAt: meta.syncedAt,
		title: epic.summary,
		objective: text(epic.objective),
		context: text(epic.context),
		successCriteria: text(epic.successCriteria),
		analysis: text(epic.analysis),
		outOfScope: text(epic.outOfScope),
		openQuestions: text(epic.openQuestions),
	};
	const epicFile = path.join(dir, "epic.md");
	await fs.promises.writeFile(epicFile, renderTemplate(readTemplate(templatesDir, "epic.md"), epicVars), "utf8");
	files.push(epicFile);

	// index.md
	const sorted = [...tasks].sort((a, b) => a.wave - b.wave || a.id.localeCompare(b.id));
	const taskRows = sorted
		.map((task) => {
			const deps = (task.dependsOn ?? []).join(", ") || "—";
			const link = `[${task.id}](./tasks/${task.id}-${slugify(task.title)}.md)`;
			return `| ${task.id} | ${task.title} | ${task.wave} | ${deps} | backlog |  |`;
		})
		.join("\n");

	const waves = [...new Set(sorted.map((task) => task.wave))].sort((a, b) => a - b);
	const waveSections = waves
		.map((wave) => {
			const inWave = sorted.filter((task) => task.wave === wave);
			const items = inWave.map((task) => `- **${task.id}** — ${task.title}`).join("\n");
			return `### Onda ${wave}\n\n${items}`;
		})
		.join("\n\n");

	const indexVars = {
		jiraKey: meta.jiraKey,
		issueType: meta.issueType,
		summary: epic.summary,
		jiraUrl: `${meta.jiraUrl}/browse/${meta.jiraKey}`,
		syncedAt: meta.syncedAt,
		taskRows: taskRows || "| — | — | — | — | — | — |",
		waveSections: waveSections || "—",
	};
	const indexFile = path.join(dir, "index.md");
	await fs.promises.writeFile(indexFile, renderTemplate(readTemplate(templatesDir, "index.md"), indexVars), "utf8");
	files.push(indexFile);

	// tasks/*.md
	for (const task of tasks) {
		const vars = {
			id: task.id,
			project: meta.project,
			type: task.type ?? "Task",
			parent: meta.jiraKey,
			summary: yamlString(task.title),
			labelsYaml: yamlList(task.labels),
			storyPoints: yamlNumber(task.storyPoints),
			wave: String(task.wave),
			dependsOnYaml: yamlList(task.dependsOn),
			dependsOnText: (task.dependsOn ?? []).join(", ") || "nenhuma",
			estimate: text(task.estimate, "—"),
			title: task.title,
			objective: text(task.objective),
			valorObservavel: text(task.valorObservavel),
			context: text(task.context),
			acceptanceCriteria: bullets(task.acceptanceCriteria),
			technicalNotes: text(task.technicalNotes),
			affectedAreas: text(task.affectedAreas),
			tests: text(task.tests),
			outOfScope: text(task.outOfScope),
			risks: text(task.risks),
		};
		const taskFile = path.join(dir, "tasks", `${task.id}-${slugify(task.title)}.md`);
		await fs.promises.writeFile(taskFile, renderTemplate(readTemplate(templatesDir, "task.md"), vars), "utf8");
		files.push(taskFile);
	}

	return { dir, files };
}
