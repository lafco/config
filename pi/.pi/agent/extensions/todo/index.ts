/**
 * Extensão `todo` — lista de tarefas do agente com painel persistente.
 *
 * Registra a tool `todo`, o comando `/todos` e o widget acima do editor. O
 * estado é reconstruído a partir da própria conversa (último snapshot `todo`
 * da branch), então sobrevive a `/reload` e compactação sem escrever em disco.
 *
 * O estado é particionado por sessão: sessões paralelas não leem nem
 * sobrescrevem a lista uma da outra, e a UI é re-keyada pela branch em
 * `session_compact` / `session_tree`.
 */

import type { ExtensionAPI, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { KeyId } from "@earendil-works/pi-tui";
import { COLLAPSE_KEY_OFF, loadConfig, resolveCollapseKey, validateGuidanceFields } from "./config.ts";
import { TodoOverlay } from "./overlay.ts";
import { buildToolResult, formatCommandTaskLine, formatStatusLabel, renderTodoCall, renderTodoResult } from "./render.ts";
import {
	applyTaskMutation,
	COMMAND_NAME,
	selectTasksByStatus,
	selectTodoCounts,
	selectVisibleTasks,
	type TaskAction,
	type TaskMutationParams,
	TOOL_LABEL,
	TOOL_NAME,
	TodoParamsSchema,
} from "./state.ts";
import {
	type BranchCtx,
	clearActiveRenderSession,
	commitState,
	evictSession,
	getActiveRenderSession,
	getRenderState,
	getState,
	replaceState,
	replayFromBranch,
	type SessionCtx,
	setActiveRenderSession,
	sid,
} from "./store.ts";

// ---------------------------------------------------------------------------
// Instruções dadas ao modelo (inglês — é o lado LLM; a UI é pt-BR)
// ---------------------------------------------------------------------------

const DEFAULT_PROMPT_SNIPPET = "Manage a task list to track multi-step progress";

const DEFAULT_PROMPT_GUIDELINES: string[] = [
	"Use `todo` for complex work with 3+ steps, when the user gives you a list of tasks, or immediately after receiving new instructions to capture requirements. Skip it for single trivial tasks and purely conversational requests.",
	"When starting a task from the todo list, mark it in_progress BEFORE beginning work. Mark it completed IMMEDIATELY when done — never batch completions. Exactly one task in_progress at a time.",
	"Never mark a task completed if tests are failing, the implementation is partial, or you hit unresolved errors — keep it in_progress and create a new task for the blocker instead.",
	"Task status is a 4-state machine: pending → in_progress → completed, plus deleted as a tombstone. Pass activeForm (present-continuous label, e.g. 'researching existing tool') when marking in_progress.",
	'To change a task\'s status, call update with the task id and the target status, e.g. {"action":"update","id":3,"status":"completed"} or {"action":"update","id":3,"status":"in_progress","activeForm":"writing tests"}. status is the field that changes the task; an update without a mutable field (status or another) is rejected.',
	"Use blockedBy to express dependencies (A is blocked by B). On create, pass blockedBy as the initial set. On update, use addBlockedBy / removeBlockedBy (additive merge — do not resend the full array). Cycles are rejected.",
	"list hides tombstoned (deleted) tasks by default; pass includeDeleted:true to see them. Pass status to filter by a single status.",
	"Subject must be short and imperative (e.g. 'Research existing tool'); description is for long-form detail. activeForm is a present-continuous label shown while in_progress.",
];

const TOOL_DESCRIPTION =
	"Manage a task list for tracking multi-step progress. Actions: create (new task), update (change status/fields/dependencies), list (all tasks, optionally filtered by status), get (single task details), delete (tombstone), clear (reset all). Status: pending → in_progress → completed, plus deleted tombstone. Use this to plan and track multi-step work like research, design, and implementation.";

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

function registerTodoTool(pi: ExtensionAPI): void {
	const guidance = validateGuidanceFields(loadConfig().guidance);
	pi.registerTool({
		name: TOOL_NAME,
		label: TOOL_LABEL,
		description: guidance.description ?? TOOL_DESCRIPTION,
		promptSnippet: guidance.promptSnippet ?? DEFAULT_PROMPT_SNIPPET,
		promptGuidelines: guidance.promptGuidelines ?? DEFAULT_PROMPT_GUIDELINES,
		parameters: TodoParamsSchema,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const sessionId = sid(ctx);
			const args = params as unknown as TaskMutationParams & { action: TaskAction };
			const result = applyTaskMutation(getState(sessionId), args.action, args);
			commitState(sessionId, result.state);
			return buildToolResult(args.action, args, result.state, result.op);
		},

		renderCall(args, theme, _context) {
			return renderTodoCall(args as unknown as TaskMutationParams & { action: TaskAction }, theme, getRenderState());
		},

		renderResult(result, _opts, theme, _context) {
			return renderTodoResult(result, theme);
		},
	});
}

// ---------------------------------------------------------------------------
// /todos
// ---------------------------------------------------------------------------

const SECTION_PENDING = "── Pendentes ──";
const SECTION_IN_PROGRESS = "── Em andamento ──";
const SECTION_COMPLETED = "── Concluídas ──";

