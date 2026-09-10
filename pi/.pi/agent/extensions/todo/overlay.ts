/**
 * Widget persistente com a lista de tarefas, exibido acima do editor.
 *
 * Controla o ciclo de `setWidget`: registro único, refresh por `requestRender`,
 * colapso configurável, consciência do modo de expansão de tool output do pi e
 * auto-ocultação quando a lista esvazia. Lê o estado vivo via `getRenderState()`
 * (slot de foreground), nunca via replay do branch.
 */

import type { ExtensionUIContext, Theme } from "@earendil-works/pi-coding-agent";
import { type TUI, truncateToWidth } from "@earendil-works/pi-tui";
import { COLLAPSE_KEY_OFF, getMaxWidgetLines, resolveCollapseKey } from "./config.ts";
import { formatOverlayTaskLine, formatStatusLabel } from "./render.ts";
import { selectHasActive, selectOverlayLayout, selectShowTaskIds, selectTodoCounts } from "./state.ts";
import { getRenderState } from "./store.ts";

const WIDGET_KEY = "todo-overlay";

const OVERLAY_HEADING = "Tarefas";
const OVERLAY_MORE = "mais";
const OVERLAY_EXPAND_HINT = "{key} para expandir";
const OVERLAY_COLLAPSED = "recolhido";

export class TodoOverlay {
	private uiCtx: ExtensionUIContext | undefined;
	private widgetRegistered = false;
	private tui: TUI | undefined;
	private completedTaskIdsPendingHide = new Set<number>();
	private hiddenCompletedTaskIds = new Set<number>();
	private lastNextId: number | undefined;
	private collapsed = false;

	setUICtx(ctx: ExtensionUIContext): void {
		// Comparação por identidade: session_start repetido é idempotente; numa
		// troca (/reload) invalida para o update() re-registrar.
		if (ctx !== this.uiCtx) {
			this.uiCtx = ctx;
			this.widgetRegistered = false;
			this.tui = undefined;
		}
	}

	update(): void {
		if (!this.uiCtx) return;
		const snapshot = this.getSnapshot();
		const visible = this.selectOverlayTasks(snapshot);

		if (visible.length === 0) {
			if (this.widgetRegistered) {
				this.uiCtx.setWidget(WIDGET_KEY, undefined);
				this.widgetRegistered = false;
				this.tui = undefined;
			}
			return;
		}

		if (!this.widgetRegistered) {
			this.uiCtx.setWidget(
				WIDGET_KEY,
				(tui, factoryTheme) => {
					this.tui = tui;
					return {
						render: (width: number) => this.renderWidget(this.uiCtx?.theme ?? factoryTheme, width),
						invalidate: () => {},
					};
				},
				{ placement: "aboveEditor" },
			);
			this.widgetRegistered = true;
		} else {
			this.tui?.requestRender();
		}
	}

	resetCompletedDisplayState(): void {
		this.completedTaskIdsPendingHide.clear();
		this.hiddenCompletedTaskIds.clear();
		this.lastNextId = undefined;
	}

	/** No início de um turno, esconde as concluídas já exibidas no turno anterior. */
	hideCompletedTasksFromPreviousTurn(): void {
		if (this.completedTaskIdsPendingHide.size === 0) return;
		for (const taskId of this.completedTaskIdsPendingHide) {
			this.hiddenCompletedTaskIds.add(taskId);
		}
		this.completedTaskIdsPendingHide.clear();
		this.tui?.requestRender();
	}

	toggleCollapse(): void {
		this.collapsed = !this.collapsed;
		// Redraw forçado na mudança de altura colapsado↔expandido.
		this.tui?.requestRender(true);
	}

	isRegistered(): boolean {
		return this.widgetRegistered;
	}

	private getSnapshot() {
		const state = getRenderState();
		if (this.lastNextId !== undefined && state.nextId < this.lastNextId) {
			this.resetCompletedDisplayState();
		}
		this.lastNextId = state.nextId;
		const completedTaskIds = new Set(
			state.tasks.filter((task) => task.status === "completed").map((task) => task.id),
		);
		for (const taskId of this.completedTaskIdsPendingHide) {
			if (!completedTaskIds.has(taskId)) this.completedTaskIdsPendingHide.delete(taskId);
		}
		for (const taskId of this.hiddenCompletedTaskIds) {
			if (!completedTaskIds.has(taskId)) this.hiddenCompletedTaskIds.delete(taskId);
		}
		return { tasks: [...state.tasks], nextId: state.nextId };
	}

