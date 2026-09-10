/**
 * Camada de apresentação: sanitização de texto, labels de status em pt-BR,
 * formatação das linhas (overlay, /todos), hooks de render da tool e o
 * envelope de resposta enviado ao modelo.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { deriveBlocks, type Op, selectTaskSubjectById, type Task, type TaskAction, type TaskDetails, type TaskMutationParams, type TaskState, type TaskStatus } from "./state.ts";

// ---------------------------------------------------------------------------
// Sanitização
// ---------------------------------------------------------------------------

/**
 * Remove caracteres de controle terminal do texto vindo do modelo: sequências
 * CSI/OSC somem inteiras, newlines/tabs viram espaço (não podem mudar o
 * layout) e controles de bidi são removidos (não podem reordenar o output).
 */
export function sanitizeTerminalText(value: string): string {
	return (
		value
			.replace(/(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]/g, "")
			.replace(/(?:\u001b\]|\u009d)[^\u0007\u009c\u001b]*(?:\u0007|\u009c|\u001b\\)?/g, "")
			.replace(/\u001b./g, "")
			.replace(/[\u2028\u2029]/g, " ")
			.replace(/[\u0000-\u001f\u007f-\u009f]/g, (character) =>
				character === "\n" || character === "\r" || character === "\t" ? " " : "",
			)
			.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
	);
}

// ---------------------------------------------------------------------------
// Labels de status (UI pt-BR; o texto voltado ao LLM permanece em inglês)
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<TaskStatus, string> = {
	pending: "pendentes",
	in_progress: "em andamento",
	completed: "concluídas",
	deleted: "excluída",
};

export function formatStatusLabel(status: TaskStatus): string {
	return STATUS_LABEL[status];
}

// ---------------------------------------------------------------------------
// Tabelas de glyph/cor — fonte única da apresentação visual.
// ---------------------------------------------------------------------------

export const STATUS_GLYPH: Record<TaskStatus, string> = {
	pending: "○",
	in_progress: "◐",
	completed: "●",
	deleted: "⊘",
};

export const STATUS_COLOR: Record<TaskStatus, "dim" | "warning" | "success" | "muted"> = {
	pending: "dim",
	in_progress: "warning",
	completed: "success",
	deleted: "muted",
};

export const ACTION_GLYPH: Record<TaskAction, string> = {
	create: "+",
	update: "→",
	delete: "×",
	get: "›",
	list: "☰",
	clear: "∅",
};

/** Glyph da linha do overlay (concluída usa `✓`, excluída usa `✗`). */
export function overlayStatusGlyph(status: TaskStatus, theme: Theme): string {
	switch (status) {
		case "pending":
			return theme.fg("dim", "○");
		case "in_progress":
			return theme.fg("warning", "◐");
		case "completed":
			return theme.fg("success", "✓");
		case "deleted":
			return theme.fg("error", "✗");
	}
}

/** Linha de uma tarefa no overlay. */
export function formatOverlayTaskLine(t: Task, theme: Theme, showId: boolean): string {
	const glyph = overlayStatusGlyph(t.status, theme);
	const subjectColor =
		t.status === "in_progress" ? "accent" : t.status === "completed" || t.status === "deleted" ? "muted" : "text";
	let subject = theme.fg(subjectColor, sanitizeTerminalText(t.subject));
	if (t.status === "completed" || t.status === "deleted") {
		subject = theme.strikethrough(subject);
	}
	let line = `${glyph}`;
	if (showId) line += ` ${theme.fg("dim", `#${t.id}`)}`;
	line += ` ${subject}`;
	if (t.status === "in_progress" && t.activeForm) {
		line += ` ${theme.fg("muted", `(${sanitizeTerminalText(t.activeForm)})`)}`;
	}
	if (t.blockedBy && t.blockedBy.length > 0) {
		line += ` ${theme.fg("muted", `⛓ ${t.blockedBy.map((id) => `#${id}`).join(",")}`)}`;
	}
	return line;
}

/** Linha de uma tarefa no `/todos`. */
export function formatCommandTaskLine(t: Task, glyph: string): string {
	const form = t.status === "in_progress" && t.activeForm ? ` (${sanitizeTerminalText(t.activeForm)})` : "";
	const block = t.blockedBy?.length ? `    ⛓ ${t.blockedBy.map((id) => `#${id}`).join(",")}` : "";
	return `  ${glyph} #${t.id} ${sanitizeTerminalText(t.subject)}${form}${block}`;
}

// ---------------------------------------------------------------------------
// Envelope de resposta ao modelo
// ---------------------------------------------------------------------------

function formatListLine(t: Task): string {
	const block = t.blockedBy?.length ? ` ⛓ ${t.blockedBy.map((id) => `#${id}`).join(",")}` : "";
	const form = t.status === "in_progress" && t.activeForm ? ` (${sanitizeTerminalText(t.activeForm)})` : "";
	return `[${t.status}] #${t.id} ${sanitizeTerminalText(t.subject)}${form}${block}`;
}

