/**
 * epic-runner — execução das tarefas de uma story refinada.
 *
 * As tools atuam sobre os artefatos já gravados pelo `jira-flow`
 * (`~/epics/<KEY>/`): leem a próxima onda pronta, preparam worktrees isoladas,
 * atualizam o status das tarefas e registram a evidência de validação.
 *
 * O despacho em si (um worker por tarefa) fica no prompt `/implement-story`,
 * que usa a tool `subagent` com a lista de tarefas desta extensão.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { resolveEpicsDir } from "./epics-dir.ts";
import {
	detectFileConflicts,
	readStory,
	reviewRoute,
	selectReadyWave,
	setTaskReview,
	setTaskStatus,
	updateIndexRow,
	writeEvidence,
	writeReview,
	type TaskFile,
} from "./tasks.ts";
import { addWorktree, removeWorktree, worktreePath } from "./worktrees.ts";

const STATUSES = ["backlog", "fazendo", "pronto", "bloqueado", "cancelado"] as const;

interface ToolResult<T> {
	content: { type: "text"; text: string }[];
	details: T;
	isError?: boolean;
}

function ok<T>(text: string, details: T): ToolResult<T> {
	return { content: [{ type: "text", text }], details };
}

function fail<T>(text: string, details: T): ToolResult<T> {
	return { content: [{ type: "text", text }], details, isError: true };
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function taskBrief(task: TaskFile) {
	return {
		id: task.id,
		title: task.title,
		wave: task.wave,
		status: task.status,
		dependsOn: task.dependsOn,
		repo: task.repo ?? null,
		branch: task.branch ?? null,
		filesLikelyTouched: task.filesLikelyTouched,
		kind: task.kind ?? null,
		validation: task.validationKind
			? {
					kind: task.validationKind,
					environment: task.validationEnvironment ?? null,
					company: task.validationCompany ?? null,
					register: task.validationRegister ?? null,
					expected: task.validationExpected ?? null,
				}
			: null,
		test: task.testStrategy
			? {
					strategy: task.testStrategy,
					file: task.testFile ?? null,
					redCommand: task.testRedCommand ?? null,
					greenCommand: task.testGreenCommand ?? null,
				}
			: null,
		review: task.reviewStatus ? { status: task.reviewStatus, category: task.reviewCategory ?? null } : null,
		attempts: task.attempts,
		file: task.file,
	};
}

// ---------------------------------------------------------------------------
// list_story_tasks
// ---------------------------------------------------------------------------

const ListSchema = Type.Object({
	storyKey: Type.String({ description: "Key da story (ex.: PROJ-123)." }),
	wave: Type.Optional(Type.Integer({ minimum: 1, description: "Restringe a uma onda específica." })),
});
type ListParams = Static<typeof ListSchema>;

function registerListTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "list_story_tasks",
		label: "Listar tarefas prontas da story",
		description:
			"Lista as tarefas da próxima onda pronta da story (dependências concluídas), com repo, branch, filesLikelyTouched e a validação declarada. Use no início do /implement-story para montar a leva de agentes.",
		parameters: ListSchema,
		executionMode: "sequential",
		async execute(_toolCallId, params: ListParams) {
			try {
				const story = readStory(params.storyKey, resolveEpicsDir());
				const ready = selectReadyWave(story.tasks, params.wave);
				const conflicts = detectFileConflicts(ready.tasks);
				const details = {
					storyKey: story.key,
					dir: story.dir,
					wave: ready.wave,
					tasks: ready.tasks.map(taskBrief),
					blockedByDependencies: ready.blockedByDependencies.map((task) => task.id),
					conflicts,
					allTasks: story.tasks.map((task) => ({
						id: task.id,
						wave: task.wave,
						status: task.status,
						dependsOn: task.dependsOn,
						repo: task.repo ?? null,
					})),
				};
				const reviewOf = new Map(
					story.tasks
						.filter((task) => task.reviewStatus === "achados" && task.reviewCategory)
						.map((task) => [task.id, task] as const),
				);
				if (ready.tasks.length === 0) {
					return ok(
						ready.blockedByDependencies.length > 0
							? `Onda ${ready.wave}: nenhuma tarefa pronta — ${ready.blockedByDependencies.length} aguardando dependência.`
							: "Nenhuma tarefa pronta: todas concluídas (ou a story não tem tarefas não concluídas).",
						details,
					);
				}
				const lines = ready.tasks.map(
					(task) =>
						`- ${task.id} (onda ${task.wave}) — ${task.title}${task.repo ? ` · ${task.repo}` : ""}${
							task.branch ? ` · ${task.branch}` : ""
						}${task.validationKind ? ` · validação ${task.validationKind}` : ""}${
							task.testStrategy ? ` · teste ${task.testStrategy}` : ""
						}${
							task.reviewStatus === "achados" ? ` · review: ${task.reviewCategory ?? "achados"} (tentativa ${task.attempts})` : ""
						}`,
				);
				const inherited = ready.tasks
					.flatMap((task) =>
						(task.dependsOn ?? [])
							.map((dep) => reviewOf.get(dep))
							.filter((depTask): depTask is TaskFile => Boolean(depTask)),
					)
					.map(
						(depTask) =>
							`- ${depTask.id} (dependência) foi revisada com achados \`${depTask.reviewCategory}\` — leia \`review/${depTask.id}-${depTask.slug}-t${depTask.attempts}.md\` antes de construir em cima.`,
					);
				const inheritedBlock = inherited.length > 0 ? `\n\nAchados herdados:\n${inherited.join("\n")}` : "";
				const warning = conflicts.length > 0 ? `\n\nConflitos de arquivo:\n- ${conflicts.join("\n- ")}` : "";
				return ok(
					`Onda ${ready.wave} — ${ready.tasks.length} tarefa(s) pronta(s):\n${lines.join("\n")}${inheritedBlock}${warning}`,
					{ ...details, inheritedReviews: inherited },
				);
			} catch (error) {
				return fail(errorMessage(error), {});
			}
		},
	});
}

// ---------------------------------------------------------------------------
// prepare_task_worktrees
// ---------------------------------------------------------------------------

const PrepareSchema = Type.Object({
	storyKey: Type.String({ description: "Key da story (ex.: PROJ-123)." }),
	taskIds: Type.Array(Type.String(), { description: "IDs das tarefas da leva (ex.: TASK-01)." }),
	repo: Type.Optional(Type.String({ description: "Repositório padrão quando a tarefa não declara `repo`." })),
	baseBranch: Type.Optional(Type.String({ description: "Branch base das worktrees (padrão: branch atual)." })),
	allowWrite: Type.Optional(
		Type.Boolean({
			description: "false bloqueia a criação das worktrees (fluxos só de diagnóstico). Padrão: true.",
		}),
	),
});
type PrepareParams = Static<typeof PrepareSchema>;

function registerPrepareTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "prepare_task_worktrees",
		label: "Preparar worktrees das tarefas",
		description:
			"Cria uma worktree git isolada por tarefa (branch declarada na tarefa) e devolve `cwd` + `branch` para o worker. Recusa a leva se duas tarefas declararem o mesmo arquivo.",
		parameters: PrepareSchema,
		executionMode: "sequential",
		async execute(_toolCallId, params: PrepareParams) {
			if (params.allowWrite === false) {
				return fail("allowWrite=false: este fluxo não altera código, então não há worktrees a preparar.", {});
			}
			try {
				const story = readStory(params.storyKey, resolveEpicsDir());
				const byId = new Map(story.tasks.map((task) => [task.id, task]));
				const selected: TaskFile[] = [];
				const missing: string[] = [];
				for (const id of params.taskIds) {
					const task = byId.get(id.trim().toUpperCase());
					if (task) selected.push(task);
					else missing.push(id);
				}
				if (missing.length > 0) {
					return fail(`Tarefas não encontradas em ${story.dir}: ${missing.join(", ")}`, {});
				}
				if (selected.length === 0) return fail("Informe ao menos uma tarefa.", {});

				const conflicts = detectFileConflicts(selected);
				if (conflicts.length > 0) {
					return fail(`Leva inválida (arquivos em comum):\n- ${conflicts.join("\n- ")}`, { conflicts });
				}

				const results = [];
				for (const task of selected) {
					const repo = (task.repo ?? params.repo ?? "").trim();
					if (!repo) {
						return fail(
							`${task.id} não declara \`repo\` e nenhum repo padrão foi informado — não sei onde criar a worktree.`,
							{},
						);
					}
					if (!fs.existsSync(path.join(repo, ".git"))) {
						return fail(`Repositório git não encontrado: ${repo}`, {});
					}
					const branch = (task.branch ?? `feat/${story.key}-${task.id.toLowerCase()}`).trim();
					const result = await addWorktree({
						taskId: task.id,
						repo,
						branch,
						storyKey: story.key,
						baseBranch: params.baseBranch,
					});
					results.push({ ...result, title: task.title });
					setTaskStatus(task.file, "fazendo");
					updateIndexRow(story.indexFile, task.id, { status: "fazendo" });
				}

				const lines = results.map(
					(result) => `- ${result.taskId} → ${result.cwd} (branch ${result.branch})`,
				);
				return ok(`Worktrees criadas:\n${lines.join("\n")}`, { storyKey: story.key, worktrees: results });
			} catch (error) {
				return fail(errorMessage(error), {});
			}
		},
	});
}

// ---------------------------------------------------------------------------
// update_task_status
// ---------------------------------------------------------------------------

const StatusSchema = Type.Object({
	storyKey: Type.String({ description: "Key da story (ex.: PROJ-123)." }),
	taskId: Type.String({ description: "ID da tarefa (ex.: TASK-01)." }),
	status: Type.Union(
		STATUSES.map((status) => Type.Literal(status)),
		{ description: "Novo status da tarefa." },
	),
});
type StatusParams = Static<typeof StatusSchema>;

function registerStatusTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "update_task_status",
		label: "Atualizar status da tarefa",
		description:
			"Escreve o status da tarefa no arquivo (`task.md`) e na tabela do `index.md` da story. Use `fazendo` ao iniciar a leva e `pronto`/`bloqueado` ao concluir cada tarefa.",
		parameters: StatusSchema,
		executionMode: "sequential",
		async execute(_toolCallId, params: StatusParams) {
			try {
				const story = readStory(params.storyKey, resolveEpicsDir());
				const task = story.tasks.find((item) => item.id === params.taskId.trim().toUpperCase());
				if (!task) return fail(`${params.taskId} não encontrada em ${story.dir}.`, {});
				setTaskStatus(task.file, params.status);
				const updated = updateIndexRow(story.indexFile, task.id, { status: params.status });
				return ok(
					`${task.id} → ${params.status}${updated ? "" : " (aviso: linha não encontrada no index.md)"}`,
					{ taskId: task.id, status: params.status, indexUpdated: updated },
				);
			} catch (error) {
				return fail(errorMessage(error), {});
			}
		},
	});
}

// ---------------------------------------------------------------------------
// write_task_evidence
// ---------------------------------------------------------------------------

const EvidenceSchema = Type.Object({
	storyKey: Type.String({ description: "Key da story (ex.: PROJ-123)." }),
	taskId: Type.String({ description: "ID da tarefa (ex.: TASK-01)." }),
	content: Type.String({ description: "Markdown da evidência: comandos, respostas, veredito da validação." }),
	status: Type.Optional(
		Type.Union(STATUSES.map((status) => Type.Literal(status)), {
			description: "Status a gravar ao registrar a evidência (padrão: mantém o atual).",
		}),
	),
});
type EvidenceParams = Static<typeof EvidenceSchema>;

function registerEvidenceTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "write_task_evidence",
		label: "Gravar evidência da tarefa",
		description:
			"Grava a evidência da tarefa em `evidence/TASK-NN-<slug>.md` e linka na coluna Evidência do `index.md`. Chame ao concluir cada tarefa (inclusive quando a validação for manual e ficar pendente de humano).",
		parameters: EvidenceSchema,
		executionMode: "sequential",
		async execute(_toolCallId, params: EvidenceParams) {
			try {
				const story = readStory(params.storyKey, resolveEpicsDir());
				const task = story.tasks.find((item) => item.id === params.taskId.trim().toUpperCase());
				if (!task) return fail(`${params.taskId} não encontrada em ${story.dir}.`, {});

				const header = [
					`# Evidência — ${task.id} ${task.title}`,
					"",
					`- **Story:** ${story.key}`,
					`- **Onda:** ${task.wave}`,
					`- **Registrada em:** ${new Date().toISOString()}`,
					task.validationKind ? `- **Validação declarada:** ${task.validationKind}` : "",
					task.repo ? `- **Repositório:** ${task.repo}` : "",
					task.branch ? `- **Branch:** ${task.branch}` : "",
					"",
					"---",
					"",
				]
					.filter(Boolean)
					.join("\n");
				const file = writeEvidence(story, task, `${header}${params.content}`);
				const link = `[${task.id}](./evidence/${path.basename(file)})`;
				const updated = updateIndexRow(story.indexFile, task.id, { evidence: link });
				if (params.status) setTaskStatus(task.file, params.status);
				if (params.status) updateIndexRow(story.indexFile, task.id, { status: params.status });
				return ok(`Evidência gravada em ${file}`, { file, indexUpdated: updated });
			} catch (error) {
				return fail(errorMessage(error), {});
			}
		},
	});
}

// ---------------------------------------------------------------------------
// write_task_review
// ---------------------------------------------------------------------------

const ReviewSchema = Type.Object({
	storyKey: Type.String({ description: "Key da story (ex.: PROJ-123)." }),
	taskId: Type.String({ description: "ID da tarefa (ex.: TASK-01)." }),
	verdict: Type.Union([Type.Literal("ok"), Type.Literal("achados")], {
		description: "`ok` quando a tarefa entregou o pedido; `achados` quando há algo a corrigir ou a escalar.",
	}),
	category: Type.Optional(
		Type.Union(
			[
				Type.Literal("quebra"),
				Type.Literal("analise"),
				Type.Literal("execucao"),
				Type.Literal("ambiente"),
				Type.Literal("escopo"),
			],
			{
				description:
					"Obrigatória quando verdict=achados. `quebra` = tarefa não autocontida/ambígua; `analise` = a tarefa pede a coisa errada; `execucao` = implementação incompleta (retenta); `ambiente` = suíte/endpoint/credencial (retenta); `escopo` = fora do que a story pede.",
			},
		),
	),
	findings: Type.String({
		description: "Achados com evidência concreta (arquivo:linha, comando, saída). Vazio quando verdict=ok.",
	}),
});
type ReviewParams = Static<typeof ReviewSchema>;

function registerReviewTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "write_task_review",
		label: "Gravar review da tarefa",
		description:
			"Registra o veredito do revisor em `review/TASK-NN-<slug>-t<attempts>.md`, incrementa `attempts` e preenche a coluna Review do `index.md`. Não bloqueia a esteira: a tool decide a rota pela categoria — `execucao` e `ambiente` retentam uma vez, as demais vão para `bloqueado` com o motivo registrado. Leia `route` na resposta e só re-despache o worker quando for `retry` (levando os achados no brief).",
		parameters: ReviewSchema,
		executionMode: "sequential",
		async execute(_toolCallId, params: ReviewParams) {
			try {
				const story = readStory(params.storyKey, resolveEpicsDir());
				const task = story.tasks.find((item) => item.id === params.taskId.trim().toUpperCase());
				if (!task) return fail(`${params.taskId} não encontrada em ${story.dir}.`, {});

				const findings = params.findings.trim();
				if (params.verdict === "ok" && findings) {
					return fail("verdict=ok não leva `findings`; use `achados` quando houver o que corrigir.", {});
				}
				const category = params.category?.trim();
				if (params.verdict === "achados" && !category) {
					return fail("verdict=achados exige `category` (quebra | analise | execucao | ambiente | escopo).", {});
				}
				if (params.verdict === "achados" && !findings) {
					return fail("verdict=achados exige `findings` com a evidência do que ficou faltando.", {});
				}

				const attempts = task.attempts + 1;
				const route = reviewRoute(params.verdict, category, attempts);

				const status = params.verdict === "ok" ? "ok" : "achados";
				setTaskReview(task.file, { status, category, attempts });

				const header = [
					`# Review — ${task.id} ${task.title}`,
					"",
					`- **Story:** ${story.key}`,
					`- **Tentativa:** ${attempts}`,
					`- **Veredito:** ${status}`,
					category ? `- **Categoria:** ${category}` : "",
					`- **Rota:** ${route}`,
					`- **Registrado em:** ${new Date().toISOString()}`,
					task.branch ? `- **Branch:** ${task.branch}` : "",
					"",
					"---",
					"",
				].filter(Boolean);
				const file = writeReview(story, task, attempts, `${header.join("\n")}\n${findings || "Sem achados."}`);

				const label = route === "ok" ? "ok" : `${status}: ${category ?? "—"}`;
				const link = `[${label}](./review/${path.basename(file)})`;
				updateIndexRow(story.indexFile, task.id, { review: link });
				if (route === "bloqueado") {
					setTaskStatus(task.file, "bloqueado");
					updateIndexRow(story.indexFile, task.id, { status: "bloqueado" });
				}

				const message =
					route === "retry"
						? `${task.id}: achados \`${category}\` na tentativa ${attempts} — re-despache o worker levando o review ${file}.`
						: route === "bloqueado"
							? `${task.id}: achados \`${category}\` na tentativa ${attempts} — marcada como bloqueado (sem retry). Review em ${file}.`
							: `${task.id}: review ok na tentativa ${attempts}. Review em ${file}.`;
				return ok(message, { file, attempts, route, status, category: category ?? null });
			} catch (error) {
				return fail(errorMessage(error), {});
			}
		},
	});
}

// ---------------------------------------------------------------------------
// remove_task_worktrees
// ---------------------------------------------------------------------------

const CleanupSchema = Type.Object({
	storyKey: Type.String({ description: "Key da story (ex.: PROJ-123)." }),
	repo: Type.String({ description: "Repositório onde as worktrees foram criadas." }),
	tasks: Type.Array(
		Type.Object({
			taskId: Type.String(),
			branch: Type.Optional(Type.String()),
		}),
		{ description: "Tarefas cujas worktrees serão removidas." },
	),
});
type CleanupParams = Static<typeof CleanupSchema>;

function registerCleanupTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "remove_task_worktrees",
		label: "Remover worktrees das tarefas",
		description:
			"Remove as worktrees das tarefas (e as branches, best-effort). Chame ao encerrar a leva, depois do merge/decisão humana — as branches não são mergeadas automaticamente.",
		parameters: CleanupSchema,
		executionMode: "sequential",
		async execute(_toolCallId, params: CleanupParams) {
			try {
				const storyKey = params.storyKey.trim().toUpperCase();
				const results = [];
				for (const task of params.tasks) {
					const cwd = worktreePath(params.repo, storyKey, task.taskId.trim().toUpperCase());
					if (!fs.existsSync(cwd)) {
						results.push({ taskId: task.taskId, cwd, removed: false, branchDeleted: false });
						continue;
					}
					const result = await removeWorktree({
						taskId: task.taskId,
						repo: params.repo,
						branch: task.branch,
						storyKey,
					});
					results.push(result);
				}
				const lines = results.map(
					(result) => `- ${result.taskId}: ${result.removed ? "removida" : "não encontrada"}${result.branchDeleted ? " (branch apagada)" : ""}`,
				);
				return ok(`Limpeza:\n${lines.join("\n")}`, { results });
			} catch (error) {
				return fail(errorMessage(error), {});
			}
		},
	});
}

export default function (pi: ExtensionAPI) {
	registerListTool(pi);
	registerPrepareTool(pi);
	registerStatusTool(pi);
	registerEvidenceTool(pi);
	registerReviewTool(pi);
	registerCleanupTool(pi);
}
