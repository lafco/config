/**
 * Materialização dos artefatos da issue refinada.
 *
 * O harness (esta extension) é quem cria pastas e arquivos. A LLM apenas
 * entrega o conteúdo estruturado via tool (`emit_epic_artifacts` para o Epic e
 * os fluxos planos; `emit_story_artifacts` para a Story e, no futuro, para os
 * fluxos de diagnóstico).
 *
 * Os templates ficam em `templates/*.md` e podem ser editados sem mexer no
 * TypeScript (são lidos a cada execução).
 *
 * Formas da entrega (ver `refinementShape` em `issue-type.ts`):
 * - Epic    -> `materializeEpicStories`: epic.md + stories/STORY-NN-*.md + index.md
 * - Story   -> `materializeStoryTasks`:  story.md + tasks/TASK-NN-*.md + index.md + evidence/
 * - Planos  -> `materializeArtifacts`:   epic.md + tasks/TASK-NN-*.md + index.md
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { IssueFlow } from "./issue-type.ts";

/** Tarefas de código exigem pelo menos um critério de aceite verificável. */
function isCodeTask(type: string | undefined): boolean {
	const value = (type ?? "").trim();
	return value === "Defeito" || value.startsWith("Codificação");
}

/** Tarefa que precisa declarar como será validada. */
function requiresValidation(task: TaskArtifact): boolean {
	if ((task.kind ?? "").trim().toLowerCase() === "correção") return true;
	return isCodeTask(task.type);
}

const TEST_STRATEGIES = new Set<string>(["tdd", "verify-only", "none"]);

/**
 * Definition of ready do contrato de teste: toda tarefa de código declara
 * `test.strategy`; `tdd` exige arquivo + comando vermelho + comando verde;
 * `verify-only` e `none` exigem justificativa.
 */
function validateTestContract(task: TaskArtifact): string[] {
	const errors: string[] = [];
	const strategy = (task.test?.strategy ?? "").trim();

	if (!strategy) {
		errors.push(
			`${task.id} precisa de \`test.strategy\` (\`tdd\`, \`verify-only\` ou \`none\`): declarar como o teste é tratado é parte da quebra.`,
		);
		return errors;
	}
	if (!TEST_STRATEGIES.has(strategy)) {
		errors.push(`${task.id}: \`test.strategy\` inválido ("${strategy}"); use \`tdd\`, \`verify-only\` ou \`none\`.`);
		return errors;
	}
	if (strategy === "tdd") {
		if (!task.test?.file?.trim()) {
			errors.push(`${task.id}: \`test.strategy: tdd\` exige \`test.file\`.`);
		}
		if (!task.test?.redCommand?.trim()) {
			errors.push(`${task.id}: \`test.strategy: tdd\` exige \`test.redCommand\` — o comando que deve falhar antes da implementação.`);
		}
		if (!task.test?.greenCommand?.trim()) {
			errors.push(`${task.id}: \`test.strategy: tdd\` exige \`test.greenCommand\` — o comando que deve passar depois.`);
		}
	} else if (!task.test?.why?.trim()) {
		errors.push(`${task.id}: \`test.strategy: ${strategy}\` exige \`test.why\` justificando por que a tarefa não segue \`tdd\`.`);
	}

	return errors;
}

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

/** História vertical: unidade negociável entre o Epic e as tarefas. */
export interface StoryArtifact {
	id: string;
	title: string;
	/** Key do Jira quando a história já existe; ausente quando ainda é proposta. */
	jiraKey?: string;
	wave: number;
	dependsOn?: string[];
	estimate?: string;
	objective?: string;
	valorObservavel?: string;
	context?: string;
	acceptanceCriteria?: string[];
	analysis?: string;
	affectedAreas?: string;
	outOfScope?: string;
	risks?: string;
	labels?: string[];
	storyPoints?: number;
}