function formatGetLines(task: Task, state: TaskState): string {
	const blocks = deriveBlocks(state.tasks).get(task.id) ?? [];
	const lines = [`#${task.id} [${task.status}] ${sanitizeTerminalText(task.subject)}`];
	if (task.description) lines.push(`  description: ${sanitizeTerminalText(task.description)}`);
	if (task.activeForm) lines.push(`  activeForm: ${sanitizeTerminalText(task.activeForm)}`);
	if (task.blockedBy?.length) lines.push(`  blockedBy: ${task.blockedBy.map((id) => `#${id}`).join(", ")}`);
	if (blocks.length) lines.push(`  blocks: ${blocks.map((id) => `#${id}`).join(", ")}`);
	if (task.owner) lines.push(`  owner: ${sanitizeTerminalText(task.owner)}`);
	return lines.join("\n");
}

/** Formata a operação em texto (switch fechado sobre `op.kind`). */
export function formatContent(op: Op, state: TaskState): string {
	switch (op.kind) {
		case "create": {
			const t = state.tasks.find((x) => x.id === op.taskId);
			if (!t) return `Created #${op.taskId}`;
			return `Created #${t.id}: ${sanitizeTerminalText(t.subject)} (pending)`;
		}
		case "update": {
			if (!op.changed) {
				return `No change: #${op.id} already matches the requested values (status: ${op.toStatus})`;
			}
			const transition = op.fromStatus !== op.toStatus ? ` (${op.fromStatus} → ${op.toStatus})` : "";
			return `Updated #${op.id}${transition}`;
		}
		case "delete":
			return `Deleted #${op.id}: ${sanitizeTerminalText(op.subject)}`;
		case "clear":
			return `Cleared ${op.count} tasks`;
		case "list": {
			let view = state.tasks;
			if (!op.includeDeleted) view = view.filter((t) => t.status !== "deleted");
			if (op.statusFilter) view = view.filter((t) => t.status === op.statusFilter);
			return view.length === 0 ? "No tasks" : view.map(formatListLine).join("\n");
		}
		case "get":
			return formatGetLines(op.task, state);
		case "error":
			return `Error: ${op.message}`;
	}
}

/**
 * Monta o envelope após o commit do novo estado. `details` é o snapshot de
 * persistência/replay consumido pelo `replayFromBranch`.
 */
export function buildToolResult(
	action: TaskAction,
	params: TaskMutationParams,
	state: TaskState,
	op: Op,
): { content: Array<{ type: "text"; text: string }>; details: TaskDetails } {
	const details: TaskDetails = {
		action,
		params: params as Record<string, unknown>,
		tasks: state.tasks,
		nextId: state.nextId,
		...(op.kind === "error" ? { error: op.message } : {}),
	};
	return { content: [{ type: "text", text: formatContent(op, state) }], details };
}

// ---------------------------------------------------------------------------
// Hooks de render da tool
// ---------------------------------------------------------------------------

export function renderTodoCall(
	args: TaskMutationParams & { action: TaskAction },
	theme: Theme,
	state: TaskState,
): Text {
	const glyph = ACTION_GLYPH[args.action] ?? args.action;
	let text = theme.fg("toolTitle", theme.bold("todo ")) + theme.fg("muted", glyph);

	if (args.action === "create" && args.subject) {
		text += ` ${theme.fg("dim", sanitizeTerminalText(args.subject))}`;
	} else if (
		(args.action === "update" || args.action === "get" || args.action === "delete") &&
		args.id !== undefined
	) {
		const subject = selectTaskSubjectById(state, args.id);
		text += ` ${theme.fg("accent", subject ? sanitizeTerminalText(subject) : `#${args.id}`)}`;
	} else if (args.action === "list" && args.status) {
		text += ` ${theme.fg("muted", formatStatusLabel(args.status))}`;
	}
	return new Text(text, 0, 0);
}

export function renderTodoResult(result: { details?: unknown }, theme: Theme): Text {
	const details = result.details as TaskDetails | undefined;
	let status: TaskStatus | undefined;
	if (details) {
		const params = details.params as TaskMutationParams;
		switch (details.action) {
			case "create":
				status = details.tasks[details.tasks.length - 1]?.status;
				break;
			case "update":
				status = params.status ?? details.tasks.find((t) => t.id === params.id)?.status;
				break;
			case "delete":
				status = details.tasks.find((t) => t.id === params.id)?.status;
				break;
			case "list":
			case "get":
			case "clear":
				break;
		}
	}
	if (status) {
		return new Text(theme.fg(STATUS_COLOR[status], `${STATUS_GLYPH[status]} ${formatStatusLabel(status)}`), 0, 0);
	}
	return new Text(theme.fg("success", "✓"), 0, 0);
}