function registerTodosCommand(pi: ExtensionAPI): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Mostra todas as tarefas da branch atual, agrupadas por status",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/todos requer modo interativo", "error");
				return;
			}
			const state = getState(sid(ctx));
			if (selectVisibleTasks(state).length === 0) {
				ctx.ui.notify("Nenhuma tarefa ainda. Peça ao agente para adicionar algumas!", "info");
				return;
			}
			const groups = selectTasksByStatus(state);
			const counts = selectTodoCounts(state);

			const header: string[] = [];
			if (counts.completed > 0) header.push(`${counts.completed}/${counts.total} ${formatStatusLabel("completed")}`);
			if (counts.inProgress > 0) header.push(`${counts.inProgress} ${formatStatusLabel("in_progress")}`);
			if (counts.pending > 0) header.push(`${counts.pending} ${formatStatusLabel("pending")}`);

			const lines: string[] = [header.join(" · ")];
			if (groups.pending.length > 0) {
				lines.push(SECTION_PENDING);
				for (const task of groups.pending) lines.push(formatCommandTaskLine(task, "○"));
			}
			if (groups.inProgress.length > 0) {
				lines.push(SECTION_IN_PROGRESS);
				for (const task of groups.inProgress) lines.push(formatCommandTaskLine(task, "◐"));
			}
			if (groups.completed.length > 0) {
				lines.push(SECTION_COMPLETED);
				for (const task of groups.completed) lines.push(formatCommandTaskLine(task, "✓"));
			}

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export default function todoExtension(pi: ExtensionAPI): void {
	let todoOverlay: TodoOverlay | undefined;
	let uiCtx: ExtensionUIContext | undefined;
	let lifecycleGeneration = 0;

	async function updateTodoOverlay(resetCompletedDisplayState = false, generation = lifecycleGeneration): Promise<void> {
		const hasVisibleTasks = getRenderState().tasks.some((task) => task.status !== "deleted");
		if (!uiCtx || (!todoOverlay && !hasVisibleTasks)) return;

		if (generation !== lifecycleGeneration || !uiCtx) return;
		todoOverlay ??= new TodoOverlay();
		todoOverlay.setUICtx(uiCtx);
		if (resetCompletedDisplayState) todoOverlay.resetCompletedDisplayState();
		todoOverlay.update();
	}

	registerTodoTool(pi);
	registerTodosCommand(pi);

	// Atalho de colapsar/expandir. Resolvido uma vez no load (mudança de config
	// precisa de `/reload` para re-vincular); ignorado quando `collapseKey` é "off".
	const collapseKey = resolveCollapseKey();
	if (collapseKey !== COLLAPSE_KEY_OFF) {
		pi.registerShortcut(collapseKey as KeyId, {
			description: "Colapsa ou expande o painel de tarefas",
			handler: (ctx) => {
				if (!ctx.hasUI || !todoOverlay?.isRegistered()) return;
				todoOverlay.toggleCollapse();
			},
		});
	}

	// Re-keya o slot da sessão pela branch e atualiza o overlay apenas quando a
	// sessão atualizada É o foreground. Um ctx stale (auto-compactação correndo
	// com disposal) mantém o estado atual — a sessão substituta re-replaya no
	// session_start. Erros que não sejam de ctx stale são bugs reais e propagam.
	const replayAndRefresh = async (ctx: SessionCtx & BranchCtx): Promise<void> => {
		let isForeground = false;
		try {
			const id = sid(ctx);
			replaceState(id, replayFromBranch(ctx));
			isForeground = id === getActiveRenderSession();
		} catch (error) {
			if (!isStaleCtxError(error)) throw error;
		}
		if (isForeground) await updateTodoOverlay(true);
	};

	pi.on("session_start", async (_event, ctx) => {
		let id: string;
		try {
			id = sid(ctx);
			replaceState(id, replayFromBranch(ctx));
		} catch (error) {
			if (!isStaleCtxError(error)) throw error;
			return;
		}
		if (!ctx.hasUI) return;
		// A primeira sessão com UI reivindica o foreground.
		if (getActiveRenderSession() === "") setActiveRenderSession(id);
		// Só o foreground re-vincula/re-renderiza o overlay compartilhado.
		if (id !== getActiveRenderSession()) return;
		const generation = ++lifecycleGeneration;
		uiCtx = ctx.ui;
		await updateTodoOverlay(true, generation);
	});

	pi.on("session_compact", async (_event, ctx) => {
		await replayAndRefresh(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		await replayAndRefresh(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		let s: string;
		try {
			s = sid(ctx);
		} catch (error) {
			if (!isStaleCtxError(error)) throw error;
			s = "";
		}
		evictSession(s);
		// Teardown gated por sid: shutdown de uma sessão filha não derruba o
		// overlay do foreground.
		if (s === "" || s === getActiveRenderSession()) {
			lifecycleGeneration++;
			uiCtx = undefined;
			try {
				todoOverlay?.dispose();
			} finally {
				todoOverlay = undefined;
				clearActiveRenderSession();
			}
		}
	});

	// Lê getRenderState() no momento do render; NÃO faz replay aqui (a branch
	// ainda está stale — message_end roda depois de tool_execution_end).
	pi.on("tool_execution_end", async (event) => {
		if (event.toolName !== TOOL_NAME || event.isError) return;
		try {
			await updateTodoOverlay();
		} catch (error) {
			console.warn(`[todo] falha ao atualizar o overlay (retenta na próxima): ${formatError(error)}`);
		}
	});

	pi.on("agent_start", async () => {
		todoOverlay?.hideCompletedTasksFromPreviousTurn();
	});
}

/** O proxy de ctx do pi-core lança esta frase após session replacement/reload. */
function isStaleCtxError(error: unknown): boolean {
	return /stale after session replacement/.test(String(error));
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