/** Como o agente implementador prova que a tarefa funcionou. */
export interface ValidationSpec {
	kind: "pw2" | "unit-tests" | "manual";
	/** Ambiente do PW2 (`local` quando omitido); fora de `local` exige `company`. */
	environment?: string;
	/** Código da empresa; fora de `local` precisa estar em `autoRunCompanies`. */
	company?: string;
	/** Matrícula usada no teste (padrão local: 236). */
	register?: string;
	steps?: string[];
	/** O que deve ser observado para a validação passar. */
	expected: string;
}

export type TestStrategy = "tdd" | "verify-only" | "none";

/**
 * Contrato de teste da tarefa. `tdd` é o padrão: a tarefa declara o teste que
 * deve falhar antes (RED) e o comando que deve passar depois (GREEN), e a
 * evidência carrega os dois. `verify-only` e `none` exigem justificativa —
 * declarar por que não há teste é diferente de não decidir.
 */
export interface TestSpec {
	strategy: TestStrategy;
	/** Arquivo de teste criado ou estendido pela tarefa (obrigatório em `tdd`). */
	file?: string;
	/** Comando que deve FALHAR antes da implementação (obrigatório em `tdd`). */
	redCommand?: string;
	/** Comando que deve PASSAR depois da implementação (obrigatório em `tdd`). */
	greenCommand?: string;
	/** Por que não é `tdd` (obrigatório em `verify-only` e `none`). */
	why?: string;
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
	/** Execução por agentes em paralelo: repositório e branch de trabalho. */
	repo?: string;
	branch?: string;
	/** Arquivos/áreas prováveis; gate anti-conflito da mesma onda. */
	filesLikelyTouched?: string[];
	/** `false` quando a tarefa é só diagnóstico/explicação (fluxos futuros). */
	implementableByAgent?: boolean;
	/** `diagnóstico | correção | exploração` (fluxos de diagnóstico futuros). */
	kind?: string;
	/** Como validar a implementação (obrigatória no fluxo Story para código). */
	validation?: ValidationSpec;
	/** Contrato de teste (RED/GREEN) da tarefa de código. */
	test?: TestSpec;
}

export interface MaterializeMeta {
	jiraKey: string;
	issueType: string;
	project: string;
	jiraUrl: string;
	syncedAt: string;
	/** Epic pai, quando a issue refinada é uma Story. */
	parentKey?: string;
	parentSummary?: string;
}

export interface MaterializeInput {
	dir: string;
	templatesDir: string;
	epic: EpicArtifact;
	tasks: TaskArtifact[];
	meta: MaterializeMeta;
	/** Fluxo da issue; decide as regras extras de validação/paralelismo. */
	flow?: IssueFlow;
	/** Empresas liberadas em ambientes não-locais (`pw2.autoRunCompanies`). */
	autoRunCompanies?: string[];
}

export interface MaterializeResult {
	dir: string;
	files: string[];
	/** Avisos não bloqueantes (paralelismo incompleto, validação que exigirá humano). */
	warnings: string[];
}