	private selectOverlayTasks(snapshot: ReturnType<TodoOverlay["getSnapshot"]>) {
		return snapshot.tasks.filter((task) => task.status !== "deleted" && !this.shouldHideCompletedTask(task));
	}

	private shouldHideCompletedTask(task: ReturnType<TodoOverlay["getSnapshot"]>["tasks"][number]): boolean {
		return task.status === "completed" && this.hiddenCompletedTaskIds.has(task.id);
	}

	private renderWidget(theme: Theme, width: number): string[] {
		const snapshot = this.getSnapshot();
		const overlayTasks = this.selectOverlayTasks(snapshot);
		if (overlayTasks.length === 0) return [];

		const overlayState = { tasks: overlayTasks, nextId: snapshot.nextId };
		const truncate = (line: string): string => truncateToWidth(line, width, "…");
		const counts = selectTodoCounts(overlayState);
		const hasActive = selectHasActive(overlayState);
		const showIds = selectShowTaskIds(overlayState);

		const headingColor = hasActive ? "accent" : "dim";
		const headingIcon = hasActive ? "●" : "○";
		const headingText = `${OVERLAY_HEADING} (${counts.completed}/${counts.total})`;
		const heading = truncate(`${theme.fg(headingColor, headingIcon)} ${theme.fg(headingColor, headingText)}`);

		// Visão recolhida: heading + hint "└─" + espaçador. Curto-circuita antes da
		// matemática de orçamento e do rastreamento de concluídas.
		if (this.collapsed) {
			const key = resolveCollapseKey();
			const hint =
				key === COLLAPSE_KEY_OFF
					? OVERLAY_COLLAPSED
					: OVERLAY_EXPAND_HINT.replace("{key}", key);
			return this.withTrailingSpacer([heading, truncate(`${theme.fg("dim", "└─")} ${theme.fg("dim", hint)}`)]);
		}

		const lines: string[] = [heading];
		// Orçamento de linhas de conteúdo (heading + tarefas/resumo). O widget
		// renderizado fica uma linha mais alto por causa do espaçador final.
		const bodyBudget = this.uiCtx?.getToolsExpanded?.() === true ? overlayTasks.length : getMaxWidgetLines() - 1;
		const layout = selectOverlayLayout(overlayState, bodyBudget);
		for (const task of layout.visible) {
			lines.push(truncate(`${theme.fg("dim", "├─")} ${formatOverlayTaskLine(task, theme, showIds)}`));
		}

		const newlyDisplayedCompletedTaskIds = overlayTasks
			.filter(
				(task) =>
					task.status === "completed" &&
					!this.completedTaskIdsPendingHide.has(task.id) &&
					!this.hiddenCompletedTaskIds.has(task.id),
			)
			.map((task) => task.id);
		for (const taskId of newlyDisplayedCompletedTaskIds) {
			this.completedTaskIdsPendingHide.add(taskId);
		}

		if (layout.hiddenCompleted === 0 && layout.truncatedTail === 0) {
			const last = lines.length - 1;
			lines[last] = lines[last].replace("├─", "└─");
			return this.withTrailingSpacer(lines);
		}

		const totalHidden = layout.hiddenCompleted + layout.truncatedTail;
		const overflowParts: string[] = [];
		if (layout.hiddenCompleted > 0) overflowParts.push(`${layout.hiddenCompleted} ${formatStatusLabel("completed")}`);
		if (layout.truncatedTail > 0) overflowParts.push(`${layout.truncatedTail} ${formatStatusLabel("pending")}`);
		const summary =
			overflowParts.length > 0 ? `+${totalHidden} ${OVERLAY_MORE} (${overflowParts.join(", ")})` : `+${totalHidden} ${OVERLAY_MORE}`;
		lines.push(truncate(`${theme.fg("dim", "└─")} ${theme.fg("dim", summary)}`));
		return this.withTrailingSpacer(lines);
	}

	/** Linha em branco final para o painel não ficar colado na caixa de input. */
	private withTrailingSpacer(lines: string[]): string[] {
		if (lines.length === 0) return lines;
		lines.push("");
		return lines;
	}

	dispose(): void {
		if (this.uiCtx) this.uiCtx.setWidget(WIDGET_KEY, undefined);
		this.widgetRegistered = false;
		this.tui = undefined;
		this.uiCtx = undefined;
		this.collapsed = false;
		this.resetCompletedDisplayState();
	}
}
