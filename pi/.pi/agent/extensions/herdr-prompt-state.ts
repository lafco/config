/**
 * herdr-prompt-state — avisa o herdr quando o pi fica bloqueado esperando o usuário.
 *
 * O `herdr-agent-state.ts` (gerenciado pelo herdr; sobrescrito em update) publica o
 * estado do pane e já escuta o canal `herdr:blocked`, mas nada o emitia: uma pergunta
 * pendente (`ask_user`, `ctx.ui.confirm/select/input`) continuava aparecendo como
 * "Working". Esta extensão fica ao lado da gerenciada e fecha essa lacuna.
 *
 * O pi dispara `ui_prompt_start`/`ui_prompt_end` ao redor de qualquer prompt de UI
 * bloqueante; traduzimos esses eventos para `herdr:blocked` com o título do prompt
 * como rótulo. Em `ctx.ui.custom` o pi não manda título, então o rótulo do `ask_user`
 * vem da pergunta capturada em `tool_execution_start`.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const ASK_TOOL = "ask_user";

const KIND_LABELS: Record<string, string> = {
	select: "aguardando escolha do usuário",
	confirm: "aguardando confirmação do usuário",
	input: "aguardando resposta do usuário",
	editor: "aguardando edição do usuário",
	custom: "aguardando resposta do usuário",
};

export default function herdrPromptState(pi: ExtensionAPI) {
	let askLabel: string | undefined;

	// `ctx.ui.custom` não recebe título, então o rótulo útil do ask_user é a pergunta.
	pi.on("tool_execution_start", (event) => {
		if (event.toolName !== ASK_TOOL) return;
		const pergunta = (event.args as { pergunta?: unknown } | undefined)?.pergunta;
		askLabel =
			typeof pergunta === "string" && pergunta.trim().length > 0 ? pergunta.trim() : undefined;
	});

	pi.on("tool_execution_end", (event) => {
		if (event.toolName !== ASK_TOOL) return;
		askLabel = undefined;
	});

	pi.on("ui_prompt_start", (event) => {
		const label = event.title ?? askLabel ?? KIND_LABELS[event.kind] ?? "aguardando o usuário";
		pi.events.emit("herdr:blocked", { active: true, label });
	});

	pi.on("ui_prompt_end", () => {
		askLabel = undefined;
		pi.events.emit("herdr:blocked", { active: false });
	});
}