export interface ValidationReport {
	errors: string[];
	warnings: string[];
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

/** Resumo curto para a célula "Valor observável" da tabela do índice. */
function inline(value: string | undefined, max = 90): string {
	const trimmed = (value ?? "").replace(/\s+/g, " ").trim();
	if (!trimmed) return "—";
	return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function cell(value: string | undefined): string {
	return (value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim() || "—";
}

function testSummary(test: TestSpec | undefined): string {
	const strategy = (test?.strategy ?? "").trim();
	if (strategy === "tdd") return "tdd (RED antes, GREEN depois)";
	if (strategy === "verify-only") return "verify-only (valida o que já existe)";
	if (strategy === "none") return "none (sem teste)";
	return "—";
}

function validationSummary(validation: ValidationSpec | undefined): string {
	if (!validation) return "—";
	const parts: string[] = [validation.kind];
	if (validation.environment && validation.environment !== "local") parts.push(validation.environment);
	if (validation.company) parts.push(validation.company);
	if (validation.register) parts.push(`matrícula ${validation.register}`);
	return parts.join(" · ");
}

function readTemplate(templatesDir: string, name: string): string {
	const file = path.join(templatesDir, name);
	if (!fs.existsSync(file)) {
		throw new Error(`Template não encontrado: ${file}`);
	}
	return fs.readFileSync(file, "utf8");
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

function validateEpic(epic: EpicArtifact | undefined): string[] {
	const errors: string[] = [];
	if (!epic?.key) errors.push("epic.key é obrigatório.");
	if (!epic?.summary) errors.push("epic.summary é obrigatório.");
	return errors;
}

function validateUniqueIds(items: { id: string; titleLabel: string }[]): {
	errors: string[];
	ids: Set<string>;
} {
	const errors: string[] = [];
	const ids = new Set<string>();
	for (const item of items) {
		if (!item.id) {
			errors.push(`Toda ${item.titleLabel} precisa de \`id\`.`);
			continue;
		}
		if (ids.has(item.id)) errors.push(`ID duplicado: ${item.id}.`);
		ids.add(item.id);
	}
	return { errors, ids };
}

function validateWave(id: string, wave: number): string[] {
	if (!Number.isInteger(wave) || wave < 1) return [`${id} precisa de \`wave\` inteiro >= 1.`];
	return [];
}

function validateDependencies(
	id: string,
	dependsOn: string[] | undefined,
	ids: Set<string>,
): string[] {
	const errors: string[] = [];
	for (const dependency of dependsOn ?? []) {
		if (!ids.has(dependency)) errors.push(`${id} depende de ${dependency}, que não existe.`);
	}
	return errors;
}

/** Valida a lista de histórias de um Epic. */
export function validateStories(input: { epic: EpicArtifact; stories: StoryArtifact[] }): string[] {
	const errors = validateEpic(input.epic);
	if (!Array.isArray(input.stories) || input.stories.length === 0) {
		errors.push("stories deve conter pelo menos uma história.");
		return errors;
	}

	const { errors: idErrors, ids } = validateUniqueIds(
		input.stories.map((story) => ({ id: story.id, titleLabel: "história" })),
	);
	errors.push(...idErrors);

	for (const story of input.stories) {
		if (!story.id) continue;
		if (!story.title) errors.push(`${story.id} sem título.`);
		errors.push(...validateWave(story.id, story.wave));
		if (!(story.valorObservavel ?? "").trim()) {
			errors.push(`${story.id} precisa de \`valorObservavel\` (o que fica demonstrável e para quem).`);
		}
		if (!(story.acceptanceCriteria?.length)) {
			errors.push(`${story.id} precisa de ao menos um critério de aceite.`);
		}
	}

	for (const story of input.stories) {
		if (!story.id) continue;
		errors.push(...validateDependencies(story.id, story.dependsOn, ids));
	}

	return errors;
}

/**
 * Valida a lista de tarefas. `flow` liga as regras de execução por agentes:
 * no fluxo Story, tarefa de código precisa declarar `validation.expected`.
 */
export function validateTasks(input: { tasks: TaskArtifact[]; flow?: IssueFlow }): string[] {
	const errors: string[] = [];
	if (!Array.isArray(input.tasks) || input.tasks.length === 0) {
		errors.push("tasks deve conter pelo menos uma tarefa.");
		return errors;
	}

	const { errors: idErrors, ids } = validateUniqueIds(
		input.tasks.map((task) => ({ id: task.id, titleLabel: "tarefa" })),
	);
	errors.push(...idErrors);

	const storyFlow = input.flow === "story";

	for (const task of input.tasks) {
		if (!task.id) continue;
		if (!task.title) errors.push(`${task.id} sem título.`);
		errors.push(...validateWave(task.id, task.wave));
		if (isCodeTask(task.type) && !(task.acceptanceCriteria?.length)) {
			errors.push(`${task.id} (${task.type}) precisa de ao menos um critério de aceite.`);
		}
		if ((storyFlow || (task.kind ?? "").toLowerCase() === "correção") && requiresValidation(task)) {
			if (!task.validation?.expected?.trim()) {
				errors.push(
					`${task.id} precisa de \`validation.expected\`: no fluxo Story toda tarefa de código declara como será validada.`,
				);
			}
		}
		if (task.validation?.kind === "pw2") {
			const environment = (task.validation.environment ?? "local").trim() || "local";
			if (environment !== "local" && !task.validation.company?.trim()) {
				errors.push(`${task.id}: validação pw2 em "${environment}" exige \`validation.company\`.`);
			}
		}

		// Definition of ready: a tarefa despachada a um agente nasce com teste
		// declarado, repositório e arquivos prováveis.
		const correcao = (task.kind ?? "").trim().toLowerCase() === "correção";
		const agentTask = requiresValidation(task) && task.implementableByAgent !== false;
		if (agentTask && (storyFlow || correcao)) {
			errors.push(...validateTestContract(task));
		}
		if (agentTask && storyFlow) {
			if (!task.repo?.trim()) {
				errors.push(`${task.id} precisa de \`repo\`: a tarefa é despachada numa worktree própria.`);
			}
			if (!task.filesLikelyTouched?.length) {
				errors.push(
					`${task.id} precisa de \`filesLikelyTouched\`: sem isso o gate anti-conflito da onda não tem o que comparar.`,
				);
			}
		}
	}

	for (const task of input.tasks) {
		if (!task.id) continue;
		errors.push(...validateDependencies(task.id, task.dependsOn, ids));
	}

	return errors;
}

/**
 * Gate anti-conflito das tarefas paralelas: na mesma onda, tarefas do mesmo
 * repositório não podem declarar o mesmo arquivo. Tarefas que não declaram
 * `filesLikelyTouched` viram aviso (a onda pode não ser paralelizável).
 */
function auditParallelism(tasks: TaskArtifact[]): ValidationReport {
	const errors: string[] = [];
	const warnings: string[] = [];
	const byWave = new Map<number, TaskArtifact[]>();
	for (const task of tasks) {
		if (!task.id) continue;
		const list = byWave.get(task.wave) ?? [];
		list.push(task);
		byWave.set(task.wave, list);
	}

	for (const [wave, list] of byWave) {
		if (list.length < 2) continue;
		const declaresFiles = list.some((task) => (task.filesLikelyTouched?.length ?? 0) > 0);
		if (!declaresFiles) continue;

		const owners = new Map<string, string>();
		for (const task of list) {
			const repo = (task.repo ?? "").trim();
			for (const file of task.filesLikelyTouched ?? []) {
				const normalized = file.trim();
				if (!normalized) continue;
				const key = `${repo}::${normalized}`;
				const owner = owners.get(key);
				if (owner) {
					errors.push(
						`Onda ${wave}: ${owner} e ${task.id} declaram o mesmo arquivo (${normalized}); separe-os em ondas diferentes.`,
					);
				} else {
					owners.set(key, task.id);
				}
			}
		}

		for (const task of list) {
			if (!(task.filesLikelyTouched?.length ?? 0)) {
				warnings.push(
					`Onda ${wave}: ${task.id} não declara filesLikelyTouched — confirme que não colide com as tarefas paralelas.`,
				);
			}
		}
	}

	return { errors, warnings };
}

/** Avisa quando a validação por worker não vai passar (empresa sem autoRun). */
function auditValidation(tasks: TaskArtifact[], autoRunCompanies: string[]): string[] {
	const warnings: string[] = [];
	for (const task of tasks) {
		const validation = task.validation;
		if (!validation || validation.kind !== "pw2") continue;
		const environment = (validation.environment ?? "local").trim() || "local";
		if (environment === "local") continue;
		const company = validation.company?.trim();
		if (company && !autoRunCompanies.includes(company)) {
			warnings.push(
				`${task.id}: validação pw2 em "${environment}" com a empresa ${company} fora de autoRunCompanies — o worker não consegue executá-la; trate como validação manual.`,
			);
		}
	}
	return warnings;
}

/** Erros + avisos dos artefatos planos (epic + tasks). */
export function validateArtifacts(
	input: Pick<MaterializeInput, "epic" | "tasks" | "flow" | "autoRunCompanies">,
): ValidationReport {
	const errors = [...validateEpic(input.epic), ...validateTasks({ tasks: input.tasks, flow: input.flow })];
	const parallelism = auditParallelism(input.tasks ?? []);
	return {
		errors: [...errors, ...parallelism.errors],
		warnings: [...parallelism.warnings, ...auditValidation(input.tasks ?? [], input.autoRunCompanies ?? [])],
	};
}

// ---------------------------------------------------------------------------
// Materialização
// ---------------------------------------------------------------------------

function assertNoErrors(prefix: string, errors: string[]): void {
	if (errors.length > 0) {
		throw new Error(`${prefix}:\n- ${errors.join("\n- ")}`);
	}
}

async function writeFile(file: string, content: string, files: string[]): Promise<void> {
	await fs.promises.writeFile(file, content, "utf8");
	files.push(file);
}

function waveSections(
	items: { id: string; title: string; wave: number }[],
	label: string,
): string {
	const waves = [...new Set(items.map((item) => item.wave))].sort((a, b) => a - b);
	return (
		waves
			.map((wave) => {
				const inWave = items.filter((item) => item.wave === wave);
				const lines = inWave.map((item) => `- **${item.id}** — ${item.title}`).join("\n");
				return `### Onda ${wave}\n\n${lines}`;
			})
			.join("\n\n") || label
	);
}

/** epic.md + stories/*.md + index.md (tabela de histórias). */
export async function materializeEpicStories(input: {
	dir: string;
	templatesDir: string;
	epic: EpicArtifact;
	stories: StoryArtifact[];
	meta: MaterializeMeta;
}): Promise<MaterializeResult> {
	const { dir, templatesDir, epic, stories, meta } = input;
	assertNoErrors("Artefatos inválidos", validateStories({ epic, stories }));

	const files: string[] = [];
	await fs.promises.mkdir(path.join(dir, "stories"), { recursive: true });

	const epicFile = path.join(dir, "epic.md");
	await writeFile(
		epicFile,
		renderTemplate(readTemplate(templatesDir, "epic.md"), {
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
		}),
		files,
	);

	for (const story of stories) {
		const jiraKey = story.jiraKey?.trim() ?? "";
		const storyFile = path.join(dir, "stories", `${story.id}-${slugify(story.title)}.md`);
		await writeFile(
			storyFile,
			renderTemplate(readTemplate(templatesDir, "story.md"), {
				id: story.id,
				jiraKey: yamlString(jiraKey),
				jiraKeyText: jiraKey || "ainda não criada no Jira",
				project: meta.project,
				parent: yamlString(meta.jiraKey),
				parentText: `${meta.jiraKey} — ${epic.summary}`,
				summary: yamlString(story.title),
				labelsYaml: yamlList(story.labels),
				storyPoints: yamlNumber(story.storyPoints),
				wave: String(story.wave),
				dependsOnYaml: yamlList(story.dependsOn),
				dependsOnText: (story.dependsOn ?? []).join(", ") || "nenhuma",
				estimate: text(story.estimate, "—"),
				title: story.title,
				objective: text(story.objective),
				valorObservavel: text(story.valorObservavel),
				context: text(story.context),
				acceptanceCriteria: bullets(story.acceptanceCriteria),
				analysis: text(story.analysis),
				affectedAreas: text(story.affectedAreas),
				outOfScope: text(story.outOfScope),
				risks: text(story.risks),
				refinementLink: jiraKey ? `./${jiraKey}/index.md` : "",
			}),
			files,
		);
	}

	const sorted = [...stories].sort((a, b) => a.wave - b.wave || a.id.localeCompare(b.id));
	const storyRows = sorted
		.map((story) => {
			const deps = (story.dependsOn ?? []).join(", ") || "—";
			const link = `[${story.id}](./stories/${story.id}-${slugify(story.title)}.md)`;
			const jiraKey = story.jiraKey?.trim();
			const refinement = jiraKey ? `[\`${jiraKey}\`](./${jiraKey}/index.md)` : "—";
			return `| ${link} | ${cell(story.title)} | ${story.wave} | ${deps} | ${cell(inline(story.valorObservavel))} | ${refinement} |`;
		})
		.join("\n");

	const indexFile = path.join(dir, "index.md");
	await writeFile(
		indexFile,
		renderTemplate(readTemplate(templatesDir, "epic-index.md"), {
			jiraKey: meta.jiraKey,
			issueType: meta.issueType,
			summary: epic.summary,
			jiraUrl: `${meta.jiraUrl}/browse/${meta.jiraKey}`,
			syncedAt: meta.syncedAt,
			storyRows: storyRows || "| — | — | — | — | — | — |",
			waveSections: waveSections(sorted, "—"),
		}),
		files,
	);

	return { dir, files, warnings: [] };
}

/** story.md + tasks/*.md + index.md (tabela de tarefas com validação). */
export async function materializeStoryTasks(input: {
	dir: string;
	templatesDir: string;
	story: StoryArtifact;
	tasks: TaskArtifact[];
	meta: MaterializeMeta;
	flow?: IssueFlow;
	autoRunCompanies?: string[];
}): Promise<MaterializeResult> {
	const { dir, templatesDir, story, tasks, meta } = input;
	const report = validateArtifacts({
		epic: { key: meta.jiraKey, summary: story.title },
		tasks,
		flow: input.flow,
		autoRunCompanies: input.autoRunCompanies,
	});
	assertNoErrors("Artefatos inválidos", report.errors);

	const files: string[] = [];
	await fs.promises.mkdir(path.join(dir, "tasks"), { recursive: true });
	await fs.promises.mkdir(path.join(dir, "evidence"), { recursive: true });

	const jiraKey = story.jiraKey?.trim() || meta.jiraKey;
	const parentKey = meta.parentKey?.trim() ?? "";

	const storyFile = path.join(dir, "story.md");
	await writeFile(
		storyFile,
		renderTemplate(readTemplate(templatesDir, "story.md"), {
			id: story.id,
			jiraKey: yamlString(jiraKey),
			jiraKeyText: jiraKey,
			project: meta.project,
			parent: yamlString(parentKey),
			parentText: parentKey
				? `${parentKey}${meta.parentSummary ? ` — ${meta.parentSummary}` : ""}`
				: "—",
			summary: yamlString(story.title),
			labelsYaml: yamlList(story.labels),
			storyPoints: yamlNumber(story.storyPoints),
			wave: String(story.wave),
			dependsOnYaml: yamlList(story.dependsOn),
			dependsOnText: (story.dependsOn ?? []).join(", ") || "nenhuma",
			estimate: text(story.estimate, "—"),
			title: story.title,
			objective: text(story.objective),
			valorObservavel: text(story.valorObservavel),
			context: text(story.context),
			acceptanceCriteria: bullets(story.acceptanceCriteria),
			analysis: text(story.analysis),
			affectedAreas: text(story.affectedAreas),
			outOfScope: text(story.outOfScope),
			risks: text(story.risks),
			refinementLink: "",
		}),
		files,
	);

	for (const task of tasks) {
		const taskFile = path.join(dir, "tasks", `${task.id}-${slugify(task.title)}.md`);
		await writeFile(
			taskFile,
			renderTemplate(readTemplate(templatesDir, "task.md"), taskVars(task, meta)),
			files,
		);
	}

	const sorted = [...tasks].sort((a, b) => a.wave - b.wave || a.id.localeCompare(b.id));
	const taskRows = sorted
		.map((task) => {
			const deps = (task.dependsOn ?? []).join(", ") || "—";
			const link = `[${task.id}](./tasks/${task.id}-${slugify(task.title)}.md)`;
			return `| ${link} | ${cell(task.title)} | ${task.wave} | ${deps} | ${validationSummary(task.validation)} | ${testSummary(task.test)} | backlog | — | — |`;
		})
		.join("\n");

	const indexFile = path.join(dir, "index.md");
	await writeFile(
		indexFile,
		renderTemplate(readTemplate(templatesDir, "story-index.md"), {
			storyId: story.id,
			jiraKey,
			parentKey: parentKey || "—",
			issueType: meta.issueType,
			summary: story.title,
			jiraUrl: `${meta.jiraUrl}/browse/${jiraKey}`,
			syncedAt: meta.syncedAt,
			taskRows: taskRows || "| — | — | — | — | — | — | — | — | — |",
			waveSections: waveSections(sorted, "—"),
		}),
		files,
	);

	return { dir, files, warnings: report.warnings };
}

function taskVars(task: TaskArtifact, meta: MaterializeMeta): Record<string, string> {
	return {
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
		repo: yamlString(task.repo ?? ""),
		repoText: text(task.repo),
		branch: yamlString(task.branch ?? ""),
		branchText: text(task.branch),
		filesLikelyTouchedYaml: yamlList(task.filesLikelyTouched),
		filesLikelyTouchedText: bullets(task.filesLikelyTouched),
		implementableByAgent: task.implementableByAgent === false ? "false" : "true",
		kind: yamlString(task.kind ?? ""),
		kindText: text(task.kind),
		validationKind: yamlString(task.validation?.kind ?? ""),
		validationEnvironment: yamlString(task.validation?.environment ?? ""),
		validationCompany: yamlString(task.validation?.company ?? ""),
		validationRegister: yamlString(task.validation?.register ?? ""),
		validationExpectedYaml: yamlString(task.validation?.expected ?? ""),
		validationExpected: text(task.validation?.expected),
		validationSteps: bullets(task.validation?.steps),
		validationSummary: validationSummary(task.validation),
		testSummary: testSummary(task.test),
		testStrategyYaml: yamlString(task.test?.strategy ?? ""),
		testFileYaml: yamlString(task.test?.file ?? ""),
		testFileText: text(task.test?.file),
		testRedCommandYaml: yamlString(task.test?.redCommand ?? ""),
		testRedCommandText: text(task.test?.redCommand),
		testGreenCommandYaml: yamlString(task.test?.greenCommand ?? ""),
		testGreenCommandText: text(task.test?.greenCommand),
		testWhyYaml: yamlString(task.test?.why ?? ""),
		testWhyLine: task.test?.why?.trim() ? `- **Justificativa:** ${task.test.why.trim()}` : "",
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
}

/** Fluxos planos (Manutenção/Apoio/Documentação/genérico): epic.md + tasks/. */
export async function materializeArtifacts(input: MaterializeInput): Promise<MaterializeResult> {
	const report = validateArtifacts(input);
	assertNoErrors("Artefatos inválidos", report.errors);

	const { dir, templatesDir, epic, tasks, meta } = input;
	const files: string[] = [];

	await fs.promises.mkdir(path.join(dir, "tasks"), { recursive: true });

	const epicFile = path.join(dir, "epic.md");
	await writeFile(
		epicFile,
		renderTemplate(readTemplate(templatesDir, "epic.md"), {
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
		}),
		files,
	);

	const sorted = [...tasks].sort((a, b) => a.wave - b.wave || a.id.localeCompare(b.id));
	const taskRows = sorted
		.map((task) => {
			const deps = (task.dependsOn ?? []).join(", ") || "—";
			const link = `[${task.id}](./tasks/${task.id}-${slugify(task.title)}.md)`;
			return `| ${link} | ${cell(task.title)} | ${task.wave} | ${deps} | backlog |  |`;
		})
		.join("\n");

	const indexFile = path.join(dir, "index.md");
	await writeFile(
		indexFile,
		renderTemplate(readTemplate(templatesDir, "index.md"), {
			jiraKey: meta.jiraKey,
			issueType: meta.issueType,
			summary: epic.summary,
			jiraUrl: `${meta.jiraUrl}/browse/${meta.jiraKey}`,
			syncedAt: meta.syncedAt,
			taskRows: taskRows || "| — | — | — | — | — | — |",
			waveSections: waveSections(sorted, "—"),
		}),
		files,
	);

	for (const task of tasks) {
		const taskFile = path.join(dir, "tasks", `${task.id}-${slugify(task.title)}.md`);
		await writeFile(taskFile, renderTemplate(readTemplate(templatesDir, "task.md"), taskVars(task, meta)), files);
	}

	return { dir, files, warnings: report.warnings };
}
