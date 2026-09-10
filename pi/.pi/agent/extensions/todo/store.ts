/**
 * Store da extensão `todo` — estado vivo por sessão + replay do branch.
 *
 * O estado é particionado por session id, então uma sessão filha/destacada não
 * lê nem sobrescreve a lista de outra. Nada é escrito em disco: ao iniciar,
 * compactar ou navegar na árvore, a lista é reconstruída a partir do último
 * snapshot `todo` da branch (last-write-wins).
 */

import type { TaskDetails } from "./state.ts";
import { EMPTY_STATE, type TaskState } from "./state.ts";

/** Shape mínimo de ctx necessário para extrair o session id (sem importar o runtime). */
export interface SessionCtx {
	sessionManager: { getSessionId(): string };
}

/** Shape mínimo para o replay. */
export interface BranchCtx {
	sessionManager: { getBranch(): Iterable<unknown> };
}

const sessions = new Map<string, TaskState>();

/**
 * Ponteiro de render sem ctx: qual slot o overlay e o `renderCall` desenham.
 * Definido quando a primeira sessão com UI reivindica o foreground.
 */
let activeRenderSession = "";

/** Extrai o session id (ou `""` quando desconhecido). */
export function sid(ctx: SessionCtx): string {
	return ctx.sessionManager.getSessionId() ?? "";
}

/** Cópia fresca e não-aliased de EMPTY_STATE. */
function freshState(): TaskState {
	return { tasks: [...EMPTY_STATE.tasks], nextId: EMPTY_STATE.nextId };
}

function slotFor(sessionId: string): TaskState {
	return sessions.get(sessionId) ?? freshState();
}

export function getState(sessionId: string): TaskState {
	return slotFor(sessionId);
}

/** Snapshot usado para semear o estado no replay. */
export function replaceState(sessionId: string, next: TaskState): void {
	sessions.set(sessionId, next);
}

/** Commit pós-reducer, chaveado pela sessão que chamou a tool. */
export function commitState(sessionId: string, next: TaskState): void {
	sessions.set(sessionId, next);
}

/** Remove o slot de uma sessão no shutdown. */
export function evictSession(sessionId: string): void {
	sessions.delete(sessionId);
}

/** Leitura sem ctx: slot do foreground (ou EMPTY_STATE fresco). */
export function getRenderState(): TaskState {
	return slotFor(activeRenderSession);
}

export function setActiveRenderSession(sessionId: string): void {
	activeRenderSession = sessionId;
}

export function getActiveRenderSession(): string {
	return activeRenderSession;
}

/** Teardown do foreground: a próxima sessão com UI reivindica o ponteiro. */
export function clearActiveRenderSession(): void {
	activeRenderSession = "";
}

/** Reset de testes/recarga. */
export function __resetState(): void {
	sessions.clear();
	activeRenderSession = "";
}

/** Discrimina `details` no shape persistido. Entradas antigas/corrompidas são ignoradas. */
export function isTaskDetails(value: unknown): value is TaskDetails {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return Array.isArray(v.tasks) && typeof v.nextId === "number";
}

/**
 * Percorre a branch em ordem cronológica; o ÚLTIMO `toolResult` de `todo` com
 * `details` no shape esperado vence. Sem entradas, devolve EMPTY_STATE.
 */
export function replayFromBranch(ctx: BranchCtx): TaskState {
	let result: TaskState = { tasks: [...EMPTY_STATE.tasks], nextId: EMPTY_STATE.nextId };
	for (const entry of ctx.sessionManager.getBranch()) {
		const e = entry as { type?: string; message?: { role?: string; toolName?: string; details?: unknown } };
		if (e.type !== "message") continue;
		const msg = e.message;
		if (msg?.role !== "toolResult" || msg.toolName !== "todo") continue;
		if (!isTaskDetails(msg.details)) continue;
		result = { tasks: msg.details.tasks.map((t) => ({ ...t })), nextId: msg.details.nextId };
	}
	return result;
}
